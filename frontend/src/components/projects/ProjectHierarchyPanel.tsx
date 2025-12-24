/**
 * Project Hierarchy Panel - Collapsible tree view of child projects
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import type { Project } from "@/types";

interface SubprojectBlockerInfo {
  isBlocked: boolean;
  blockerCount: number;
  maxImpact: string | null;
}

interface ProjectHierarchyPanelProps {
  children: Project[];
  currentProjectId: string;
  onAddSubproject?: () => void;
  subprojectBlockers?: Record<string, SubprojectBlockerInfo>;
  className?: string;
}

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  on_hold: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

export default function ProjectHierarchyPanel({
  children,
  currentProjectId: _currentProjectId,
  onAddSubproject,
  subprojectBlockers,
  className = "",
}: ProjectHierarchyPanelProps) {
  // currentProjectId available for future use (currently used for prop interface)
  void _currentProjectId;
  const [isExpanded, setIsExpanded] = useState(true);

  if (!children || children.length === 0) {
    // Show minimal panel with add button when no children
    if (onAddSubproject) {
      return (
        <div
          className={clsx(
            "rounded-xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-card",
            className
          )}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <FolderIcon className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Subprojects
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                0
              </span>
            </div>
            <button
              onClick={onAddSubproject}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/30 transition-colors"
            >
              <FolderPlusIcon className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div
      className={clsx(
        "rounded-xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-card",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-gray-500" />
          )}
          <FolderIcon className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Subprojects
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            {children.length}
          </span>
        </button>
        {onAddSubproject && (
          <button
            onClick={onAddSubproject}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/30 transition-colors"
          >
            <FolderPlusIcon className="h-3.5 w-3.5" />
            Add
          </button>
        )}
      </div>

      {/* Children list */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-dark-border">
          <div className="divide-y divide-gray-100 dark:divide-dark-border/50">
            {children.map((child) => {
              const blockerInfo = subprojectBlockers?.[child.id];
              return (
                <Link
                  key={child.id}
                  to={`/projects/${child.id}`}
                  className={clsx(
                    "flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-elevated/50 transition-colors",
                    blockerInfo?.isBlocked && "bg-yellow-50/50 dark:bg-yellow-900/10"
                  )}
                >
                  <div className="relative">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ backgroundColor: child.color || "#6366F1" }}
                    >
                      {child.emoji ? (
                        <span className="text-base">{child.emoji}</span>
                      ) : (
                        <FolderIcon className="h-4 w-4 text-white" />
                      )}
                    </div>
                    {blockerInfo?.isBlocked && (
                      <div
                        className={clsx(
                          "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full",
                          blockerInfo.maxImpact === "critical" || blockerInfo.maxImpact === "high"
                            ? "bg-red-500"
                            : "bg-yellow-400"
                        )}
                        title={`Blocked by ${blockerInfo.blockerCount} blocker${blockerInfo.blockerCount !== 1 ? "s" : ""}`}
                      >
                        <ExclamationTriangleIcon className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {child.name}
                      </span>
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          statusColors[child.status]
                        )}
                      >
                        {child.status}
                      </span>
                      {blockerInfo?.isBlocked && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                          <ExclamationTriangleIcon className="h-3 w-3" />
                          Blocked
                        </span>
                      )}
                    </div>
                    {child.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {child.description}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {child.task_count !== undefined && (
                      <span>{child.task_count} tasks</span>
                    )}
                  </div>
                  <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
