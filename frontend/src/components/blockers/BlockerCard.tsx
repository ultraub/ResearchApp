/**
 * BlockerCard - Card component for displaying a blocker in lists.
 */

import { useMemo } from "react";
import { format, isPast, isToday } from "date-fns";
import {
  CalendarIcon,
  UserCircleIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import type { Blocker } from "@/types";
import { BlockerStatusBadge } from "./BlockerStatusBadge";
import { BlockerImpactBadge } from "./BlockerImpactBadge";

interface BlockerCardProps {
  blocker: Blocker;
  onClick?: () => void;
}

const priorityColors = {
  low: "border-l-gray-400",
  medium: "border-l-blue-400",
  high: "border-l-orange-400",
  urgent: "border-l-red-500",
};

const blockerTypeLabels: Record<string, string> = {
  general: "General",
  external_dependency: "External Dependency",
  resource: "Resource",
  technical: "Technical",
  approval: "Approval",
};

const blockerTypeIcons: Record<string, string> = {
  general: "🚧",
  external_dependency: "🔗",
  resource: "👥",
  technical: "⚙️",
  approval: "✅",
};

// Extract plain text from TipTap JSON content or return string as-is
function getDescriptionText(description: string | Record<string, unknown> | null): string | null {
  if (!description) return null;
  if (typeof description === "string") return description;

  // TipTap JSON format - extract text recursively
  const extractText = (node: Record<string, unknown>): string => {
    if (node.text && typeof node.text === "string") {
      return node.text;
    }
    if (Array.isArray(node.content)) {
      return node.content.map((child) => extractText(child as Record<string, unknown>)).join(" ");
    }
    return "";
  };

  return extractText(description).trim() || null;
}

export function BlockerCard({ blocker, onClick }: BlockerCardProps) {
  const descriptionText = useMemo(() => getDescriptionText(blocker.description), [blocker.description]);

  const isOverdue = useMemo(() => {
    if (!blocker.due_date || blocker.status === "resolved" || blocker.status === "wont_fix") return false;
    return isPast(new Date(blocker.due_date)) && !isToday(new Date(blocker.due_date));
  }, [blocker.due_date, blocker.status]);

  const isDueToday = useMemo(() => {
    if (!blocker.due_date) return false;
    return isToday(new Date(blocker.due_date));
  }, [blocker.due_date]);

  const isResolved = blocker.status === "resolved" || blocker.status === "wont_fix";

  return (
    <div
      onClick={onClick}
      className={clsx(
        "cursor-pointer rounded-lg border-l-4 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:bg-dark-card",
        priorityColors[blocker.priority],
        isResolved && "opacity-60"
      )}
    >
      {/* Blocker type indicator and status */}
      <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm">{blockerTypeIcons[blocker.blocker_type] || "🚧"}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {blockerTypeLabels[blocker.blocker_type] || blocker.blocker_type}
          </span>
        </div>
        <BlockerStatusBadge status={blocker.status} size="sm" />
      </div>

      {/* Title */}
      <h4 className={clsx(
        "font-medium text-gray-900 dark:text-white line-clamp-2",
        isResolved && "line-through"
      )}>
        {blocker.title}
      </h4>

      {/* Description preview */}
      {descriptionText && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
          {descriptionText}
        </p>
      )}

      {/* Tags */}
      {blocker.tags && blocker.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {blocker.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400"
            >
              {tag}
            </span>
          ))}
          {blocker.tags && blocker.tags.length > 3 && (
            <span className="text-xs text-gray-400">+{blocker.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          {/* Impact level */}
          <BlockerImpactBadge impact={blocker.impact_level} size="sm" showIcon={false} />

          {/* Due date */}
          {blocker.due_date && (
            <span
              className={clsx(
                "flex items-center gap-1",
                isOverdue
                  ? "text-red-500"
                  : isDueToday
                  ? "text-orange-500"
                  : "text-gray-500 dark:text-gray-400"
              )}
            >
              <CalendarIcon className="h-4 w-4" />
              {isOverdue
                ? "Overdue"
                : isDueToday
                ? "Today"
                : format(new Date(blocker.due_date), "MMM d")}
            </span>
          )}

          {/* Blocked items count */}
          {blocker.blocked_items_count !== undefined && blocker.blocked_items_count > 0 && (
            <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <LinkIcon className="h-4 w-4" />
              {blocker.blocked_items_count} blocked
            </span>
          )}
        </div>

        {/* Assignee */}
        {blocker.assignee_name ? (
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
              {blocker.assignee_name.charAt(0).toUpperCase()}
            </div>
            <span className="max-w-[100px] truncate">{blocker.assignee_name}</span>
          </div>
        ) : blocker.assignee_id ? (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
            A
          </div>
        ) : (
          <UserCircleIcon className="h-5 w-5 text-gray-300 dark:text-gray-600" />
        )}
      </div>

      {/* Resolution info for resolved blockers */}
      {isResolved && blocker.resolved_at && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Resolved {format(new Date(blocker.resolved_at), "MMM d, yyyy")}
          {blocker.resolution_type && ` - ${blocker.resolution_type.replace("_", " ")}`}
        </div>
      )}
    </div>
  );
}

export default BlockerCard;
