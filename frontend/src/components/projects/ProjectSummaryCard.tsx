/**
 * ProjectSummaryCard - Consolidated project metadata display
 *
 * Shows: owner/team, dates, description, status in one glanceable card
 */

import { clsx } from "clsx";
import { formatDistanceToNow, format, isPast, isToday } from "date-fns";
import {
  CalendarIcon,
  UserIcon,
  UserGroupIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import OwnerDisplay from "@/components/common/OwnerDisplay";
import type { Project } from "@/types";

interface ProjectSummaryCardProps {
  project: Project;
  className?: string;
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  active: {
    bg: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-700 dark:text-green-400",
    label: "Active",
  },
  completed: {
    bg: "bg-primary-100 dark:bg-primary-900/30",
    text: "text-primary-700 dark:text-primary-400",
    label: "Completed",
  },
  on_hold: {
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    text: "text-yellow-700 dark:text-yellow-400",
    label: "On Hold",
  },
  archived: {
    bg: "bg-gray-100 dark:bg-gray-700",
    text: "text-gray-600 dark:text-gray-400",
    label: "Archived",
  },
};

export function ProjectSummaryCard({ project, className }: ProjectSummaryCardProps) {
  const status = statusConfig[project.status] || statusConfig.active;
  const hasTargetDate = !!project.target_end_date;
  const isOverdue = hasTargetDate && isPast(new Date(project.target_end_date!)) && project.status !== "completed";
  const isDueToday = hasTargetDate && isToday(new Date(project.target_end_date!));

  return (
    <div className={clsx(
      "rounded-xl bg-white p-4 shadow-soft dark:bg-dark-card",
      className
    )}>
      {/* Status and Team Row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className={clsx(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            status.bg,
            status.text
          )}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {status.label}
          </span>

          {project.parent_id && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
              <FolderIcon className="h-3 w-3" />
              Subproject
            </span>
          )}
        </div>

        {/* Team badge */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          {project.team_is_personal ? (
            <>
              <UserIcon className="h-3.5 w-3.5" />
              <span>Personal</span>
            </>
          ) : project.team_name ? (
            <>
              <UserGroupIcon className="h-3.5 w-3.5" />
              <span>{project.team_name}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
          {project.description}
        </p>
      )}

      {/* Dates Row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {/* Start Date */}
        {project.start_date && (
          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>Started {format(new Date(project.start_date), "MMM d, yyyy")}</span>
          </div>
        )}

        {/* Target End Date */}
        {hasTargetDate && (
          <div className={clsx(
            "flex items-center gap-1.5",
            isOverdue
              ? "text-red-600 dark:text-red-400 font-medium"
              : isDueToday
              ? "text-orange-600 dark:text-orange-400 font-medium"
              : "text-gray-500 dark:text-gray-400"
          )}>
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>
              {isOverdue
                ? `Overdue by ${formatDistanceToNow(new Date(project.target_end_date!))}`
                : isDueToday
                ? "Due today"
                : `Due ${format(new Date(project.target_end_date!), "MMM d, yyyy")}`}
            </span>
          </div>
        )}

        {/* Creator */}
        {project.created_by_name && (
          <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
            <span>by</span>
            <OwnerDisplay
              name={project.created_by_name}
              email={project.created_by_email}
              id={project.created_by_id}
              size="xs"
            />
          </div>
        )}

        {/* Last updated */}
        <div className="text-gray-400 dark:text-gray-500">
          Updated {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
        </div>
      </div>
    </div>
  );
}

export default ProjectSummaryCard;
