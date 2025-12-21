import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { tasksService } from "@/services/tasks";
import type { Task } from "@/types";

const MAX_VISIBLE_TASKS = 5;

const statusIcons: Record<string, { icon: string; className: string }> = {
  todo: { icon: "○", className: "text-gray-400" },
  in_progress: { icon: "◐", className: "text-blue-500" },
  in_review: { icon: "◎", className: "text-purple-500" },
};

// Priority tag colors
const priorityColors: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  medium: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  low: "bg-gray-50 text-gray-500 dark:bg-dark-card dark:text-gray-500",
};

// Calculate days until/since due date
function getDueDateInfo(dueDate: string): { text: string; isOverdue: boolean; daysOverdue: number } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      text: overdueDays === 1 ? "1d overdue" : `${overdueDays}d overdue`,
      isOverdue: true,
      daysOverdue: overdueDays,
    };
  } else if (diffDays === 0) {
    return { text: "Today", isOverdue: false, daysOverdue: 0 };
  } else if (diffDays === 1) {
    return { text: "Tomorrow", isOverdue: false, daysOverdue: -1 };
  } else if (diffDays <= 7) {
    return { text: `${diffDays}d`, isOverdue: false, daysOverdue: -diffDays };
  } else {
    return {
      text: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      isOverdue: false,
      daysOverdue: -diffDays,
    };
  }
}

// Sort tasks: overdue first (most overdue at top), then by due date, then by status
function sortTasksByUrgency(tasks: Task[]): Task[] {
  const statusOrder: Record<string, number> = {
    in_progress: 0,
    in_review: 1,
    todo: 2,
  };

  return [...tasks].sort((a, b) => {
    const aInfo = a.due_date ? getDueDateInfo(a.due_date) : null;
    const bInfo = b.due_date ? getDueDateInfo(b.due_date) : null;

    // Overdue tasks first
    const aOverdue = aInfo?.isOverdue ? aInfo.daysOverdue : -Infinity;
    const bOverdue = bInfo?.isOverdue ? bInfo.daysOverdue : -Infinity;

    if (aOverdue !== bOverdue) {
      return bOverdue - aOverdue; // Higher overdue days first
    }

    // Then by due date (soonest first)
    if (a.due_date && b.due_date) {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    if (a.due_date) return -1;
    if (b.due_date) return 1;

    // Then by status
    return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
  });
}

interface InlineTaskListProps {
  projectId: string;
  className?: string;
}

export default function InlineTaskList({ projectId, className = "" }: InlineTaskListProps) {
  // Fetch tasks grouped by status
  const { data: tasksByStatus, isLoading } = useQuery({
    queryKey: ["tasks", projectId, "by-status"],
    queryFn: () => tasksService.getByStatus(projectId),
  });

  // Combine active tasks (exclude done) and sort by urgency
  const activeTasks: Task[] = [];
  if (tasksByStatus) {
    activeTasks.push(...(tasksByStatus.in_progress || []));
    activeTasks.push(...(tasksByStatus.in_review || []));
    activeTasks.push(...(tasksByStatus.todo || []));
  }

  // Sort by overdue status, then due date, then status
  const sortedTasks = sortTasksByUrgency(activeTasks);
  const visibleTasks = sortedTasks.slice(0, MAX_VISIBLE_TASKS);
  const remainingCount = activeTasks.length - visibleTasks.length;
  const doneCount = tasksByStatus?.done?.length ?? 0;
  const allDone = tasksByStatus && activeTasks.length === 0 && doneCount > 0;
  const noTasks = tasksByStatus && activeTasks.length === 0 && doneCount === 0;

  if (isLoading) {
    return (
      <div className={`pl-8 py-2 ${className}`}>
        <div className="h-4 w-32 bg-gray-200 dark:bg-dark-elevated rounded animate-pulse" />
      </div>
    );
  }

  if (noTasks) {
    return (
      <div className={`pl-8 py-2 text-sm text-gray-400 dark:text-gray-500 italic ${className}`}>
        No tasks yet
      </div>
    );
  }

  if (allDone) {
    return (
      <div className={`pl-8 py-2 text-sm text-green-600 dark:text-green-400 ${className}`}>
        All tasks completed ({doneCount})
      </div>
    );
  }

  return (
    <div className={`pl-8 py-1 ${className}`}>
      <div className="space-y-1">
        {visibleTasks.map((task) => (
          <TaskRow key={task.id} task={task} projectId={projectId} />
        ))}
      </div>

      {remainingCount > 0 && (
        <Link
          to={`/projects/${projectId}`}
          className="mt-1 inline-block text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          + {remainingCount} more task{remainingCount !== 1 ? "s" : ""}...
        </Link>
      )}
    </div>
  );
}

function TaskRow({ task, projectId }: { task: Task; projectId: string }) {
  const statusConfig = statusIcons[task.status] || statusIcons.todo;
  const dueDateInfo = task.due_date ? getDueDateInfo(task.due_date) : null;

  return (
    <Link
      to={`/projects/${projectId}?task=${task.id}`}
      className="flex items-center gap-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-dark-elevated/50 group transition-colors"
    >
      {/* Status icon */}
      <span className={`text-sm font-medium ${statusConfig.className}`}>
        {statusConfig.icon}
      </span>

      {/* Task title */}
      <span className="text-sm text-gray-700 dark:text-gray-300 truncate group-hover:text-gray-900 dark:group-hover:text-white">
        {task.title}
      </span>

      {/* Priority tag */}
      <span className={`px-1.5 py-0.5 text-xs rounded ${priorityColors[task.priority] || priorityColors.medium}`}>
        {task.priority}
      </span>

      {/* Due date tag */}
      {dueDateInfo && (
        <span
          className={`px-1.5 py-0.5 text-xs rounded whitespace-nowrap ${
            dueDateInfo.isOverdue
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              : dueDateInfo.text === "Today"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
          }`}
        >
          {dueDateInfo.text}
        </span>
      )}
    </Link>
  );
}
