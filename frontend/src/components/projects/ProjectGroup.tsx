/**
 * ProjectGroup - A collapsible group of projects for the Grouped View
 *
 * Features:
 * - Uses CollapsibleSection for expand/collapse
 * - Shows group summary in header (project count, task count)
 * - Renders project cards with clear visual separation
 */

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { UserGroupIcon, UserIcon, FolderIcon, ShareIcon } from "@heroicons/react/24/outline";
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
  /** Whether this is a shared/org-public group */
  isShared?: boolean;
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
  isShared = false,
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

  const Icon = isShared ? ShareIcon : isPersonal ? UserIcon : UserGroupIcon;

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
      <div className="p-3 space-y-2">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            attentionInfo={attentionMap[project.id]}
            showTeamBadge={isShared}
            onClick={() => navigate(`/projects/${project.id}`)}
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}

/**
 * ProjectCard - Individual project card with clear visual boundaries
 */
interface ProjectCardProps {
  project: Project;
  attentionInfo?: ProjectAttentionInfo;
  showTeamBadge?: boolean;
  onClick: () => void;
}

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700 ring-1 ring-green-200 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-800",
  completed: "bg-primary-100 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:ring-primary-800",
  on_hold: "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-800",
  archived: "bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-dark-elevated dark:text-gray-400 dark:ring-gray-600",
};

function ProjectCard({
  project,
  attentionInfo,
  showTeamBadge = false,
  onClick,
}: ProjectCardProps) {
  const hasBlockers = attentionInfo && attentionInfo.activeBlockerCount > 0;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full flex items-center gap-3 p-4 text-left",
        "rounded-lg border border-gray-200 dark:border-dark-border",
        "bg-white dark:bg-dark-card",
        "shadow-sm hover:shadow-md",
        "transition-all duration-200 hover:border-primary-300 dark:hover:border-primary-700",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
      )}
    >
      {/* Color indicator with emoji support */}
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: project.color || "#6366f1" }}
      >
        {project.emoji ? (
          <span className="text-xl">{project.emoji}</span>
        ) : (
          <FolderIcon className="h-5 w-5 text-white" />
        )}
      </div>

      {/* Project info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900 dark:text-white truncate">
            {project.name}
          </span>
          {/* Status badge */}
          <span
            className={clsx(
              "flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
              statusColors[project.status] || statusColors.active
            )}
          >
            {project.status.replace("_", " ")}
          </span>
          {/* Demo badge */}
          {project.is_demo && (
            <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 ring-1 ring-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:ring-purple-800">
              Demo
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-1">
          <span>{project.task_count || 0} tasks</span>
          {project.target_end_date && (
            <span>
              Due {new Date(project.target_end_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
          {/* Team badge for shared projects */}
          {showTeamBadge && project.team_name && (
            <span className="text-gray-400 dark:text-gray-500">
              From: {project.team_name}
            </span>
          )}
        </div>
      </div>

      {/* Attention indicators */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {hasBlockers && (
          <span
            className={clsx(
              "flex items-center justify-center h-7 w-7 rounded-full text-xs font-medium",
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
          className="h-5 w-5 text-gray-400"
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
