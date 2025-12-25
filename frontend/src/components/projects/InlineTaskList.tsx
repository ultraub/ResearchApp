import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExclamationTriangleIcon, UserIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { tasksService } from "@/services/tasks";
import { blockersService } from "@/services/blockers";
import { useAuthStore } from "@/stores/auth";
import type { Task } from "@/types";

/** Blocker info for a task */
export interface TaskBlockerInfo {
  isBlocked: boolean;
  maxImpact: "low" | "medium" | "high" | "critical" | null;
  blockerCount: number;
}

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

// Sort tasks: Urgent priority first, then overdue tasks, then by due date, then by status
function sortTasksByUrgency(tasks: Task[]): Task[] {
  const statusOrder: Record<string, number> = {
    in_progress: 0,
    in_review: 1,
    todo: 2,
  };

  const priorityOrder: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...tasks].sort((a, b) => {
    // Urgent priority always first
    const aIsUrgent = a.priority === "urgent";
    const bIsUrgent = b.priority === "urgent";
    if (aIsUrgent && !bIsUrgent) return -1;
    if (!aIsUrgent && bIsUrgent) return 1;

    const aInfo = a.due_date ? getDueDateInfo(a.due_date) : null;
    const bInfo = b.due_date ? getDueDateInfo(b.due_date) : null;

    // Overdue tasks next (most overdue at top)
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

    // Then by priority
    const aPriority = priorityOrder[a.priority] ?? 2;
    const bPriority = priorityOrder[b.priority] ?? 2;
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // Then by status
    return (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
  });
}

interface InlineTaskListProps {
  projectId: string;
  className?: string;
  /** If true, only show tasks assigned to the current user */
  showOnlyMyTasks?: boolean;
  /** Filter tasks to a specific person (user_id) or "unassigned" */
  personFilter?: string;
}

export default function InlineTaskList({
  projectId,
  className = "",
  showOnlyMyTasks = false,
  personFilter,
}: InlineTaskListProps) {
  const { user } = useAuthStore();

  // Fetch tasks grouped by status
  const { data: tasksByStatus, isLoading } = useQuery({
    queryKey: ["tasks", projectId, "by-status"],
    queryFn: () => tasksService.getByStatus(projectId),
  });

  // Fetch blocker info for all tasks in this project
  const { data: taskBlockerInfo } = useQuery({
    queryKey: ["project", projectId, "task-blocker-info"],
    queryFn: () => blockersService.getTaskBlockerInfo(projectId),
  });

  // Combine active tasks (exclude done) and sort by urgency
  let activeTasks: Task[] = [];
  if (tasksByStatus) {
    activeTasks.push(...(tasksByStatus.in_progress || []));
    activeTasks.push(...(tasksByStatus.in_review || []));
    activeTasks.push(...(tasksByStatus.todo || []));
  }

  // Filter by assigned user if requested
  if (showOnlyMyTasks && user?.id) {
    activeTasks = activeTasks.filter(task =>
      task.assignments?.some(assignment => assignment.user_id === user.id)
    );
  }

  // Filter by specific person or unassigned
  if (personFilter) {
    if (personFilter === "unassigned") {
      activeTasks = activeTasks.filter(task =>
        !task.assignments || task.assignments.length === 0
      );
    } else {
      activeTasks = activeTasks.filter(task =>
        task.assignments?.some(assignment => assignment.user_id === personFilter)
      );
    }
  }

  // Sort by urgency (Urgent priority first, then deadline, then status)
  const sortedTasks = sortTasksByUrgency(activeTasks);
  const doneCount = tasksByStatus?.done?.length ?? 0;
  const hasPersonFilter = !!personFilter;
  const allDone = tasksByStatus && activeTasks.length === 0 && doneCount > 0 && !showOnlyMyTasks && !hasPersonFilter;
  const noTasks = tasksByStatus && activeTasks.length === 0 && doneCount === 0 && !showOnlyMyTasks && !hasPersonFilter;
  const noMyTasks = showOnlyMyTasks && activeTasks.length === 0 && !hasPersonFilter;
  const noFilteredTasks = hasPersonFilter && activeTasks.length === 0;

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

  if (noMyTasks) {
    return (
      <div className={`pl-8 py-2 text-sm text-gray-400 dark:text-gray-500 italic ${className}`}>
        No tasks assigned to you
      </div>
    );
  }

  if (noFilteredTasks) {
    return (
      <div className={`pl-8 py-2 text-sm text-gray-400 dark:text-gray-500 italic ${className}`}>
        No matching tasks
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
        {sortedTasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            projectId={projectId}
            blockerInfo={taskBlockerInfo?.[task.id]}
          />
        ))}
      </div>
    </div>
  );
}

interface TaskRowProps {
  task: Task;
  projectId: string;
  blockerInfo?: TaskBlockerInfo;
}

function TaskRow({ task, projectId, blockerInfo }: TaskRowProps) {
  const statusConfig = statusIcons[task.status] || statusIcons.todo;
  const dueDateInfo = task.due_date ? getDueDateInfo(task.due_date) : null;

  // Get assignees names (first 2)
  const assigneeNames = task.assignments?.slice(0, 2).map(a => a.user_name || a.user_email?.split('@')[0] || 'Unknown');
  const moreAssignees = task.assignments && task.assignments.length > 2 ? task.assignments.length - 2 : 0;

  return (
    <Link
      to={`/projects/${projectId}?task=${task.id}`}
      className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-white dark:hover:bg-dark-elevated group transition-colors"
    >
      {/* Status icon */}
      <span className={`text-sm font-medium flex-shrink-0 ${statusConfig.className}`}>
        {statusConfig.icon}
      </span>

      {/* Task title */}
      <span className="text-sm text-gray-700 dark:text-gray-300 truncate group-hover:text-gray-900 dark:group-hover:text-white flex-1 min-w-0">
        {task.title}
      </span>

      {/* Blocker indicator */}
      {blockerInfo?.isBlocked && (
        <span
          className={clsx(
            "flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded flex-shrink-0",
            blockerInfo.maxImpact === "critical"
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              : blockerInfo.maxImpact === "high"
                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
          )}
          title={`${blockerInfo.blockerCount} blocker${blockerInfo.blockerCount !== 1 ? "s" : ""} (${blockerInfo.maxImpact})`}
        >
          <ExclamationTriangleIcon className="h-3 w-3" />
          {blockerInfo.blockerCount}
        </span>
      )}

      {/* Priority tag */}
      <span className={`px-1.5 py-0.5 text-xs rounded flex-shrink-0 ${priorityColors[task.priority] || priorityColors.medium}`}>
        {task.priority}
      </span>

      {/* Due date tag */}
      {dueDateInfo && (
        <span
          className={clsx(
            "px-1.5 py-0.5 text-xs rounded whitespace-nowrap flex-shrink-0",
            dueDateInfo.isOverdue
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              : dueDateInfo.text === "Today"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
          )}
        >
          {dueDateInfo.text}
        </span>
      )}

      {/* Assignees */}
      {assigneeNames && assigneeNames.length > 0 && (
        <span
          className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 flex-shrink-0"
          title={`Assigned to: ${task.assignments?.map(a => a.user_name || a.user_email).join(', ')}`}
        >
          <UserIcon className="h-3 w-3" />
          {assigneeNames.join(', ')}
          {moreAssignees > 0 && ` +${moreAssignees}`}
        </span>
      )}

      {/* Creator info */}
      {task.created_by_name && (
        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 hidden sm:inline">
          by {task.created_by_name.split(' ')[0]}
        </span>
      )}
    </Link>
  );
}
