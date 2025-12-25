/**
 * UpcomingTasksSection - Display tasks grouped by day with urgency indicators.
 */

import { useMemo } from 'react';
import { CalendarDaysIcon, ClockIcon, AlertTriangleIcon } from 'lucide-react';
import { clsx } from 'clsx';
import type { TaskSummary } from '@/types/dashboard';
import { URGENCY_COLORS } from '@/types/dashboard';
import { formatDayLabel, sortTasksByPriority, getUrgencyCategory } from '@/services/dashboard';
import { TaskRowItem } from './TaskRowItem';

interface UpcomingTasksSectionProps {
  tasksByDay: Record<string, TaskSummary[]>;
  overdueTasks: TaskSummary[];
  stalledTasks: TaskSummary[];
}

interface DayGroupProps {
  dateKey: string;
  tasks: TaskSummary[];
  urgency: 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'future';
}

function DayGroup({ dateKey, tasks, urgency }: DayGroupProps) {
  const urgencyColors = URGENCY_COLORS[urgency];
  const sortedTasks = useMemo(() => sortTasksByPriority(tasks), [tasks]);
  const dayLabel = formatDayLabel(dateKey);

  return (
    <div className="mb-4">
      <div
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-lg mb-2',
          urgencyColors.bg,
          urgencyColors.border,
          'border'
        )}
      >
        <CalendarDaysIcon className={clsx('h-4 w-4', urgencyColors.text)} />
        <span className={clsx('text-sm font-semibold', urgencyColors.text)}>
          {dayLabel}
        </span>
        <span className={clsx('text-xs', urgencyColors.text)}>
          ({tasks.length} task{tasks.length !== 1 ? 's' : ''})
        </span>
      </div>
      <div className="space-y-2 pl-1">
        {sortedTasks.map(task => (
          <TaskRowItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

function OverdueSection({ tasks }: { tasks: TaskSummary[] }) {
  const sortedTasks = useMemo(() => sortTasksByPriority(tasks), [tasks]);

  if (tasks.length === 0) return null;

  return (
    <div className="mb-6">
      <div
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-lg mb-2',
          'bg-red-50 dark:bg-red-900/20',
          'border border-red-200 dark:border-red-800'
        )}
      >
        <AlertTriangleIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
        <span className="text-sm font-semibold text-red-600 dark:text-red-400">
          Overdue
        </span>
        <span className="text-xs text-red-600 dark:text-red-400">
          ({tasks.length} task{tasks.length !== 1 ? 's' : ''})
        </span>
      </div>
      <div className="space-y-2 pl-1">
        {sortedTasks.map(task => (
          <TaskRowItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

function StalledSection({ tasks }: { tasks: TaskSummary[] }) {
  if (tasks.length === 0) return null;

  return (
    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-dark-border">
      <div
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-lg mb-2',
          'bg-amber-50 dark:bg-amber-900/20',
          'border border-amber-200 dark:border-amber-800'
        )}
      >
        <ClockIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
          Stalled Tasks
        </span>
        <span className="text-xs text-amber-600 dark:text-amber-400">
          (no updates in 7+ days)
        </span>
      </div>
      <div className="space-y-2 pl-1">
        {tasks.map(task => (
          <div key={task.id} className="flex items-center gap-2">
            <TaskRowItem task={task} />
            {task.days_stalled && (
              <span className="text-xs text-amber-600 dark:text-amber-400 whitespace-nowrap">
                {task.days_stalled}d stalled
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function UpcomingTasksSection({
  tasksByDay,
  overdueTasks,
  stalledTasks,
}: UpcomingTasksSectionProps) {
  // Sort date keys chronologically
  const sortedDateKeys = useMemo(() => {
    return Object.keys(tasksByDay).sort((a, b) => {
      return new Date(a).getTime() - new Date(b).getTime();
    });
  }, [tasksByDay]);

  const hasAnyTasks = sortedDateKeys.length > 0 || overdueTasks.length > 0;

  if (!hasAnyTasks && stalledTasks.length === 0) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Upcoming Tasks</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          {/* Celebration indicator with gradient */}
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary-100 to-primary-50 dark:from-primary-900/30 dark:to-primary-900/20 flex items-center justify-center mb-4 ring-4 ring-primary-50 dark:ring-primary-900/20">
            <span className="text-3xl">🎉</span>
          </div>
          <p className="text-base font-medium text-gray-700 dark:text-gray-200">
            All caught up!
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-[220px]">
            No upcoming tasks scheduled. Time to plan ahead?
          </p>
          {/* Actionable hints */}
          <div className="mt-4 flex items-center gap-3">
            <a
              href="/projects"
              className="text-xs px-3 py-1.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors"
            >
              View Projects
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <CalendarDaysIcon className="h-5 w-5 text-primary-500" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Upcoming Tasks</h2>
      </div>

      {/* Overdue tasks first */}
      <OverdueSection tasks={overdueTasks} />

      {/* Tasks by day */}
      <div className="max-h-[500px] overflow-y-auto pr-1 -mr-1">
        {sortedDateKeys.map(dateKey => {
          const urgency = getUrgencyCategory(dateKey);
          return (
            <DayGroup
              key={dateKey}
              dateKey={dateKey}
              tasks={tasksByDay[dateKey]}
              urgency={urgency}
            />
          );
        })}
      </div>

      {/* Stalled tasks at bottom */}
      <StalledSection tasks={stalledTasks} />
    </div>
  );
}

export default UpcomingTasksSection;
