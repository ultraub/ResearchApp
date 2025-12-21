/**
 * SubmitForReviewButton - Button to submit a task for review
 * Handles the workflow transition from task work to review phase.
 */

import { useState, Fragment } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, Transition } from "@headlessui/react";
import { clsx } from "clsx";
import { tasksService } from "@/services/tasks";
import type { SubmitForReviewRequest, ReviewPriority, ReviewType } from "@/types";
import { REVIEW_PRIORITY_LABELS, REVIEW_TYPE_LABELS } from "@/types";
import {
  PaperAirplaneIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface SubmitForReviewButtonProps {
  taskId: string;
  taskTitle: string;
  canSubmit: boolean;
  blockedReason?: string | null;
  linkedDocumentCount: number;
  onSuccess?: () => void;
  className?: string;
}

export default function SubmitForReviewButton({
  taskId,
  taskTitle,
  canSubmit,
  blockedReason,
  linkedDocumentCount,
  onSuccess,
  className,
}: SubmitForReviewButtonProps) {
  const [open, setOpen] = useState(false);
  const [reviewType, setReviewType] = useState<ReviewType>("approval");
  const [priority, setPriority] = useState<ReviewPriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [autoTransition, setAutoTransition] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);

  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: (data: SubmitForReviewRequest) =>
      tasksService.submitForReview(taskId, data),
    onSuccess: (reviews) => {
      alert(`Created ${reviews.length} review(s) for task "${taskTitle}"`);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
      setOpen(false);
      onSuccess?.();
    },
    onError: (error: Error) => {
      alert(`Failed to submit for review: ${error.message}`);
    },
  });

  const handleSubmit = () => {
    const data: SubmitForReviewRequest = {
      review_type: reviewType,
      priority,
      auto_transition_task: autoTransition,
    };

    if (dueDate) {
      data.due_date = new Date(dueDate).toISOString();
    }

    submitMutation.mutate(data);
  };

  return (
    <>
      <div
        className="relative inline-block"
        onMouseEnter={() => !canSubmit && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <button
          type="button"
          disabled={!canSubmit || submitMutation.isPending}
          onClick={() => canSubmit && setOpen(true)}
          className={clsx(
            "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all shadow-soft hover:shadow-md",
            canSubmit
              ? "bg-gradient-to-br from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              : "cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-dark-elevated",
            className
          )}
        >
          {submitMutation.isPending ? (
            <ArrowPathIcon className="h-4 w-4 animate-spin" />
          ) : (
            <PaperAirplaneIcon className="h-4 w-4" />
          )}
          Submit for Review
        </button>

        {/* Tooltip */}
        {showTooltip && blockedReason && (
          <div className="absolute bottom-full left-1/2 z-10 mb-2 w-48 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-gray-700">
            <div className="flex items-start gap-2">
              <ExclamationCircleIcon className="h-4 w-4 flex-shrink-0 text-yellow-400" />
              <span>{blockedReason}</span>
            </div>
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
          </div>
        )}
      </div>

      <Transition appear show={open} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/25 dark:bg-black/50" />
          </Transition.Child>

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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-xl bg-white p-6 shadow-card transition-all dark:bg-dark-card">
                  <div className="flex items-center justify-between">
                    <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white">
                      Submit Task for Review
                    </Dialog.Title>
                    <button
                      onClick={() => setOpen(false)}
                      className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-700"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    This will create reviews for {linkedDocumentCount} linked document(s)
                    that require review.
                  </p>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label
                        htmlFor="review-type"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        Review Type
                      </label>
                      <select
                        id="review-type"
                        value={reviewType}
                        onChange={(e) => setReviewType(e.target.value as ReviewType)}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      >
                        {Object.entries(REVIEW_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="priority"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        Priority
                      </label>
                      <select
                        id="priority"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as ReviewPriority)}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      >
                        {Object.entries(REVIEW_PRIORITY_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="due-date"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        Due Date (optional)
                      </label>
                      <input
                        type="date"
                        id="due-date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="auto-transition"
                        checked={autoTransition}
                        onChange={(e) => setAutoTransition(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700"
                      />
                      <label
                        htmlFor="auto-transition"
                        className="text-sm text-gray-700 dark:text-gray-300"
                      >
                        Automatically transition task to "In Review" status
                      </label>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50"
                    >
                      {submitMutation.isPending && (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      )}
                      Submit for Review
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
