/**
 * ThemeToggle - Quick theme switcher for the header.
 * Provides fast access to light/dark mode toggle and theme preset switching.
 */

import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { SunIcon, MoonIcon, ComputerDesktopIcon, SwatchIcon } from '@heroicons/react/24/outline';
import { useThemeStore, type ThemePreset } from '@/stores/theme';

const PRESET_EMOJIS: Record<ThemePreset, string> = {
  warm: '🌅',
  cool: '🌊',
  vibrant: '🎨',
  minimal: '📐',
  custom: '✨',
};

const PRESET_NAMES: Record<ThemePreset, string> = {
  warm: 'Warm',
  cool: 'Cool',
  vibrant: 'Vibrant',
  minimal: 'Minimal',
  custom: 'Custom',
};

export function ThemeToggle() {
  const { colorMode, setColorMode, resolvedColorMode, customization, setPreset } = useThemeStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleColorModeChange = (mode: 'light' | 'dark' | 'system') => {
    setColorMode(mode);
  };

  const handlePresetChange = (preset: ThemePreset) => {
    setPreset(preset);
  };

  const CurrentIcon = resolvedColorMode === 'dark' ? MoonIcon : SunIcon;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'group flex items-center gap-2 rounded-xl px-3 py-2 transition-all',
          'hover:bg-gray-100 dark:hover:bg-dark-elevated',
          isOpen && 'bg-gray-100 dark:bg-dark-elevated'
        )}
        title="Theme settings"
      >
        <div className="relative">
          <CurrentIcon className="h-5 w-5 text-gray-600 transition-transform group-hover:scale-110 dark:text-gray-400" />
        </div>
        <span className="hidden text-sm sm:inline">
          {PRESET_EMOJIS[customization.preset]}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-dark-border dark:bg-dark-card">
          {/* Color Mode Section */}
          <div className="mb-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Color Mode
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => handleColorModeChange('light')}
                className={clsx(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  colorMode === 'light'
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-elevated'
                )}
              >
                <SunIcon className="h-4 w-4" />
                Light
              </button>
              <button
                onClick={() => handleColorModeChange('dark')}
                className={clsx(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  colorMode === 'dark'
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-elevated'
                )}
              >
                <MoonIcon className="h-4 w-4" />
                Dark
              </button>
              <button
                onClick={() => handleColorModeChange('system')}
                className={clsx(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                  colorMode === 'system'
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-elevated'
                )}
              >
                <ComputerDesktopIcon className="h-4 w-4" />
                Auto
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="my-3 border-t border-gray-200 dark:border-dark-border" />

          {/* Theme Presets Section */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Theme
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(PRESET_EMOJIS) as ThemePreset[]).filter(p => p !== 'custom').map((preset) => (
                <button
                  key={preset}
                  onClick={() => handlePresetChange(preset)}
                  className={clsx(
                    'flex flex-col items-center gap-0.5 rounded-lg p-2 text-xs font-medium transition-all',
                    customization.preset === preset
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-elevated'
                  )}
                >
                  <span className="text-lg">{PRESET_EMOJIS[preset]}</span>
                  <span>{PRESET_NAMES[preset]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="my-3 border-t border-gray-200 dark:border-dark-border" />

          {/* Full Settings Link */}
          <a
            href="/settings/appearance"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-dark-elevated dark:hover:text-white"
            onClick={() => setIsOpen(false)}
          >
            <SwatchIcon className="h-4 w-4" />
            All appearance settings
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * SimpleThemeToggle - Minimal toggle button for just light/dark switching.
 * Use when you only need a simple toggle without the full dropdown.
 */
export function SimpleThemeToggle() {
  const { resolvedColorMode, colorMode, setColorMode } = useThemeStore();

  const toggleTheme = () => {
    if (colorMode === 'system') {
      // If on system, switch to the opposite of current resolved mode
      setColorMode(resolvedColorMode === 'dark' ? 'light' : 'dark');
    } else {
      // Toggle between light and dark
      setColorMode(colorMode === 'dark' ? 'light' : 'dark');
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="group flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-dark-elevated"
      title={`Switch to ${resolvedColorMode === 'dark' ? 'light' : 'dark'} mode`}
    >
      {resolvedColorMode === 'dark' ? (
        <SunIcon className="h-5 w-5 text-gray-400 transition-transform group-hover:scale-110 group-hover:text-amber-400" />
      ) : (
        <MoonIcon className="h-5 w-5 text-gray-600 transition-transform group-hover:scale-110 group-hover:text-primary-600" />
      )}
    </button>
  );
}

export default ThemeToggle;
