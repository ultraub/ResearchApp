import { useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import type { Task, TasksByStatus } from "@/types";
import TaskCard, { type TaskBlockerInfo, type TaskUnreadInfo } from "./TaskCard";

interface KanbanBoardProps {
  tasks: TasksByStatus;
  onTaskClick?: (task: Task) => void;
  onTaskMove?: (taskId: string, newStatus: string, newPosition: number) => void;
  onAddTask?: (status: string) => void;
  /** Map of task ID to blocker info for displaying blocked indicators */
  taskBlockers?: Record<string, TaskBlockerInfo>;
  /** Map of task ID to unread comment info */
  taskUnreadInfo?: Record<string, TaskUnreadInfo>;
  /** Callback for when vote button is clicked on an idea */
  onVote?: (taskId: string) => void;
}

const columns = [
  { id: "idea", label: "Ideas", color: "bg-amber-400", icon: "💡", addLabel: "Add idea" },
  { id: "todo", label: "To Do", color: "bg-gray-400" },
  { id: "in_progress", label: "In Progress", color: "bg-blue-500" },
  { id: "in_review", label: "In Review", color: "bg-purple-500" },
  { id: "done", label: "Done", color: "bg-green-500" },
];

export default function KanbanBoard({
  tasks,
  onTaskClick,
  onTaskMove,
  onAddTask,
  taskBlockers,
  taskUnreadInfo,
  onVote,
}: KanbanBoardProps) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (draggedTask && draggedTask.status !== columnId) {
      const columnTasks = tasks[columnId as keyof TasksByStatus] || [];
      onTaskMove?.(draggedTask.id, columnId, columnTasks.length);
    }
    setDraggedTask(null);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((column) => {
        const columnTasks = tasks[column.id as keyof TasksByStatus] || [];
        const isDropTarget = dragOverColumn === column.id;

        return (
          <div
            key={column.id}
            className={clsx(
              "flex-shrink-0 w-72 rounded-xl bg-gray-100 p-3 shadow-soft dark:bg-dark-elevated",
              isDropTarget && "ring-2 ring-primary-500 ring-opacity-50"
            )}
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            {/* Column header */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={clsx("h-2 w-2 rounded-full", column.color)} />
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {column.label}
                </h3>
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  {columnTasks.length}
                </span>
              </div>
              <button
                onClick={() => onAddTask?.(column.id)}
                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Tasks */}
            <div className="space-y-2">
              {columnTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task)}
                  onDragEnd={handleDragEnd}
                >
                  <TaskCard
                    task={task}
                    onClick={() => onTaskClick?.(task)}
                    isDragging={draggedTask?.id === task.id}
                    blockerInfo={taskBlockers?.[task.id]}
                    unreadInfo={taskUnreadInfo?.[task.id]}
                    onVote={onVote}
                  />
                </div>
              ))}

              {/* Empty state */}
              {columnTasks.length === 0 && (
                <div className="rounded-lg border-2 border-dashed border-gray-300 p-4 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                  No tasks
                </div>
              )}

              {/* Add task button at bottom */}
              <button
                onClick={() => onAddTask?.(column.id)}
                className="flex w-full items-center gap-2 rounded-lg p-2 text-sm text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <PlusIcon className="h-4 w-4" />
                {column.addLabel || "Add task"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
