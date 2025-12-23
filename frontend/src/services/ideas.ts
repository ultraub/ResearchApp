import { apiClient, fetchPaginated, fetchOne, createOne, updateOne, deleteOne } from "@/lib/api-client";
import type { Idea } from "@/types";

export interface IdeaCreateData {
  content: string;
  title?: string;
  tags?: string[];
  source?: "web" | "mobile" | "voice" | "api";
}

export interface IdeaUpdateData {
  content?: string;
  title?: string;
  tags?: string[];
  status?: "captured" | "reviewed" | "converted" | "archived";
  is_pinned?: boolean;
}

export interface IdeaListParams {
  page?: number;
  page_size?: number;
  status?: string;
  search?: string;
  pinned_only?: boolean;
  tag?: string;
}

export const ideasService = {
  list: async (params: IdeaListParams = {}) => {
    return fetchPaginated<Idea>("/ideas", params);
  },

  get: async (id: string) => {
    return fetchOne<Idea>(`/ideas/${id}`);
  },

  create: async (data: IdeaCreateData) => {
    return createOne<Idea>("/ideas", data);
  },

  update: async (id: string, data: IdeaUpdateData) => {
    return updateOne<Idea>(`/ideas/${id}`, data);
  },

  delete: async (id: string) => {
    return deleteOne(`/ideas/${id}`);
  },

  togglePin: async (id: string) => {
    const response = await apiClient.post<Idea>(`/ideas/${id}/pin`);
    return response.data;
  },

  convertToProject: async (
    id: string,
    data: { project_name: string; team_id: string; project_type?: string }
  ) => {
    const response = await apiClient.post<Idea>(`/ideas/${id}/convert-to-project`, data);
    return response.data;
  },

  convertToTask: async (
    id: string,
    data: {
      project_id: string;
      task_title?: string;
      initial_status?: "idea" | "todo"; // "idea" for team review, "todo" for direct action
    }
  ) => {
    const response = await apiClient.post<Idea>(`/ideas/${id}/convert-to-task`, data);
    return response.data;
  },
};
