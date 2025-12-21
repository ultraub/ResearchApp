/**
 * Base API service with fetch wrapper.
 */

function getApiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;

  if (!envUrl) {
    return '/api/v1';
  }

  // If we're on HTTPS but the env URL is HTTP, upgrade to HTTPS
  if (window.location.protocol === 'https:' && envUrl.startsWith('http://')) {
    return envUrl.replace('http://', 'https://');
  }

  return envUrl;
}

const API_BASE = getApiBase();

function getAuthToken(): string | null {
  try {
    const stored = localStorage.getItem('pasteur-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.accessToken || null;
    }
  } catch {
    return null;
  }
  return null;
}

interface ApiResponse<T> extends Response {
  data: T;
  json(): Promise<T>;
}

async function handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  // Clone the response so we can read it twice
  const cloned = response.clone();

  // Pre-parse the JSON and attach it to the response
  const contentType = response.headers.get('content-type');
  let data: T;

  if (contentType && contentType.includes('application/json')) {
    const text = await response.text();
    data = text ? JSON.parse(text) : null;
  } else {
    data = null as T;
  }

  // Return response with data attached and json() method that returns the pre-parsed data
  const enhancedResponse = cloned as ApiResponse<T>;
  enhancedResponse.data = data;
  enhancedResponse.json = async () => data;

  return enhancedResponse;
}

interface RequestConfig {
  params?: Record<string, unknown> | object;
}

function buildUrl(endpoint: string, params?: Record<string, unknown> | object): string {
  const url = new URL(`${API_BASE}${endpoint}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          // Handle array params (e.g., tags)
          value.forEach(v => url.searchParams.append(key, String(v)));
        } else {
          url.searchParams.append(key, String(value));
        }
      }
    });
  }
  return url.toString();
}

export const api = {
  async get<T = unknown>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    const token = getAuthToken();
    const url = buildUrl(endpoint, config?.params);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return handleResponse<T>(response);
  },

  async post<T = unknown>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    const token = getAuthToken();
    const url = buildUrl(endpoint, config?.params);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(response);
  },

  async patch<T = unknown>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    const token = getAuthToken();
    const url = buildUrl(endpoint, config?.params);
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(response);
  },

  async put<T = unknown>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    const token = getAuthToken();
    const url = buildUrl(endpoint, config?.params);
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(response);
  },

  async delete<T = void>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    const token = getAuthToken();
    const url = buildUrl(endpoint, config?.params);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return handleResponse<T>(response);
  },
};
