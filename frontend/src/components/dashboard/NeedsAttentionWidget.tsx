/**
 * NeedsAttentionWidget - Dashboard widget showing items that need attention
 *
 * Displays a prioritized list of blockers and unread comments across all projects.
 * Critical blockers shown first, then high, then unread comments.
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import {
  ExclamationTriangleIcon,
  ChatBubbleLeftIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import type { ProjectProgress } from "@/services/analytics";

interface NeedsAttentionWidgetProps {
  /** All projects with their blocker and comment metrics */
  projects: ProjectProgress[];
  /** Maximum number of items to show */
  maxItems?: number;
}

interface AttentionItem {
  id: string;
  type: "blocker" | "comment";
  projectId: string;
  projectName: string;
  count: number;
  severity?: "critical" | "high" | "medium" | "low";
  priority: number; // For sorting
}

export function NeedsAttentionWidget({
  projects,
  maxItems = 8,
}: NeedsAttentionWidgetProps) {
  // Aggregate attention items from all projects
  const { items, totalBlockers, totalUnreadComments } = useMemo(() => {
    const attentionItems: AttentionItem[] = [];
    let blockerTotal = 0;
    let commentTotal = 0;

    for (const project of projects) {
      // Add blocker items (one per project with blockers)
      if (project.active_blocker_count > 0) {
        blockerTotal += project.active_blocker_count;
        const severity = project.max_blocker_impact as "critical" | "high" | "medium" | "low" || "medium";
        const priorityMap = { critical: 0, high: 1, medium: 2, low: 3 };

        attentionItems.push({
          id: `blocker-${project.project_id}`,
          type: "blocker",
          projectId: project.project_id,
          projectName: project.project_name,
          count: project.active_blocker_count,
          severity,
          priority: priorityMap[severity],
        });
      }

      // Add comment items (one per project with unread comments)
      if (project.unread_comment_count > 0) {
        commentTotal += project.unread_comment_count;

        attentionItems.push({
          id: `comment-${project.project_id}`,
          type: "comment",
          projectId: project.project_id,
          projectName: project.project_name,
          count: project.unread_comment_count,
          priority: 10, // Comments come after blockers
        });
      }
    }

    // Sort by priority (critical blockers first, then high, then medium/low, then comments)
    attentionItems.sort((a, b) => a.priority - b.priority);

    return {
      items: attentionItems.slice(0, maxItems),
      totalBlockers: blockerTotal,
      totalUnreadComments: commentTotal,
    };
  }, [projects, maxItems]);

  // Don't render if nothing needs attention
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
          <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Needs Attention
        </h3>
      </div>

      {/* Summary stats */}
      <div className="flex gap-3 mb-4">
        {totalBlockers > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium">
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            {totalBlockers} Blocker{totalBlockers !== 1 ? "s" : ""}
          </div>
        )}
        {totalUnreadComments > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-medium">
            <ChatBubbleLeftIcon className="h-3.5 w-3.5" />
            {totalUnreadComments} Unread
          </div>
        )}
      </div>

      {/* Item list */}
      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.id}
            to={
              item.type === "blocker"
                ? `/projects/${item.projectId}?tab=blockers`
                : `/projects/${item.projectId}`
            }
            className="flex items-center gap-2 p-2 -mx-2 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-elevated transition-colors group"
          >
            {item.type === "blocker" ? (
              <span
                className={clsx(
                  "flex-shrink-0 w-2 h-2 rounded-full",
                  item.severity === "critical" && "bg-red-500",
                  item.severity === "high" && "bg-orange-500",
                  item.severity === "medium" && "bg-blue-500",
                  item.severity === "low" && "bg-gray-400"
                )}
              />
            ) : (
              <ChatBubbleLeftIcon className="flex-shrink-0 h-4 w-4 text-primary-500" />
            )}

            <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 truncate">
              {item.type === "blocker" ? (
                <>
                  <span className="font-medium">{item.count}</span>{" "}
                  <span
                    className={clsx(
                      item.severity === "critical" && "text-red-600 dark:text-red-400",
                      item.severity === "high" && "text-orange-600 dark:text-orange-400"
                    )}
                  >
                    {item.severity}
                  </span>{" "}
                  blocker{item.count !== 1 ? "s" : ""} in{" "}
                </>
              ) : (
                <>
                  <span className="font-medium">{item.count}</span> unread in{" "}
                </>
              )}
              <span className="font-medium">{item.projectName}</span>
            </span>

            <ArrowRightIcon className="flex-shrink-0 h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
          </Link>
        ))}
      </div>

      {/* Show more indicator if items were truncated */}
      {items.length === maxItems && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-dark-border">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            + more items across your projects
          </span>
        </div>
      )}
    </div>
  );
}

export default NeedsAttentionWidget;
