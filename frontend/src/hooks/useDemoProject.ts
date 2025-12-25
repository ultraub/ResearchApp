/**
 * useDemoProject hook - Manages demo project visibility and filtering
 *
 * Provides utilities for:
 * - Checking if demo project is hidden
 * - Hiding the demo project permanently
 * - Filtering demo projects from lists
 */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/services/users";
import type { Project } from "@/types";

export const USER_PREFERENCES_KEY = ["user-preferences"] as const;

export function useDemoProject() {
  const queryClient = useQueryClient();

  // Fetch user preferences to check hidden_demo_project
  const { data: preferences, isLoading: isLoadingPreferences } = useQuery({
    queryKey: USER_PREFERENCES_KEY,
    queryFn: usersApi.getPreferences,
    staleTime: 5 * 60 * 1000, // 5 min - user settings rarely change
  });

  // Check if demo is hidden
  const isDemoHidden = Boolean(
    preferences?.additional_settings?.hidden_demo_project
  );

  // Mutation to hide the demo project
  const hideDemoMutation = useMutation({
    mutationFn: async () => {
      return usersApi.updatePreferences({
        additional_settings: { hidden_demo_project: true },
      });
    },
    onSuccess: () => {
      // Invalidate preferences to update hidden status
      queryClient.invalidateQueries({ queryKey: USER_PREFERENCES_KEY });
      // Invalidate projects to trigger re-filtering
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  // Filter function to remove demo projects from a list
  const filterDemoProjects = useCallback(
    <T extends Pick<Project, "is_demo">>(projects: T[]): T[] => {
      if (!isDemoHidden) {
        return projects;
      }
      return projects.filter((p) => !p.is_demo);
    },
    [isDemoHidden]
  );

  // Check if a specific project is the demo project
  const isDemoProject = useCallback((project: Pick<Project, "is_demo">) => {
    return Boolean(project.is_demo);
  }, []);

  return {
    isDemoHidden,
    isLoadingPreferences,
    hideDemoProject: hideDemoMutation.mutate,
    isHiding: hideDemoMutation.isPending,
    filterDemoProjects,
    isDemoProject,
  };
}
