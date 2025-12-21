/**
 * BlockerList - Displays a list of blockers with optional filters
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExclamationTriangleIcon, PlusIcon } from "@heroicons/react/24/outline";
import { blockersService } from "@/services/blockers";
import type { BlockerListParams } from "@/types";
import { BlockerCard } from "./BlockerCard";
import { BlockerDetailModal } from "./BlockerDetailModal";

interface BlockerListProps {
  projectId: string;
  showResolved?: boolean;
  onCreateBlocker?: () => void;
  className?: string;
}

export function BlockerList({
  projectId,
  showResolved = false,
  onCreateBlocker,
  className,
}: BlockerListProps) {
  const [selectedBlockerId, setSelectedBlockerId] = useState<string | null>(null);

  const params: BlockerListParams = {
    project_id: projectId,
    page_size: 50,
  };

  if (!showResolved) {
    // Filter to only show active blockers
    params.status = "open";
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ["blockers", projectId, showResolved],
    queryFn: async () => {
      // Make two queries - one for open and one for in_progress
      const [openBlockers, inProgressBlockers] = await Promise.all([
        blockersService.list({ ...params, status: "open" }),
        blockersService.list({ ...params, status: "in_progress" }),
      ]);

      let blockers = [...openBlockers.items, ...inProgressBlockers.items];

      if (showResolved) {
        const [resolved, wontFix] = await Promise.all([
          blockersService.list({ ...params, status: "resolved" }),
          blockersService.list({ ...params, status: "wont_fix" }),
        ]);
        blockers = [...blockers, ...resolved.items, ...wontFix.items];
      }

      return blockers;
    },
  });

  const blockers = data ?? [];

  if (isLoading) {
    return (
      <div className={className}>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to load blockers
        </div>
      </div>
    );
  }

  if (blockers.length === 0) {
    return (
      <div className={className}>
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            No blockers
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {showResolved
              ? "No blockers have been created for this project."
              : "No active blockers in this project."}
          </p>
          {onCreateBlocker && (
            <button
              onClick={onCreateBlocker}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <PlusIcon className="h-4 w-4" />
              Add Blocker
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        {blockers.map((blocker) => (
          <BlockerCard
            key={blocker.id}
            blocker={blocker}
            onClick={() => setSelectedBlockerId(blocker.id)}
          />
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

export default BlockerList;
