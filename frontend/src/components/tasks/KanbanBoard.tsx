import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  const [visibleColumns, setVisibleColumns] = useState<string[]>(columns.map(c => c.id));

  const boardRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Use ref to track visible columns to avoid recreating observer on state changes
  const visibleColumnsRef = useRef<Set<string>>(new Set(columns.map(c => c.id)));
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Memoize column IDs to use as stable dependency
  const columnIds = useMemo(() => columns.map(c => c.id), []);

  // Track which columns are visible using IntersectionObserver
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    // Clean up existing observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;

        entries.forEach((entry) => {
          const columnId = entry.target.getAttribute('data-column-id');
          if (columnId) {
            const wasVisible = visibleColumnsRef.current.has(columnId);
            if (entry.isIntersecting && !wasVisible) {
              visibleColumnsRef.current.add(columnId);
              changed = true;
            } else if (!entry.isIntersecting && wasVisible) {
              visibleColumnsRef.current.delete(columnId);
              changed = true;
            }
          }
        });

        if (changed) {
          setVisibleColumns(Array.from(visibleColumnsRef.current));
        }
      },
      { root: board, threshold: 0.5 }
    );

    observerRef.current = observer;

    // Observe all column elements
    columnRefs.current.forEach((el) => {
      observer.observe(el);
    });

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [columnIds]); // Only recreate when columns change, not on visibleColumns change

  // Set up column ref
  const setColumnRef = useCallback((columnId: string, el: HTMLDivElement | null) => {
    if (el) {
      columnRefs.current.set(columnId, el);
    } else {
      columnRefs.current.delete(columnId);
    }
  }, []);

  // Scroll to a specific column (horizontal only, preserves vertical position)
  const scrollToColumn = useCallback((columnId: string) => {
    const columnEl = columnRefs.current.get(columnId);
    const board = boardRef.current;
    if (columnEl && board) {
      // Instant scroll to exact position, then let scroll-snap + scroll-smooth
      // handle the final snap animation. This is more reliable than trying
      // to time when a smooth scroll animation completes.
      board.style.scrollBehavior = 'auto';
      board.scrollLeft = columnEl.offsetLeft;
      // Restore smooth behavior for future scrolls
      board.style.scrollBehavior = '';
    }
  }, []);

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    setDraggedTask(task);
    // Disable scroll snap during drag for smoother movement
    if (boardRef.current) {
      boardRef.current.style.scrollSnapType = 'none';
    }
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
    // Re-enable scroll snap after drag
    if (boardRef.current) {
      boardRef.current.style.scrollSnapType = 'x mandatory';
    }
  };

  return (
    <div className="space-y-3">
      {/* Navigation Pills - Hidden on mobile */}
      <nav
        className="hidden md:flex gap-2 overflow-x-auto pb-2"
        aria-label="Board columns"
      >
        {columns.map((column) => {
          const columnTasks = tasks[column.id as keyof TasksByStatus] || [];
          const isVisible = visibleColumns.includes(column.id);

          return (
            <button
              key={column.id}
              onClick={() => scrollToColumn(column.id)}
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap",
                isVisible
                  ? "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              )}
              aria-current={isVisible ? "true" : undefined}
            >
              <span className={clsx("w-2 h-2 rounded-full flex-shrink-0", column.color)} />
              <span>{column.label}</span>
              <span className={clsx(
                "text-xs px-1.5 py-0.5 rounded-full",
                isVisible
                  ? "bg-primary-200/50 dark:bg-primary-800/50"
                  : "bg-gray-200 dark:bg-gray-700"
              )}>
                {columnTasks.length}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Kanban Board */}
      <div
        ref={boardRef}
        className="flex gap-4 overflow-x-auto pb-4 scroll-smooth"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {columns.map((column) => {
          const columnTasks = tasks[column.id as keyof TasksByStatus] || [];
          const isDropTarget = dragOverColumn === column.id;

          return (
            <div
              key={column.id}
              ref={(el) => setColumnRef(column.id, el)}
              data-column-id={column.id}
              className={clsx(
                "flex-shrink-0 w-72 rounded-xl bg-gray-100 p-3 shadow-soft dark:bg-dark-elevated",
                isDropTarget && "ring-2 ring-primary-500 ring-opacity-50"
              )}
              style={{ scrollSnapAlign: 'start' }}
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
    </div>
  );
}
