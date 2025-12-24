/**
 * ProjectGroup - A collapsible group of projects for the Grouped View
 *
 * Features:
 * - Uses CollapsibleSection for expand/collapse
 * - Shows group summary in header (project count, task count)
 * - Renders compact project rows on mobile, full rows on desktop
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { UserGroupIcon, UserIcon, FolderIcon } from "@heroicons/react/24/outline";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import type { Project } from "@/types";
import type { ProjectAttentionInfo } from "./HierarchicalProjectList";

interface ProjectGroupProps {
  /** Group identifier */
  id: string;
  /** Group title (team name, status, etc.) */
  title: string;
  /** Whether this is a personal team */
  isPersonal?: boolean;
  /** Projects in this group */
  projects: Project[];
  /** Attention info map for projects */
  attentionMap: Record<string, ProjectAttentionInfo>;
  /** Whether the group is expanded by default */
  defaultOpen?: boolean;
  /** Storage key for persistence */
  storageKey?: string;
  /** Additional class names */
  className?: string;
}

export function ProjectGroup({
  id,
  title,
  isPersonal = false,
  projects,
  attentionMap,
  defaultOpen = false,
  storageKey,
  className,
}: ProjectGroupProps) {
  const navigate = useNavigate();

  // Calculate group statistics
  const stats = useMemo(() => {
    let totalTasks = 0;
    let hasBlockers = false;

    for (const project of projects) {
      totalTasks += project.task_count || 0;
      const attention = attentionMap[project.id];
      if (attention?.activeBlockerCount > 0) {
        hasBlockers = true;
      }
    }

    return { totalTasks, hasBlockers };
  }, [projects, attentionMap]);

  const Icon = isPersonal ? UserIcon : UserGroupIcon;

  return (
    <CollapsibleSection
      id={id}
      title={title}
      icon={Icon}
      count={projects.length}
      defaultOpen={defaultOpen}
      storageKey={storageKey}
      warning={stats.hasBlockers}
      variant="card"
      className={className}
      headerClassName="min-h-[56px]"
    >
      <div className="divide-y divide-gray-100 dark:divide-dark-border">
        {projects.map((project) => (
          <CompactProjectItem
            key={project.id}
            project={project}
            attentionInfo={attentionMap[project.id]}
            onClick={() => navigate(`/projects/${project.id}`)}
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}

/**
 * CompactProjectItem - Simplified project row for grouped view
 */
interface CompactProjectItemProps {
  project: Project;
  attentionInfo?: ProjectAttentionInfo;
  onClick: () => void;
}

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700 ring-1 ring-green-200 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-800",
  completed: "bg-primary-100 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:ring-primary-800",
  on_hold: "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-800",
  archived: "bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-dark-elevated dark:text-gray-400 dark:ring-gray-600",
};

function CompactProjectItem({
  project,
  attentionInfo,
  onClick,
}: CompactProjectItemProps) {
  const hasBlockers = attentionInfo && attentionInfo.activeBlockerCount > 0;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full flex items-center gap-3 p-3 text-left",
        "transition-all duration-200 hover:bg-gray-50 hover:pl-4 dark:hover:bg-dark-elevated",
        "min-h-[56px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
      )}
    >
      {/* Color indicator */}
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: project.color || "#6366f1" }}
      >
        <FolderIcon className="h-4 w-4 text-white" />
      </div>

      {/* Project info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 dark:text-white truncate">
            {project.name}
          </span>
          {/* Status badge - compact */}
          <span
            className={clsx(
              "flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
              statusColors[project.status] || statusColors.active
            )}
          >
            {project.status}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          <span>{project.task_count || 0} tasks</span>
          {project.target_end_date && (
            <span>
              Due {new Date(project.target_end_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      </div>

      {/* Attention indicators */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {hasBlockers && (
          <span
            className={clsx(
              "flex items-center justify-center h-6 w-6 rounded-full text-xs font-medium",
              attentionInfo.criticalBlockerCount > 0
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
            )}
          >
            {attentionInfo.activeBlockerCount}
          </span>
        )}
        {/* Chevron indicator */}
        <svg
          className="h-4 w-4 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </button>
  );
}

export default ProjectGroup;
