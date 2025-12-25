/**
 * Hook to fetch user's editor preferences (font size, line height).
 * Used by DocumentEditor to respect user settings.
 */

import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/services/users';

interface EditorPreferences {
  fontSize: number;
  lineHeight: number;
}

const DEFAULT_PREFERENCES: EditorPreferences = {
  fontSize: 14,
  lineHeight: 1.6,
};

export function useEditorPreferences(): EditorPreferences {
  const { data } = useQuery({
    queryKey: ['userPreferences'],
    queryFn: () => usersApi.getPreferences(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    fontSize: data?.editor_font_size ?? DEFAULT_PREFERENCES.fontSize,
    lineHeight: data?.editor_line_height ?? DEFAULT_PREFERENCES.lineHeight,
  };
}
