/**
 * WeeklyTimelineView - Visual 7-day timeline for upcoming tasks.
 * Custom implementation with proper links, colors, and tooltips.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarIcon } from '@heroicons/react/24/outline';
import type { TaskSummary } from '@/types/dashboard';

interface WeeklyTimelineViewProps {
  tasks: TaskSummary[];
  className?: string;
}

// Priority colors with background and text variants
const PRIORITY_STYLES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  urgent: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-300 dark:border-red-700',
    text: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
  },
  high: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-300 dark:border-orange-700',
    text: 'text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500',
  },
  medium: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-300 dark:border-blue-700',
    text: 'text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  low: {
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    border: 'border-gray-300 dark:border-gray-600',
    text: 'text-gray-600 dark:text-gray-400',
    dot: 'bg-gray-400',
  },
};

// Generate next 7 days
function getNext7Days(): Date[] {
  const days: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const day = new Date(today);
    day.setDate(today.getDate() + i);
    days.push(day);
  }
  return days;
}

// Format date for display
function formatDayHeader(date: Date, isToday: boolean): { day: string; date: string } {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    day: isToday ? 'Today' : dayNames[date.getDay()],
    date: `${date.getMonth() + 1}/${date.getDate()}`,
  };
}

// Task item with tooltip
function TaskItem({ task }: { task: TaskSummary }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const priority = task.priority || 'medium';
  const styles = PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium;

  return (
    <div className="relative">
      <Link
        to={`/projects/${task.project_id}/tasks/${task.id}`}
        className={`
          block px-2 py-1.5 rounded border text-xs
          ${styles.bg} ${styles.border} ${styles.text}
          hover:shadow-md transition-shadow cursor-pointer
          truncate
        `}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
          <span className="truncate font-medium">{task.title}</span>
        </div>
      </Link>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="absolute z-50 left-0 top-full mt-1 w-64 p-3 rounded-lg shadow-lg
            bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
            text-sm"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="font-semibold text-gray-900 dark:text-white mb-2">
            {task.title}
          </div>
          <div className="space-y-1 text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Project:</span>
              <span className="text-gray-900 dark:text-gray-200">{task.project_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Priority:</span>
              <span className={`capitalize ${styles.text}`}>{priority}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Status:</span>
              <span className="text-gray-900 dark:text-gray-200 capitalize">
                {task.status?.replace(/_/g, ' ') || 'To do'}
              </span>
            </div>
            {task.assignee_name && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Assignee:</span>
                <span className="text-gray-900 dark:text-gray-200">{task.assignee_name}</span>
              </div>
            )}
            {task.is_blocked && (
              <div className="mt-2 text-red-600 dark:text-red-400 font-medium">
                ⚠️ Blocked
              </div>
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
            Click to view task details
          </div>
        </div>
      )}
    </div>
  );
}

export function WeeklyTimelineView({ tasks, className }: WeeklyTimelineViewProps) {
  const days = useMemo(() => getNext7Days(), []);

  // Group tasks by date
  const tasksByDate = useMemo(() => {
    const grouped: Record<string, TaskSummary[]> = {};

    tasks.forEach((task) => {
      if (!task.due_date) return;

      const dueDate = new Date(task.due_date);
      dueDate.setHours(0, 0, 0, 0);
      const dateKey = dueDate.toISOString().split('T')[0];

      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(task);
    });

    // Sort tasks within each day by priority
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    Object.values(grouped).forEach((dayTasks) => {
      dayTasks.sort((a, b) => {
        const aPriority = priorityOrder[a.priority || 'medium'] ?? 2;
        const bPriority = priorityOrder[b.priority || 'medium'] ?? 2;
        return aPriority - bPriority;
      });
    });

    return grouped;
  }, [tasks]);

  const totalTasks = Object.values(tasksByDate).reduce((sum, t) => sum + t.length, 0);

  if (totalTasks === 0) {
    return (
      <div className={className}>
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <CalendarIcon className="h-5 w-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Weekly Timeline
            </h2>
          </div>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No tasks with due dates in the next 7 days
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarIcon className="h-5 w-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Weekly Timeline
          </h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({totalTasks} task{totalTasks !== 1 ? 's' : ''})
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs">
          <div className="flex items-center gap-1">
            <div className={`h-3 w-3 rounded ${PRIORITY_STYLES.urgent.dot}`} />
            <span className="text-gray-600 dark:text-gray-400">Urgent</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`h-3 w-3 rounded ${PRIORITY_STYLES.high.dot}`} />
            <span className="text-gray-600 dark:text-gray-400">High</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`h-3 w-3 rounded ${PRIORITY_STYLES.medium.dot}`} />
            <span className="text-gray-600 dark:text-gray-400">Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`h-3 w-3 rounded ${PRIORITY_STYLES.low.dot}`} />
            <span className="text-gray-600 dark:text-gray-400">Low</span>
          </div>
        </div>

        {/* Timeline Grid */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            {days.map((day, index) => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const isToday = day.getTime() === today.getTime();
              const { day: dayName, date } = formatDayHeader(day, isToday);

              return (
                <div
                  key={index}
                  className={`
                    px-2 py-2 text-center border-r last:border-r-0 border-gray-200 dark:border-gray-700
                    ${isToday ? 'bg-primary-50 dark:bg-primary-900/20' : ''}
                  `}
                >
                  <div className={`text-xs font-semibold ${isToday ? 'text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {dayName}
                  </div>
                  <div className={`text-xs ${isToday ? 'text-primary-500 dark:text-primary-400' : 'text-gray-500 dark:text-gray-500'}`}>
                    {date}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Task rows */}
          <div className="grid grid-cols-7 min-h-[200px]">
            {days.map((day, index) => {
              const dateKey = day.toISOString().split('T')[0];
              const dayTasks = tasksByDate[dateKey] || [];
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const isToday = day.getTime() === today.getTime();

              return (
                <div
                  key={index}
                  className={`
                    p-2 border-r last:border-r-0 border-gray-200 dark:border-gray-700
                    ${isToday ? 'bg-primary-50/30 dark:bg-primary-900/10' : ''}
                    min-h-[200px]
                  `}
                >
                  <div className="space-y-1.5">
                    {dayTasks.map((task) => (
                      <TaskItem key={task.id} task={task} />
                    ))}
                    {dayTasks.length === 0 && (
                      <div className="text-xs text-gray-400 dark:text-gray-600 text-center py-4">
                        No tasks
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default WeeklyTimelineView;
