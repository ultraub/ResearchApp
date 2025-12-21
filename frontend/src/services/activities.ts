/**
 * Activity and notification API service.
 */

import { api } from './api';

// Types
export interface Activity {
  id: string;
  activity_type: string;
  action: string;
  description: string | null;
  target_type: string;
  target_id: string;
  target_title: string | null;
  parent_type: string | null;
  parent_id: string | null;
  project_id: string | null;
  organization_id: string;
  actor_id: string;
  actor_name: string | null;
  actor_avatar: string | null;
  metadata: Record<string, unknown> | null;
  is_public: boolean;
  created_at: string;
}

export interface ActivityFeedResponse {
  activities: Activity[];
  total: number;
  has_more: boolean;
}

export interface Notification {
  id: string;
  notification_type: string;
  title: string;
  message: string | null;
  activity_id: string | null;
  target_type: string | null;
  target_id: string | null;
  target_url: string | null;
  user_id: string;
  sender_id: string | null;
  sender_name: string | null;
  organization_id: string;
  is_read: boolean;
  read_at: string | null;
  is_archived: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface NotificationListResponse {
  notifications: Notification[];
  unread_count: number;
  total: number;
  has_more: boolean;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  email_enabled: boolean;
  email_frequency: 'instant' | 'daily' | 'weekly' | 'never';
  in_app_enabled: boolean;
  notify_mentions: boolean;
  notify_assignments: boolean;
  notify_comments: boolean;
  notify_task_updates: boolean;
  notify_document_updates: boolean;
  notify_project_updates: boolean;
  notify_team_changes: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_timezone: string | null;
}

// Activity API
export const activitiesApi = {
  // Get activity feed
  async getFeed(params: {
    organization_id: string;
    project_id?: string;
    target_type?: string;
    target_id?: string;
    actor_id?: string;
    skip?: number;
    limit?: number;
  }): Promise<ActivityFeedResponse> {
    const searchParams = new URLSearchParams();
    searchParams.append('organization_id', params.organization_id);
    if (params.project_id) searchParams.append('project_id', params.project_id);
    if (params.target_type) searchParams.append('target_type', params.target_type);
    if (params.target_id) searchParams.append('target_id', params.target_id);
    if (params.actor_id) searchParams.append('actor_id', params.actor_id);
    if (params.skip !== undefined) searchParams.append('skip', params.skip.toString());
    if (params.limit !== undefined) searchParams.append('limit', params.limit.toString());

    const response = await api.get<ActivityFeedResponse>(`/activities/feed?${searchParams}`);
    return response.data;
  },

  // Get single activity
  async getById(activityId: string): Promise<Activity> {
    const response = await api.get<Activity>(`/activities/${activityId}`);
    return response.data;
  },
};

// Notifications API
// Note: Backend now uses authenticated user from token, no user_id param needed
export const notificationsApi = {
  // Get notifications for current user
  async getList(params: {
    organization_id?: string;
    is_read?: boolean;
    skip?: number;
    limit?: number;
  } = {}): Promise<NotificationListResponse> {
    const searchParams = new URLSearchParams();
    if (params.organization_id) searchParams.append('organization_id', params.organization_id);
    if (params.is_read !== undefined) searchParams.append('is_read', params.is_read.toString());
    if (params.skip !== undefined) searchParams.append('skip', params.skip.toString());
    if (params.limit !== undefined) searchParams.append('limit', params.limit.toString());

    const queryString = searchParams.toString();
    const response = await api.get<NotificationListResponse>(`/activities/notifications${queryString ? `?${queryString}` : ''}`);
    return response.data;
  },

  // Mark notifications as read
  async markRead(params: {
    notification_ids?: string[];
    mark_all?: boolean;
  }): Promise<void> {
    await api.post('/activities/notifications/mark-read', {
      notification_ids: params.notification_ids,
      mark_all: params.mark_all,
    });
  },

  // Archive notification
  async archive(notificationId: string): Promise<void> {
    await api.post(`/activities/notifications/${notificationId}/archive`);
  },

  // Get notification preferences for current user
  async getPreferences(): Promise<NotificationPreferences> {
    const response = await api.get<NotificationPreferences>('/activities/notifications/preferences');
    return response.data;
  },

  // Update notification preferences for current user
  async updatePreferences(
    updates: Partial<Omit<NotificationPreferences, 'id' | 'user_id'>>
  ): Promise<NotificationPreferences> {
    const response = await api.patch<NotificationPreferences>('/activities/notifications/preferences', updates);
    return response.data;
  },
};
