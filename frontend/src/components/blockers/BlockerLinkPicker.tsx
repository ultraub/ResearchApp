/**
 * BlockerLinkPicker - Unified view for selecting tasks/projects to link to a blocker
 * Shows all available items in grouped sections with search filtering and hover details
 */

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MagnifyingGlassIcon,
  PlusIcon,
  DocumentIcon,
  FolderIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { tasksService } from "@/services/tasks";
import { projectsService } from "@/services/projects";
import type { BlockerLink, Task, Project } from "@/types";

interface BlockerLinkPickerProps {
  projectId: string;
  existingLinks: BlockerLink[];
  onSelect: (entityType: "task" | "project", entityId: string) => void;
  disabled?: boolean;
}

type EntityItem = {
  id: string;
  type: "task" | "project";
  title: string;
  status?: string;
  description?: string | null;
  priority?: string;
  dueDate?: string | null;
  taskCount?: number;
  projectName?: string; // For tasks in subprojects
  category: "current-project" | "subproject" | "current-task" | "subproject-task";
};

const statusColors: Record<string, string> = {
  todo: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_review: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  done: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  on_hold: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

const priorityColors: Record<string, string> = {
  low: "text-gray-500",
  medium: "text-yellow-500",
  high: "text-orange-500",
  urgent: "text-red-500",
};

function HoverTooltip({ item, visible }: { item: EntityItem; visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="absolute left-full top-0 z-50 ml-2 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-dark-card">
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          {item.type === "task" ? (
            <DocumentIcon className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
          ) : (
            <FolderIcon className="h-4 w-4 text-purple-500 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {item.title}
            </p>
            {item.projectName && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                in {item.projectName}
              </p>
            )}
          </div>
        </div>

        {item.description && (
          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">
            {item.description}
          </p>
        )}

        <div className="flex flex-wrap gap-2 text-xs">
          {item.status && (
            <span className={clsx("rounded-full px-2 py-0.5 font-medium", statusColors[item.status])}>
              {item.status.replace("_", " ")}
            </span>
          )}
          {item.priority && (
            <span className={clsx("font-medium", priorityColors[item.priority])}>
              {item.priority} priority
            </span>
          )}
        </div>

        <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
          {item.dueDate && (
            <span className="flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              {new Date(item.dueDate).toLocaleDateString()}
            </span>
          )}
          {item.type === "project" && item.taskCount !== undefined && (
            <span>{item.taskCount} tasks</span>
          )}
        </div>
      </div>
    </div>
  );
}

function EntityListItem({
  item,
  onSelect,
  disabled,
}: {
  item: EntityItem;
  onSelect: () => void;
  disabled: boolean;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => setShowTooltip(true), 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowTooltip(false);
  };

  return (
    <div
      className="relative group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={clsx(
          "flex items-center justify-between py-2 px-3 transition-colors",
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
        )}
        onClick={() => !disabled && onSelect()}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {item.type === "task" ? (
            <DocumentIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
          ) : (
            <FolderIcon className="h-4 w-4 text-purple-500 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900 dark:text-white truncate">
              {item.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {item.status && (
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-0.5 text-xs font-medium",
                    statusColors[item.status]
                  )}
                >
                  {item.status.replace("_", " ")}
                </span>
              )}
              {item.priority && (
                <span className={clsx("text-xs", priorityColors[item.priority])}>
                  {item.priority}
                </span>
              )}
              {item.projectName && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  in {item.projectName}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          className={clsx(
            "p-1.5 rounded-md transition-colors flex-shrink-0",
            disabled
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-primary-100 dark:hover:bg-primary-900/30 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onSelect();
          }}
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
      <HoverTooltip item={item} visible={showTooltip} />
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  items,
  onSelect,
  disabled,
  defaultExpanded = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: EntityItem[];
  onSelect: (item: EntityItem) => void;
  disabled: boolean;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (items.length === 0) return null;

  return (
    <div className="border-b border-gray-100 dark:border-gray-700/50 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-3 py-2 bg-gray-50 dark:bg-dark-card/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5 text-gray-400" />
          )}
          <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            {title}
          </span>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {items.length}
        </span>
      </button>
      {isExpanded && (
        <div className="divide-y divide-gray-50 dark:divide-gray-700/30">
          {items.map((item) => (
            <EntityListItem
              key={item.id}
              item={item}
              onSelect={() => onSelect(item)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function BlockerLinkPicker({
  projectId,
  existingLinks,
  onSelect,
  disabled = false,
}: BlockerLinkPickerProps) {
  const [query, setQuery] = useState("");

  // Get existing linked IDs for filtering (with defensive check)
  const safeExistingLinks = existingLinks || [];
  const existingTaskIds = new Set(
    safeExistingLinks
      .filter((l) => l.blocked_entity_type === "task")
      .map((l) => l.blocked_entity_id)
  );
  const existingProjectIds = new Set(
    safeExistingLinks
      .filter((l) => l.blocked_entity_type === "project")
      .map((l) => l.blocked_entity_id)
  );

  // Fetch current project info
  const { data: currentProject, isLoading: projectLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsService.get(projectId),
    enabled: !!projectId,
  });

  // Fetch tasks for the current project using getByStatus (same as ProjectDetailPage)
  const { data: currentProjectTasksByStatus, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", projectId, "by-status-for-blocker-picker"],
    queryFn: () => tasksService.getByStatus(projectId),
    enabled: !!projectId,
  });

  // Flatten tasks from all status columns (with defensive checks)
  const currentProjectTasks = currentProjectTasksByStatus
    ? [
        ...(currentProjectTasksByStatus.todo || []),
        ...(currentProjectTasksByStatus.in_progress || []),
        ...(currentProjectTasksByStatus.in_review || []),
        ...(currentProjectTasksByStatus.done || []),
      ]
    : [];

  // Fetch subprojects
  const { data: subprojects, isLoading: subprojectsLoading } = useQuery({
    queryKey: ["project", projectId, "children"],
    queryFn: () => projectsService.getChildren(projectId),
    enabled: !!projectId,
  });

  // Fetch tasks from all subprojects using getByStatus
  const { data: subprojectTasks, isLoading: subprojectTasksLoading } = useQuery({
    queryKey: ["tasks", projectId, "subproject-tasks-for-blocker"],
    queryFn: async () => {
      if (!subprojects || subprojects.length === 0) return [];

      const taskPromises = subprojects.map((sp: Project) =>
        tasksService.getByStatus(sp.id)
      );
      const results = await Promise.all(taskPromises);

      // Flatten and combine all tasks with their parent project name
      return results.flatMap((tasksByStatus, idx) => {
        // Defensive: ensure tasksByStatus and its properties exist
        if (!tasksByStatus) return [];
        const allTasks = [
          ...(tasksByStatus.todo || []),
          ...(tasksByStatus.in_progress || []),
          ...(tasksByStatus.in_review || []),
          ...(tasksByStatus.done || []),
        ];
        return allTasks.map((task: Task) => ({
          ...task,
          projectName: subprojects[idx].name,
        }));
      });
    },
    enabled: !!subprojects && subprojects.length > 0,
  });

  // Helper to check if item matches filter
  const matchesFilter = (title: string, description?: string | null) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      title.toLowerCase().includes(q) ||
      (typeof description === "string" && description.toLowerCase().includes(q))
    );
  };

  // Build grouped items
  const currentProjectItem: EntityItem | null =
    currentProject && !existingProjectIds.has(projectId) && matchesFilter(currentProject.name, currentProject.description)
      ? {
          id: projectId,
          type: "project",
          title: currentProject.name,
          status: currentProject.status,
          description: currentProject.description,
          taskCount: currentProject.task_count,
          category: "current-project",
        }
      : null;

  const subprojectItems: EntityItem[] = (subprojects || [])
    .filter((p: Project) => !existingProjectIds.has(p.id))
    .filter((p: Project) => matchesFilter(p.name, p.description))
    .map((p: Project) => ({
      id: p.id,
      type: "project" as const,
      title: p.name,
      status: p.status,
      description: p.description,
      taskCount: p.task_count,
      category: "subproject" as const,
    }));

  const currentTaskItems: EntityItem[] = currentProjectTasks
    .filter((t: Task) => !existingTaskIds.has(t.id))
    .filter((t: Task) => matchesFilter(t.title, typeof t.description === "string" ? t.description : null))
    .map((t: Task) => ({
      id: t.id,
      type: "task" as const,
      title: t.title,
      status: t.status,
      description: typeof t.description === "string" ? t.description : null,
      priority: t.priority,
      dueDate: t.due_date,
      category: "current-task" as const,
    }));

  const subprojectTaskItems: EntityItem[] = (subprojectTasks || [])
    .filter((t: Task & { projectName?: string }) => !existingTaskIds.has(t.id))
    .filter((t: Task) => matchesFilter(t.title, typeof t.description === "string" ? t.description : null))
    .map((t: Task & { projectName?: string }) => ({
      id: t.id,
      type: "task" as const,
      title: t.title,
      status: t.status,
      description: typeof t.description === "string" ? t.description : null,
      priority: t.priority,
      dueDate: t.due_date,
      projectName: t.projectName,
      category: "subproject-task" as const,
    }));

  const handleSelect = (item: EntityItem) => {
    onSelect(item.type, item.id);
  };

  const isLoading = projectLoading || tasksLoading || subprojectsLoading || subprojectTasksLoading;

  const totalItems =
    (currentProjectItem ? 1 : 0) +
    subprojectItems.length +
    currentTaskItems.length +
    subprojectTaskItems.length;

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-dark-card dark:text-white dark:placeholder-gray-400"
          placeholder="Filter items..."
          disabled={disabled}
        />
      </div>

      {/* Items list */}
      <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600" />
          </div>
        ) : totalItems === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {query
              ? `No items found matching "${query}"`
              : "No items available to link"}
          </div>
        ) : (
          <div>
            {/* Current Project Section */}
            {currentProjectItem && (
              <Section
                title="This Project"
                icon={FolderIcon}
                items={[currentProjectItem]}
                onSelect={handleSelect}
                disabled={disabled}
              />
            )}

            {/* Subprojects Section */}
            <Section
              title="Subprojects"
              icon={FolderIcon}
              items={subprojectItems}
              onSelect={handleSelect}
              disabled={disabled}
            />

            {/* Current Project Tasks Section */}
            <Section
              title="Tasks in this project"
              icon={DocumentIcon}
              items={currentTaskItems}
              onSelect={handleSelect}
              disabled={disabled}
            />

            {/* Subproject Tasks Section */}
            <Section
              title="Tasks in subprojects"
              icon={DocumentIcon}
              items={subprojectTaskItems}
              onSelect={handleSelect}
              disabled={disabled}
            />
          </div>
        )}
      </div>

      {/* Count indicator */}
      {!isLoading && totalItems > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
          {totalItems} item{totalItems !== 1 ? "s" : ""} available
          {query && ` matching "${query}"`}
        </p>
      )}
    </div>
  );
}

export default BlockerLinkPicker;
