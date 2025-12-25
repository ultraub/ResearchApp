import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiClient } from "@/lib/api-client";
import type { User, TokenResponse } from "@/types/api";
import { useOrganizationStore } from "./organization";
import { initializeThemeFromBackend } from "./theme";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (code: string, redirectUri: string) => Promise<void>;
  devLogin: () => void;
  logout: () => void;
  refreshAccessToken: () => Promise<void>;
  fetchUser: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      login: async (code: string, redirectUri: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.post<TokenResponse>(
            "/auth/google/login",
            { code, redirect_uri: redirectUri }
          );

          set({
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            isAuthenticated: true,
          });

          // Fetch user info
          await get().fetchUser();

          // Initialize theme customization from backend
          initializeThemeFromBackend();
        } catch (error: any) {
          set({
            error: error.response?.data?.detail || "Login failed",
            isAuthenticated: false,
          });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      devLogin: () => {
        // Mock user for development testing
        const mockUser: User = {
          id: "dev-user-001",
          email: "dev@pasteur.local",
          display_name: "Dev User",
          avatar_url: null,
          title: "Developer",
          department: "Engineering",
          research_interests: ["AI", "Machine Learning"],
          onboarding_completed: true,
          onboarding_step: 5,
          created_at: new Date().toISOString(),
        };

        set({
          user: mockUser,
          accessToken: "dev-token-for-testing",
          refreshToken: "dev-refresh-token",
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });

        // Initialize dev organization context
        useOrganizationStore.getState().initializeDevOrganization();
      },

      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        });

        // Clear organization context
        useOrganizationStore.getState().clear();
      },

      refreshAccessToken: async () => {
        const { refreshToken, accessToken } = get();

        // Skip refresh for dev tokens - they don't need refreshing
        if (accessToken === "dev-token-for-testing") {
          return;
        }

        if (!refreshToken) {
          get().logout();
          return;
        }

        try {
          const response = await apiClient.post<TokenResponse>(
            "/auth/refresh",
            {},
            {
              headers: {
                Authorization: `Bearer ${refreshToken}`,
              },
            }
          );

          set({
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
          });
        } catch (error) {
          get().logout();
          throw error;
        }
      },

      fetchUser: async () => {
        const { accessToken } = get();
        if (!accessToken) return;

        // Skip API call for dev tokens - user is already set
        if (accessToken === "dev-token-for-testing") {
          return;
        }

        try {
          const response = await apiClient.get<User>("/auth/me", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          set({ user: response.data });
        } catch (error) {
          // If fetching user fails, might be token expired
          try {
            await get().refreshAccessToken();
            // Retry fetch
            const retryResponse = await apiClient.get<User>("/auth/me");
            set({ user: retryResponse.data });
          } catch {
            get().logout();
          }
        }
      },

      setLoading: (loading: boolean) => set({ isLoading: loading }),
      clearError: () => set({ error: null }),
    }),
    {
      name: "pasteur-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Initialize auth on app load
export const initializeAuth = async () => {
  const { accessToken, fetchUser, setLoading } = useAuthStore.getState();

  if (accessToken) {
    try {
      await fetchUser();
      // Also initialize organization context
      await useOrganizationStore.getState().initializeDevOrganization();
    } catch {
      // Token invalid, already logged out in fetchUser
    }
  }

  setLoading(false);
};
