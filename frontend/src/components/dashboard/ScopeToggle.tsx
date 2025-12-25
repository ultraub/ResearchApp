/**
 * ScopeToggle - Toggle between personal and team task views.
 */

import { clsx } from 'clsx';
import type { ScopeFilter } from '@/types/dashboard';

interface ScopeToggleProps {
  value: ScopeFilter;
  onChange: (value: ScopeFilter) => void;
  className?: string;
}

export function ScopeToggle({ value, onChange, className }: ScopeToggleProps) {
  return (
    <div
      className={clsx(
        'inline-flex rounded-lg bg-gray-100 p-1 dark:bg-dark-elevated',
        className
      )}
    >
      <button
        onClick={() => onChange('personal')}
        className={clsx(
          'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
          value === 'personal'
            ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-card dark:text-white'
            : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
        )}
      >
        My Tasks
      </button>
      <button
        onClick={() => onChange('team')}
        className={clsx(
          'px-3 py-1.5 text-sm font-medium rounded-md transition-all',
          value === 'team'
            ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-card dark:text-white'
            : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
        )}
      >
        Team
      </button>
    </div>
  );
}

export default ScopeToggle;
