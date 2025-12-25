/**
 * WeeklyTimelineView - Visual 7-day timeline using SVAR React Gantt.
 */

import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gantt, type GanttApi } from 'wx-react-gantt';
import 'wx-react-gantt/dist/gantt.css';
import { CalendarIcon } from '@heroicons/react/24/outline';
import type { TaskSummary } from '@/types/dashboard';

interface WeeklyTimelineViewProps {
  tasks: TaskSummary[];
  className?: string;
}

// Priority to color mapping for task bars
const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444', // red-500
  high: '#f97316',   // orange-500
  medium: '#3b82f6', // blue-500
  low: '#9ca3af',    // gray-400
};

// Custom styles for Gantt task bars by priority
const ganttStyles = `
  .wx-gantt .task-urgent .wx-task-bar { background-color: ${PRIORITY_COLORS.urgent} !important; }
  .wx-gantt .task-high .wx-task-bar { background-color: ${PRIORITY_COLORS.high} !important; }
  .wx-gantt .task-medium .wx-task-bar { background-color: ${PRIORITY_COLORS.medium} !important; }
  .wx-gantt .task-low .wx-task-bar { background-color: ${PRIORITY_COLORS.low} !important; }
  .wx-gantt .wx-task-bar { border-radius: 4px; min-height: 20px; }
  .wx-gantt .wx-grid-cell { cursor: pointer; }
`;

export function WeeklyTimelineView({ tasks, className }: WeeklyTimelineViewProps) {
  const navigate = useNavigate();
  const apiRef = useRef<unknown>(null);

  // Calculate date range for 7 days
  const { start, end, scales } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);

    return {
      start: today,
      end: endDate,
      scales: [
        { unit: 'day' as const, step: 1, format: 'EEE d' },
      ],
    };
  }, []);

  // Transform tasks to Gantt format
  const ganttTasks = useMemo(() => {
    return tasks
      .filter(task => task.due_date) // Only tasks with due dates
      .map(task => {
        const dueDate = new Date(task.due_date!);
        dueDate.setHours(0, 0, 0, 0);
        const startDate = new Date(dueDate);
        // End date needs to be slightly after start for the bar to render
        const endDate = new Date(dueDate);
        endDate.setHours(23, 59, 59, 999);

        return {
          id: task.id,
          text: task.title,
          start: startDate,
          end: endDate,
          duration: 1,
          progress: task.status === 'done' ? 100 : 0,
          type: 'task' as const,
          // Bar color based on priority
          $css: `task-${task.priority}`,
          // Custom data for navigation
          priority: task.priority,
          projectId: task.project_id,
          projectName: task.project_name,
          isBlocked: task.is_blocked,
        };
      });
  }, [tasks]);

  // Handle task click
  const handleInit = (api: GanttApi) => {
    apiRef.current = api;

    api.on('select-task', (ev) => {
      const event = ev as { id: string };
      const task = ganttTasks.find(t => t.id === event.id);
      if (task) {
        navigate(`/projects/${task.projectId}/tasks/${task.id}`);
      }
    });
  };

  if (ganttTasks.length === 0) {
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
      {/* Inject custom Gantt styles */}
      <style>{ganttStyles}</style>

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarIcon className="h-5 w-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Weekly Timeline
          </h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({ganttTasks.length} task{ganttTasks.length !== 1 ? 's' : ''})
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ background: PRIORITY_COLORS.urgent }} />
            <span className="text-gray-600 dark:text-gray-400">Urgent</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ background: PRIORITY_COLORS.high }} />
            <span className="text-gray-600 dark:text-gray-400">High</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ background: PRIORITY_COLORS.medium }} />
            <span className="text-gray-600 dark:text-gray-400">Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ background: PRIORITY_COLORS.low }} />
            <span className="text-gray-600 dark:text-gray-400">Low</span>
          </div>
        </div>

        {/* Gantt Chart */}
        <div className="h-[300px] overflow-hidden rounded-lg border border-gray-200 dark:border-dark-border">
          <Gantt
            init={handleInit}
            tasks={ganttTasks}
            scales={scales}
            start={start}
            end={end}
            cellWidth={100}
            cellHeight={36}
            readonly={true}
            columns={[
              { id: 'text', header: 'Task', width: 200 },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export default WeeklyTimelineView;
