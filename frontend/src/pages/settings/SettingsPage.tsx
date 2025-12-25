/**
 * User settings page with profile, notifications, appearance, and security sections.
 */

import { useState, useEffect } from 'react';
import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  UserIcon,
  BellIcon,
  PaintBrushIcon,
  ShieldCheckIcon,
  BuildingOfficeIcon,
  SparklesIcon,
  CheckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore, type ThemePreset, type CardStyle, type AnimationIntensity } from '@/stores/theme';
import { useOrganizationStore } from '@/stores/organization';
import { usersApi, type UserProfileUpdate, type UserPreferencesUpdate } from '../../services/users';
import * as aiService from '../../services/ai';
import type { AutoReviewConfigUpdate } from '../../types/ai';

const settingsNavigation = [
  { name: 'Profile', href: '/settings/profile', icon: UserIcon },
  { name: 'Notifications', href: '/settings/notifications', icon: BellIcon },
  { name: 'Appearance', href: '/settings/appearance', icon: PaintBrushIcon },
  { name: 'AI Features', href: '/settings/ai-features', icon: SparklesIcon },
  { name: 'Security', href: '/settings/security', icon: ShieldCheckIcon },
  { name: 'Organization', href: '/settings/organization', icon: BuildingOfficeIcon },
];

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div
      className={clsx(
        'fixed bottom-4 right-4 flex items-center gap-2 rounded-lg px-4 py-3 text-white shadow-lg',
        type === 'success' ? 'bg-green-600' : 'bg-red-600'
      )}
    >
      {type === 'success' ? (
        <CheckIcon className="h-5 w-5" />
      ) : (
        <ExclamationTriangleIcon className="h-5 w-5" />
      )}
      {message}
    </div>
  );
}

function ProfileSettings() {
  const { user, fetchUser } = useAuthStore();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [formData, setFormData] = useState({
    display_name: '',
    title: '',
    department: '',
    research_interests: '',
  });

  useEffect(() => {
    if (user) {
      setFormData({
        display_name: user.display_name || '',
        title: user.title || '',
        department: user.department || '',
        research_interests: user.research_interests?.join(', ') || '',
      });
    }
  }, [user]);

  const updateProfileMutation = useMutation({
    mutationFn: (updates: UserProfileUpdate) => usersApi.updateProfile(updates),
    onSuccess: () => {
      fetchUser();
      setToast({ message: 'Profile updated successfully', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    },
    onError: () => {
      setToast({ message: 'Failed to update profile', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const interests = formData.research_interests
      .split(',')
      .map((i) => i.trim())
      .filter((i) => i.length > 0);

    updateProfileMutation.mutate({
      display_name: formData.display_name,
      title: formData.title || undefined,
      department: formData.department || undefined,
      research_interests: interests,
    });
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Profile Settings</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Manage your personal information and preferences
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Display Name
          </label>
          <input
            type="text"
            value={formData.display_name}
            onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="Your name"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email
          </label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            className="mt-1 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500 dark:border-gray-600 dark:bg-dark-card dark:text-gray-400"
          />
          <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Title
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="e.g., Research Associate"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Department
          </label>
          <input
            type="text"
            value={formData.department}
            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="e.g., Biomedical Engineering"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Research Interests
          </label>
          <input
            type="text"
            value={formData.research_interests}
            onChange={(e) => setFormData({ ...formData, research_interests: e.target.value })}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            placeholder="e.g., Machine Learning, Clinical Trials (comma separated)"
          />
          <p className="mt-1 text-xs text-gray-500">Separate multiple interests with commas</p>
        </div>

        <button
          type="submit"
          disabled={updateProfileMutation.isPending}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

function NotificationSettings() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: preferences, isLoading } = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => usersApi.getPreferences(),
    staleTime: 5 * 60 * 1000, // 5 min - user settings rarely change
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (updates: UserPreferencesUpdate) => usersApi.updatePreferences(updates),
    onSuccess: () => {
      setToast({ message: 'Notification settings updated', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    },
    onError: () => {
      setToast({ message: 'Failed to update settings', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    },
  });

  const handleToggle = (key: keyof UserPreferencesUpdate, value: boolean) => {
    updatePreferencesMutation.mutate({ [key]: value });
  };

  const handleDigestChange = (value: string) => {
    updatePreferencesMutation.mutate({
      notification_email_digest: value as 'immediate' | 'daily' | 'weekly' | 'none',
    });
  };

  if (isLoading) {
    return <div className="animate-pulse">Loading...</div>;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notification Settings</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Choose how you want to be notified
      </p>

      <div className="mt-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Email Notifications</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Receive email updates about your projects
            </p>
          </div>
          <button
            onClick={() => handleToggle('notification_email', !preferences?.notification_email)}
            className={clsx(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              preferences?.notification_email ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
            )}
          >
            <span
              className={clsx(
                'inline-block h-4 w-4 transform rounded-full bg-white transition',
                preferences?.notification_email ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {preferences?.notification_email && (
          <div className="ml-4 border-l-2 border-gray-200 pl-4 dark:border-gray-700">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email Digest Frequency
            </label>
            <select
              value={preferences?.notification_email_digest || 'daily'}
              onChange={(e) => handleDigestChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="immediate">Immediately</option>
              <option value="daily">Daily digest</option>
              <option value="weekly">Weekly digest</option>
              <option value="none">Don't send digest</option>
            </select>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">In-App Notifications</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Show notifications within the app
            </p>
          </div>
          <button
            onClick={() => handleToggle('notification_in_app', !preferences?.notification_in_app)}
            className={clsx(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              preferences?.notification_in_app ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
            )}
          >
            <span
              className={clsx(
                'inline-block h-4 w-4 transform rounded-full bg-white transition',
                preferences?.notification_in_app ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">AI Suggestions</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Receive AI-powered writing and research suggestions
            </p>
          </div>
          <button
            onClick={() =>
              handleToggle('ai_suggestions_enabled', !preferences?.ai_suggestions_enabled)
            }
            className={clsx(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              preferences?.ai_suggestions_enabled
                ? 'bg-primary-600'
                : 'bg-gray-300 dark:bg-gray-600'
            )}
          >
            <span
              className={clsx(
                'inline-block h-4 w-4 transform rounded-full bg-white transition',
                preferences?.ai_suggestions_enabled ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

// Theme preset display configurations
const PRESET_CONFIG: Record<ThemePreset, { name: string; emoji: string; description: string; colors: string[] }> = {
  warm: {
    name: 'Warm',
    emoji: '🌅',
    description: 'Cozy violets & corals',
    colors: ['#8b5cf6', '#f97316', '#fef3c7'],
  },
  cool: {
    name: 'Cool',
    emoji: '🌊',
    description: 'Calm blues & teals',
    colors: ['#3b82f6', '#14b8a6', '#e0f2fe'],
  },
  vibrant: {
    name: 'Vibrant',
    emoji: '🎨',
    description: 'Bold purples & pinks',
    colors: ['#a855f7', '#ec4899', '#fce7f3'],
  },
  minimal: {
    name: 'Minimal',
    emoji: '📐',
    description: 'Clean & professional',
    colors: ['#475569', '#3b82f6', '#f1f5f9'],
  },
  custom: {
    name: 'Custom',
    emoji: '✨',
    description: 'Your own colors',
    colors: ['#8b5cf6', '#8b5cf6', '#f5f3ff'],
  },
};

const CARD_STYLE_CONFIG: Record<CardStyle, { name: string; description: string; preview: React.ReactNode }> = {
  gradient: {
    name: 'Gradient',
    description: 'Subtle depth with soft gradients',
    preview: (
      <div className="h-16 w-full rounded-lg bg-gradient-to-br from-white to-gray-50 shadow-sm ring-1 ring-gray-100 dark:from-dark-card dark:to-dark-elevated dark:ring-dark-border" />
    ),
  },
  flat: {
    name: 'Flat',
    description: 'Clean and modern look',
    preview: (
      <div className="h-16 w-full rounded-lg bg-white shadow-sm ring-1 ring-gray-200 dark:bg-dark-card dark:ring-dark-border" />
    ),
  },
  bordered: {
    name: 'Bordered',
    description: 'Clear separation with borders',
    preview: (
      <div className="h-16 w-full rounded-lg border-2 border-gray-200 bg-white dark:border-dark-border dark:bg-dark-card" />
    ),
  },
};

const ANIMATION_CONFIG: Record<AnimationIntensity, { name: string; emoji: string; description: string }> = {
  minimal: {
    name: 'Minimal',
    emoji: '🧘',
    description: 'Subtle and calm',
  },
  moderate: {
    name: 'Moderate',
    emoji: '✨',
    description: 'Balanced delight',
  },
  playful: {
    name: 'Playful',
    emoji: '🎉',
    description: 'Fun and bouncy',
  },
};

function AppearanceSettings() {
  const { colorMode, setColorMode, customization, setPreset, setAccentColor, setCardStyle, setAnimationIntensity } = useThemeStore();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: preferences, isLoading } = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => usersApi.getPreferences(),
    staleTime: 5 * 60 * 1000, // 5 min - user settings rarely change
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (updates: UserPreferencesUpdate) => usersApi.updatePreferences(updates),
    onSuccess: () => {
      setToast({ message: 'Appearance settings updated', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    },
    onError: () => {
      setToast({ message: 'Failed to update settings', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    },
  });

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setColorMode(newTheme);
    updatePreferencesMutation.mutate({ theme: newTheme });
  };

  const handlePresetChange = (preset: ThemePreset) => {
    setPreset(preset);
    // Sync to server if needed
    updatePreferencesMutation.mutate({});
  };

  const handleCardStyleChange = (style: CardStyle) => {
    setCardStyle(style);
  };

  const handleAnimationChange = (intensity: AnimationIntensity) => {
    setAnimationIntensity(intensity);
  };

  const handleAccentColorChange = (color: string) => {
    setAccentColor(color);
  };

  const handleViewChange = (view: 'list' | 'grid' | 'grouped') => {
    updatePreferencesMutation.mutate({ default_project_view: view });
  };

  if (isLoading) {
    return <div className="animate-pulse">Loading...</div>;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Appearance</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Customize how Pasteur looks and feels
      </p>

      <div className="mt-6 space-y-8">
        {/* Color Mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Color Mode
          </label>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Choose between light and dark theme
          </p>
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => handleThemeChange('light')}
              className={clsx(
                'flex-1 rounded-xl border-2 bg-white p-4 text-center transition-all hover:shadow-md',
                colorMode === 'light'
                  ? 'border-primary-500 shadow-md ring-2 ring-primary-500/20'
                  : 'border-gray-200 dark:border-gray-600'
              )}
            >
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-orange-50">
                <span className="text-2xl">☀️</span>
              </div>
              <span className="block font-medium text-gray-900">Light</span>
            </button>
            <button
              onClick={() => handleThemeChange('dark')}
              className={clsx(
                'flex-1 rounded-xl border-2 bg-gray-900 p-4 text-center transition-all hover:shadow-md',
                colorMode === 'dark'
                  ? 'border-primary-500 shadow-md ring-2 ring-primary-500/20'
                  : 'border-gray-600'
              )}
            >
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-900 to-purple-900">
                <span className="text-2xl">🌙</span>
              </div>
              <span className="block font-medium text-white">Dark</span>
            </button>
            <button
              onClick={() => handleThemeChange('system')}
              className={clsx(
                'flex-1 rounded-xl border-2 p-4 text-center transition-all hover:shadow-md dark:bg-dark-card',
                colorMode === 'system'
                  ? 'border-primary-500 shadow-md ring-2 ring-primary-500/20'
                  : 'border-gray-200 dark:border-gray-600'
              )}
            >
              <div className="mx-auto mb-2 flex h-12 w-12 overflow-hidden rounded-xl">
                <div className="flex w-1/2 items-center justify-center bg-gradient-to-br from-amber-100 to-orange-50">
                  <span className="text-lg">☀️</span>
                </div>
                <div className="flex w-1/2 items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900">
                  <span className="text-lg">🌙</span>
                </div>
              </div>
              <span className="block font-medium text-gray-900 dark:text-white">Auto</span>
            </button>
          </div>
        </div>

        {/* Theme Presets */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Theme Preset
          </label>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Choose a color palette that suits your style
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(Object.keys(PRESET_CONFIG) as ThemePreset[]).map((preset) => {
              const config = PRESET_CONFIG[preset];
              return (
                <button
                  key={preset}
                  onClick={() => handlePresetChange(preset)}
                  className={clsx(
                    'group relative rounded-xl border-2 p-3 text-left transition-all hover:shadow-md',
                    customization.preset === preset
                      ? 'border-primary-500 bg-primary-50/50 shadow-md ring-2 ring-primary-500/20 dark:bg-primary-900/20'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700'
                  )}
                >
                  <div className="mb-2 flex gap-1">
                    {config.colors.map((color, i) => (
                      <div
                        key={i}
                        className="h-4 w-4 rounded-full shadow-sm ring-1 ring-black/10"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{config.emoji}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {config.name}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {config.description}
                  </p>
                  {customization.preset === preset && (
                    <div className="absolute right-2 top-2">
                      <CheckIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Accent Color (only when custom preset is selected) */}
        {customization.preset === 'custom' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Custom Accent Color
            </label>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Pick your own accent color
            </p>
            <div className="mt-3 flex items-center gap-4">
              <div className="relative">
                <input
                  type="color"
                  value={customization.accentColor}
                  onChange={(e) => handleAccentColorChange(e.target.value)}
                  className="h-12 w-12 cursor-pointer rounded-lg border-2 border-gray-200 p-1 dark:border-gray-600"
                />
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  value={customization.accentColor}
                  onChange={(e) => handleAccentColorChange(e.target.value)}
                  placeholder="#8b5cf6"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div
                className="h-10 w-20 rounded-lg shadow-inner"
                style={{ backgroundColor: customization.accentColor }}
              />
            </div>
          </div>
        )}

        {/* Card Style */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Card Style
          </label>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Choose how cards and panels appear
          </p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {(Object.keys(CARD_STYLE_CONFIG) as CardStyle[]).map((style) => {
              const config = CARD_STYLE_CONFIG[style];
              return (
                <button
                  key={style}
                  onClick={() => handleCardStyleChange(style)}
                  className={clsx(
                    'rounded-xl border-2 p-3 text-left transition-all hover:shadow-md',
                    customization.cardStyle === style
                      ? 'border-primary-500 bg-primary-50/50 shadow-md ring-2 ring-primary-500/20 dark:bg-primary-900/20'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700'
                  )}
                >
                  <div className="mb-2">{config.preview}</div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {config.name}
                  </span>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {config.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Animation Intensity */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Animation Intensity
          </label>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Control how much motion you see
          </p>
          <div className="mt-3 flex gap-3">
            {(Object.keys(ANIMATION_CONFIG) as AnimationIntensity[]).map((intensity) => {
              const config = ANIMATION_CONFIG[intensity];
              return (
                <button
                  key={intensity}
                  onClick={() => handleAnimationChange(intensity)}
                  className={clsx(
                    'flex-1 rounded-xl border-2 p-4 text-center transition-all hover:shadow-md',
                    customization.animationIntensity === intensity
                      ? 'border-primary-500 bg-primary-50/50 shadow-md ring-2 ring-primary-500/20 dark:bg-primary-900/20'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700'
                  )}
                >
                  <span className="text-2xl">{config.emoji}</span>
                  <span className="mt-1 block text-sm font-medium text-gray-900 dark:text-white">
                    {config.name}
                  </span>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {config.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Default Project View */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Default Project View
          </label>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Choose your preferred way to view projects
          </p>
          <div className="mt-3 flex gap-3">
            {([
              { value: 'list' as const, label: 'List', emoji: '📋' },
              { value: 'grid' as const, label: 'Grid', emoji: '📊' },
              { value: 'grouped' as const, label: 'Grouped', emoji: '📁' },
            ]).map(({ value, label, emoji }) => (
              <button
                key={value}
                onClick={() => handleViewChange(value)}
                className={clsx(
                  'flex-1 rounded-xl border-2 px-4 py-3 text-center transition-all hover:shadow-md',
                  preferences?.default_project_view === value
                    ? 'border-primary-500 bg-primary-50/50 text-primary-700 shadow-md ring-2 ring-primary-500/20 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                )}
              >
                {emoji} {label}
              </button>
            ))}
          </div>
        </div>

        {/* Editor Font Size */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Editor Font Size
          </label>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Adjust the text size in the document editor
          </p>
          <div className="mt-3 flex items-center gap-4">
            <span className="text-xs text-gray-500">A</span>
            <input
              type="range"
              min="10"
              max="24"
              value={preferences?.editor_font_size || 14}
              onChange={(e) =>
                updatePreferencesMutation.mutate({ editor_font_size: parseInt(e.target.value) })
              }
              className="flex-1 accent-primary-500"
            />
            <span className="text-lg text-gray-500">A</span>
            <span className="w-16 rounded-lg bg-gray-100 px-3 py-1.5 text-center text-sm font-medium text-gray-900 dark:bg-gray-700 dark:text-white">
              {preferences?.editor_font_size || 14}px
            </span>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

function SecuritySettings() {
  const { user, logout } = useAuthStore();

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Security</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Manage your account security</p>

      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <svg className="h-5 w-5 text-blue-600" viewBox="0 0 23 23">
                <path fill="currentColor" d="M0 0h11v11H0zM12 0h11v11H12zM0 12h11v11H0zM12 12h11v11H12z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Connected Account</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Signed in with Microsoft Azure AD
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300">{user?.email}</p>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
          <p className="font-medium text-gray-900 dark:text-white">Active Sessions</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Currently signed in on this device
          </p>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300">Current session</span>
            </div>
            <span className="text-xs text-gray-400">Active now</span>
          </div>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
          <p className="font-medium text-red-800 dark:text-red-400">Danger Zone</p>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            Sign out from your account on all devices
          </p>
          <button
            onClick={() => logout()}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

const FOCUS_AREA_OPTIONS = [
  { value: 'clarity', label: 'Clarity', description: 'Clear and understandable writing' },
  { value: 'methodology', label: 'Methodology', description: 'Research methods and approach' },
  { value: 'completeness', label: 'Completeness', description: 'Coverage and thoroughness' },
  { value: 'accuracy', label: 'Accuracy', description: 'Factual correctness' },
  { value: 'citations', label: 'Citations', description: 'Reference quality and formatting' },
  { value: 'grammar', label: 'Grammar', description: 'Language and style' },
];

function AIFeaturesSettings() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: config, isLoading, error } = useQuery({
    queryKey: ['auto-review-config'],
    queryFn: () => aiService.getAutoReviewConfig(),
    staleTime: 5 * 60 * 1000, // 5 min - config rarely changes
  });

  const updateMutation = useMutation({
    mutationFn: (updates: AutoReviewConfigUpdate) => aiService.updateAutoReviewConfig(updates),
    onSuccess: (data) => {
      queryClient.setQueryData(['auto-review-config'], data);
      setToast({ message: 'AI settings updated', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    },
    onError: (err: Error) => {
      const message = err.message.includes('403')
        ? 'Only organization admins can update these settings'
        : 'Failed to update settings';
      setToast({ message, type: 'error' });
      setTimeout(() => setToast(null), 3000);
    },
  });

  const handleToggle = (key: keyof AutoReviewConfigUpdate, value: boolean) => {
    updateMutation.mutate({ [key]: value });
  };

  const handleNumberChange = (key: keyof AutoReviewConfigUpdate, value: number) => {
    updateMutation.mutate({ [key]: value });
  };

  const handleFocusAreaToggle = (area: string) => {
    const currentAreas = config?.default_focus_areas || [];
    const newAreas = currentAreas.includes(area)
      ? currentAreas.filter((a) => a !== area)
      : [...currentAreas, area];
    updateMutation.mutate({ default_focus_areas: newAreas });
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-48 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-64 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-200 dark:bg-gray-700" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
        <p className="text-red-800 dark:text-red-400">Failed to load AI settings</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">AI Features</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Configure AI-powered review and suggestion settings for your organization
      </p>

      {/* Auto-Review Triggers */}
      <div className="mt-6">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Auto-Review Triggers</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Choose when AI should automatically review documents
        </p>

        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">On Document Create</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Automatically review new documents when created
              </p>
            </div>
            <button
              onClick={() => handleToggle('on_document_create', !config?.on_document_create)}
              disabled={updateMutation.isPending}
              className={clsx(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50',
                config?.on_document_create ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
              )}
            >
              <span
                className={clsx(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition',
                  config?.on_document_create ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">On Document Update</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Review documents when content is significantly changed
              </p>
            </div>
            <button
              onClick={() => handleToggle('on_document_update', !config?.on_document_update)}
              disabled={updateMutation.isPending}
              className={clsx(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50',
                config?.on_document_update ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
              )}
            >
              <span
                className={clsx(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition',
                  config?.on_document_update ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">On Review Submission</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Generate AI suggestions when a task is submitted for review
              </p>
            </div>
            <button
              onClick={() => handleToggle('on_task_submit_review', !config?.on_task_submit_review)}
              disabled={updateMutation.isPending}
              className={clsx(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50',
                config?.on_task_submit_review ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
              )}
            >
              <span
                className={clsx(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition',
                  config?.on_task_submit_review ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Auto-Create Review</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Automatically create a review record with AI suggestions
              </p>
            </div>
            <button
              onClick={() => handleToggle('auto_create_review', !config?.auto_create_review)}
              disabled={updateMutation.isPending}
              className={clsx(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50',
                config?.auto_create_review ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
              )}
            >
              <span
                className={clsx(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition',
                  config?.auto_create_review ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Default Focus Areas */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Default Focus Areas</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Select areas AI should focus on during automatic reviews
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {FOCUS_AREA_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => handleFocusAreaToggle(option.value)}
              disabled={updateMutation.isPending}
              className={clsx(
                'rounded-lg border-2 p-3 text-left transition-colors disabled:opacity-50',
                config?.default_focus_areas?.includes(option.value)
                  ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700'
              )}
            >
              <p
                className={clsx(
                  'font-medium',
                  config?.default_focus_areas?.includes(option.value)
                    ? 'text-primary-700 dark:text-primary-400'
                    : 'text-gray-900 dark:text-white'
                )}
              >
                {option.label}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Review Parameters */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white">Review Parameters</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Fine-tune how auto-reviews behave
        </p>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Minimum Document Length
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Documents shorter than this (in characters) won't trigger auto-review
            </p>
            <div className="mt-2 flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="1000"
                step="50"
                value={config?.min_document_length || 100}
                onChange={(e) => handleNumberChange('min_document_length', parseInt(e.target.value))}
                disabled={updateMutation.isPending}
                className="flex-1 disabled:opacity-50"
              />
              <span className="w-20 text-center text-sm text-gray-600 dark:text-gray-400">
                {config?.min_document_length || 100} chars
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Review Cooldown
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Minimum hours before re-reviewing the same content
            </p>
            <div className="mt-2 flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="168"
                step="1"
                value={config?.review_cooldown_hours || 24}
                onChange={(e) => handleNumberChange('review_cooldown_hours', parseInt(e.target.value))}
                disabled={updateMutation.isPending}
                className="flex-1 disabled:opacity-50"
              />
              <span className="w-20 text-center text-sm text-gray-600 dark:text-gray-400">
                {config?.review_cooldown_hours || 24} hours
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Max Suggestions Per Review
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Maximum number of AI suggestions to generate
            </p>
            <div className="mt-2 flex items-center gap-4">
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={config?.max_suggestions_per_review || 10}
                onChange={(e) => handleNumberChange('max_suggestions_per_review', parseInt(e.target.value))}
                disabled={updateMutation.isPending}
                className="flex-1 disabled:opacity-50"
              />
              <span className="w-20 text-center text-sm text-gray-600 dark:text-gray-400">
                {config?.max_suggestions_per_review || 10}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Last Updated */}
      {config?.updated_at && (
        <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
          Last updated: {new Date(config.updated_at).toLocaleString()}
        </p>
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

function OrganizationSettings() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { organizations, fetchOrganizationsAndTeams } = useOrganizationStore();

  const createOrgMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string }) => {
      const response = await fetch('/api/v1/organizations/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().accessToken}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create organization');
      }
      return response.json();
    },
    onSuccess: () => {
      setToast({ message: 'Organization created successfully!', type: 'success' });
      fetchOrganizationsAndTeams();
      setShowCreateForm(false);
      setOrgName('');
      setOrgSlug('');
      setTimeout(() => setToast(null), 3000);
    },
    onError: (error: Error) => {
      setToast({ message: error.message, type: 'error' });
      setTimeout(() => setToast(null), 3000);
    },
  });

  const joinOrgMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await fetch('/api/v1/invites/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().accessToken}`,
        },
        body: JSON.stringify({ code: code.toUpperCase() }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to join organization');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setToast({ message: `Successfully joined ${data.name}!`, type: 'success' });
      fetchOrganizationsAndTeams();
      setInviteCode('');
      setTimeout(() => setToast(null), 3000);
    },
    onError: (error: Error) => {
      setToast({ message: error.message, type: 'error' });
      setTimeout(() => setToast(null), 3000);
    },
  });

  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !orgSlug.trim()) return;
    createOrgMutation.mutate({ name: orgName.trim(), slug: orgSlug.trim().toLowerCase() });
  };

  const handleJoinOrg = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setToast({ message: 'Please enter an invite code', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    joinOrgMutation.mutate(inviteCode.trim());
  };

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setOrgName(name);
    // Convert name to slug: lowercase, replace non-alphanumeric with hyphens, trim leading/trailing hyphens
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric sequences with hyphens
      .replace(/^-+|-+$/g, '')       // Trim leading/trailing hyphens
      .replace(/-+/g, '-');          // Collapse multiple hyphens into one
    setOrgSlug(slug);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Organizations</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Manage your organizations and memberships
      </p>

      <div className="mt-6 space-y-6">
        {/* Existing Organizations */}
        {organizations.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Your Organizations ({organizations.length})
            </h3>
            {organizations.map((org) => (
              <div
                key={org.id}
                className="rounded-lg border border-gray-200 p-4 dark:border-gray-600"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
                    <BuildingOfficeIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">{org.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">@{org.slug}</p>
                  </div>
                  <a
                    href={`/organizations/${org.id}`}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Manage
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Organization Form */}
        {showCreateForm ? (
          <form onSubmit={handleCreateOrg} className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
            <h3 className="font-medium text-gray-900 dark:text-white">Create New Organization</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="My Research Lab"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  URL Slug
                </label>
                <input
                  type="text"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="my-research-lab"
                  pattern="[a-z0-9][a-z0-9\-]*[a-z0-9]|[a-z0-9]"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">Only lowercase letters, numbers, and hyphens</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createOrgMutation.isPending}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {createOrgMutation.isPending ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-4 text-sm font-medium text-gray-600 hover:border-primary-400 hover:text-primary-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-primary-500 dark:hover:text-primary-400"
          >
            <BuildingOfficeIcon className="h-5 w-5" />
            Create New Organization
          </button>
        )}

        {/* Join Organization */}
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-600">
          <h3 className="font-medium text-gray-900 dark:text-white">Join an Organization</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Enter an invite code to join an existing organization
          </p>
          <form onSubmit={handleJoinOrg} className="mt-3 flex gap-2">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Enter invite code (e.g., ORG-ABC123)"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
            <button
              type="submit"
              disabled={joinOrgMutation.isPending}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {joinOrgMutation.isPending ? 'Joining...' : 'Join'}
            </button>
          </form>
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* Sidebar navigation */}
        <nav className="w-full lg:w-64">
          <div className="rounded-xl bg-white p-2 shadow-soft dark:bg-dark-card">
            {settingsNavigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Settings content */}
        <div className="flex-1 rounded-xl bg-white p-6 shadow-soft dark:bg-dark-card">
          <Routes>
            <Route index element={<Navigate to="profile" replace />} />
            <Route path="profile" element={<ProfileSettings />} />
            <Route path="notifications" element={<NotificationSettings />} />
            <Route path="appearance" element={<AppearanceSettings />} />
            <Route path="ai-features" element={<AIFeaturesSettings />} />
            <Route path="security" element={<SecuritySettings />} />
            <Route path="organization" element={<OrganizationSettings />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
