import { apiClient, fetchPaginated, fetchOne, createOne, updateOne, deleteOne } from "@/lib/api-client";
import type { Project, ProjectTemplate, ProjectTreeNode } from "@/types";

export interface ProjectCreateData {
  name: string;
  description?: string;
  team_id: string;
  project_type?: string;
  parent_id?: string;
  visibility?: "private" | "team" | "organization";
  start_date?: string;
  target_end_date?: string;
  tags?: string[];
  color?: string;
  template_id?: string;
}

export interface ProjectUpdateData {
  name?: string;
  description?: string;
  status?: "active" | "completed" | "archived" | "on_hold";
  visibility?: "private" | "team" | "organization";
  start_date?: string;
  target_end_date?: string;
  actual_end_date?: string;
  tags?: string[];
  color?: string;
  settings?: Record<string, unknown>;
}

export interface ProjectListParams {
  page?: number;
  page_size?: number;
  team_id?: string;
  parent_id?: string;
  top_level_only?: boolean;
  status?: string;
  search?: string;
  include_archived?: boolean;
  include_ancestors?: boolean;
}

export interface ProjectMember {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  display_name?: string | null;
  email?: string | null;
  notify_on_task_assigned: boolean;
  notify_on_document_update: boolean;
  notify_on_comment: boolean;
}

export interface ProjectReviewSummary {
  total_reviews: number;
  pending_reviews: number;
  approved_reviews: number;
  rejected_reviews: number;
  all_approved: boolean;
  overall_status: "none" | "pending" | "approved" | "rejected" | "mixed";
  ai_suggestion_count: number;
  tasks_in_review: number;
}

export const projectsService = {
  list: async (params: ProjectListParams = {}) => {
    return fetchPaginated<Project>("/projects", params);
  },

  get: async (id: string) => {
    return fetchOne<Project>(`/projects/${id}`);
  },

  create: async (data: ProjectCreateData) => {
    return createOne<Project>("/projects", data);
  },

  update: async (id: string, data: ProjectUpdateData) => {
    return updateOne<Project>(`/projects/${id}`, data);
  },

  delete: async (id: string) => {
    return deleteOne(`/projects/${id}`);
  },

  getTemplates: async () => {
    const response = await apiClient.get<ProjectTemplate[]>("/projects/templates");
    return response.data || [];
  },

  getMembers: async (projectId: string) => {
    const response = await apiClient.get<ProjectMember[]>(`/projects/${projectId}/members`);
    return response.data || [];
  },

  addMember: async (projectId: string, data: { user_id: string; role?: string }) => {
    const response = await apiClient.post<ProjectMember>(`/projects/${projectId}/members`, data);
    return response.data;
  },

  removeMember: async (projectId: string, userId: string) => {
    await apiClient.delete(`/projects/${projectId}/members/${userId}`);
  },

  updateMember: async (projectId: string, userId: string, data: { role: string }) => {
    const response = await apiClient.patch<ProjectMember>(
      `/projects/${projectId}/members/${userId}`,
      data
    );
    return response.data;
  },

  // Hierarchy methods
  getChildren: async (projectId: string, includeArchived = false) => {
    const response = await apiClient.get<Project[]>(`/projects/${projectId}/children`, {
      params: { include_archived: includeArchived },
    });
    return response.data || [];
  },

  getTree: async (projectId: string, includeArchived = false) => {
    const response = await apiClient.get<ProjectTreeNode>(`/projects/${projectId}/tree`, {
      params: { include_archived: includeArchived },
    });
    return response.data;
  },

  getAncestors: async (projectId: string) => {
    const response = await apiClient.get<Project[]>(`/projects/${projectId}/ancestors`);
    return response.data || [];
  },

  move: async (projectId: string, newParentId: string | null) => {
    const response = await apiClient.post<Project>(`/projects/${projectId}/move`, {
      new_parent_id: newParentId,
    });
    return response.data;
  },

  // Get top-level projects (for parent selection)
  getTopLevelProjects: async (teamId: string) => {
    return fetchPaginated<Project>("/projects", {
      team_id: teamId,
      top_level_only: true,
      page_size: 100,
    });
  },

  // Review summary
  getReviewSummary: async (projectId: string): Promise<ProjectReviewSummary> => {
    const response = await apiClient.get<ProjectReviewSummary>(
      `/projects/${projectId}/review-summary`
    );
    return response.data;
  },

  // Scope management
  changeScope: async (
    projectId: string,
    data: {
      new_scope: "private" | "team" | "organization";
      team_id?: string;
    }
  ) => {
    // Map frontend visibility values to backend scope values
    const scopeMap: Record<string, string> = {
      private: "PERSONAL",
      team: "TEAM",
      organization: "ORGANIZATION",
    };
    const response = await apiClient.patch<Project>(`/projects/${projectId}/scope`, {
      new_scope: scopeMap[data.new_scope],
      team_id: data.team_id,
    });
    return response.data;
  },

  // Transfer project to a different team
  transferToTeam: async (projectId: string, teamId: string) => {
    const response = await apiClient.patch<Project>(`/projects/${projectId}/scope`, {
      team_id: teamId,
    });
    return response.data;
  },
};
