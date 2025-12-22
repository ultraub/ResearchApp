/**
 * Sharing, invitations, comments, and reactions API service.
 */

import { api } from './api';

// Types
export interface ProjectShare {
  id: string;
  project_id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  role: 'viewer' | 'editor' | 'admin';
  granted_by_id: string;
  granted_by_name: string | null;
  last_accessed_at: string | null;
  access_count: number;
  notify_on_updates: boolean;
  created_at: string;
}

export interface ShareLink {
  id: string;
  token: string;
  resource_type: 'project' | 'document' | 'collection';
  resource_id: string;
  access_level: 'view' | 'comment' | 'edit';
  requires_auth: boolean;
  has_password: boolean;
  allowed_domains: string[] | null;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  is_active: boolean;
  created_by_name: string | null;
  url: string;
  created_at: string;
}

export interface Invitation {
  id: string;
  invitation_type: 'organization' | 'project';
  organization_id: string;
  organization_name: string | null;
  project_id: string | null;
  project_name: string | null;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
  personal_message: string | null;
  invited_by_id: string;
  invited_by_name: string | null;
  expires_at: string;
  created_at: string;
}

export interface Comment {
  id: string;
  content: string;
  content_html: string | null;
  resource_type: string;
  resource_id: string;
  parent_id: string | null;
  thread_id: string | null;
  author_id: string;
  author_name: string | null;
  author_avatar: string | null;
  is_edited: boolean;
  edited_at: string | null;
  is_deleted: boolean;
  is_resolved: boolean;
  resolved_by_name: string | null;
  resolved_at: string | null;
  reply_count: number;
  created_at: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  users: Array<{
    id: string;
    name: string | null;
  }>;
  user_reacted: boolean;
}

// Project Shares API
export const projectSharesApi = {
  async create(data: {
    project_id: string;
    user_id: string;
    role: 'viewer' | 'editor' | 'admin';
    granted_by_id: string;
    notify_on_updates?: boolean;
  }): Promise<ProjectShare> {
    const response = await api.post<ProjectShare>('/sharing/projects', data);
    return response.data;
  },

  async list(projectId: string): Promise<ProjectShare[]> {
    const response = await api.get<ProjectShare[]>(`/sharing/projects/${projectId}/shares`);
    return response.data || [];
  },

  async update(shareId: string, updates: {
    role?: 'viewer' | 'editor' | 'admin';
    notify_on_updates?: boolean;
  }): Promise<ProjectShare> {
    const response = await api.patch<ProjectShare>(`/sharing/shares/${shareId}`, updates);
    return response.data;
  },

  async remove(shareId: string): Promise<void> {
    await api.delete(`/sharing/shares/${shareId}`);
  },
};

// Share Links API
export const shareLinksApi = {
  async create(data: {
    resource_type: 'project' | 'document' | 'collection';
    resource_id: string;
    access_level?: 'view' | 'comment' | 'edit';
    requires_auth?: boolean;
    password?: string;
    allowed_domains?: string[];
    expires_at?: string;
    max_uses?: number;
    created_by_id: string;
    organization_id: string;
  }): Promise<ShareLink> {
    const response = await api.post<ShareLink>('/sharing/links', data);
    return response.data;
  },

  async getByToken(token: string): Promise<ShareLink> {
    const response = await api.get<ShareLink>(`/sharing/links/${token}`);
    return response.data;
  },

  async revoke(linkId: string): Promise<void> {
    await api.post(`/sharing/links/${linkId}/revoke`);
  },
};

// Invitations API
export const invitationsApi = {
  async create(data: {
    invitation_type: 'organization' | 'project';
    organization_id: string;
    project_id?: string;
    email: string;
    role: string;
    personal_message?: string;
    invited_by_id: string;
    expires_in_days?: number;
  }): Promise<Invitation> {
    const response = await api.post<Invitation>('/sharing/invitations', data);
    return response.data;
  },

  async list(params: {
    organization_id?: string;
    project_id?: string;
    status?: 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
    skip?: number;
    limit?: number;
  }): Promise<{ invitations: Invitation[]; total: number; has_more: boolean }> {
    const searchParams = new URLSearchParams();
    if (params.organization_id) searchParams.append('organization_id', params.organization_id);
    if (params.project_id) searchParams.append('project_id', params.project_id);
    if (params.status) searchParams.append('status', params.status);
    if (params.skip !== undefined) searchParams.append('skip', params.skip.toString());
    if (params.limit !== undefined) searchParams.append('limit', params.limit.toString());

    const response = await api.get<{ invitations: Invitation[]; total: number; has_more: boolean }>(`/sharing/invitations?${searchParams}`);
    return response.data;
  },

  async accept(token: string, userId: string): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>(`/sharing/invitations/${token}/accept`, { user_id: userId });
    return response.data;
  },

  async decline(token: string): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>(`/sharing/invitations/${token}/decline`);
    return response.data;
  },

  async revoke(invitationId: string): Promise<void> {
    await api.post(`/sharing/invitations/${invitationId}/revoke`);
  },
};

// Comments API
export const commentsApi = {
  async create(data: {
    content: string;
    resource_type: string;
    resource_id: string;
    parent_id?: string;
    author_id: string;
    organization_id: string;
  }): Promise<Comment> {
    const response = await api.post<Comment>('/sharing/comments', data);
    return response.data;
  },

  async list(params: {
    resource_type: string;
    resource_id: string;
    include_replies?: boolean;
    skip?: number;
    limit?: number;
  }): Promise<{ comments: Comment[]; total: number; has_more: boolean }> {
    const searchParams = new URLSearchParams();
    searchParams.append('resource_type', params.resource_type);
    searchParams.append('resource_id', params.resource_id);
    if (params.include_replies !== undefined) {
      searchParams.append('include_replies', params.include_replies.toString());
    }
    if (params.skip !== undefined) searchParams.append('skip', params.skip.toString());
    if (params.limit !== undefined) searchParams.append('limit', params.limit.toString());

    const response = await api.get<{ comments: Comment[]; total: number; has_more: boolean }>(`/sharing/comments?${searchParams}`);
    return response.data;
  },

  async update(commentId: string, content: string): Promise<Comment> {
    const response = await api.patch<Comment>(`/sharing/comments/${commentId}`, { content });
    return response.data;
  },

  async delete(commentId: string): Promise<void> {
    await api.delete(`/sharing/comments/${commentId}`);
  },

  async resolve(commentId: string, userId: string): Promise<Comment> {
    const response = await api.post<Comment>(`/sharing/comments/${commentId}/resolve`, { user_id: userId });
    return response.data;
  },
};

// Reactions API
export const reactionsApi = {
  async add(data: {
    resource_type: string;
    resource_id: string;
    emoji: string;
    user_id: string;
  }): Promise<{ message: string }> {
    const response = await api.post<{ message: string }>('/sharing/reactions', data);
    return response.data;
  },

  async list(params: {
    resource_type: string;
    resource_id: string;
    user_id?: string;
  }): Promise<Reaction[]> {
    const searchParams = new URLSearchParams();
    searchParams.append('resource_type', params.resource_type);
    searchParams.append('resource_id', params.resource_id);
    if (params.user_id) searchParams.append('user_id', params.user_id);

    const response = await api.get<Reaction[]>(`/sharing/reactions?${searchParams}`);
    return response.data || [];
  },

  async remove(data: {
    resource_type: string;
    resource_id: string;
    emoji: string;
    user_id: string;
  }): Promise<void> {
    const searchParams = new URLSearchParams();
    searchParams.append('resource_type', data.resource_type);
    searchParams.append('resource_id', data.resource_id);
    searchParams.append('emoji', data.emoji);
    searchParams.append('user_id', data.user_id);

    await api.delete(`/sharing/reactions?${searchParams}`);
  },
};
