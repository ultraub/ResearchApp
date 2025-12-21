/**
 * Analytics API service.
 */

import { api } from './api';

export interface OverviewMetrics {
  total_projects: number;
  active_projects: number;
  total_tasks: number;
  completed_tasks: number;
  task_completion_rate: number;
  total_documents: number;
  total_ideas: number;
  total_papers: number;
  total_members: number;
  active_members_last_week: number;
}

export interface TaskStatusBreakdown {
  todo: number;
  in_progress: number;
  in_review: number;
  completed: number;
  blocked: number;
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface TimeSeriesData {
  label: string;
  data: TimeSeriesPoint[];
}

export interface ProjectProgress {
  project_id: string;
  project_name: string;
  total_tasks: number;
  completed_tasks: number;
  progress_percentage: number;
  status: string;
  // Blocker metrics
  active_blocker_count: number;
  critical_blocker_count: number;
  max_blocker_impact: string | null;
  // Comment metrics
  total_comment_count: number;
  unread_comment_count: number;
}

/** Simplified blocker data for hover display */
export interface BlockerSummaryItem {
  id: string;
  title: string;
  impact_level: string;
  status: string;
  due_date: string | null;
}

/** Simplified comment data for hover display */
export interface CommentSummaryItem {
  id: string;
  author_name: string | null;
  content: string;
  created_at: string;
  task_title: string | null;
}

/** Detailed data for project attention hover card */
export interface ProjectAttentionDetails {
  project_id: string;
  project_name: string;
  blockers: BlockerSummaryItem[];
  recent_comments: CommentSummaryItem[];
}

export interface ActivityMetrics {
  activity_type: string;
  count: number;
  percentage: number;
}

export interface TeamProductivity {
  user_id: string;
  user_name: string | null;
  tasks_completed: number;
  documents_created: number;
  comments_made: number;
  activity_score: number;
}

export interface DashboardAnalytics {
  overview: OverviewMetrics;
  task_status: TaskStatusBreakdown;
  activity_over_time: TimeSeriesData[];
  project_progress: ProjectProgress[];
  recent_activity_types: ActivityMetrics[];
  top_contributors: TeamProductivity[];
}

export const analyticsApi = {
  async getOverview(organizationId: string): Promise<OverviewMetrics> {
    const response = await api.get<OverviewMetrics>(`/analytics/overview?organization_id=${organizationId}`);
    return response.data;
  },

  async getTaskStatus(
    organizationId: string,
    projectId?: string
  ): Promise<TaskStatusBreakdown> {
    const params = new URLSearchParams();
    params.append('organization_id', organizationId);
    if (projectId) params.append('project_id', projectId);

    const response = await api.get<TaskStatusBreakdown>(`/analytics/task-status?${params}`);
    return response.data;
  },

  async getActivityTimeline(
    organizationId: string,
    days = 30
  ): Promise<TimeSeriesData[]> {
    const params = new URLSearchParams();
    params.append('organization_id', organizationId);
    params.append('days', days.toString());

    const response = await api.get<TimeSeriesData[]>(`/analytics/activity-timeline?${params}`);
    return response.data;
  },

  async getProjectProgress(
    organizationId: string,
    limit?: number
  ): Promise<ProjectProgress[]> {
    const params = new URLSearchParams();
    params.append('organization_id', organizationId);
    if (limit !== undefined) {
      params.append('limit', limit.toString());
    }

    const response = await api.get<ProjectProgress[]>(`/analytics/project-progress?${params}`);
    return response.data;
  },

  async getProjectAttentionDetails(projectId: string): Promise<ProjectAttentionDetails> {
    const response = await api.get<ProjectAttentionDetails>(`/analytics/project-attention/${projectId}`);
    return response.data;
  },

  async getActivityTypes(
    organizationId: string,
    days = 30
  ): Promise<ActivityMetrics[]> {
    const params = new URLSearchParams();
    params.append('organization_id', organizationId);
    params.append('days', days.toString());

    const response = await api.get<ActivityMetrics[]>(`/analytics/activity-types?${params}`);
    return response.data;
  },

  async getTeamProductivity(
    organizationId: string,
    days = 30,
    limit = 10
  ): Promise<TeamProductivity[]> {
    const params = new URLSearchParams();
    params.append('organization_id', organizationId);
    params.append('days', days.toString());
    params.append('limit', limit.toString());

    const response = await api.get<TeamProductivity[]>(`/analytics/team-productivity?${params}`);
    return response.data;
  },

  async getDashboard(organizationId: string): Promise<DashboardAnalytics> {
    const response = await api.get<DashboardAnalytics>(`/analytics/dashboard?organization_id=${organizationId}`);
    return response.data;
  },
};
