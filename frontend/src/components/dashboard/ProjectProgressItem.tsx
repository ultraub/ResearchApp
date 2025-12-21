/**
 * ProjectProgressItem - Individual project row with progress bar and indicators
 *
 * Shows project progress with blocker and comment indicators that have hover cards.
 * Color-coded badges by severity for blockers and unread count for comments.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import {
  ExclamationTriangleIcon,
  ChatBubbleLeftIcon,
} from "@heroicons/react/24/solid";
import type { ProjectProgress, BlockerSummaryItem, CommentSummaryItem } from "@/services/analytics";
import { analyticsApi } from "@/services/analytics";
import { HoverCard, HoverCardHeader, HoverCardContent, HoverCardFooter } from "@/components/common/HoverCard";

interface ProjectProgressItemProps {
  project: ProjectProgress;
  /** Whether to show indicators for blockers and comments */
  showIndicators?: boolean;
}

// Impact level to color mapping
const IMPACT_COLORS = {
  critical: "bg-red-500 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-blue-500 text-white",
  low: "bg-gray-400 text-white",
} as const;

const IMPACT_DOT_COLORS = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-blue-500",
  low: "bg-gray-400",
} as const;

const IMPACT_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

const STATUS_LABELS = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  wont_fix: "Won't Fix",
} as const;

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 1000 / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function BlockerIndicator({
  projectId,
  count,
  criticalCount,
  maxImpact,
}: {
  projectId: string;
  count: number;
  criticalCount: number;
  maxImpact: string | null;
}) {
  // Use lazy loading for hover details
  const [shouldFetch, setShouldFetch] = useState(false);
  const { data: details } = useQuery({
    queryKey: ["project-attention", projectId],
    queryFn: () => analyticsApi.getProjectAttentionDetails(projectId),
    enabled: shouldFetch,
    staleTime: 30000,
  });

  const impactKey = (maxImpact || "medium") as keyof typeof IMPACT_COLORS;
  const badgeColor = IMPACT_COLORS[impactKey] || IMPACT_COLORS.medium;

  const trigger = (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium cursor-default",
        badgeColor
      )}
    >
      <ExclamationTriangleIcon className="h-3 w-3" />
      {count}
    </span>
  );

  return (
    <HoverCard
      trigger={trigger}
      placement="bottom"
      maxWidth={340}
      triggerClassName="inline-flex"
    >
      <div onMouseEnter={() => setShouldFetch(true)}>
        <HoverCardHeader className="flex items-center gap-2">
          <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
          <span>
            Active Blockers ({count})
            {criticalCount > 0 && (
              <span className="text-red-600 dark:text-red-400"> • {criticalCount} critical</span>
            )}
          </span>
        </HoverCardHeader>

        <HoverCardContent className="space-y-2 py-2">
          {details?.blockers && details.blockers.length > 0 ? (
            details.blockers.map((blocker: BlockerSummaryItem) => (
              <div key={blocker.id} className="flex items-start gap-2 text-sm">
                <span
                  className={clsx(
                    "flex-shrink-0 w-2 h-2 rounded-full mt-1.5",
                    IMPACT_DOT_COLORS[blocker.impact_level as keyof typeof IMPACT_DOT_COLORS] || "bg-gray-400"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {blocker.title}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className={clsx(
                      blocker.impact_level === "critical" && "text-red-600 dark:text-red-400",
                      blocker.impact_level === "high" && "text-orange-600 dark:text-orange-400"
                    )}>
                      {IMPACT_LABELS[blocker.impact_level as keyof typeof IMPACT_LABELS] || blocker.impact_level}
                    </span>
                    <span>•</span>
                    <span>{STATUS_LABELS[blocker.status as keyof typeof STATUS_LABELS] || blocker.status}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
          )}
        </HoverCardContent>

        <HoverCardFooter>
          <Link
            to={`/projects/${projectId}?tab=blockers`}
            className="flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-xs"
          >
            View all blockers
          </Link>
        </HoverCardFooter>
      </div>
    </HoverCard>
  );
}

function CommentIndicator({
  projectId,
  totalCount,
  unreadCount,
}: {
  projectId: string;
  totalCount: number;
  unreadCount: number;
}) {
  // Use lazy loading for hover details
  const [shouldFetch, setShouldFetch] = useState(false);
  const { data: details } = useQuery({
    queryKey: ["project-attention", projectId],
    queryFn: () => analyticsApi.getProjectAttentionDetails(projectId),
    enabled: shouldFetch,
    staleTime: 30000,
  });

  const hasUnread = unreadCount > 0;

  const trigger = (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium cursor-default",
        hasUnread
          ? "bg-primary-500 text-white"
          : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
      )}
    >
      <ChatBubbleLeftIcon className="h-3 w-3" />
      {hasUnread ? unreadCount : totalCount}
    </span>
  );

  return (
    <HoverCard
      trigger={trigger}
      placement="bottom"
      maxWidth={340}
      triggerClassName="inline-flex"
    >
      <div onMouseEnter={() => setShouldFetch(true)}>
        <HoverCardHeader className="flex items-center gap-2">
          <ChatBubbleLeftIcon className="h-4 w-4 text-primary-500" />
          <span>
            Comments ({totalCount})
            {hasUnread && <span className="text-primary-600 dark:text-primary-400"> • {unreadCount} unread</span>}
          </span>
        </HoverCardHeader>

        <HoverCardContent className="space-y-3 py-2">
          {details?.recent_comments && details.recent_comments.length > 0 ? (
            details.recent_comments.map((comment: CommentSummaryItem) => (
              <div key={comment.id} className="text-sm">
                {comment.task_title && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate mb-0.5">
                    on "{comment.task_title}"
                  </div>
                )}
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {comment.author_name || "Unknown"}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500">•</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {formatRelativeTime(comment.created_at)}
                  </span>
                </div>
                <div className="text-gray-600 dark:text-gray-300 line-clamp-2">
                  "{comment.content.slice(0, 100)}{comment.content.length > 100 ? "..." : ""}"
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
          )}
        </HoverCardContent>

        <HoverCardFooter>
          <Link
            to={`/projects/${projectId}`}
            className="flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-xs"
          >
            View project
          </Link>
        </HoverCardFooter>
      </div>
    </HoverCard>
  );
}

export function ProjectProgressItem({
  project,
  showIndicators = true,
}: ProjectProgressItemProps) {
  const hasBlockers = project.active_blocker_count > 0;
  const hasComments = project.total_comment_count > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Link
          to={`/projects/${project.project_id}`}
          className="text-sm font-medium text-gray-900 dark:text-white truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          {project.project_name}
        </Link>

        <div className="flex items-center gap-2">
          {/* Indicators */}
          {showIndicators && (
            <>
              {hasBlockers && (
                <BlockerIndicator
                  projectId={project.project_id}
                  count={project.active_blocker_count}
                  criticalCount={project.critical_blocker_count}
                  maxImpact={project.max_blocker_impact}
                />
              )}
              {hasComments && (
                <CommentIndicator
                  projectId={project.project_id}
                  totalCount={project.total_comment_count}
                  unreadCount={project.unread_comment_count}
                />
              )}
            </>
          )}

          {/* Task count */}
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {project.completed_tasks}/{project.total_tasks}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-100 dark:bg-dark-elevated rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full transition-all duration-500"
          style={{ width: `${project.progress_percentage}%` }}
        />
      </div>
    </div>
  );
}

export default ProjectProgressItem;
