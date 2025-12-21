/**
 * BlockerSummaryHoverCard - Hover card wrapper showing blocker summary
 *
 * Displays a summary of active blockers when hovering over an indicator.
 * Shows top 3-5 blockers with title, severity badge, and status.
 * Color-coded by impact level with "View all blockers" link.
 */

import { Link } from "react-router-dom";
import { clsx } from "clsx";
import {
  ExclamationTriangleIcon,
  ArrowUpIcon,
  MinusIcon,
  ArrowDownIcon,
  ChevronRightIcon,
  NoSymbolIcon,
} from "@heroicons/react/24/solid";
import {
  HoverCard,
  HoverCardHeader,
  HoverCardContent,
  HoverCardFooter,
  type HoverCardProps,
} from "@/components/common/HoverCard";
import type { Blocker, BlockerImpactLevel, BlockerStatus } from "@/types";

/** Simplified blocker data for hover display */
export interface BlockerSummaryItem {
  id: string;
  title: string;
  impact_level: BlockerImpactLevel;
  status: BlockerStatus;
  due_date?: string | null;
}

interface BlockerSummaryHoverCardProps extends Omit<HoverCardProps, "children"> {
  /** List of blockers to display (shows top 5) */
  blockers: BlockerSummaryItem[];
  /** Total count of blockers (may differ from blockers.length if paginated) */
  totalCount?: number;
  /** Project ID for navigation link */
  projectId?: string;
  /** Task ID for more specific navigation */
  taskId?: string;
  /** Whether to show the "View all" footer link */
  showViewAll?: boolean;
  /** Custom header text */
  headerText?: string;
}

// Impact level styling
const IMPACT_CONFIG: Record<
  BlockerImpactLevel,
  { icon: React.ComponentType<{ className?: string }>; dot: string; text: string }
> = {
  critical: {
    icon: ExclamationTriangleIcon,
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
  },
  high: {
    icon: ArrowUpIcon,
    dot: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-400",
  },
  medium: {
    icon: MinusIcon,
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
  },
  low: {
    icon: ArrowDownIcon,
    dot: "bg-gray-400",
    text: "text-gray-600 dark:text-gray-400",
  },
};

const STATUS_LABELS: Record<BlockerStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  wont_fix: "Won't Fix",
};

// Sort blockers by impact level (critical first)
const IMPACT_PRIORITY: Record<BlockerImpactLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function sortByImpact(blockers: BlockerSummaryItem[]): BlockerSummaryItem[] {
  return [...blockers].sort(
    (a, b) => IMPACT_PRIORITY[a.impact_level] - IMPACT_PRIORITY[b.impact_level]
  );
}

function formatDueDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7) return `Due in ${days} days`;
  return `Due ${date.toLocaleDateString()}`;
}

export function BlockerSummaryHoverCard({
  trigger,
  blockers,
  totalCount,
  projectId,
  taskId,
  showViewAll = true,
  headerText,
  placement = "bottom",
  maxWidth = 340,
  ...hoverCardProps
}: BlockerSummaryHoverCardProps) {
  const displayCount = totalCount ?? blockers.length;
  const sortedBlockers = sortByImpact(blockers).slice(0, 5);
  const hasMore = displayCount > sortedBlockers.length;

  // If no blockers, show a simple "no blockers" message
  if (displayCount === 0) {
    return (
      <HoverCard
        trigger={trigger}
        placement={placement}
        maxWidth={maxWidth}
        {...hoverCardProps}
      >
        <HoverCardContent>
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
            <NoSymbolIcon className="h-4 w-4" />
            <span>No active blockers</span>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  // Build navigation URL
  const viewAllUrl = projectId
    ? taskId
      ? `/projects/${projectId}/tasks/${taskId}?tab=blockers`
      : `/projects/${projectId}?tab=blockers`
    : "/blockers";

  return (
    <HoverCard
      trigger={trigger}
      placement={placement}
      maxWidth={maxWidth}
      {...hoverCardProps}
    >
      <HoverCardHeader className="flex items-center gap-2">
        <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
        <span>{headerText ?? `Active Blockers (${displayCount})`}</span>
      </HoverCardHeader>

      <HoverCardContent className="space-y-2 py-2">
        {sortedBlockers.map((blocker) => {
          const config = IMPACT_CONFIG[blocker.impact_level];
          const Icon = config.icon;
          const dueText = formatDueDate(blocker.due_date);

          return (
            <div
              key={blocker.id}
              className="flex items-start gap-2 text-sm"
            >
              {/* Impact indicator dot */}
              <span
                className={clsx(
                  "flex-shrink-0 w-2 h-2 rounded-full mt-1.5",
                  config.dot
                )}
              />

              <div className="flex-1 min-w-0">
                {/* Title */}
                <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {blocker.title}
                </div>

                {/* Meta info */}
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className={clsx("flex items-center gap-0.5", config.text)}>
                    <Icon className="h-3 w-3" />
                    {blocker.impact_level.charAt(0).toUpperCase() +
                      blocker.impact_level.slice(1)}
                  </span>
                  <span>•</span>
                  <span>{STATUS_LABELS[blocker.status]}</span>
                  {dueText && (
                    <>
                      <span>•</span>
                      <span
                        className={clsx(
                          dueText === "Overdue" && "text-red-600 dark:text-red-400 font-medium"
                        )}
                      >
                        {dueText}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {hasMore && (
          <div className="text-xs text-gray-500 dark:text-gray-400 pt-1">
            +{displayCount - sortedBlockers.length} more blockers
          </div>
        )}
      </HoverCardContent>

      {showViewAll && (
        <HoverCardFooter>
          <Link
            to={viewAllUrl}
            className="flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          >
            View all blockers
            <ChevronRightIcon className="h-3 w-3" />
          </Link>
        </HoverCardFooter>
      )}
    </HoverCard>
  );
}

/**
 * Helper to convert full Blocker objects to BlockerSummaryItem
 */
export function toBlockerSummaryItems(blockers: Blocker[]): BlockerSummaryItem[] {
  return blockers.map((b) => ({
    id: b.id,
    title: b.title,
    impact_level: b.impact_level,
    status: b.status,
    due_date: b.due_date,
  }));
}

export default BlockerSummaryHoverCard;
