/**
 * Dashboard Command Center types.
 */

// Task summary for dashboard display
export interface TaskSummary {
  id: string;
  title: string;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: string;
  project_id: string;
  project_name: string;
  assignee_id: string | null;
  assignee_name: string | null;
  is_blocked: boolean;
  days_overdue?: number;
  days_stalled?: number;
}

// Blocker summary for dashboard display
export interface BlockerSummary {
  id: string;
  title: string;
  status: 'open' | 'in_progress';
  priority: string;
  impact_level: 'low' | 'medium' | 'high' | 'critical';
  assignee_id: string | null;
  assignee_name: string | null;
  project_id: string;
  project_name: string;
  blocked_items_count: number;
  days_open: number;
}

// Blockers list with total count
export interface BlockersList {
  items: BlockerSummary[];
  total_count: number;
}

// Summary counts for dashboard badges
export interface DashboardSummary {
  total_blockers: number;
  critical_blockers: number;
  overdue_count: number;
  stalled_count: number;
  due_today: number;
  due_this_week: number;
}

// Complete command center dashboard data
export interface CommandCenterData {
  blockers: BlockersList;
  tasks_by_day: Record<string, TaskSummary[]>; // ISO date string keys
  overdue_tasks: TaskSummary[];
  stalled_tasks: TaskSummary[];
  unscheduled_tasks: TaskSummary[]; // Tasks with no due date
  summary: DashboardSummary;
}

// Scope filter type
export type ScopeFilter = 'personal' | 'team';

// Snooze options
export type SnoozeOption = 'tomorrow' | 'next_week';

// Priority colors for styling
export const PRIORITY_COLORS = {
  urgent: {
    border: 'border-l-red-500',
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
  },
  high: {
    border: 'border-l-orange-500',
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-300',
  },
  medium: {
    border: 'border-l-primary-400',
    bg: 'bg-primary-100 dark:bg-primary-900/30',
    text: 'text-primary-700 dark:text-primary-300',
  },
  low: {
    border: 'border-l-gray-300',
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-600 dark:text-gray-400',
  },
} as const;

// Impact colors for blockers
export const IMPACT_COLORS = {
  critical: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
    border: 'border-l-red-500',
    headerBg: 'bg-red-50 dark:bg-red-900/20',
    headerBorder: 'border-red-200 dark:border-red-800',
  },
  high: {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500',
    border: 'border-l-orange-500',
    headerBg: 'bg-orange-50 dark:bg-orange-900/20',
    headerBorder: 'border-orange-200 dark:border-orange-800',
  },
  medium: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
    border: 'border-l-blue-400',
    headerBg: 'bg-blue-50 dark:bg-blue-900/20',
    headerBorder: 'border-blue-200 dark:border-blue-800',
  },
  low: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-600 dark:text-gray-400',
    dot: 'bg-gray-400',
    border: 'border-l-gray-400',
    headerBg: 'bg-gray-50 dark:bg-gray-900/20',
    headerBorder: 'border-gray-200 dark:border-gray-800',
  },
} as const;

// Urgency colors based on due date
export const URGENCY_COLORS = {
  overdue: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
  },
  today: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-200 dark:border-orange-800',
  },
  tomorrow: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
  },
  this_week: {
    bg: 'bg-primary-50 dark:bg-primary-900/20',
    text: 'text-primary-600 dark:text-primary-400',
    border: 'border-primary-200 dark:border-primary-800',
  },
  future: {
    bg: 'bg-gray-50 dark:bg-gray-900/20',
    text: 'text-gray-600 dark:text-gray-400',
    border: 'border-gray-200 dark:border-gray-800',
  },
} as const;
