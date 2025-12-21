/**
 * WebSocket hook for real-time updates.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface WebSocketMessage {
  type: string;
  payload: Record<string, unknown>;
}

interface UseWebSocketOptions {
  userId: string;
  organizationId?: string;
  projectId?: string;
  documentId?: string;
  onActivity?: (data: Record<string, unknown>) => void;
  onNotification?: (data: Record<string, unknown>) => void;
  onPresence?: (data: Record<string, unknown>) => void;
  onDocumentChange?: (data: Record<string, unknown>) => void;
  onCursorMove?: (data: Record<string, unknown>) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  sendMessage: (message: WebSocketMessage) => void;
  sendCursorPosition: (position: { line: number; column: number }) => void;
  sendDocumentChange: (changes: unknown) => void;
}

const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/api/v1/ws';
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;
const PING_INTERVAL = 30000;

export function useWebSocket({
  userId,
  organizationId,
  projectId,
  documentId,
  onActivity,
  onNotification,
  onPresence,
  onDocumentChange,
  onCursorMove,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();

  const connect = useCallback(() => {
    // Build WebSocket URL with query params
    const params = new URLSearchParams();
    params.append('user_id', userId);
    if (organizationId) params.append('organization_id', organizationId);
    if (projectId) params.append('project_id', projectId);
    if (documentId) params.append('document_id', documentId);

    const wsUrl = `${WS_BASE_URL}/connect?${params}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;

        // Start ping interval to keep connection alive
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);

        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Attempt to reconnect
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current += 1;
          console.log(`Reconnecting... Attempt ${reconnectAttempts.current}`);
          setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'activity':
              // Invalidate activity queries to refresh feed
              queryClient.invalidateQueries({ queryKey: ['activities'] });
              onActivity?.(message.payload);
              break;

            case 'notification':
              // Invalidate notification queries
              queryClient.invalidateQueries({ queryKey: ['notifications'] });
              onNotification?.(message.payload);
              break;

            case 'presence':
              onPresence?.(message.payload);
              break;

            case 'document_change':
              onDocumentChange?.(message.payload);
              break;

            case 'cursor_move':
              onCursorMove?.(message.payload);
              break;

            case 'document_update':
              // Invalidate document queries
              queryClient.invalidateQueries({ queryKey: ['documents'] });
              queryClient.invalidateQueries({ queryKey: ['documentVersions'] });
              break;

            case 'pong':
              // Ping response received, connection is alive
              break;

            default:
              console.log('Unknown message type:', message.type);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  }, [
    userId,
    organizationId,
    projectId,
    documentId,
    onActivity,
    onNotification,
    onPresence,
    onDocumentChange,
    onCursorMove,
    queryClient,
  ]);

  useEffect(() => {
    connect();

    return () => {
      // Cleanup on unmount
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const sendCursorPosition = useCallback(
    (position: { line: number; column: number }) => {
      sendMessage({
        type: 'cursor_move',
        payload: { position },
      });
    },
    [sendMessage]
  );

  const sendDocumentChange = useCallback(
    (changes: unknown) => {
      sendMessage({
        type: 'document_change',
        payload: { changes },
      });
    },
    [sendMessage]
  );

  return {
    isConnected,
    sendMessage,
    sendCursorPosition,
    sendDocumentChange,
  };
}

// Hook for document presence
interface Presence {
  userId: string;
  name?: string;
  color?: string;
  cursor?: { line: number; column: number };
}

export function useDocumentPresence(documentId: string, userId: string) {
  const [activeUsers, setActiveUsers] = useState<Presence[]>([]);
  const [cursors, setCursors] = useState<Record<string, { line: number; column: number }>>({});

  const { isConnected, sendCursorPosition, sendDocumentChange } = useWebSocket({
    userId,
    documentId,
    onPresence: (data) => {
      if (data.event === 'user_joined' || data.event === 'user_left') {
        setActiveUsers(
          (data.active_users as string[]).map((id) => ({
            userId: id,
            color: getUserColor(id),
          }))
        );
      }
    },
    onCursorMove: (data) => {
      const { user_id, position } = data as { user_id: string; position: { line: number; column: number } };
      setCursors((prev) => ({
        ...prev,
        [user_id]: position,
      }));
    },
  });

  return {
    isConnected,
    activeUsers,
    cursors,
    sendCursorPosition,
    sendDocumentChange,
  };
}

// Generate consistent color for user
function getUserColor(userId: string): string {
  const colors = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FFEAA7',
    '#DDA0DD',
    '#98D8C8',
    '#F7DC6F',
  ];
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}
