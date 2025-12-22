/**
 * Teams service for team management operations.
 */

import { apiClient, fetchPaginated, fetchOne, createOne, updateOne, deleteOne } from "@/lib/api-client";
import type {
  TeamDetail,
  TeamCreate,
  TeamUpdate,
  TeamListParams,
  TeamMember,
  InviteCode,
  InviteCodeCreate,
  Project,
} from "@/types";

export interface TeamMemberCreate {
  user_id: string;
  role?: "owner" | "lead" | "member";
}

export interface TeamMemberUpdate {
  role: "owner" | "lead" | "member";
}

export const teamsService = {
  // ============================================================================
  // Team CRUD
  // ============================================================================

  /**
   * List teams the current user is a member of.
   */
  list: async (params: TeamListParams = {}) => {
    return fetchPaginated<TeamDetail>("/teams", params);
  },

  /**
   * Get a single team by ID.
   */
  get: async (teamId: string) => {
    return fetchOne<TeamDetail>(`/teams/${teamId}`);
  },

  /**
   * Create a new team. The creator becomes the owner.
   */
  create: async (data: TeamCreate) => {
    return createOne<TeamDetail>("/teams", data);
  },

  /**
   * Update team details. Requires owner or lead role.
   */
  update: async (teamId: string, data: TeamUpdate) => {
    return updateOne<TeamDetail>(`/teams/${teamId}`, data);
  },

  /**
   * Delete a team. Requires owner role.
   */
  delete: async (teamId: string) => {
    return deleteOne(`/teams/${teamId}`);
  },

  // ============================================================================
  // Team Members
  // ============================================================================

  /**
   * List all members of a team.
   */
  getMembers: async (teamId: string) => {
    const response = await apiClient.get<TeamMember[]>(`/teams/${teamId}/members`);
    return response.data || [];
  },

  /**
   * Add a member to the team. Requires owner or lead role.
   */
  addMember: async (teamId: string, data: TeamMemberCreate) => {
    const response = await apiClient.post<TeamMember>(`/teams/${teamId}/members`, data);
    return response.data;
  },

  /**
   * Update a member's role. Requires owner or lead role.
   */
  updateMember: async (teamId: string, userId: string, data: TeamMemberUpdate) => {
    const response = await apiClient.patch<TeamMember>(
      `/teams/${teamId}/members/${userId}`,
      data
    );
    return response.data;
  },

  /**
   * Remove a member from the team. Requires owner or lead role.
   */
  removeMember: async (teamId: string, userId: string) => {
    await apiClient.delete(`/teams/${teamId}/members/${userId}`);
  },

  // ============================================================================
  // Team Projects
  // ============================================================================

  /**
   * List all projects belonging to a team.
   */
  getProjects: async (teamId: string, includeArchived = false) => {
    const response = await apiClient.get<Project[]>(`/teams/${teamId}/projects`, {
      params: { include_archived: includeArchived },
    });
    return response.data || [];
  },

  // ============================================================================
  // Invite Codes
  // ============================================================================

  /**
   * Create an invite code for the team. Requires owner or lead role.
   */
  createInvite: async (teamId: string, data: InviteCodeCreate = {}) => {
    const response = await apiClient.post<InviteCode>(`/teams/${teamId}/invites`, data);
    return response.data;
  },

  /**
   * List all invite codes for the team. Requires owner or lead role.
   */
  getInvites: async (teamId: string) => {
    const response = await apiClient.get<InviteCode[]>(`/teams/${teamId}/invites`);
    return response.data || [];
  },

  /**
   * Revoke an invite code. Requires owner or lead role.
   */
  revokeInvite: async (teamId: string, inviteId: string) => {
    await apiClient.delete(`/teams/${teamId}/invites/${inviteId}`);
  },

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Check if the current user can manage the team (is owner or lead).
   */
  canManage: (team: TeamDetail): boolean => {
    return team.current_user_role === "owner" || team.current_user_role === "lead";
  },

  /**
   * Check if the current user is the team owner.
   */
  isOwner: (team: TeamDetail): boolean => {
    return team.current_user_role === "owner";
  },

  /**
   * Generate a shareable invite URL from an invite code.
   */
  getInviteUrl: (code: string): string => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/join/${code}`;
  },
};
