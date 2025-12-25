/**
 * QuickActionsDropdown - Dropdown menu for task quick actions (complete, snooze).
 */

import { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import {
  EllipsisVerticalIcon,
  CheckCircleIcon,
  ClockIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import type { SnoozeOption } from '@/types/dashboard';

interface QuickActionsDropdownProps {
  onComplete: () => void;
  onSnooze: (option: SnoozeOption) => void;
  isCompleting?: boolean;
  isSnoozeing?: boolean;
  className?: string;
}

export function QuickActionsDropdown({
  onComplete,
  onSnooze,
  isCompleting = false,
  isSnoozeing = false,
  className,
}: QuickActionsDropdownProps) {
  const isLoading = isCompleting || isSnoozeing;

  return (
    <Menu as="div" className={clsx('relative', className)}>
      <Menu.Button
        className={clsx(
          'rounded-lg p-1.5 text-gray-400 transition-colors',
          'hover:bg-gray-100 hover:text-gray-600',
          'dark:hover:bg-dark-elevated dark:hover:text-gray-300',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
          isLoading && 'opacity-50 pointer-events-none'
        )}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <EllipsisVerticalIcon className="h-5 w-5" />
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition duration-100 ease-out"
        enterFrom="transform scale-95 opacity-0"
        enterTo="transform scale-100 opacity-100"
        leave="transition duration-75 ease-in"
        leaveFrom="transform scale-100 opacity-100"
        leaveTo="transform scale-95 opacity-0"
      >
        <Menu.Items
          className={clsx(
            'absolute right-0 z-20 mt-1 w-44',
            'rounded-xl bg-white py-1 shadow-card',
            'ring-1 ring-gray-200 dark:bg-dark-elevated dark:ring-dark-border'
          )}
        >
          {/* Complete */}
          <Menu.Item>
            {({ active }) => (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onComplete();
                }}
                disabled={isLoading}
                className={clsx(
                  'flex w-full items-center gap-2 px-4 py-2 text-sm',
                  active ? 'bg-gray-100 dark:bg-dark-base' : '',
                  'text-green-600 dark:text-green-400',
                  isLoading && 'opacity-50'
                )}
              >
                <CheckCircleIcon className="h-4 w-4" />
                Mark Complete
              </button>
            )}
          </Menu.Item>

          <div className="my-1 border-t border-gray-100 dark:border-dark-border" />

          {/* Snooze Tomorrow */}
          <Menu.Item>
            {({ active }) => (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSnooze('tomorrow');
                }}
                disabled={isLoading}
                className={clsx(
                  'flex w-full items-center gap-2 px-4 py-2 text-sm',
                  active ? 'bg-gray-100 dark:bg-dark-base' : '',
                  'text-gray-700 dark:text-gray-300',
                  isLoading && 'opacity-50'
                )}
              >
                <ClockIcon className="h-4 w-4" />
                Snooze to Tomorrow
              </button>
            )}
          </Menu.Item>

          {/* Snooze Next Week */}
          <Menu.Item>
            {({ active }) => (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSnooze('next_week');
                }}
                disabled={isLoading}
                className={clsx(
                  'flex w-full items-center gap-2 px-4 py-2 text-sm',
                  active ? 'bg-gray-100 dark:bg-dark-base' : '',
                  'text-gray-700 dark:text-gray-300',
                  isLoading && 'opacity-50'
                )}
              >
                <CalendarDaysIcon className="h-4 w-4" />
                Snooze to Next Week
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}

export default QuickActionsDropdown;
