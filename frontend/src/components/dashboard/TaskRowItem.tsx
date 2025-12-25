/**
 * TaskRowItem - Compact task row for dashboard with quick actions.
 */

import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import { clsx } from 'clsx';
import type { TaskSummary, SnoozeOption } from '@/types/dashboard';
import { PRIORITY_COLORS } from '@/types/dashboard';
import { dashboardService } from '@/services/dashboard';
import { QuickActionsDropdown } from './QuickActionsDropdown';

interface TaskRowItemProps {
  task: TaskSummary;
  showProject?: boolean;
  onComplete?: () => void;
}

export function TaskRowItem({ task, showProject = true, onComplete }: TaskRowItemProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const priorityColors = PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.medium;

  const completeMutation = useMutation({
    mutationFn: () => dashboardService.quickCompleteTask(task.id),
    onMutate: async () => {
      // Optimistic update - invalidate immediately
      await queryClient.cancelQueries({ queryKey: ['command-center'] });
    },
    onSuccess: () => {
      toast.success('Task completed!');
      queryClient.invalidateQueries({ queryKey: ['command-center'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onComplete?.();
    },
    onError: () => {
      toast.error('Failed to complete task');
      queryClient.invalidateQueries({ queryKey: ['command-center'] });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: (snoozeTo: SnoozeOption) => dashboardService.snoozeTask(task.id, snoozeTo),
    onSuccess: (_, snoozeTo) => {
      const label = snoozeTo === 'tomorrow' ? 'tomorrow' : 'next week';
      toast.success(`Task snoozed to ${label}`);
      queryClient.invalidateQueries({ queryKey: ['command-center'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: () => {
      toast.error('Failed to snooze task');
    },
  });

  const handleClick = () => {
    // Navigate to project with task query param to open task detail modal
    navigate(`/projects/${task.project_id}?task=${task.id}`);
  };

  const handleComplete = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    completeMutation.mutate();
  };

  const handleSnooze = (option: SnoozeOption) => {
    snoozeMutation.mutate(option);
  };

  return (
    <div
      onClick={handleClick}
      className={clsx(
        'group flex items-center gap-3 p-3 rounded-lg cursor-pointer',
        'border-l-4 bg-white dark:bg-dark-card',
        'hover:shadow-sm hover:bg-gray-50 dark:hover:bg-dark-elevated',
        'transition-all',
        priorityColors.border,
        task.is_blocked && 'opacity-80 ring-1 ring-amber-200 dark:ring-amber-800'
      )}
    >
      {/* Complete checkbox - larger tap target */}
      <button
        onClick={handleComplete}
        disabled={completeMutation.isPending}
        className={clsx(
          'flex-shrink-0 rounded-full p-1 transition-colors',
          'text-gray-300 hover:text-green-500 hover:bg-green-50',
          'dark:text-gray-600 dark:hover:text-green-400 dark:hover:bg-green-900/20',
          completeMutation.isPending && 'opacity-50'
        )}
      >
        {completeMutation.isPending ? (
          <CheckCircleSolidIcon className="h-5 w-5 text-green-500 animate-pulse" />
        ) : (
          <CheckCircleIcon className="h-5 w-5" />
        )}
      </button>

      {/* Task content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-white truncate">
            {task.title}
          </span>
          {task.is_blocked && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30">
              <ExclamationTriangleIcon className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs text-amber-700 dark:text-amber-300">Blocked</span>
            </span>
          )}
        </div>
        {showProject && (
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">
            {task.project_name}
          </span>
        )}
      </div>

      {/* Priority badge */}
      <span
        className={clsx(
          'flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium capitalize',
          priorityColors.bg,
          priorityColors.text
        )}
      >
        {task.priority}
      </span>

      {/* Assignee */}
      {task.assignee_name && (
        <div
          className={clsx(
            'flex-shrink-0 flex items-center justify-center',
            'h-6 w-6 rounded-full text-xs font-medium',
            'bg-primary-100 text-primary-700',
            'dark:bg-primary-900/30 dark:text-primary-400'
          )}
          title={task.assignee_name}
        >
          {task.assignee_name.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Quick actions */}
      <QuickActionsDropdown
        onComplete={() => completeMutation.mutate()}
        onSnooze={handleSnooze}
        isCompleting={completeMutation.isPending}
        isSnoozeing={snoozeMutation.isPending}
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </div>
  );
}

export default TaskRowItem;
