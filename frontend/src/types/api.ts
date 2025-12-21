// User types
export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  title: string | null;
  department: string | null;
  research_interests: string[];
  onboarding_completed: boolean;
  onboarding_step: number;
  created_at: string;
}

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  language: string;
  timezone: string;
  notification_email: boolean;
  notification_email_digest: "immediate" | "daily" | "weekly" | "none";
  notification_in_app: boolean;
  default_project_view: "list" | "kanban" | "timeline";
  editor_font_size: number;
  editor_line_height: number;
  ai_suggestions_enabled: boolean;
}

// Auth types
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string | null;
}

// Organization types
export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
}

export interface Department {
  id: string;
  name: string;
  organization_id: string;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  department_id: string | null;
  organization_id: string;
}

export interface OrganizationMember {
  user_id: string;
  email: string;
  display_name: string;
  role: "admin" | "member";
}

// Project types
export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "completed" | "archived" | "on_hold";
  visibility: "private" | "team" | "organization";
  project_type: string;
  team_id: string;
  parent_id: string | null;
  settings: Record<string, unknown>;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  task_type: "general" | "paper_review" | "data_analysis" | "writing" | "meeting";
  assignee_id: string | null;
  due_date: string | null;
  position: number;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

// Document types
export interface Document {
  id: string;
  project_id: string;
  title: string;
  content: Record<string, unknown>;
  document_type: string;
  status: "draft" | "in_review" | "approved" | "published";
  version: number;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version: number;
  content: Record<string, unknown>;
  change_summary: string | null;
  created_by_id: string;
  created_at: string;
}

// Knowledge types
export interface Paper {
  id: string;
  doi: string | null;
  pmid: string | null;
  title: string;
  authors: string[];
  journal: string | null;
  publication_date: string | null;
  abstract: string | null;
  pdf_url: string | null;
  ai_summary: string | null;
  organization_id: string;
  added_by_id: string;
  created_at: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  is_smart: boolean;
  filter_criteria: Record<string, unknown> | null;
  organization_id: string;
  created_by_id: string;
  created_at: string;
}

// API Response types
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface ApiError {
  detail: string;
  code?: string;
}

// Search types
export interface SearchResult {
  type: "project" | "task" | "document" | "paper" | "user";
  id: string;
  title: string;
  snippet: string;
  url: string;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  suggestions: string[];
}

// Notification types
export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
