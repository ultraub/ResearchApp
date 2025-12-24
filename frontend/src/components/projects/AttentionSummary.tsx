/**
 * AttentionSummary - Shows what needs attention at a glance
 *
 * Displays: active blockers, overdue tasks, unread comments
 * Clicking each item can trigger navigation/filtering
 */

import { useMemo } from "react";
import { clsx } from "clsx";
import {
  ExclamationTriangleIcon,
  ClockIcon,
  ChatBubbleLeftIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import type { Task, Blocker } from "@/types";

interface AttentionSummaryProps {
  tasks: Task[];
  blockers?: Blocker[];
  unreadCounts?: Record<string, { totalComments: number; unreadCount: number }>;
  onBlockersClick?: () => void;
  onOverdueClick?: () => void;
  onUnreadClick?: () => void;
  className?: string;
  /** Compact mode for mobile - shows as badges instead of cards */
  compact?: boolean;
}

export function AttentionSummary({
  tasks,
  blockers = [],
  unreadCounts = {},
  onBlockersClick,
  onOverdueClick,
  onUnreadClick,
  className,
  compact = false,
}: AttentionSummaryProps) {
  // Calculate attention metrics
  const metrics = useMemo(() => {
    const now = new Date();

    // Count active blockers (not resolved)
    const activeBlockers = blockers.filter(b => b.status !== "resolved");
    const criticalBlockers = activeBlockers.filter(
      b => b.impact_level === "critical" || b.impact_level === "high"
    );

    // Count overdue tasks
    const overdueTasks = tasks.filter(
      t => t.due_date && new Date(t.due_date) < now && t.status !== "done"
    );

    // Count unread comments
    let totalUnread = 0;
    for (const info of Object.values(unreadCounts)) {
      totalUnread += info.unreadCount;
    }

    return {
      blockerCount: activeBlockers.length,
      criticalBlockerCount: criticalBlockers.length,
      overdueCount: overdueTasks.length,
      unreadCount: totalUnread,
    };
  }, [tasks, blockers, unreadCounts]);

  const hasAttention = metrics.blockerCount > 0 || metrics.overdueCount > 0 || metrics.unreadCount > 0;

  // Compact mode - inline badges
  if (compact) {
    if (!hasAttention) return null;

    return (
      <div className={clsx("flex items-center gap-2 flex-wrap", className)}>
        {metrics.blockerCount > 0 && (
          <button
            onClick={onBlockersClick}
            className={clsx(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
              metrics.criticalBlockerCount > 0
                ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
                : "bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400"
            )}
          >
            <ExclamationTriangleIcon className="h-3 w-3" />
            {metrics.blockerCount} blocker{metrics.blockerCount !== 1 ? "s" : ""}
          </button>
        )}

        {metrics.overdueCount > 0 && (
          <button
            onClick={onOverdueClick}
            className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400"
          >
            <ClockIcon className="h-3 w-3" />
            {metrics.overdueCount} overdue
          </button>
        )}

        {metrics.unreadCount > 0 && (
          <button
            onClick={onUnreadClick}
            className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-400"
          >
            <ChatBubbleLeftIcon className="h-3 w-3" />
            {metrics.unreadCount} unread
          </button>
        )}
      </div>
    );
  }

  // Full card mode
  return (
    <div className={clsx(
      "rounded-xl bg-white p-4 shadow-soft dark:bg-dark-card",
      className
    )}>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        Needs Attention
      </h3>

      {!hasAttention ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <CheckCircleIcon className="h-5 w-5 text-green-500" />
          <span>All clear! No items need attention.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Blockers */}
          {metrics.blockerCount > 0 && (
            <button
              onClick={onBlockersClick}
              className={clsx(
                "w-full flex items-center justify-between p-3 rounded-lg transition-colors",
                metrics.criticalBlockerCount > 0
                  ? "bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30"
                  : "bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/30"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={clsx(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  metrics.criticalBlockerCount > 0
                    ? "bg-red-100 dark:bg-red-900/40"
                    : "bg-orange-100 dark:bg-orange-900/40"
                )}>
                  <ExclamationTriangleIcon className={clsx(
                    "h-4 w-4",
                    metrics.criticalBlockerCount > 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-orange-600 dark:text-orange-400"
                  )} />
                </div>
                <div className="text-left">
                  <div className={clsx(
                    "text-sm font-medium",
                    metrics.criticalBlockerCount > 0
                      ? "text-red-700 dark:text-red-400"
                      : "text-orange-700 dark:text-orange-400"
                  )}>
                    {metrics.blockerCount} Active Blocker{metrics.blockerCount !== 1 ? "s" : ""}
                  </div>
                  {metrics.criticalBlockerCount > 0 && (
                    <div className="text-xs text-red-600 dark:text-red-400">
                      {metrics.criticalBlockerCount} critical/high impact
                    </div>
                  )}
                </div>
              </div>
              <span className="text-xs text-gray-400">View →</span>
            </button>
          )}

          {/* Overdue Tasks */}
          {metrics.overdueCount > 0 && (
            <button
              onClick={onOverdueClick}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                  <ClockIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-red-700 dark:text-red-400">
                    {metrics.overdueCount} Overdue Task{metrics.overdueCount !== 1 ? "s" : ""}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400">
                    Past due date
                  </div>
                </div>
              </div>
              <span className="text-xs text-gray-400">View →</span>
            </button>
          )}

          {/* Unread Comments */}
          {metrics.unreadCount > 0 && (
            <button
              onClick={onUnreadClick}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/20 dark:hover:bg-primary-900/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40">
                  <ChatBubbleLeftIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-medium text-primary-700 dark:text-primary-400">
                    {metrics.unreadCount} Unread Comment{metrics.unreadCount !== 1 ? "s" : ""}
                  </div>
                  <div className="text-xs text-primary-600 dark:text-primary-400">
                    New activity
                  </div>
                </div>
              </div>
              <span className="text-xs text-gray-400">View →</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default AttentionSummary;
