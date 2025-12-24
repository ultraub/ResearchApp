/**
 * HierarchicalProjectRow - A project row with inline tasks and nested children
 */

import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  ExclamationTriangleIcon,
  ChatBubbleLeftIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { projectsService } from "@/services/projects";
import InlineTaskList from "./InlineTaskList";
import { ReviewStatusBadge } from "@/components/common/ReviewStatusBadge";
import { TeamBadge } from "./TeamBadge";
import type { Project } from "@/types";
import type { ProjectAttentionInfo } from "./HierarchicalProjectList";

const priorityColors: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 ring-1 ring-red-200 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-800",
  high: "bg-orange-100 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:ring-orange-800",
  medium: "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-800",
  low: "bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:ring-gray-600",
};

interface HierarchicalProjectRowProps {
  project: Project;
  depth?: number;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  /** Attention info for this specific project */
  attentionInfo?: ProjectAttentionInfo;
  /** Map of all project attention info (for passing to children) */
  attentionMap?: Record<string, ProjectAttentionInfo>;
  /** If true, only show tasks assigned to the current user */
  showOnlyMyTasks?: boolean;
  /** Filter tasks to a specific person (user_id) or "unassigned" */
  personFilter?: string;
}

export default function HierarchicalProjectRow({
  project,
  depth = 0,
  expandedIds,
  onToggleExpand,
  attentionInfo,
  attentionMap = {},
  showOnlyMyTasks = false,
  personFilter,
}: HierarchicalProjectRowProps) {
  const navigate = useNavigate();
  const isExpanded = expandedIds.has(project.id);
  const hasChildren = project.has_children ?? false;

  // Fetch children only when expanded
  const { data: children, isLoading: childrenLoading } = useQuery({
    queryKey: ["project", project.id, "children"],
    queryFn: () => projectsService.getChildren(project.id),
    enabled: isExpanded && hasChildren,
  });

  // Fetch review summary
  const { data: reviewSummary } = useQuery({
    queryKey: ["project", project.id, "review-summary"],
    queryFn: () => projectsService.getReviewSummary(project.id),
    staleTime: 30000, // Cache for 30 seconds
  });

  // Calculate active task count
  const activeTaskCount = (project.task_count || 0) - (project.completed_task_count || 0);

  return (
    <div className="border-b border-gray-100 dark:border-dark-border/50 last:border-b-0">
      {/* Project Header Row */}
      <div
        className={clsx(
          "flex items-center gap-3 py-3 pr-4 cursor-pointer transition-all duration-200",
          "hover:bg-gray-50 hover:pl-1 dark:hover:bg-dark-elevated"
        )}
        style={{ paddingLeft: `${depth * 24 + 16}px` }}
        onClick={() => navigate(`/projects/${project.id}`)}
      >
        {/* Expand/collapse button for children */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) {
              onToggleExpand(project.id);
            }
          }}
          className={clsx(
            "flex h-6 w-6 items-center justify-center rounded transition-colors flex-shrink-0",
            hasChildren
              ? "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              : "text-transparent"
          )}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ChevronRightIcon className="h-4 w-4" />
            )
          ) : (
            <span className="w-4" />
          )}
        </button>

        {/* Project icon with color */}
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: project.color || "#6366f1" }}
        >
          <FolderIcon className="h-4 w-4 text-white" />
        </div>

        {/* Project info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-white">
              {project.name}
            </span>
            {hasChildren && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({project.children_count} sub)
              </span>
            )}
            {/* Team badge */}
            <TeamBadge
              teamName={project.team_name}
              isPersonal={project.team_is_personal}
            />
            {/* Inline tags */}
            {project.priority && project.priority !== "medium" && (
              <span
                className={clsx(
                  "px-1.5 py-0.5 text-xs rounded",
                  priorityColors[project.priority]
                )}
              >
                {project.priority}
              </span>
            )}
            {activeTaskCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                {activeTaskCount} task{activeTaskCount !== 1 ? "s" : ""}
              </span>
            )}
            {/* Blocker indicator */}
            {attentionInfo && attentionInfo.activeBlockerCount > 0 && (
              <span
                className={clsx(
                  "flex items-center gap-1 px-1.5 py-0.5 text-xs rounded",
                  attentionInfo.criticalBlockerCount > 0
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                )}
                title={`${attentionInfo.activeBlockerCount} blocker${attentionInfo.activeBlockerCount !== 1 ? "s" : ""}`}
              >
                <ExclamationTriangleIcon className="h-3 w-3" />
                {attentionInfo.activeBlockerCount}
              </span>
            )}
            {/* Comment indicator */}
            {attentionInfo && attentionInfo.unreadCommentCount > 0 && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
                title={`${attentionInfo.unreadCommentCount} unread comment${attentionInfo.unreadCommentCount !== 1 ? "s" : ""}`}
              >
                <ChatBubbleLeftIcon className="h-3 w-3" />
                {attentionInfo.unreadCommentCount}
              </span>
            )}
            {/* Review status badge */}
            {reviewSummary && reviewSummary.overall_status !== "none" && (
              <ReviewStatusBadge
                summary={{
                  status: reviewSummary.overall_status,
                  pending_count: reviewSummary.pending_reviews,
                  ai_suggestion_count: reviewSummary.ai_suggestion_count,
                  approved_count: reviewSummary.approved_reviews,
                  rejected_count: reviewSummary.rejected_reviews,
                  total_count: reviewSummary.total_reviews,
                }}
                size="sm"
              />
            )}
            {project.target_end_date && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                {new Date(project.target_end_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
          {project.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {project.description}
            </p>
          )}
        </div>
      </div>

      {/* Inline Tasks - always rendered, component handles empty states */}
      <div
        className="pb-2 border-l-2 border-gray-200 dark:border-dark-border ml-4"
        style={{ marginLeft: `${depth * 24 + 28}px` }}
      >
        <InlineTaskList
          projectId={project.id}
          showOnlyMyTasks={showOnlyMyTasks}
          personFilter={personFilter}
        />
      </div>

      {/* Child Projects (when expanded) */}
      {isExpanded && hasChildren && (
        <div className="relative">
          {/* Vertical connector line */}
          <div
            className="absolute top-0 bottom-4 w-px bg-gray-200 dark:bg-dark-border"
            style={{ left: `${depth * 24 + 28}px` }}
          />

          {childrenLoading ? (
            <div
              className="py-3 text-sm text-gray-400"
              style={{ paddingLeft: `${(depth + 1) * 24 + 16}px` }}
            >
              Loading...
            </div>
          ) : (
            children?.map((child, index) => (
              <div key={child.id} className="relative">
                {/* Horizontal connector line */}
                <div
                  className="absolute w-4 h-px bg-gray-200 dark:bg-dark-border"
                  style={{
                    left: `${depth * 24 + 28}px`,
                    top: "24px",
                  }}
                />
                {/* Last item gets an L-shaped connector */}
                {index === (children?.length || 0) - 1 && (
                  <div
                    className="absolute w-px bg-white dark:bg-dark-card"
                    style={{
                      left: `${depth * 24 + 28}px`,
                      top: "24px",
                      bottom: 0,
                    }}
                  />
                )}
                <HierarchicalProjectRow
                  project={child}
                  depth={depth + 1}
                  expandedIds={expandedIds}
                  onToggleExpand={onToggleExpand}
                  attentionInfo={attentionMap[child.id]}
                  attentionMap={attentionMap}
                  showOnlyMyTasks={showOnlyMyTasks}
                  personFilter={personFilter}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
