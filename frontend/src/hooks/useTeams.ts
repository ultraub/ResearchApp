/**
 * useTeams hook - Single source of truth for teams data
 *
 * Uses React Query for fetching and automatically syncs to Zustand store
 * for components that need synchronous access to teams data.
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useOrganizationStore, type Team } from "@/stores/organization";

export const TEAMS_QUERY_KEY = ["my-teams"] as const;

export function useTeams() {
  const queryClient = useQueryClient();
  const { setTeams, setOrganization, currentTeamId, setCurrentTeam } = useOrganizationStore();

  // Fetch teams with React Query
  const teamsQuery = useQuery({
    queryKey: TEAMS_QUERY_KEY,
    queryFn: async () => {
      const response = await api.get<Team[]>("/organizations/my/teams");
      return response.data || [];
    },
    staleTime: 0, // Always refetch teams for real-time feel
  });

  // Fetch organizations (for setting current org)
  const orgsQuery = useQuery({
    queryKey: ["my-organizations"],
    queryFn: async () => {
      const response = await api.get<{ id: string; name: string; slug: string; logo_url: string | null }[]>("/organizations/");
      return response.data || [];
    },
    staleTime: 1000 * 60, // Organizations change less frequently
  });

  // Sync teams to Zustand when data changes
  useEffect(() => {
    if (teamsQuery.data) {
      setTeams(teamsQuery.data);

      // Auto-select first team if none selected or current selection is invalid
      if (teamsQuery.data.length > 0) {
        const validTeam = teamsQuery.data.find(t => t.id === currentTeamId);
        if (!validTeam) {
          setCurrentTeam(teamsQuery.data[0].id);
        }
      }
    }
  }, [teamsQuery.data, currentTeamId, setTeams, setCurrentTeam]);

  // Sync organization to Zustand
  useEffect(() => {
    if (orgsQuery.data && orgsQuery.data.length > 0) {
      setOrganization(orgsQuery.data[0]);
    }
  }, [orgsQuery.data, setOrganization]);

  // Helper to invalidate and refetch teams
  const refreshTeams = () => {
    queryClient.invalidateQueries({ queryKey: TEAMS_QUERY_KEY });
  };

  return {
    teams: teamsQuery.data || [],
    isLoading: teamsQuery.isLoading,
    isError: teamsQuery.isError,
    error: teamsQuery.error,
    refetch: teamsQuery.refetch,
    refreshTeams,
    currentTeamId,
    setCurrentTeam,
  };
}
