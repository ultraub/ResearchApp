/**
 * ReviewStatusBadge - Enhanced review status indicator with counts and AI support
 *
 * Shows review status with optional counts for pending items and AI suggestions.
 * Designed to be used in project lists, task cards, and dashboard widgets.
 *
 * Variants:
 * - sm: Just a colored dot (for tight spaces)
 * - md: Dot + count (e.g., "2 pending")
 * - lg: Full details (e.g., "Review: 2 pending, 1 AI suggestion")
 */

import { clsx } from "clsx";
import type { OverallReviewStatus } from "@/types";
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  MinusCircleIcon,
  ExclamationCircleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

export interface ReviewStatusSummary {
  /** Overall status of reviews */
  status: OverallReviewStatus;
  /** Number of pending reviews */
  pending_count?: number;
  /** Number of unresolved AI suggestions */
  ai_suggestion_count?: number;
  /** Number of approved reviews */
  approved_count?: number;
  /** Number of rejected reviews */
  rejected_count?: number;
  /** Total number of reviews */
  total_count?: number;
}

interface ReviewStatusBadgeProps {
  summary: ReviewStatusSummary;
  className?: string;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  /** Show AI suggestion indicator when present */
  showAIIndicator?: boolean;
}

const STATUS_COLORS: Record<OverallReviewStatus, { bg: string; text: string; dot: string }> = {
  none: { bg: "bg-gray-100 dark:bg-dark-elevated", text: "text-gray-600 dark:text-gray-300", dot: "bg-gray-400" },
  pending: { bg: "bg-primary-100 dark:bg-primary-900/30", text: "text-primary-700 dark:text-primary-300", dot: "bg-primary-500" },
  approved: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", dot: "bg-green-500" },
  rejected: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", dot: "bg-red-500" },
  mixed: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
};

const STATUS_ICONS: Record<OverallReviewStatus, React.ComponentType<{ className?: string }>> = {
  none: MinusCircleIcon,
  pending: ClockIcon,
  approved: CheckCircleIcon,
  rejected: XCircleIcon,
  mixed: ExclamationCircleIcon,
};

export function ReviewStatusBadge({
  summary,
  className,
  size = "md",
  showIcon = true,
  showAIIndicator = true,
}: ReviewStatusBadgeProps) {
  const { status, pending_count = 0, ai_suggestion_count = 0 } = summary;
  const colors = STATUS_COLORS[status];
  const Icon = STATUS_ICONS[status];

  const hasAISuggestions = showAIIndicator && ai_suggestion_count > 0;

  // Small variant - just a colored dot
  if (size === "sm") {
    return (
      <span className={clsx("relative inline-flex", className)}>
        <span
          className={clsx("h-2 w-2 rounded-full", colors.dot)}
          title={getTooltip(summary)}
        />
        {hasAISuggestions && (
          <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-purple-500" />
        )}
      </span>
    );
  }

  // Medium variant - dot + primary count
  if (size === "md") {
    const count = pending_count || summary.total_count || 0;
    const label = status === "none" ? "" : count > 0 ? `${count}` : "";

    return (
      <span
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium shadow-soft",
          colors.bg,
          colors.text,
          className
        )}
        title={getTooltip(summary)}
      >
        {showIcon && <Icon className="h-3.5 w-3.5" />}
        {label && <span>{label}</span>}
        {hasAISuggestions && (
          <SparklesIcon className="h-3 w-3 text-purple-600 dark:text-purple-400" />
        )}
      </span>
    );
  }

  // Large variant - full details
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium shadow-soft",
        colors.bg,
        colors.text,
        className
      )}
    >
      {showIcon && <Icon className="h-4 w-4" />}
      <span className="flex items-center gap-2">
        {status === "none" ? (
          <span>No reviews</span>
        ) : (
          <>
            {pending_count > 0 && (
              <span>{pending_count} pending</span>
            )}
            {summary.approved_count && summary.approved_count > 0 && (
              <span className="text-green-600 dark:text-green-400">{summary.approved_count} approved</span>
            )}
            {summary.rejected_count && summary.rejected_count > 0 && (
              <span className="text-red-600 dark:text-red-400">{summary.rejected_count} rejected</span>
            )}
          </>
        )}
        {hasAISuggestions && (
          <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
            <SparklesIcon className="h-3.5 w-3.5" />
            {ai_suggestion_count} AI
          </span>
        )}
      </span>
    </span>
  );
}

function getTooltip(summary: ReviewStatusSummary): string {
  const parts: string[] = [];

  if (summary.pending_count && summary.pending_count > 0) {
    parts.push(`${summary.pending_count} pending`);
  }
  if (summary.approved_count && summary.approved_count > 0) {
    parts.push(`${summary.approved_count} approved`);
  }
  if (summary.rejected_count && summary.rejected_count > 0) {
    parts.push(`${summary.rejected_count} rejected`);
  }
  if (summary.ai_suggestion_count && summary.ai_suggestion_count > 0) {
    parts.push(`${summary.ai_suggestion_count} AI suggestions`);
  }

  if (parts.length === 0) {
    return "No reviews";
  }

  return `Review: ${parts.join(", ")}`;
}

/**
 * Compact dot-only indicator for use in tables and lists
 */
export function ReviewStatusDot({
  status,
  hasAISuggestions = false,
  className,
}: {
  status: OverallReviewStatus;
  hasAISuggestions?: boolean;
  className?: string;
}) {
  const colors = STATUS_COLORS[status];

  return (
    <span className={clsx("relative inline-flex", className)}>
      <span className={clsx("h-2.5 w-2.5 rounded-full", colors.dot)} />
      {hasAISuggestions && (
        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-purple-500 ring-1 ring-white dark:ring-dark-base" />
      )}
    </span>
  );
}

export default ReviewStatusBadge;
