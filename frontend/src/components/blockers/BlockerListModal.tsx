/**
 * BlockerListModal - Modal for viewing and managing project blockers
 *
 * Shows list of blockers with ability to:
 * - View/edit existing blockers (opens BlockerDetailModal)
 * - Create new blockers
 */

import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, Transition } from "@headlessui/react";
import {
  XMarkIcon,
  PlusIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { blockersService } from "@/services/blockers";
import { BlockerCard } from "./BlockerCard";
import { BlockerDetailModal } from "./BlockerDetailModal";
import { CreateBlockerModal } from "./CreateBlockerModal";

interface BlockerListModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export function BlockerListModal({
  isOpen,
  onClose,
  projectId,
}: BlockerListModalProps) {
  const [selectedBlockerId, setSelectedBlockerId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  // Fetch blockers
  const { data, isLoading } = useQuery({
    queryKey: ["blockers", projectId, showResolved],
    queryFn: async () => {
      const [openBlockers, inProgressBlockers] = await Promise.all([
        blockersService.list({ project_id: projectId, status: "open", page_size: 50 }),
        blockersService.list({ project_id: projectId, status: "in_progress", page_size: 50 }),
      ]);

      let blockers = [...openBlockers.items, ...inProgressBlockers.items];

      if (showResolved) {
        const [resolved, wontFix] = await Promise.all([
          blockersService.list({ project_id: projectId, status: "resolved", page_size: 50 }),
          blockersService.list({ project_id: projectId, status: "wont_fix", page_size: 50 }),
        ]);
        blockers = [...blockers, ...resolved.items, ...wontFix.items];
      }

      return blockers;
    },
    enabled: isOpen,
  });

  const blockers = data ?? [];
  const activeBlockers = blockers.filter(b => b.status !== "resolved" && b.status !== "wont_fix");
  const resolvedBlockers = blockers.filter(b => b.status === "resolved" || b.status === "wont_fix");

  return (
    <>
      <Transition show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={onClose}>
          {/* Backdrop */}
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" />
          </Transition.Child>

          {/* Modal */}
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-2xl transform rounded-xl bg-white shadow-xl transition-all dark:bg-gray-900">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" />
                      <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                        Blockers
                      </Dialog.Title>
                      {activeBlockers.length > 0 && (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                          {activeBlockers.length} active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsCreateOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
                      >
                        <PlusIcon className="h-4 w-4" />
                        New Blocker
                      </button>
                      <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="max-h-[60vh] overflow-y-auto p-6">
                    {isLoading ? (
                      <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                          <div
                            key={i}
                            className="h-20 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
                          />
                        ))}
                      </div>
                    ) : blockers.length === 0 ? (
                      <div className="py-8 text-center">
                        <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                          No blockers
                        </h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          This project has no active blockers.
                        </p>
                        <button
                          onClick={() => setIsCreateOpen(true)}
                          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                        >
                          <PlusIcon className="h-4 w-4" />
                          Add Blocker
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Active blockers */}
                        {activeBlockers.length > 0 && (
                          <div className="space-y-2">
                            {activeBlockers.map((blocker) => (
                              <BlockerCard
                                key={blocker.id}
                                blocker={blocker}
                                onClick={() => setSelectedBlockerId(blocker.id)}
                              />
                            ))}
                          </div>
                        )}

                        {/* Show/hide resolved toggle */}
                        {(resolvedBlockers.length > 0 || showResolved) && (
                          <button
                            onClick={() => setShowResolved(!showResolved)}
                            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                          >
                            {showResolved
                              ? `Hide ${resolvedBlockers.length} resolved`
                              : `Show ${resolvedBlockers.length} resolved`}
                          </button>
                        )}

                        {/* Resolved blockers */}
                        {showResolved && resolvedBlockers.length > 0 && (
                          <div className={clsx("space-y-2", activeBlockers.length > 0 && "opacity-60")}>
                            {resolvedBlockers.map((blocker) => (
                              <BlockerCard
                                key={blocker.id}
                                blocker={blocker}
                                onClick={() => setSelectedBlockerId(blocker.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Detail Modal */}
      <BlockerDetailModal
        isOpen={!!selectedBlockerId}
        onClose={() => setSelectedBlockerId(null)}
        blockerId={selectedBlockerId}
      />

      {/* Create Modal */}
      <CreateBlockerModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        projectId={projectId}
      />
    </>
  );
}

export default BlockerListModal;
