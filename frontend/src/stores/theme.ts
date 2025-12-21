/**
 * Theme store for managing appearance settings.
 * Supports dark/light mode, theme presets, accent colors, and visual preferences.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ColorMode = 'light' | 'dark' | 'system';
type ThemePreset = 'warm' | 'cool' | 'vibrant' | 'minimal' | 'custom';
type CardStyle = 'gradient' | 'flat' | 'bordered';
type AnimationIntensity = 'minimal' | 'moderate' | 'playful';

// Preset color definitions (RGB values for CSS variables)
// Each preset includes full color scales for primary and accent
const THEME_PRESETS = {
  warm: {
    // Violet palette
    primary: '139 92 246',
    primary50: '245 243 255',
    primary100: '237 233 254',
    primary200: '221 214 254',
    primary300: '196 181 253',
    primary400: '167 139 250',
    primary600: '124 58 237',
    primary700: '109 40 217',
    primary800: '91 33 182',
    primary900: '76 29 149',
    primary950: '59 20 133',
    // Orange accent
    accent: '249 115 22',
    accent50: '255 247 237',
    accent100: '255 237 213',
    accent200: '254 215 170',
    accent300: '253 186 116',
    accent400: '251 146 60',
    accent600: '234 88 12',
    accent700: '194 65 12',
    accent800: '154 52 18',
    accent900: '124 45 18',
  },
  cool: {
    // Blue palette
    primary: '59 130 246',
    primary50: '239 246 255',
    primary100: '219 234 254',
    primary200: '191 219 254',
    primary300: '147 197 253',
    primary400: '96 165 250',
    primary600: '37 99 235',
    primary700: '29 78 216',
    primary800: '30 64 175',
    primary900: '30 58 138',
    primary950: '23 37 84',
    // Teal accent
    accent: '20 184 166',
    accent50: '240 253 250',
    accent100: '204 251 241',
    accent200: '153 246 228',
    accent300: '94 234 212',
    accent400: '45 212 191',
    accent600: '13 148 136',
    accent700: '15 118 110',
    accent800: '17 94 89',
    accent900: '19 78 74',
  },
  vibrant: {
    // Purple palette
    primary: '168 85 247',
    primary50: '250 245 255',
    primary100: '243 232 255',
    primary200: '233 213 255',
    primary300: '216 180 254',
    primary400: '192 132 252',
    primary600: '147 51 234',
    primary700: '126 34 206',
    primary800: '107 33 168',
    primary900: '88 28 135',
    primary950: '59 7 100',
    // Pink accent
    accent: '236 72 153',
    accent50: '253 242 248',
    accent100: '252 231 243',
    accent200: '251 207 232',
    accent300: '249 168 212',
    accent400: '244 114 182',
    accent600: '219 39 119',
    accent700: '190 24 93',
    accent800: '157 23 77',
    accent900: '131 24 67',
  },
  minimal: {
    // Slate palette
    primary: '71 85 105',
    primary50: '248 250 252',
    primary100: '241 245 249',
    primary200: '226 232 240',
    primary300: '203 213 225',
    primary400: '148 163 184',
    primary600: '71 85 105',
    primary700: '51 65 85',
    primary800: '30 41 59',
    primary900: '15 23 42',
    primary950: '2 6 23',
    // Blue accent
    accent: '59 130 246',
    accent50: '239 246 255',
    accent100: '219 234 254',
    accent200: '191 219 254',
    accent300: '147 197 253',
    accent400: '96 165 250',
    accent600: '37 99 235',
    accent700: '29 78 216',
    accent800: '30 64 175',
    accent900: '30 58 138',
  },
} as const;

interface ThemeCustomization {
  preset: ThemePreset;
  accentColor: string;         // Hex color for custom presets
  cardStyle: CardStyle;
  animationIntensity: AnimationIntensity;
}

interface ThemeState {
  // Color mode (dark/light)
  colorMode: ColorMode;
  resolvedColorMode: 'light' | 'dark';

  // Theme customization
  customization: ThemeCustomization;

  // Legacy alias
  theme: ColorMode;
  resolvedTheme: 'light' | 'dark';

  // Actions
  setColorMode: (mode: ColorMode) => void;
  setTheme: (theme: ColorMode) => void; // Legacy alias
  setPreset: (preset: ThemePreset) => void;
  setAccentColor: (color: string) => void;
  setCardStyle: (style: CardStyle) => void;
  setAnimationIntensity: (intensity: AnimationIntensity) => void;
  setCustomization: (customization: Partial<ThemeCustomization>) => void;
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyColorMode(mode: 'light' | 'dark') {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '139 92 246'; // fallback to violet
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
}

function applyThemeCustomization(customization: ThemeCustomization) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const { preset, accentColor, cardStyle, animationIntensity } = customization;

  // Apply color variables from preset or custom
  if (preset !== 'custom' && THEME_PRESETS[preset]) {
    const colors = THEME_PRESETS[preset];
    // Primary colors - full scale
    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-primary-50', colors.primary50);
    root.style.setProperty('--color-primary-100', colors.primary100);
    root.style.setProperty('--color-primary-200', colors.primary200);
    root.style.setProperty('--color-primary-300', colors.primary300);
    root.style.setProperty('--color-primary-400', colors.primary400);
    root.style.setProperty('--color-primary-600', colors.primary600);
    root.style.setProperty('--color-primary-700', colors.primary700);
    root.style.setProperty('--color-primary-800', colors.primary800);
    root.style.setProperty('--color-primary-900', colors.primary900);
    if ('primary950' in colors) {
      root.style.setProperty('--color-primary-950', colors.primary950);
    }
    // Accent colors - full scale
    root.style.setProperty('--color-accent', colors.accent);
    root.style.setProperty('--color-accent-50', colors.accent50);
    root.style.setProperty('--color-accent-100', colors.accent100);
    root.style.setProperty('--color-accent-200', colors.accent200);
    root.style.setProperty('--color-accent-300', colors.accent300);
    root.style.setProperty('--color-accent-400', colors.accent400);
    root.style.setProperty('--color-accent-600', colors.accent600);
    root.style.setProperty('--color-accent-700', colors.accent700);
    root.style.setProperty('--color-accent-800', colors.accent800);
    root.style.setProperty('--color-accent-900', colors.accent900);
    // Legacy compatibility
    root.style.setProperty('--color-primary-light', colors.primary100);
    root.style.setProperty('--color-accent-light', colors.accent50);
  } else if (preset === 'custom' && accentColor) {
    // For custom, use the accent color as primary and generate simple scale
    const primaryRgb = hexToRgb(accentColor);
    root.style.setProperty('--color-primary', primaryRgb);
    root.style.setProperty('--color-accent', primaryRgb);
  }

  // Apply card style class
  root.classList.remove('card-gradient', 'card-flat', 'card-bordered');
  root.classList.add(`card-${cardStyle}`);

  // Apply animation intensity class
  root.classList.remove('motion-minimal', 'motion-moderate', 'motion-playful');
  root.classList.add(`motion-${animationIntensity}`);
}

// Default customization values
const DEFAULT_CUSTOMIZATION: ThemeCustomization = {
  preset: 'warm',
  accentColor: '#8b5cf6',
  cardStyle: 'gradient',
  animationIntensity: 'moderate',
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      // Color mode state
      colorMode: 'system',
      resolvedColorMode: getSystemTheme(),

      // Theme customization
      customization: DEFAULT_CUSTOMIZATION,

      // Legacy aliases for backward compatibility
      get theme() {
        return get().colorMode;
      },
      get resolvedTheme() {
        return get().resolvedColorMode;
      },

      setColorMode: (mode: ColorMode) => {
        const resolvedColorMode = mode === 'system' ? getSystemTheme() : mode;
        applyColorMode(resolvedColorMode);
        set({ colorMode: mode, resolvedColorMode });
      },

      // Legacy alias
      setTheme: (theme: ColorMode) => {
        get().setColorMode(theme);
      },

      setPreset: (preset: ThemePreset) => {
        const customization = { ...get().customization, preset };
        applyThemeCustomization(customization);
        set({ customization });
      },

      setAccentColor: (color: string) => {
        const customization = { ...get().customization, accentColor: color, preset: 'custom' as ThemePreset };
        applyThemeCustomization(customization);
        set({ customization });
      },

      setCardStyle: (style: CardStyle) => {
        const customization = { ...get().customization, cardStyle: style };
        applyThemeCustomization(customization);
        set({ customization });
      },

      setAnimationIntensity: (intensity: AnimationIntensity) => {
        const customization = { ...get().customization, animationIntensity: intensity };
        applyThemeCustomization(customization);
        set({ customization });
      },

      setCustomization: (updates: Partial<ThemeCustomization>) => {
        const customization = { ...get().customization, ...updates };
        applyThemeCustomization(customization);
        set({ customization });
      },
    }),
    {
      name: 'pasteur-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Apply color mode
          const resolvedColorMode = state.colorMode === 'system' ? getSystemTheme() : state.colorMode;
          applyColorMode(resolvedColorMode);
          state.resolvedColorMode = resolvedColorMode;

          // Apply theme customization
          if (state.customization) {
            applyThemeCustomization(state.customization);
          }
        }
      },
    }
  )
);

// Listen for system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const state = useThemeStore.getState();
    if (state.colorMode === 'system') {
      const resolvedColorMode = e.matches ? 'dark' : 'light';
      applyColorMode(resolvedColorMode);
      useThemeStore.setState({ resolvedColorMode });
    }
  });
}

// Export types for use in other components
export type { ThemePreset, CardStyle, AnimationIntensity, ThemeCustomization };
export { THEME_PRESETS };
