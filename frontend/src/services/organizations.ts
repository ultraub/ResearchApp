/**
 * Organizations service for organization management operations.
 */

import { apiClient, fetchOne, updateOne } from "@/lib/api-client";
import type {
  OrganizationDetail,
  OrganizationUpdate,
  OrganizationMemberDetail,
  TeamDetail,
  InviteCode,
  InviteCodeCreate,
} from "@/types";

export interface OrgMemberCreate {
  user_id: string;
  role?: "admin" | "member";
}

export interface OrgMemberUpdate {
  role: "admin" | "member";
}

export const organizationsService = {
  // ============================================================================
  // Organization CRUD
  // ============================================================================

  /**
   * Get the current user's organization.
   */
  getMy: async () => {
    return fetchOne<OrganizationDetail>("/organizations/my");
  },

  /**
   * Get an organization by ID.
   */
  get: async (orgId: string) => {
    return fetchOne<OrganizationDetail>(`/organizations/${orgId}`);
  },

  /**
   * Update organization details. Requires admin role.
   */
  update: async (orgId: string, data: OrganizationUpdate) => {
    return updateOne<OrganizationDetail>(`/organizations/${orgId}`, data);
  },

  // ============================================================================
  // Organization Members
  // ============================================================================

  /**
   * List all members of an organization.
   */
  getMembers: async (orgId: string) => {
    const response = await apiClient.get<OrganizationMemberDetail[]>(
      `/organizations/${orgId}/members`
    );
    return response.data;
  },

  /**
   * Add a member to the organization. Requires admin role.
   */
  addMember: async (orgId: string, data: OrgMemberCreate) => {
    const response = await apiClient.post<OrganizationMemberDetail>(
      `/organizations/${orgId}/members`,
      data
    );
    return response.data;
  },

  /**
   * Update a member's role. Requires admin role.
   */
  updateMember: async (orgId: string, userId: string, data: OrgMemberUpdate) => {
    const response = await apiClient.patch<OrganizationMemberDetail>(
      `/organizations/${orgId}/members/${userId}`,
      data
    );
    return response.data;
  },

  /**
   * Remove a member from the organization. Requires admin role.
   */
  removeMember: async (orgId: string, userId: string) => {
    await apiClient.delete(`/organizations/${orgId}/members/${userId}`);
  },

  // ============================================================================
  // Organization Teams
  // ============================================================================

  /**
   * List all teams in an organization.
   */
  getTeams: async (orgId: string) => {
    const response = await apiClient.get<TeamDetail[]>(`/organizations/${orgId}/teams`);
    return response.data;
  },

  // ============================================================================
  // Invite Codes
  // ============================================================================

  /**
   * Create an invite code for the organization. Requires admin role.
   */
  createInvite: async (orgId: string, data: InviteCodeCreate = {}) => {
    const response = await apiClient.post<InviteCode>(`/organizations/${orgId}/invites`, data);
    return response.data;
  },

  /**
   * List all invite codes for the organization. Requires admin role.
   */
  getInvites: async (orgId: string) => {
    const response = await apiClient.get<InviteCode[]>(`/organizations/${orgId}/invites`);
    return response.data;
  },

  /**
   * Revoke an invite code. Requires admin role.
   */
  revokeInvite: async (orgId: string, inviteId: string) => {
    await apiClient.delete(`/organizations/${orgId}/invites/${inviteId}`);
  },

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Check if the current user is an organization admin.
   */
  isAdmin: (org: OrganizationDetail): boolean => {
    return org.current_user_role === "admin";
  },

  /**
   * Generate a shareable invite URL from an invite code.
   */
  getInviteUrl: (code: string): string => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/join/${code}`;
  },
};
