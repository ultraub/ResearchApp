/**
 * AI module types for Pasteur.
 */

// Enums
export type AIFeatureName =
  | 'document_assistant'
  | 'knowledge_summarization'
  | 'review_helper'
  | 'search_copilot'
  | 'task_generation';

export type DocumentAction = 'expand' | 'simplify' | 'continue' | 'structure' | 'formalize';

export type SummaryType = 'general' | 'methods' | 'findings';

// Request types
export interface AIGenerateRequest {
  template_key: string;
  variables: Record<string, unknown>;
  context_type?: string;
  context_id?: string;
  stream?: boolean;
}

export interface AIDocumentActionRequest {
  action: DocumentAction;
  document_id: string;
  selected_text?: string;
  document_type?: string;
  surrounding_context?: string;
  instructions?: string;
  stream?: boolean;
}

export interface AIPaperSummarizeRequest {
  paper_id: string;
  summary_type?: SummaryType;
}

export interface AIConversationCreateRequest {
  feature_name: AIFeatureName;
  context_type?: string;
  context_id?: string;
  initial_message?: string;
}

export interface AIConversationMessageRequest {
  content: string;
  stream?: boolean;
}

// Response types
export interface AIGenerateResponse {
  content: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  phi_detected: boolean;
  phi_warnings: string[];
}

export interface AIDocumentActionResponse {
  content: string;
  action: DocumentAction;
  model: string;
  tokens_used: number;
}

export interface AIPaperSummaryResponse {
  paper_id: string;
  summary_type: SummaryType;
  summary: string;
  model: string;
  tokens_used: number;
}

export interface AIConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface AIConversation {
  id: string;
  feature_name: string;
  context_type: string | null;
  context_id: string | null;
  title: string | null;
  is_active: boolean;
  total_input_tokens: number;
  total_output_tokens: number;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface AIConversationWithMessages extends AIConversation {
  messages: AIConversationMessage[];
}

export interface AIConversationListResponse {
  items: AIConversation[];
  total: number;
  page: number;
  page_size: number;
}

export interface AIPromptTemplate {
  template_key: string;
  display_name: string;
  category: string;
  description: string | null;
  is_custom: boolean;
}

export interface AIUsageSummary {
  period_start: string;
  period_end: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  estimated_cost_cents: number;
  by_feature: Record<string, number>;
}

// Auto-review configuration
export interface AutoReviewConfig {
  organization_id: string;
  on_document_create: boolean;
  on_document_update: boolean;
  on_task_submit_review: boolean;
  default_focus_areas: string[];
  min_document_length: number;
  review_cooldown_hours: number;
  max_suggestions_per_review: number;
  auto_create_review: boolean;
  updated_at: string;
}

export interface AutoReviewConfigUpdate {
  on_document_create?: boolean;
  on_document_update?: boolean;
  on_task_submit_review?: boolean;
  default_focus_areas?: string[];
  min_document_length?: number;
  review_cooldown_hours?: number;
  max_suggestions_per_review?: number;
  auto_create_review?: boolean;
}

// Quick action configuration
export interface QuickAction {
  action: DocumentAction;
  label: string;
  description: string;
  icon: string;
  requiresSelection: boolean;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    action: 'expand',
    label: 'Expand',
    description: 'Elaborate on selected text with more detail',
    icon: 'ArrowsPointingOutIcon',
    requiresSelection: true,
  },
  {
    action: 'simplify',
    label: 'Simplify',
    description: 'Make text clearer and more accessible',
    icon: 'SparklesIcon',
    requiresSelection: true,
  },
  {
    action: 'continue',
    label: 'Continue',
    description: 'Write the next paragraph or section',
    icon: 'ArrowRightIcon',
    requiresSelection: false,
  },
  {
    action: 'structure',
    label: 'Structure',
    description: 'Suggest an outline or organization',
    icon: 'ListBulletIcon',
    requiresSelection: false,
  },
  {
    action: 'formalize',
    label: 'Formalize',
    description: 'Convert to academic/professional tone',
    icon: 'AcademicCapIcon',
    requiresSelection: true,
  },
];
