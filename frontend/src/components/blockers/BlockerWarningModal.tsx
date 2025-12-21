/**
 * BlockerWarningModal - Displays a warning when trying to complete a task/project with active blockers.
 * Implements the "soft block" behavior - warns but allows override.
 */

import { Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import type { Blocker } from "@/types";
import { BlockerStatusBadge } from "./BlockerStatusBadge";
import { BlockerImpactBadge } from "./BlockerImpactBadge";

interface BlockerWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  blockers: Blocker[];
  entityType: "task" | "project";
  entityTitle?: string;
}

export function BlockerWarningModal({
  isOpen,
  onClose,
  onProceed,
  blockers,
  entityType,
  entityTitle,
}: BlockerWarningModalProps) {
  // Count by impact level for summary
  const criticalCount = blockers.filter((b) => b.impact_level === "critical").length;
  const highCount = blockers.filter((b) => b.impact_level === "high").length;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[60]" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-dark-card">
                {/* Warning Header */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 rounded-full bg-yellow-100 p-3 dark:bg-yellow-900/30">
                    <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                      Active Blockers Detected
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {entityTitle ? (
                        <>
                          <span className="font-medium">{entityTitle}</span> has{" "}
                        </>
                      ) : (
                        `This ${entityType} has `
                      )}
                      {blockers.length} active blocker{blockers.length !== 1 ? "s" : ""} that
                      may prevent proper completion.
                    </p>
                  </div>
                </div>

                {/* Impact Summary */}
                {(criticalCount > 0 || highCount > 0) && (
                  <div className="mt-4 flex gap-4 rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
                    {criticalCount > 0 && (
                      <span className="text-sm text-red-700 dark:text-red-400">
                        {criticalCount} Critical
                      </span>
                    )}
                    {highCount > 0 && (
                      <span className="text-sm text-orange-700 dark:text-orange-400">
                        {highCount} High Impact
                      </span>
                    )}
                  </div>
                )}

                {/* Blockers List */}
                <div className="mt-4 max-h-64 overflow-y-auto">
                  <div className="space-y-2">
                    {blockers.map((blocker) => (
                      <div
                        key={blocker.id}
                        className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {blocker.title}
                          </h4>
                          <div className="flex items-center gap-2">
                            <BlockerImpactBadge impact={blocker.impact_level} size="sm" showIcon={false} />
                            <BlockerStatusBadge status={blocker.status} size="sm" showIcon={false} />
                          </div>
                        </div>
                        {blocker.description && (
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                            {typeof blocker.description === "string"
                              ? blocker.description
                              : "Has description"}
                          </p>
                        )}
                        <div className="mt-2 text-xs text-gray-400">
                          Type: {blocker.blocker_type.replace("_", " ")}
                          {blocker.assignee_name && ` | Assigned to: ${blocker.assignee_name}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onProceed();
                      onClose();
                    }}
                    className="rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700"
                  >
                    Proceed Anyway
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export default BlockerWarningModal;
