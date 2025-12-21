/**
 * BlockedBySection - Shows blockers that are blocking a specific task or project.
 * Used within TaskDetailModal and ProjectDetailPage.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExclamationTriangleIcon, ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { blockersService } from "@/services/blockers";
import { BlockerStatusBadge } from "./BlockerStatusBadge";
import { BlockerDetailModal } from "./BlockerDetailModal";

interface BlockedBySectionProps {
  entityType: "task" | "project";
  entityId: string;
  className?: string;
  /** Whether to show resolved blockers */
  showResolved?: boolean;
  /** Compact display mode for sidebar/metadata panels */
  compact?: boolean;
}

export function BlockedBySection({
  entityType,
  entityId,
  className,
  showResolved = false,
  compact = false,
}: BlockedBySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedBlockerId, setSelectedBlockerId] = useState<string | null>(null);

  const { data: blockers = [], isLoading } = useQuery({
    queryKey: ["blockers-for", entityType, entityId, showResolved],
    queryFn: async () => {
      if (entityType === "task") {
        return blockersService.getForTask(entityId, !showResolved);
      } else {
        return blockersService.getForProject(entityId, !showResolved);
      }
    },
    enabled: !!entityId,
  });

  // Filter active blockers for warning display
  const activeBlockers = blockers.filter(
    (b) => b.status === "open" || b.status === "in_progress"
  );

  if (isLoading) {
    return (
      <div className={clsx("animate-pulse", className)}>
        <div className="h-8 w-32 rounded bg-gray-200 dark:bg-dark-elevated" />
      </div>
    );
  }

  // Don't show if no blockers
  if (blockers.length === 0) {
    return null;
  }

  // Compact mode for sidebar/metadata display
  if (compact) {
    return (
      <div className={className}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-full items-center justify-between rounded-lg bg-yellow-50 px-3 py-2 dark:bg-yellow-900/20"
        >
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              {activeBlockers.length} Active Blocker{activeBlockers.length !== 1 ? "s" : ""}
            </span>
          </div>
          {isExpanded ? (
            <ChevronUpIcon className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          ) : (
            <ChevronDownIcon className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          )}
        </button>

        {isExpanded && (
          <div className="mt-2 space-y-1">
            {blockers.map((blocker) => (
              <button
                key={blocker.id}
                onClick={() => setSelectedBlockerId(blocker.id)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-elevated"
              >
                <span className="truncate text-gray-700 dark:text-gray-300">
                  {blocker.title}
                </span>
                <BlockerStatusBadge status={blocker.status} size="sm" showIcon={false} />
              </button>
            ))}
          </div>
        )}

        <BlockerDetailModal
          isOpen={!!selectedBlockerId}
          onClose={() => setSelectedBlockerId(null)}
          blockerId={selectedBlockerId}
        />
      </div>
    );
  }

  // Full display mode
  return (
    <div className={className}>
      {/* Warning Banner */}
      {activeBlockers.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20 shadow-soft">
          <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
          <div>
            <h4 className="font-medium text-yellow-800 dark:text-yellow-300">
              This {entityType} is blocked
            </h4>
            <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
              There {activeBlockers.length === 1 ? "is" : "are"} {activeBlockers.length} active
              blocker{activeBlockers.length !== 1 ? "s" : ""} preventing progress on this {entityType}.
            </p>
          </div>
        </div>
      )}

      {/* Blockers List */}
      <div className="space-y-2">
        {blockers.map((blocker) => (
          <div
            key={blocker.id}
            onClick={() => setSelectedBlockerId(blocker.id)}
            className={clsx(
              "cursor-pointer rounded-xl border p-3 transition-colors hover:bg-gray-50 dark:hover:bg-dark-elevated shadow-soft",
              blocker.status === "open" || blocker.status === "in_progress"
                ? "border-yellow-200 bg-yellow-50/50 dark:border-yellow-800/50 dark:bg-yellow-900/10"
                : "border-gray-200 dark:border-dark-border"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h5 className={clsx(
                  "font-medium text-gray-900 dark:text-white truncate",
                  (blocker.status === "resolved" || blocker.status === "wont_fix") && "line-through opacity-60"
                )}>
                  {blocker.title}
                </h5>
                {blocker.description && (
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                    {typeof blocker.description === "string"
                      ? blocker.description
                      : "Rich text description"}
                  </p>
                )}
              </div>
              <BlockerStatusBadge status={blocker.status} size="sm" />
            </div>

            {/* Blocker metadata */}
            <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span className="capitalize">{blocker.blocker_type.replace("_", " ")}</span>
              <span className="capitalize">{blocker.impact_level} impact</span>
              {blocker.due_date && (
                <span>Due: {new Date(blocker.due_date).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <BlockerDetailModal
        isOpen={!!selectedBlockerId}
        onClose={() => setSelectedBlockerId(null)}
        blockerId={selectedBlockerId}
      />
    </div>
  );
}

export default BlockedBySection;
