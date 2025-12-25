/**
 * Hook to check if AI suggestions are enabled for the user.
 * Used by AI components to respect user settings.
 */

import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/services/users';

export function useAIEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['userPreferences'],
    queryFn: () => usersApi.getPreferences(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Default to true if preferences haven't loaded yet
  return data?.ai_suggestions_enabled ?? true;
}
