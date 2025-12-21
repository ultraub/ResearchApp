import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth";

function getApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) return "/api/v1";
  // Upgrade HTTP to HTTPS when page is on HTTPS
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && envUrl.startsWith('http://')) {
    return envUrl.replace('http://', 'https://');
  }
  return envUrl;
}

export const apiClient = axios.create({
  baseURL: getApiUrl(),
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Skip refresh logic for auth endpoints to prevent infinite loops
    const isAuthEndpoint = originalRequest?.url?.includes("/auth/");

    // If 401 and haven't retried yet and not an auth endpoint, try refreshing token
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;

      try {
        await useAuthStore.getState().refreshAccessToken();
        const { accessToken } = useAuthStore.getState();

        if (accessToken && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }

        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout
        useAuthStore.getState().logout();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Helper functions for common API patterns
export async function fetchPaginated<T>(
  endpoint: string,
  params?: object
) {
  const response = await apiClient.get<{
    items: T[];
    total: number;
    page: number;
    page_size: number;
    pages: number;
  }>(endpoint, { params });
  return response.data;
}

export async function fetchOne<T>(endpoint: string) {
  const response = await apiClient.get<T>(endpoint);
  return response.data;
}

export async function createOne<T, D = unknown>(endpoint: string, data: D) {
  const response = await apiClient.post<T>(endpoint, data);
  return response.data;
}

export async function updateOne<T, D = unknown>(endpoint: string, data: D) {
  const response = await apiClient.patch<T>(endpoint, data);
  return response.data;
}

export async function deleteOne(endpoint: string) {
  await apiClient.delete(endpoint);
}
