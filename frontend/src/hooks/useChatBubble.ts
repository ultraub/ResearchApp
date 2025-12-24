/**
 * Hook to manage the AI chat bubble state and interactions.
 */

import { useState, useCallback, useRef } from 'react';
import * as assistantService from '../services/assistant';
import { usePageContext } from './usePageContext';
import type {
  ChatMessage,
  ProposedAction,
  PageContext,
  ToolActivity,
} from '../types/assistant';

// Generate unique IDs using native crypto API
const generateId = () => crypto.randomUUID();

interface UseChatBubbleResult {
  // State
  isOpen: boolean;
  isMinimized: boolean;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  pendingActions: ProposedAction[];
  pageContext: PageContext;
  contextLabel: string;

  // Actions
  open: () => void;
  close: () => void;
  minimize: () => void;
  maximize: () => void;
  toggle: () => void;
  sendMessage: (content: string) => Promise<void>;
  approveAction: (actionId: string) => Promise<void>;
  rejectAction: (actionId: string, reason?: string) => Promise<void>;
  clearMessages: () => void;
}

export function useChatBubble(): UseChatBubbleResult {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<ProposedAction[]>([]);

  const { pageContext, contextLabel } = usePageContext();
  const abortControllerRef = useRef<AbortController | null>(null);

  const open = useCallback(() => {
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const minimize = useCallback(() => {
    setIsMinimized(true);
  }, []);

  const maximize = useCallback(() => {
    setIsMinimized(false);
  }, []);

  const toggle = useCallback(() => {
    if (!isOpen) {
      open();
    } else if (isMinimized) {
      maximize();
    } else {
      minimize();
    }
  }, [isOpen, isMinimized, open, maximize, minimize]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      // Add user message
      const userMessage: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Create placeholder for assistant response
      const assistantMessageId = generateId();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
        actions: [],
      };
      setMessages((prev) => [...prev, assistantMessage]);

      setIsLoading(true);
      setError(null);

      try {
        // Build message history for context
        // Filter out messages with empty content (e.g., assistant messages that only had tool calls)
        const messageHistory = messages
          .filter((m) => m.content && m.content.trim() !== '')
          .map((m) => ({
            role: m.role,
            content: m.content,
          }));

        // Stream response
        const stream = assistantService.chatStream({
          message: content.trim(),
          conversationId: conversationId || undefined,
          messages: messageHistory,
          pageContext,
        });

        let accumulatedContent = '';
        let accumulatedThinking = '';
        const accumulatedActions: ProposedAction[] = [];
        const accumulatedToolActivity: ToolActivity[] = [];

        for await (const event of stream) {
          switch (event.event) {
            case 'text':
              // Complete text block (fallback for non-streaming providers)
              accumulatedContent = event.data.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: accumulatedContent }
                    : m
                )
              );
              break;

            case 'text_delta':
              // Real-time text streaming - append to content
              accumulatedContent += event.data.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: accumulatedContent }
                    : m
                )
              );
              break;

            case 'thinking':
              // Model thinking/reasoning content (Gemini 3+)
              accumulatedThinking += event.data.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, thinking: accumulatedThinking }
                    : m
                )
              );
              break;

            case 'tool_call': {
              // Track tool call activity
              const toolActivity: ToolActivity = {
                id: generateId(),
                tool: event.data.tool,
                input: event.data.input,
                timestamp: new Date(),
              };
              accumulatedToolActivity.push(toolActivity);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, toolActivity: [...(m.toolActivity || []), toolActivity] }
                    : m
                )
              );
              break;
            }

            case 'action_preview': {
              // Transform snake_case API response to camelCase
              // Cast through unknown first since SSE data comes as snake_case from API
              const actionData = event.data as unknown as Record<string, unknown>;

              // Transform diff entries from snake_case to camelCase
              const rawDiff = (actionData.diff || []) as Array<Record<string, unknown>>;
              const transformedDiff = rawDiff.map((d) => ({
                field: String(d.field || ''),
                oldValue: d.old_value ?? d.oldValue,
                newValue: d.new_value ?? d.newValue,
                changeType: (d.change_type || d.changeType || 'modified') as 'added' | 'modified' | 'removed',
              }));

              const action: ProposedAction = {
                id: String(actionData.action_id || actionData.id || ''),
                toolName: String(actionData.tool_name || actionData.toolName || ''),
                description: String(actionData.description || ''),
                entityType: String(actionData.entity_type || actionData.entityType || ''),
                entityId: actionData.entity_id || actionData.entityId
                  ? String(actionData.entity_id || actionData.entityId)
                  : undefined,
                oldState: (actionData.old_state || actionData.oldState) as Record<string, unknown> | undefined,
                newState: (actionData.new_state || actionData.newState || {}) as Record<string, unknown>,
                diff: transformedDiff,
                status: 'pending',
                expiresAt: actionData.expires_at || actionData.expiresAt
                  ? String(actionData.expires_at || actionData.expiresAt)
                  : undefined,
              };
              accumulatedActions.push(action);
              setPendingActions((prev) => [...prev, action]);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, actions: [...(m.actions || []), action] }
                    : m
                )
              );
              break;
            }

            case 'done':
              if (event.data.conversation_id) {
                setConversationId(event.data.conversation_id);
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId ? { ...m, isStreaming: false } : m
                )
              );
              break;

            case 'error':
              setError(event.data.message);
              break;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        setError(message);
        // Remove the placeholder message on error
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
      } finally {
        setIsLoading(false);
      }
    },
    [messages, conversationId, pageContext]
  );

  const approveAction = useCallback(async (actionId: string) => {
    try {
      await assistantService.approveAction(actionId);
      // Update action status in pending actions
      setPendingActions((prev) =>
        prev.map((a) => (a.id === actionId ? { ...a, status: 'approved' as const } : a))
      );
      // Update action status in messages
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          actions: m.actions?.map((a) =>
            a.id === actionId ? { ...a, status: 'approved' as const } : a
          ),
        }))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve action';
      setError(message);
    }
  }, []);

  const rejectAction = useCallback(async (actionId: string, reason?: string) => {
    try {
      await assistantService.rejectAction(actionId, reason);
      // Update action status
      setPendingActions((prev) =>
        prev.map((a) => (a.id === actionId ? { ...a, status: 'rejected' as const } : a))
      );
      // Update action status in messages
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          actions: m.actions?.map((a) =>
            a.id === actionId ? { ...a, status: 'rejected' as const } : a
          ),
        }))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject action';
      setError(message);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setPendingActions([]);
    setConversationId(null);
    setError(null);
  }, []);

  return {
    isOpen,
    isMinimized,
    messages,
    isLoading,
    error,
    conversationId,
    pendingActions,
    pageContext,
    contextLabel,
    open,
    close,
    minimize,
    maximize,
    toggle,
    sendMessage,
    approveAction,
    rejectAction,
    clearMessages,
  };
}
