/**
 * Global search API service.
 */

import { api } from './api';

export interface SearchResultItem {
  id: string;
  type: 'project' | 'task' | 'document' | 'idea' | 'paper' | 'collection' | 'user';
  title: string;
  description: string | null;
  snippet: string | null;
  url: string;
  created_at: string;
  updated_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface SearchResponse {
  results: SearchResultItem[];
  total: number;
  query: string;
  filters: Record<string, unknown>;
  has_more: boolean;
}

export interface SearchSuggestion {
  text: string;
  type: string;
  id: string | null;
}

export interface SearchParams {
  q: string;
  organization_id: string;
  types?: string[];
  project_id?: string;
  created_after?: string;
  created_before?: string;
  sort_by?: 'relevance' | 'created_at' | 'updated_at';
  skip?: number;
  limit?: number;
}

export const searchApi = {
  async search(params: SearchParams): Promise<SearchResponse> {
    const searchParams = new URLSearchParams();
    searchParams.append('q', params.q);
    searchParams.append('organization_id', params.organization_id);

    if (params.types && params.types.length > 0) {
      params.types.forEach((type) => searchParams.append('types', type));
    }
    if (params.project_id) searchParams.append('project_id', params.project_id);
    if (params.created_after) searchParams.append('created_after', params.created_after);
    if (params.created_before) searchParams.append('created_before', params.created_before);
    if (params.sort_by) searchParams.append('sort_by', params.sort_by);
    if (params.skip !== undefined) searchParams.append('skip', params.skip.toString());
    if (params.limit !== undefined) searchParams.append('limit', params.limit.toString());

    const response = await api.get<SearchResponse>(`/search?${searchParams}`);
    return response.data;
  },

  async getSuggestions(
    q: string,
    organizationId: string,
    limit = 10
  ): Promise<SearchSuggestion[]> {
    const searchParams = new URLSearchParams();
    searchParams.append('q', q);
    searchParams.append('organization_id', organizationId);
    searchParams.append('limit', limit.toString());

    const response = await api.get<SearchSuggestion[]>(`/search/suggestions?${searchParams}`);
    return response.data;
  },

  async getRecentSearches(userId: string, limit = 10): Promise<string[]> {
    const searchParams = new URLSearchParams();
    searchParams.append('user_id', userId);
    searchParams.append('limit', limit.toString());

    const response = await api.get<string[]>(`/search/recent?${searchParams}`);
    return response.data;
  },
};
