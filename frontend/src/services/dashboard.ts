/**
 * Dashboard Command Center API service.
 */

import { apiClient } from '@/lib/api-client';
import type {
  CommandCenterData,
  ScopeFilter,
  SnoozeOption,
  TaskSummary,
} from '@/types/dashboard';
import type { Task } from '@/types';

export interface CommandCenterParams {
  daysAhead?: number;
  scope?: ScopeFilter;
}

export const dashboardService = {
  /**
   * Get command center dashboard data.
   * Returns blockers, tasks grouped by day, overdue/stalled tasks, and summary counts.
   */
  getCommandCenterData: async (params: CommandCenterParams = {}): Promise<CommandCenterData> => {
    const queryParams = new URLSearchParams();
    if (params.daysAhead) {
      queryParams.append('days_ahead', params.daysAhead.toString());
    }
    if (params.scope) {
      queryParams.append('scope', params.scope);
    }

    const queryString = queryParams.toString();
    const url = `/dashboard/command-center${queryString ? `?${queryString}` : ''}`;

    const response = await apiClient.get<CommandCenterData>(url);
    return response.data;
  },

  /**
   * Quick complete a task - sets status to 'done' immediately.
   * Returns the updated task.
   */
  quickCompleteTask: async (taskId: string): Promise<Task> => {
    const response = await apiClient.post<Task>(`/tasks/${taskId}/quick-complete`);
    return response.data;
  },

  /**
   * Snooze a task by moving its due date.
   * @param taskId - The task to snooze
   * @param snoozeTo - 'tomorrow' or 'next_week'
   * Returns the updated task.
   */
  snoozeTask: async (taskId: string, snoozeTo: SnoozeOption): Promise<Task> => {
    const response = await apiClient.post<Task>(`/tasks/${taskId}/snooze`, {
      snooze_to: snoozeTo,
    });
    return response.data;
  },
};

/**
 * Helper to get urgency category for a due date.
 */
export function getUrgencyCategory(
  dueDate: string | null
): 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'future' {
  if (!dueDate) return 'future';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays <= 7) return 'this_week';
  return 'future';
}

/**
 * Helper to format a date as a friendly day label.
 */
export function formatDayLabel(dateString: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';

  // For dates within 7 days, show day name
  if (diffDays > 0 && diffDays <= 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }

  // For other dates, show formatted date
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Sort tasks by priority (urgent first).
 */
export function sortTasksByPriority(tasks: TaskSummary[]): TaskSummary[] {
  const priorityOrder: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...tasks].sort((a, b) => {
    const aPriority = priorityOrder[a.priority] ?? 4;
    const bPriority = priorityOrder[b.priority] ?? 4;
    return aPriority - bPriority;
  });
}
