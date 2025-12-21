/**
 * JoinModal - Enter invite code to join a team/organization
 */

import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon, TicketIcon, UserGroupIcon, BuildingOffice2Icon } from "@heroicons/react/24/outline";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { invitationsService } from "@/services/invitations";
import type { InvitePreview } from "@/types";

interface JoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
}

export function JoinModal({ isOpen, onClose, initialCode = "" }: JoinModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Preview invite mutation
  const handlePreview = async () => {
    if (!code.trim()) {
      toast.error("Please enter an invite code");
      return;
    }

    setIsLoadingPreview(true);
    try {
      const result = await invitationsService.preview(code.trim().toUpperCase());
      setPreview(result);
    } catch {
      toast.error("Invalid invite code");
      setPreview(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Join mutation
  const joinMutation = useMutation({
    mutationFn: (inviteCode: string) => invitationsService.join(inviteCode),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success(`Successfully joined ${result.name}!`);
      handleClose();

      // Navigate to the team/org
      if (result.type === "team") {
        navigate(`/teams/${result.id}`);
      } else {
        navigate(`/organizations/${result.id}`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to join");
    },
  });

  const handleJoin = () => {
    if (!preview?.is_valid) return;
    joinMutation.mutate(code.trim().toUpperCase());
  };

  const handleClose = () => {
    setCode(initialCode);
    setPreview(null);
    onClose();
  };

  const handleCodeChange = (value: string) => {
    // Auto-uppercase and limit to valid characters
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    setCode(cleaned);
    // Clear preview when code changes
    if (preview) setPreview(null);
  };

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
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
              <Dialog.Panel className="w-full max-w-md rounded-xl bg-white shadow-card dark:bg-dark-card">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-dark-border">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
                      <TicketIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                    </div>
                    <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                      Join with Invite Code
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={handleClose}
                    className="rounded p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-elevated"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6">
                  {!preview ? (
                    <div className="space-y-4">
                      <div>
                        <label
                          htmlFor="invite-code"
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          Invite Code
                        </label>
                        <input
                          id="invite-code"
                          type="text"
                          value={code}
                          onChange={(e) => handleCodeChange(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handlePreview()}
                          placeholder="e.g., TM-X8B2P4"
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center font-mono text-lg uppercase tracking-wider placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white dark:placeholder-gray-500"
                          autoFocus
                        />
                      </div>

                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Enter the invite code you received to preview and join a team or organization.
                      </p>

                      <button
                        onClick={handlePreview}
                        disabled={!code.trim() || isLoadingPreview}
                        className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {isLoadingPreview ? "Checking..." : "Check Invite"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Preview card */}
                      <div
                        className={clsx(
                          "rounded-lg border p-4",
                          preview.is_valid
                            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                            : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={clsx(
                              "flex h-12 w-12 items-center justify-center rounded-lg",
                              preview.is_valid
                                ? "bg-green-100 dark:bg-green-900/30"
                                : "bg-red-100 dark:bg-red-900/30"
                            )}
                          >
                            {preview.type === "team" ? (
                              <UserGroupIcon
                                className={clsx(
                                  "h-6 w-6",
                                  preview.is_valid
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                                )}
                              />
                            ) : (
                              <BuildingOffice2Icon
                                className={clsx(
                                  "h-6 w-6",
                                  preview.is_valid
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                                )}
                              />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {preview.name}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {preview.type === "team" ? "Team" : "Organization"} • Join as{" "}
                              <span className="capitalize font-medium">{preview.role}</span>
                            </p>
                          </div>
                        </div>

                        {!preview.is_valid && preview.error && (
                          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                            {preview.error}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setPreview(null);
                            setCode("");
                          }}
                          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:text-gray-300 dark:hover:bg-dark-elevated"
                        >
                          Try Another
                        </button>
                        {preview.is_valid && (
                          <button
                            onClick={handleJoin}
                            disabled={joinMutation.isPending}
                            className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                          >
                            {joinMutation.isPending ? "Joining..." : "Join Now"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
