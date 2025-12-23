/**
 * Organization store for managing current organization context.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/services/api";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  organization_id: string | null;  // Nullable for personal teams
  is_personal: boolean;
}

interface OrganizationState {
  organization: Organization | null;
  organizations: Organization[];  // All user's organizations
  teams: Team[];
  currentTeamId: string | null;
  isLoading: boolean;

  // Actions
  setOrganization: (org: Organization | null) => void;
  setOrganizations: (orgs: Organization[]) => void;
  setTeams: (teams: Team[]) => void;
  setCurrentTeam: (teamId: string) => void;
  fetchOrganizationsAndTeams: () => Promise<void>;
  refreshOrganizations: () => Promise<void>;
  refreshTeams: () => Promise<void>;
  initializeDevOrganization: () => Promise<void>;
  clear: () => void;
}

export const useOrganizationStore = create<OrganizationState>()(
  persist(
    (set, get) => ({
      organization: null,
      organizations: [],
      teams: [],
      currentTeamId: null,
      isLoading: false,

      setOrganization: (org: Organization | null) => {
        set({ organization: org });
      },

      setOrganizations: (orgs: Organization[]) => {
        set({ organizations: orgs });
      },

      setTeams: (teams: Team[]) => {
        set({ teams });
        // Auto-select first team if none selected
        if (teams.length > 0) {
          set((state) => ({
            currentTeamId: state.currentTeamId || teams[0].id,
          }));
        }
      },

      setCurrentTeam: (teamId: string) => {
        set({ currentTeamId: teamId });
      },

      fetchOrganizationsAndTeams: async () => {
        set({ isLoading: true });
        try {
          // Fetch organizations
          const orgsResponse = await api.get<Organization[]>("/organizations/");
          const orgs = orgsResponse.data || [];

          // Store all organizations
          set({ organizations: orgs });

          // Set first org as current if none selected
          if (orgs.length > 0) {
            set({ organization: orgs[0] });
          }

          // Fetch user's teams
          const teamsResponse = await api.get<Team[]>("/organizations/my/teams");
          const teams = teamsResponse.data || [];

          set({ teams });

          // Auto-select first team if none selected
          if (teams.length > 0) {
            const currentTeamId = get().currentTeamId;
            // Only update if no current team or current team not in list
            if (!currentTeamId || !teams.find(t => t.id === currentTeamId)) {
              set({ currentTeamId: teams[0].id });
            }
          }
        } catch (error) {
          console.error("Failed to fetch organizations and teams:", error);
        } finally {
          set({ isLoading: false });
        }
      },

      refreshOrganizations: async () => {
        try {
          const orgsResponse = await api.get<Organization[]>("/organizations/");
          const orgs = orgsResponse.data || [];
          set({ organizations: orgs });

          // Update current organization if it still exists
          const currentOrg = get().organization;
          if (currentOrg) {
            const updatedOrg = orgs.find(o => o.id === currentOrg.id);
            if (updatedOrg) {
              set({ organization: updatedOrg });
            } else if (orgs.length > 0) {
              // Current org no longer exists, select first
              set({ organization: orgs[0] });
            }
          } else if (orgs.length > 0) {
            // No org selected, select first
            set({ organization: orgs[0] });
          }
        } catch (error) {
          console.error("Failed to refresh organizations:", error);
        }
      },

      refreshTeams: async () => {
        // Fetch fresh teams data - useful after mutations
        try {
          const teamsResponse = await api.get<Team[]>("/organizations/my/teams");
          const teams = teamsResponse.data || [];
          set({ teams });

          // Validate current team still exists
          const currentTeamId = get().currentTeamId;
          if (currentTeamId && !teams.find(t => t.id === currentTeamId)) {
            // Current team no longer accessible, select first available
            set({ currentTeamId: teams.length > 0 ? teams[0].id : null });
          } else if (!currentTeamId && teams.length > 0) {
            // No team selected, select first
            set({ currentTeamId: teams[0].id });
          }
        } catch (error) {
          console.error("Failed to refresh teams:", error);
        }
      },

      initializeDevOrganization: async () => {
        // For dev mode, fetch from API to get the real team IDs created by the backend
        await get().fetchOrganizationsAndTeams();
      },

      clear: () => {
        set({
          organization: null,
          organizations: [],
          teams: [],
          currentTeamId: null,
          isLoading: false,
        });
      },
    }),
    {
      name: "pasteur-organization",
      // Only persist team selection - teams/org fetched fresh on load
      partialize: (state) => ({
        currentTeamId: state.currentTeamId,
      }),
    }
  )
);

// Helper hook to get organization ID with fallback
export function useOrganizationId(): string {
  const { organization } = useOrganizationStore();
  return organization?.id || "";
}

// Helper hook to get current team ID with fallback
export function useCurrentTeamId(): string {
  const { currentTeamId } = useOrganizationStore();
  return currentTeamId || "";
}
