/**
 * AI service client for Pasteur.
 * Handles all AI-related API calls including streaming support.
 */

import { api } from './api';
import type {
  AIGenerateRequest,
  AIGenerateResponse,
  AIDocumentActionRequest,
  AIDocumentActionResponse,
  AIPaperSummarizeRequest,
  AIPaperSummaryResponse,
  AIConversationCreateRequest,
  AIConversationMessageRequest,
  AIConversationWithMessages,
  AIConversationListResponse,
  AIConversationMessage,
  AIPromptTemplate,
  AIUsageSummary,
  AutoReviewConfig,
  AutoReviewConfigUpdate,
} from '../types/ai';

function getApiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) return '/api/v1';
  // Upgrade HTTP to HTTPS when page is on HTTPS
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

// =============================================================================
// Generate Endpoints
// =============================================================================

/**
 * Generate AI content using a template (non-streaming).
 */
export async function generate(request: AIGenerateRequest): Promise<AIGenerateResponse> {
  const response = await api.post<AIGenerateResponse>('/ai/generate', request);
  return response.data;
}

/**
 * Generate AI content with streaming response.
 * Returns an async generator that yields content chunks.
 */
export async function* generateStream(
  request: AIGenerateRequest
): AsyncGenerator<string, void, unknown> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}/ai/generate/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          if (data.startsWith('[ERROR]')) {
            throw new Error(data.slice(8));
          }
          yield data;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// =============================================================================
// Document Assistant Endpoints
// =============================================================================

/**
 * Perform a quick action on document content.
 */
export async function documentAction(
  request: AIDocumentActionRequest
): Promise<AIDocumentActionResponse> {
  const response = await api.post<AIDocumentActionResponse>('/ai/document/action', request);
  return response.data;
}

/**
 * Perform a document action with streaming response.
 */
export async function* documentActionStream(
  request: AIDocumentActionRequest
): AsyncGenerator<string, void, unknown> {
  // Convert to generate request with appropriate template
  const templateMap: Record<string, string> = {
    expand: 'document_expand',
    simplify: 'document_simplify',
    continue: 'document_continue',
    structure: 'document_structure',
    formalize: 'document_formalize',
  };

  // For continue action, use surrounding_context if no text selected
  const previousContent = request.action === 'continue'
    ? (request.selected_text || request.surrounding_context)
    : request.selected_text;

  yield* generateStream({
    template_key: templateMap[request.action],
    variables: {
      selected_text: request.selected_text,
      document_type: request.document_type,
      surrounding_context: request.surrounding_context,
      instructions: request.instructions,
      previous_content: previousContent,
    },
    context_type: 'document',
    context_id: request.document_id,
    stream: true,
  });
}

/**
 * Chat about a specific document.
 */
export async function documentChat(
  documentId: string,
  message: string
): Promise<AIGenerateResponse> {
  const response = await api.post<AIGenerateResponse>(
    `/ai/document/${documentId}/chat`,
    null,
    { params: { message } }
  );
  return response.data;
}

// =============================================================================
// Knowledge Assistant Endpoints
// =============================================================================

/**
 * Summarize an academic paper.
 */
export async function summarizePaper(
  request: AIPaperSummarizeRequest
): Promise<AIPaperSummaryResponse> {
  const response = await api.post<AIPaperSummaryResponse>('/ai/knowledge/summarize', request);
  return response.data;
}

// =============================================================================
// Conversation Endpoints
// =============================================================================

/**
 * List user's AI conversations.
 */
export async function listConversations(params?: {
  feature_name?: string;
  page?: number;
  page_size?: number;
}): Promise<AIConversationListResponse> {
  const response = await api.get<AIConversationListResponse>('/ai/conversations', { params });
  return response.data;
}

/**
 * Create a new AI conversation.
 */
export async function createConversation(
  request: AIConversationCreateRequest
): Promise<AIConversationWithMessages> {
  const response = await api.post<AIConversationWithMessages>('/ai/conversations', request);
  return response.data;
}

/**
 * Get a conversation with all messages.
 */
export async function getConversation(conversationId: string): Promise<AIConversationWithMessages> {
  const response = await api.get<AIConversationWithMessages>(`/ai/conversations/${conversationId}`);
  return response.data;
}

/**
 * Add a message to a conversation and get AI response.
 */
export async function addMessage(
  conversationId: string,
  request: AIConversationMessageRequest
): Promise<AIConversationMessage> {
  const response = await api.post<AIConversationMessage>(
    `/ai/conversations/${conversationId}/messages`,
    request
  );
  return response.data;
}

/**
 * Delete a conversation.
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  await api.delete(`/ai/conversations/${conversationId}`);
}

// =============================================================================
// Template Endpoints
// =============================================================================

/**
 * List available prompt templates.
 */
export async function listTemplates(category?: string): Promise<AIPromptTemplate[]> {
  const response = await api.get<AIPromptTemplate[]>('/ai/templates', {
    params: category ? { category } : undefined,
  });
  return response.data;
}

// =============================================================================
// Usage Endpoints
// =============================================================================

/**
 * Get AI usage summary for the organization.
 */
export async function getUsageSummary(days?: number): Promise<AIUsageSummary> {
  const response = await api.get<AIUsageSummary>('/ai/usage/summary', {
    params: days ? { days } : undefined,
  });
  return response.data;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Helper to collect streaming response into a single string.
 */
export async function collectStream(generator: AsyncGenerator<string>): Promise<string> {
  let result = '';
  for await (const chunk of generator) {
    result += chunk;
  }
  return result;
}

// =============================================================================
// Auto-Review Configuration Endpoints
// =============================================================================

/**
 * Get the organization's auto-review configuration.
 */
export async function getAutoReviewConfig(): Promise<AutoReviewConfig> {
  const response = await api.get<AutoReviewConfig>('/ai/auto-review/config');
  return response.data;
}

/**
 * Update the organization's auto-review configuration.
 */
export async function updateAutoReviewConfig(
  updates: AutoReviewConfigUpdate
): Promise<AutoReviewConfig> {
  const response = await api.put<AutoReviewConfig>('/ai/auto-review/config', updates);
  return response.data;
}
