/**
 * UnscheduledTasksSection - Display tasks without due dates.
 */

import { useState } from 'react';
import { InboxIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import type { TaskSummary } from '@/types/dashboard';
import { TaskRowItem } from './TaskRowItem';

interface UnscheduledTasksSectionProps {
  tasks: TaskSummary[];
}

export function UnscheduledTasksSection({ tasks }: UnscheduledTasksSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (tasks.length === 0) {
    return null; // Don't show section if no unscheduled tasks
  }

  // Show first 3 when collapsed, all when expanded
  const visibleTasks = isExpanded ? tasks : tasks.slice(0, 3);
  const hiddenCount = tasks.length - 3;

  return (
    <div className="card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <InboxIcon className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Unscheduled
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs font-medium">
            {tasks.length}
          </span>
        </div>

        {tasks.length > 3 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={clsx(
              'flex items-center gap-1 text-sm font-medium',
              'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
              'transition-colors'
            )}
          >
            {isExpanded ? (
              <>
                <ChevronDownIcon className="h-4 w-4" />
                Show less
              </>
            ) : (
              <>
                <ChevronRightIcon className="h-4 w-4" />
                +{hiddenCount} more
              </>
            )}
          </button>
        )}
      </div>

      {/* Hint text */}
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Tasks without due dates - consider scheduling them!
      </p>

      {/* Task list */}
      <div className="space-y-2">
        {visibleTasks.map(task => (
          <TaskRowItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

export default UnscheduledTasksSection;
