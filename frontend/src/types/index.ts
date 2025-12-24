// Re-export all types from api.ts
export * from "./api";

// Re-export AI types
export * from "./ai";

// Re-export Review types
export * from "./review";

// Additional frontend-specific types

export type ViewMode = "list" | "grid" | "kanban";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface SortOption {
  field: string;
  direction: "asc" | "desc";
  label: string;
}

// Idea types (extended from API)
export interface Idea {
  id: string;
  content: string;
  title: string | null;
  tags: string[];
  status: "captured" | "reviewed" | "converted" | "archived";
  source: "web" | "mobile" | "voice" | "api";
  is_pinned: boolean;
  ai_summary: string | null;
  ai_suggested_tags: string[];
  converted_to_project_id: string | null;
  converted_to_task_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
  // Owner info
  user_id?: string;
  user_name?: string | null;
  user_email?: string | null;
}

// Project ancestor for breadcrumb display
export interface ProjectAncestor {
  id: string;
  name: string;
  color: string | null;
}

// Project types (extended from API)
export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "completed" | "archived" | "on_hold";
  priority: "low" | "medium" | "high" | "urgent";
  visibility: "private" | "team" | "organization";
  project_type: string;
  team_id: string;
  parent_id: string | null;
  start_date: string | null;
  target_end_date: string | null;
  actual_end_date: string | null;
  tags: string[];
  color: string | null;
  emoji?: string | null;
  is_archived: boolean;
  is_demo?: boolean;
  settings: Record<string, unknown>;
  created_by_id: string | null;
  // Creator info
  created_by_name?: string | null;
  created_by_email?: string | null;
  created_at: string;
  updated_at: string;
  task_count?: number;
  completed_task_count?: number;
  has_children?: boolean;
  children_count?: number;
  ancestors?: ProjectAncestor[] | null;  // Populated when include_ancestors=true
  // Team/Organization context for display
  team_name?: string | null;
  team_is_personal?: boolean;
  organization_id?: string | null;
  organization_name?: string | null;
  // Org-public access
  is_org_public?: boolean;
  org_public_role?: "viewer" | "member";
}

// Project tree node for hierarchical display
export interface ProjectTreeNode {
  id: string;
  name: string;
  description: string | null;
  status: string;
  parent_id: string | null;
  has_children: boolean;
  children_count: number;
  task_count: number;
  children: ProjectTreeNode[];
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  template_type: string;
  is_system: boolean;
  usage_count: number;
}

// Task types (extended from API)
export interface Task {
  id: string;
  title: string;
  description: string | Record<string, unknown> | null; // JSONB TipTap content or legacy string
  status: "idea" | "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  task_type: string;
  project_id: string;
  project_name?: string | null; // Populated when fetching aggregated tasks
  assignee_id: string | null;
  created_by_id: string | null;
  // Creator info
  created_by_name?: string | null;
  created_by_email?: string | null;
  due_date: string | null;
  completed_at: string | null;
  position: number;
  estimated_hours: number | null;
  actual_hours: number | null;
  parent_task_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  comment_count?: number;
  subtask_count?: number;
  // Multi-assignee support
  assignments?: TaskAssignment[];
  // Task-document links
  documents?: TaskDocument[];
  // Idea-specific fields (populated when status="idea")
  vote_count?: number;
  user_voted?: boolean;
  impact_score?: number | null;
  effort_score?: number | null;
  // Source idea (if task was created from personal idea capture)
  source_idea_id?: string | null;
  source_idea?: SourceIdea | null;
}

// Source idea info for task context
export interface SourceIdea {
  id: string;
  content: string;
  title: string | null;
  tags: string[];
  source: string;
  created_at: string;
}

export interface TasksByStatus {
  idea: Task[];
  todo: Task[];
  in_progress: Task[];
  in_review: Task[];
  done: Task[];
}

// Idea vote types
export interface IdeaVote {
  id: string;
  task_id: string;
  user_id: string;
  vote_type: string;
  created_at: string;
  user_name?: string | null;
  user_email?: string | null;
}

export interface IdeaScoreUpdate {
  impact_score: number; // 1-5
  effort_score: number; // 1-5
  notes?: string | null;
}

export interface ConvertToTaskRequest {
  target_status?: "todo" | "in_progress" | "in_review";
  assignee_id?: string | null;
  due_date?: string | null;
}

export interface ConvertToProjectRequest {
  name: string;
  description?: string | null;
  team_id?: string | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  parent_comment_id: string | null;
  edited_at: string | null;
  created_at: string;
  // User info (when loaded from backend)
  user_name?: string | null;
  user_email?: string | null;
  // Reactions (when loaded)
  reactions?: ReactionSummary[];
  // Mentions (when loaded)
  mentions?: MentionInfo[];
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  user_reacted: boolean;
}

export interface CommentReaction {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface MentionInfo {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
}

export interface TaskAssignment {
  id: string;
  task_id: string;
  user_id: string;
  assigned_by_id: string | null;
  role: "assignee" | "lead" | "reviewer" | "observer";
  status: "assigned" | "accepted" | "in_progress" | "completed";
  due_date: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // User info (when loaded)
  user_name?: string | null;
  user_email?: string | null;
}

export interface TaskAssignmentCreate {
  user_ids: string[];
  role?: "assignee" | "lead" | "reviewer" | "observer";
  due_date?: string | null;
  notes?: string | null;
}

export interface TaskAssignmentUpdate {
  role?: "assignee" | "lead" | "reviewer" | "observer";
  status?: "assigned" | "accepted" | "in_progress" | "completed";
  due_date?: string | null;
  notes?: string | null;
}

export interface TaskDocument {
  id: string;
  task_id: string;
  document_id: string;
  link_type: "reference" | "attachment" | "deliverable" | "input" | "output";
  is_primary: boolean;
  requires_review: boolean;
  position: number;
  notes: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  // Document info when loaded
  document_title?: string | null;
  document_type?: string | null;
}

export interface TaskDocumentCreate {
  document_ids: string[];
  link_type?: "reference" | "attachment" | "deliverable" | "input" | "output";
  is_primary?: boolean;
  requires_review?: boolean;
  notes?: string | null;
}

export interface TaskDocumentUpdate {
  link_type?: "reference" | "attachment" | "deliverable" | "input" | "output";
  is_primary?: boolean;
  requires_review?: boolean;
  notes?: string | null;
}

// Recurring Task Rule types
export type RecurrenceType = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly" | "custom";

export interface RecurrenceConfig {
  days_of_week?: number[]; // 0=Monday, 6=Sunday
  day_of_month?: number;
  month?: number;
  day?: number;
  interval_days?: number;
  week_start?: number;
}

export interface RecurringTaskRule {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  task_type: string;
  priority: "low" | "medium" | "high" | "urgent";
  tags: string[];
  estimated_hours: number | null;
  created_by_id: string | null;
  default_assignee_ids: string[];
  recurrence_type: RecurrenceType;
  recurrence_config: RecurrenceConfig;
  start_date: string;
  end_date: string | null;
  due_date_offset_days: number | null;
  next_occurrence: string | null;
  last_created_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecurringTaskRuleCreate {
  title: string;
  description?: string | null;
  task_type?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  tags?: string[];
  estimated_hours?: number | null;
  default_assignee_ids?: string[];
  recurrence_type: RecurrenceType;
  recurrence_config?: RecurrenceConfig;
  start_date: string;
  end_date?: string | null;
  due_date_offset_days?: number | null;
  is_active?: boolean;
}

export interface RecurringTaskRuleUpdate {
  title?: string;
  description?: string | null;
  task_type?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  tags?: string[];
  estimated_hours?: number | null;
  default_assignee_ids?: string[];
  recurrence_type?: RecurrenceType;
  recurrence_config?: RecurrenceConfig;
  start_date?: string;
  end_date?: string | null;
  due_date_offset_days?: number | null;
  is_active?: boolean;
}

// Custom Field types
export type CustomFieldType = "text" | "number" | "date" | "select" | "multi_select" | "user" | "checkbox" | "url";

export interface CustomFieldConfig {
  options?: string[]; // For select/multi_select
  max_length?: number; // For text
  min?: number; // For number
  max?: number; // For number
  default?: unknown;
}

export interface CustomField {
  id: string;
  project_id: string;
  name: string;
  display_name: string;
  description: string | null;
  field_type: CustomFieldType;
  field_config: CustomFieldConfig;
  applies_to: string[];
  is_required: boolean;
  is_active: boolean;
  position: number;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomFieldCreate {
  name: string; // lowercase letters, numbers, underscores only
  display_name: string;
  description?: string | null;
  field_type: CustomFieldType;
  field_config?: CustomFieldConfig;
  applies_to?: string[];
  is_required?: boolean;
  position?: number;
}

export interface CustomFieldUpdate {
  display_name?: string;
  description?: string | null;
  field_config?: CustomFieldConfig;
  applies_to?: string[];
  is_required?: boolean;
  is_active?: boolean;
  position?: number;
}

export interface CustomFieldValue {
  id: string;
  task_id: string;
  field_id: string;
  value: { value: unknown } | null;
  field_name: string | null;
  field_display_name: string | null;
  field_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomFieldValueSet {
  field_id: string;
  value: unknown;
}

// =============================================================================
// Journal Types
// =============================================================================

export type JournalScope = "personal" | "project";
export type JournalEntryType = "observation" | "experiment" | "meeting" | "idea" | "reflection" | "protocol";
export type LinkedEntityType = "project" | "task" | "document" | "paper";
export type JournalLinkType = "reference" | "result" | "follow_up" | "related";

export interface JournalEntryLink {
  id: string;
  journal_entry_id: string;
  linked_entity_type: LinkedEntityType;
  linked_entity_id: string;
  link_type: JournalLinkType;
  notes: string | null;
  position: number;
  created_by_id: string | null;
  created_at: string;
  linked_entity_title?: string | null;
}

export interface JournalEntry {
  id: string;
  title: string | null;
  content: Record<string, unknown>;
  content_text: string | null;
  entry_date: string;
  scope: JournalScope;
  user_id: string | null;
  project_id: string | null;
  project_name: string | null;
  organization_id: string;
  created_by_id: string | null;
  last_edited_by_id: string | null;
  entry_type: JournalEntryType;
  tags: string[];
  word_count: number;
  mood: string | null;
  is_archived: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  links: JournalEntryLink[];
}

export interface JournalEntryCreate {
  title?: string | null;
  content?: Record<string, unknown>;
  entry_date: string;
  scope?: JournalScope;
  project_id?: string | null;
  entry_type?: JournalEntryType;
  tags?: string[];
  mood?: string | null;
}

export interface JournalEntryUpdate {
  title?: string | null;
  content?: Record<string, unknown>;
  entry_date?: string;
  entry_type?: JournalEntryType;
  tags?: string[];
  mood?: string | null;
  is_pinned?: boolean;
  is_archived?: boolean;
}

export interface JournalEntryLinkCreate {
  linked_entity_type: LinkedEntityType;
  linked_entity_id: string;
  link_type?: JournalLinkType;
  notes?: string | null;
}

export interface JournalListParams {
  scope?: "personal" | "project" | "all";
  project_id?: string;
  entry_type?: JournalEntryType;
  tags?: string[];
  search?: string;
  entry_date_from?: string;
  entry_date_to?: string;
  include_archived?: boolean;
  page?: number;
  page_size?: number;
  sort_by?: "entry_date" | "created_at" | "updated_at";
  sort_order?: "asc" | "desc";
}

export interface JournalListResponse {
  items: JournalEntry[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface JournalCalendarResponse {
  entries_by_date: Record<string, number>;
}

// =============================================================================
// Blocker Types
// =============================================================================

export type BlockerStatus = "open" | "in_progress" | "resolved" | "wont_fix";
export type BlockerPriority = "low" | "medium" | "high" | "urgent";
export type BlockerType = "general" | "external_dependency" | "resource" | "technical" | "approval";
export type BlockerResolutionType = "resolved" | "wont_fix" | "deferred" | "duplicate";
export type BlockerImpactLevel = "low" | "medium" | "high" | "critical";
export type BlockedEntityType = "task" | "project";

export interface Blocker {
  id: string;
  title: string;
  description: string | Record<string, unknown> | null;
  status: BlockerStatus;
  priority: BlockerPriority;
  blocker_type: BlockerType;
  resolution_type: BlockerResolutionType | null;
  impact_level: BlockerImpactLevel;
  project_id: string;
  assignee_id: string | null;
  created_by_id: string | null;
  due_date: string | null;
  resolved_at: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  blocked_items_count?: number;
  // Optional populated fields
  assignee_name?: string | null;
  assignee_email?: string | null;
}

export interface BlockerLink {
  id: string;
  blocker_id: string;
  blocked_entity_type: BlockedEntityType;
  blocked_entity_id: string;
  notes: string | null;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  blocked_entity_title?: string | null;
}

export interface BlockerCreate {
  title: string;
  description?: string | Record<string, unknown> | null;
  project_id: string;
  status?: BlockerStatus;
  priority?: BlockerPriority;
  blocker_type?: BlockerType;
  impact_level?: BlockerImpactLevel;
  assignee_id?: string | null;
  due_date?: string | null;
  tags?: string[];
}

export interface BlockerUpdate {
  title?: string;
  description?: string | Record<string, unknown> | null;
  status?: BlockerStatus;
  priority?: BlockerPriority;
  blocker_type?: BlockerType;
  resolution_type?: BlockerResolutionType | null;
  impact_level?: BlockerImpactLevel;
  assignee_id?: string | null;
  due_date?: string | null;
  tags?: string[];
}

export interface BlockerLinkCreate {
  blocked_entity_type: BlockedEntityType;
  blocked_entity_id: string;
  notes?: string | null;
}

export interface BlockerListParams {
  project_id?: string;
  status?: BlockerStatus;
  priority?: BlockerPriority;
  blocker_type?: BlockerType;
  assignee_id?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface BlockerListResponse {
  items: Blocker[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

// =============================================================================
// Team Types (Extended)
// =============================================================================

export type TeamMemberRole = "owner" | "lead" | "member";

export interface TeamMember {
  id?: string;
  team_id?: string;
  user_id: string;
  role: TeamMemberRole;
  created_at?: string;
  updated_at?: string;
  // User info from API
  display_name?: string | null;
  email?: string | null;
  // Legacy field names (for backwards compatibility)
  user_name?: string | null;
  user_email?: string | null;
}

export interface TeamDetail {
  id: string;
  name: string;
  description: string | null;
  department_id: string | null;
  organization_id: string | null;
  is_personal: boolean;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  member_count: number;
  project_count: number;
  current_user_role?: TeamMemberRole | null;
}

export interface TeamCreate {
  name: string;
  description?: string | null;
  organization_id?: string | null;
}

export interface TeamUpdate {
  name?: string;
  description?: string | null;
}

export interface TeamListParams {
  organization_id?: string;
  include_personal?: boolean;
  page?: number;
  page_size?: number;
}

// =============================================================================
// Invite Code Types
// =============================================================================

export interface InviteCode {
  id: string;
  code: string;
  organization_id: string | null;
  team_id: string | null;
  role: string;
  created_by: string | null;
  email: string | null;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Creator info (when loaded)
  created_by_name?: string | null;
}

export interface InviteCodeCreate {
  role?: string;
  email?: string | null;
  expires_in_hours?: number | null;
  max_uses?: number | null;
}

export interface InvitePreview {
  code: string;
  type: "team" | "organization";
  name: string;
  role: string;
  is_valid: boolean;
  error: string | null;
}

export interface JoinResult {
  success: boolean;
  type: "team" | "organization";
  id: string;
  name: string;
  role: string;
}

// =============================================================================
// Organization Types (Extended)
// =============================================================================

export type OrganizationMemberRole = "admin" | "member";

export interface OrganizationMemberDetail {
  id?: string;
  organization_id?: string;
  user_id: string;
  role: OrganizationMemberRole;
  created_at?: string;
  updated_at?: string;
  // User info - API returns these field names
  display_name?: string | null;
  email?: string | null;
  // Legacy field names for backwards compatibility
  user_name?: string | null;
  user_email?: string | null;
}

export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  member_count: number;
  team_count: number;
  current_user_role?: OrganizationMemberRole | null;
}

export interface OrganizationUpdate {
  name?: string;
  settings?: Record<string, unknown>;
}
