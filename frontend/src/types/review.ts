/**
 * Review workflow types for document collaboration.
 */

export type ReviewType = 'feedback' | 'approval' | 'peer_review' | 'editorial';
export type ReviewStatus = 'pending' | 'in_progress' | 'changes_requested' | 'approved' | 'completed' | 'cancelled';
export type ReviewPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ReviewDecision = 'approved' | 'rejected' | 'needs_revision';
export type AssignmentStatus = 'pending' | 'accepted' | 'declined' | 'in_progress' | 'completed';
export type AssignmentRole = 'reviewer' | 'primary_reviewer' | 'approver';
export type ReviewerRecommendation = 'approve' | 'reject' | 'revise' | 'abstain';
export type CommentType = 'general' | 'inline' | 'suggestion' | 'question' | 'issue' | 'gap_identified' | 'clarity_needed' | 'methodology_concern' | 'consistency_issue';
export type CommentSeverity = 'critical' | 'major' | 'minor' | 'suggestion';
export type CommentSource = 'human' | 'ai_suggestion' | 'ai_accepted' | 'ai_dismissed';

export interface ReviewAssignment {
  id: string;
  review_id: string;
  reviewer_id: string;
  assigned_by_id: string | null;
  status: AssignmentStatus;
  role: AssignmentRole;
  responded_at: string | null;
  completed_at: string | null;
  recommendation: ReviewerRecommendation | null;
  notes: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewComment {
  id: string;
  review_id: string;
  user_id: string;
  content: string;
  comment_type: CommentType;
  selected_text: string | null;
  anchor_data: ReviewCommentAnchor | null;
  severity: CommentSeverity | null;
  is_resolved: boolean;
  resolved_by_id: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  parent_comment_id: string | null;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  replies: ReviewComment[];
  // AI-specific fields
  source: CommentSource;
  ai_confidence: number | null;
  question_for_author: string | null;
  why_this_matters: string | null;
}

/** Anchor data for positioning comments in documents/tasks */
export interface ReviewCommentAnchor {
  source_type: 'task' | 'document';
  source_id: string;
  document_title?: string;
  paragraph?: number;
  text_snippet?: string;
  offset?: number;
  [key: string]: unknown;
}

export interface Review {
  id: string;
  document_id: string;
  project_id: string;
  title: string;
  description: string | null;
  review_type: ReviewType;
  status: ReviewStatus;
  priority: ReviewPriority;
  document_version: number;
  requested_by_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by_id: string | null;
  decision: ReviewDecision | null;
  decision_notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  assignments: ReviewAssignment[];
}

export interface ReviewListResponse {
  items: Review[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReviewStats {
  total_comments: number;
  resolved_comments: number;
  unresolved_comments: number;
  total_reviewers: number;
  completed_reviews: number;
  pending_reviews: number;
  completion_percentage: number;
}

// Request types
export interface CreateReviewRequest {
  document_id: string;
  project_id: string;
  title: string;
  description?: string;
  review_type?: ReviewType;
  priority?: ReviewPriority;
  due_date?: string;
  reviewer_ids?: string[];
  tags?: string[];
}

export interface UpdateReviewRequest {
  title?: string;
  description?: string;
  status?: ReviewStatus;
  priority?: ReviewPriority;
  due_date?: string;
  decision?: ReviewDecision;
  decision_notes?: string;
  tags?: string[];
}

export interface CreateAssignmentRequest {
  reviewer_id: string;
  role?: AssignmentRole;
  due_date?: string;
}

export interface UpdateAssignmentRequest {
  status?: AssignmentStatus;
  recommendation?: ReviewerRecommendation;
  notes?: string;
}

export interface CreateCommentRequest {
  content: string;
  comment_type?: CommentType;
  selected_text?: string;
  anchor_data?: ReviewCommentAnchor;
  severity?: CommentSeverity;
  parent_comment_id?: string;
  // AI-specific fields (for programmatic creation)
  source?: CommentSource;
  ai_confidence?: number;
  question_for_author?: string;
  why_this_matters?: string;
}

export interface UpdateCommentRequest {
  content?: string;
  is_resolved?: boolean;
  resolution_notes?: string;
}

/** Request to update AI suggestion status */
export interface UpdateAISuggestionRequest {
  action: 'accept' | 'dismiss';
  resolution_notes?: string;
}

/** Request to bulk update AI suggestions */
export interface BulkUpdateAISuggestionsRequest {
  comment_ids: string[];
  action: 'accept' | 'dismiss';
}

// Filter types
export interface ReviewFilters {
  project_id?: string;
  document_id?: string;
  status?: ReviewStatus;
  review_type?: ReviewType;
  assigned_to_me?: boolean;
  requested_by_me?: boolean;
  page?: number;
  page_size?: number;
}

// Helper constants
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  changes_requested: 'Changes Requested',
  approved: 'Approved',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  changes_requested: 'bg-orange-100 text-orange-800',
  approved: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
};

export const REVIEW_PRIORITY_LABELS: Record<ReviewPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export const REVIEW_PRIORITY_COLORS: Record<ReviewPriority, string> = {
  low: 'bg-gray-100 text-gray-800',
  normal: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

export const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  feedback: 'Feedback',
  approval: 'Approval',
  peer_review: 'Peer Review',
  editorial: 'Editorial',
};

export const COMMENT_TYPE_LABELS: Record<CommentType, string> = {
  general: 'General',
  inline: 'Inline',
  suggestion: 'Suggestion',
  question: 'Question',
  issue: 'Issue',
  gap_identified: 'Gap Identified',
  clarity_needed: 'Clarity Needed',
  methodology_concern: 'Methodology Concern',
  consistency_issue: 'Consistency Issue',
};

export const COMMENT_TYPE_ICONS: Record<CommentType, string> = {
  general: '💬',
  inline: '📍',
  suggestion: '💡',
  question: '❓',
  issue: '⚠️',
  gap_identified: '🔍',
  clarity_needed: '🔮',
  methodology_concern: '⚙️',
  consistency_issue: '🔄',
};

export const COMMENT_SEVERITY_LABELS: Record<CommentSeverity, string> = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
  suggestion: 'Suggestion',
};

export const COMMENT_SEVERITY_COLORS: Record<CommentSeverity, string> = {
  critical: 'bg-red-100 text-red-800',
  major: 'bg-orange-100 text-orange-800',
  minor: 'bg-yellow-100 text-yellow-800',
  suggestion: 'bg-blue-100 text-blue-800',
};

// ============================================================================
// Workflow Integration Types (Task-Review Integration)
// ============================================================================

export type WorkflowStage = 'not_started' | 'in_progress' | 'under_review' | 'review_approved' | 'review_rejected' | 'completed' | 'unknown';
export type OverallReviewStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'mixed';

/** Review summary within task review status */
export interface ReviewSummary {
  id: string;
  document_id: string;
  title: string;
  status: ReviewStatus;
  decision: ReviewDecision | null;
}

/** Aggregate review status for a task */
export interface TaskReviewStatus {
  total_reviews: number;
  pending_reviews: number;
  approved_reviews: number;
  rejected_reviews: number;
  all_approved: boolean;
  overall_status: OverallReviewStatus;
  reviews: ReviewSummary[];
}

/** Complete workflow state for a task */
export interface TaskWorkflowState {
  task_id: string;
  task_status: string;
  task_title: string;
  linked_documents: number;
  reviewable_documents: number;
  assignees: number;
  review_status: TaskReviewStatus;
  can_submit_for_review: boolean;
  submit_blocked_reason: string | null;
  workflow_stage: WorkflowStage;
}

/** A unified work item (task or review assignment) */
export interface WorkItem {
  type: 'task' | 'review';
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  assignment_status: string;
  assignment_role: string;
  project_id: string;
  created_at: string;
  // Review-specific fields
  document_id?: string;
  task_id?: string;
}

/** Response from /tasks/my/work-items endpoint */
export interface WorkItemsResponse {
  tasks: WorkItem[];
  reviews: WorkItem[];
  combined: WorkItem[];
  total_tasks: number;
  total_reviews: number;
}

/** Request to submit a task for review */
export interface SubmitForReviewRequest {
  reviewer_ids?: string[];
  review_type?: ReviewType;
  priority?: ReviewPriority;
  due_date?: string;
  auto_transition_task?: boolean;
}

/** Response from submit-for-review endpoint */
export interface SubmitForReviewResponse {
  id: string;
  document_id: string;
  title: string;
  status: ReviewStatus;
}

// Workflow status labels
export const WORKFLOW_STAGE_LABELS: Record<WorkflowStage, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  under_review: 'Under Review',
  review_approved: 'Review Approved',
  review_rejected: 'Review Rejected',
  completed: 'Completed',
  unknown: 'Unknown',
};

export const WORKFLOW_STAGE_COLORS: Record<WorkflowStage, string> = {
  not_started: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  under_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  review_approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  review_rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  unknown: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

export const OVERALL_REVIEW_STATUS_LABELS: Record<OverallReviewStatus, string> = {
  none: 'No Reviews',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  mixed: 'Mixed',
};

export const OVERALL_REVIEW_STATUS_COLORS: Record<OverallReviewStatus, string> = {
  none: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  mixed: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

// ============================================================================
// AI Review Types and Labels
// ============================================================================

export const COMMENT_SOURCE_LABELS: Record<CommentSource, string> = {
  human: 'Human',
  ai_suggestion: 'AI Suggestion',
  ai_accepted: 'AI Accepted',
  ai_dismissed: 'AI Dismissed',
};

export const COMMENT_SOURCE_COLORS: Record<CommentSource, string> = {
  human: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  ai_suggestion: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  ai_accepted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  ai_dismissed: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

/** AI comment types that represent substantive review issues */
export const AI_COMMENT_TYPES: CommentType[] = [
  'gap_identified',
  'clarity_needed',
  'methodology_concern',
  'consistency_issue',
];

/** Check if a comment is an AI-generated suggestion */
export const isAISuggestion = (comment: ReviewComment): boolean => {
  return comment.source === 'ai_suggestion';
};

/** Check if a comment has AI fields populated */
export const hasAIContent = (comment: ReviewComment): boolean => {
  return !!(comment.question_for_author || comment.why_this_matters);
};

/** Get the display badge for a comment source */
export const getCommentSourceBadge = (source: CommentSource): { label: string; color: string; icon: string } => {
  const badges: Record<CommentSource, { label: string; color: string; icon: string }> = {
    human: { label: 'Human', color: 'bg-gray-100 text-gray-700', icon: '👤' },
    ai_suggestion: { label: 'AI', color: 'bg-purple-100 text-purple-700', icon: '🤖' },
    ai_accepted: { label: 'Addressed', color: 'bg-green-100 text-green-700', icon: '✅' },
    ai_dismissed: { label: 'Dismissed', color: 'bg-gray-100 text-gray-500', icon: '➖' },
  };
  return badges[source];
};
