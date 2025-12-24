/**
 * Types for the AI Assistant chat bubble.
 */

// Page context for the assistant
export interface PageContext {
  type: string;
  id?: string;
  projectId?: string;
  name?: string;
}

// Tool call activity for display
export interface ToolActivity {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  timestamp: Date;
}

// Chat message
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  actions?: ProposedAction[];
  // For displaying model thinking (Gemini 3+)
  thinking?: string;
  // For displaying tool call activity
  toolActivity?: ToolActivity[];
}

// Proposed action from assistant
export interface ProposedAction {
  id: string;
  toolName: string;
  description: string;
  entityType: string;
  entityId?: string;
  oldState?: Record<string, unknown>;
  newState: Record<string, unknown>;
  diff: DiffEntry[];
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'expired';
  expiresAt?: string;
}

// Diff entry for showing changes
export interface DiffEntry {
  field: string;
  oldValue?: unknown;
  newValue: unknown;
  changeType: 'added' | 'modified' | 'removed';
}

// SSE events from the assistant
export type AssistantSSEEvent =
  | { event: 'text'; data: { content: string } }
  | { event: 'text_delta'; data: { content: string } }
  | { event: 'thinking'; data: { content: string } }
  | { event: 'tool_call'; data: { tool: string; input: Record<string, unknown> } }
  | { event: 'tool_result'; data: Record<string, unknown> }
  | { event: 'action_preview'; data: ProposedAction }
  | { event: 'done'; data: { conversation_id: string } }
  | { event: 'error'; data: { message: string } };

// Chat request to the assistant
export interface AssistantChatRequest {
  message: string;
  conversationId?: string;
  messages?: Array<{ role: string; content: string }>;
  pageContext?: PageContext;
  // Experimental: force use of dynamic_query instead of specialized query tools
  useDynamicQueries?: boolean;
}

// Pending action from API
export interface PendingAction {
  actionId: string;
  toolName: string;
  entityType: string;
  entityId?: string;
  oldState?: Record<string, unknown>;
  newState: Record<string, unknown>;
  status: string;
  expiresAt: string;
  createdAt: string;
}

// Action approval/rejection response
export interface ActionResponse {
  success: boolean;
  message: string;
  entityType?: string;
  entityId?: string;
}
