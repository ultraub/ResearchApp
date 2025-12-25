/**
 * User profile and preferences API service.
 */

import { api } from './api';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  title: string | null;
  department: string | null;
  research_interests: string[];
  onboarding_completed: boolean;
  onboarding_step: number;
}

export interface UserProfileUpdate {
  display_name?: string;
  title?: string;
  department?: string;
  research_interests?: string[];
  avatar_url?: string;
}

// Theme customization types
export type ThemePreset = 'warm' | 'cool' | 'vibrant' | 'minimal' | 'custom';
export type CardStyle = 'gradient' | 'flat' | 'bordered';
export type AnimationIntensity = 'minimal' | 'moderate' | 'playful';

export interface ThemeCustomization {
  preset: ThemePreset;
  accent_color: string;           // Hex color for custom presets
  card_style: CardStyle;
  animation_intensity: AnimationIntensity;
}

export interface UserPreferences {
  // Color mode
  theme: 'light' | 'dark' | 'system';

  // Theme customization
  theme_customization: ThemeCustomization;

  // Notification preferences
  notification_email: boolean;
  notification_email_digest: 'immediate' | 'daily' | 'weekly' | 'none';
  notification_in_app: boolean;

  // View preferences
  default_project_view: 'list' | 'grid' | 'grouped';
  editor_font_size: number;
  editor_line_height: number;

  // AI preferences
  ai_suggestions_enabled: boolean;

  // Additional settings (for extensible preferences like hidden_demo_project)
  additional_settings: Record<string, unknown>;
}

export interface UserPreferencesUpdate {
  theme?: 'light' | 'dark' | 'system';
  theme_customization?: Partial<ThemeCustomization>;
  notification_email?: boolean;
  notification_email_digest?: 'immediate' | 'daily' | 'weekly' | 'none';
  notification_in_app?: boolean;
  default_project_view?: 'list' | 'grid' | 'grouped';
  editor_font_size?: number;
  editor_line_height?: number;
  ai_suggestions_enabled?: boolean;
  additional_settings?: Record<string, unknown>;
}

export interface OnboardingStepUpdate {
  step: number;
  completed?: boolean;
}

export interface OrganizationMember {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
}

export interface UserListItem {
  user_id: string;
  email: string;
  display_name: string;
}

export const usersApi = {
  // Profile
  async getProfile(): Promise<UserProfile> {
    const response = await api.get<UserProfile>('/users/me/profile');
    return response.data;
  },

  async updateProfile(updates: UserProfileUpdate): Promise<UserProfile> {
    const response = await api.patch<UserProfile>('/users/me/profile', updates);
    return response.data;
  },

  async getUserProfile(userId: string): Promise<UserProfile> {
    const response = await api.get<UserProfile>(`/users/${userId}`);
    return response.data;
  },

  // Preferences
  async getPreferences(): Promise<UserPreferences> {
    const response = await api.get<UserPreferences>('/users/me/preferences');
    return response.data;
  },

  async updatePreferences(updates: UserPreferencesUpdate): Promise<UserPreferences> {
    const response = await api.patch<UserPreferences>('/users/me/preferences', updates);
    return response.data;
  },

  // Onboarding
  async updateOnboardingStep(update: OnboardingStepUpdate): Promise<UserProfile> {
    const response = await api.post<UserProfile>('/users/me/onboarding', update);
    return response.data;
  },

  // Organization Members
  async getOrganizationMembers(orgId: string): Promise<OrganizationMember[]> {
    const response = await api.get<OrganizationMember[]>(`/organizations/${orgId}/members`);
    return response.data || [];
  },

  // List all users for member selection
  async listUsers(search?: string): Promise<UserListItem[]> {
    const params = search ? { search } : {};
    const response = await api.get<UserListItem[]>('/users', { params });
    return response.data || [];
  },
};
