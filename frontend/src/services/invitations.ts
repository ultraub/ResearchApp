/**
 * Invitations service for invite code preview and join operations.
 */

import { apiClient } from "@/lib/api-client";
import type { InvitePreview, JoinResult } from "@/types";

export const invitationsService = {
  /**
   * Preview an invite code (public endpoint, no authentication required).
   * Returns information about what you'll be joining.
   */
  preview: async (code: string): Promise<InvitePreview> => {
    const response = await apiClient.get<InvitePreview>(`/invites/${code}`);
    return response.data;
  },

  /**
   * Join a team or organization using an invite code.
   * Requires authentication.
   */
  join: async (code: string): Promise<JoinResult> => {
    const response = await apiClient.post<JoinResult>("/invites/join", { code });
    return response.data;
  },

  /**
   * Check if an invite code is valid without joining.
   */
  isValid: async (code: string): Promise<boolean> => {
    try {
      const preview = await invitationsService.preview(code);
      return preview.is_valid;
    } catch {
      return false;
    }
  },

  /**
   * Get a user-friendly error message for invalid invite codes.
   */
  getErrorMessage: (preview: InvitePreview): string => {
    if (preview.is_valid) return "";
    return preview.error || "This invite code is not valid";
  },
};
