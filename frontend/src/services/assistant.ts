/**
 * AI Assistant service client.
 * Handles chat streaming and action approval/rejection.
 */

import { api } from './api';
import type {
  AssistantChatRequest,
  AssistantSSEEvent,
  PendingAction,
  ActionResponse,
} from '../types/assistant';

function getApiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) return '/api/v1';
  if (window.location.protocol === 'https:' && envUrl.startsWith('http://')) {
    return envUrl.replace('http://', 'https://');
  }
  return envUrl;
}

const API_BASE = getApiBase();

function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem('pasteur-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.accessToken || null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Chat with the AI assistant using Server-Sent Events.
 * Returns an async generator that yields SSE events.
 */
export async function* chatStream(
  request: AssistantChatRequest
): AsyncGenerator<AssistantSSEEvent, void, unknown> {
  const token = getAuthToken();

  const response = await fetch(`${API_BASE}/assistant/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message: request.message,
      conversation_id: request.conversationId,
      messages: request.messages?.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      page_context: request.pageContext
        ? {
            type: request.pageContext.type,
            id: request.pageContext.id,
            project_id: request.pageContext.projectId,
            name: request.pageContext.name,
          }
        : undefined,
      use_dynamic_queries: request.useDynamicQueries ?? false,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Chat request failed');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEventType = 'text';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.startsWith('event: ')) {
          // Store the event type for the next data line
          currentEventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          try {
            const data = JSON.parse(dataStr);
            yield { event: currentEventType, data } as AssistantSSEEvent;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Process SSE stream and accumulate events properly.
 */
export async function* processSSEStream(
  response: Response
): AsyncGenerator<AssistantSSEEvent, void, unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEventType = 'text';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          try {
            const data = JSON.parse(dataStr);
            yield { event: currentEventType, data } as AssistantSSEEvent;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Get pending actions for the current user.
 */
export async function getPendingActions(
  conversationId?: string
): Promise<PendingAction[]> {
  const params = conversationId ? `?conversation_id=${conversationId}` : '';
  const response = await api.get<PendingAction[]>(`/assistant/actions/pending${params}`);
  return response.data;
}

/**
 * Approve a pending action.
 */
export async function approveAction(actionId: string): Promise<ActionResponse> {
  const response = await api.post<ActionResponse>(
    `/assistant/actions/${actionId}/approve`,
    {}
  );
  return response.data;
}

/**
 * Reject a pending action.
 */
export async function rejectAction(
  actionId: string,
  reason?: string
): Promise<ActionResponse> {
  const response = await api.post<ActionResponse>(
    `/assistant/actions/${actionId}/reject`,
    { reason }
  );
  return response.data;
}

/**
 * Get a specific pending action.
 */
export async function getPendingAction(actionId: string): Promise<PendingAction> {
  const response = await api.get<PendingAction>(`/assistant/actions/${actionId}`);
  return response.data;
}
