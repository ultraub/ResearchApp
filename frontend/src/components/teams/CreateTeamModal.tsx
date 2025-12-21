/**
 * CreateTeamModal - Modal for creating a new team
 */

import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { teamsService } from "@/services/teams";
import { useOrganizationStore } from "@/stores/organization";
import { TEAMS_QUERY_KEY } from "@/hooks/useTeams";
import type { TeamCreate } from "@/types";

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (teamId: string) => void;
}

export function CreateTeamModal({ isOpen, onClose, onSuccess }: CreateTeamModalProps) {
  const queryClient = useQueryClient();
  const { organization, refreshTeams } = useOrganizationStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [attachToOrg, setAttachToOrg] = useState(true);

  const createMutation = useMutation({
    mutationFn: (data: TeamCreate) => teamsService.create(data),
    onSuccess: async (team) => {
      // Invalidate all teams-related caches
      queryClient.invalidateQueries({ queryKey: TEAMS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["teams"] });

      // Refresh Zustand store for immediate sync
      await refreshTeams();

      toast.success("Team created successfully");
      resetForm();
      onClose();
      onSuccess?.(team.id);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create team");
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setAttachToOrg(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Team name is required");
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      organization_id: attachToOrg ? organization?.id : null,
    });
  };

  const handleClose = () => {
    resetForm();
    onClose();
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
              <Dialog.Panel className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-dark-card">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-dark-border">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600">
                      <UserGroupIcon className="h-5 w-5 text-white" />
                    </div>
                    <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                      Create Team
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={handleClose}
                    className="rounded p-2 text-gray-400 transition-all hover:bg-gray-100 dark:hover:bg-dark-elevated"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                  <div className="space-y-4 p-6">
                    {/* Team Name */}
                    <div>
                      <label
                        htmlFor="team-name"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        Team Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="team-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Research Team, Marketing"
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white dark:placeholder-gray-500"
                        autoFocus
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label
                        htmlFor="team-description"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        Description
                      </label>
                      <textarea
                        id="team-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What does this team work on?"
                        rows={3}
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white dark:placeholder-gray-500"
                      />
                    </div>

                    {/* Organization toggle */}
                    {organization && (
                      <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-dark-border">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            Attach to organization
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Add this team to {organization.name}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAttachToOrg(!attachToOrg)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                            attachToOrg ? "bg-primary-600" : "bg-gray-200 dark:bg-gray-600"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              attachToOrg ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    )}

                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      You will be the owner of this team and can invite others to join.
                    </p>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-dark-border">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createMutation.isPending || !name.trim()}
                      className="rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 px-4 py-2 text-sm font-medium text-white shadow-soft transition-all hover:shadow-md disabled:opacity-50"
                    >
                      {createMutation.isPending ? "Creating..." : "Create Team"}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
