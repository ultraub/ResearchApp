/**
 * CreateTeamModal - Modal for creating a new team
 */

import { Fragment, useState, useEffect } from "react";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import { XMarkIcon, UserGroupIcon, ChevronUpDownIcon, CheckIcon, BuildingOfficeIcon } from "@heroicons/react/24/outline";
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
  const { organization, organizations, refreshTeams } = useOrganizationStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(organization?.id || null);

  // Update selected org when current organization changes
  useEffect(() => {
    if (organization && !selectedOrgId) {
      setSelectedOrgId(organization.id);
    }
  }, [organization, selectedOrgId]);

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
    setSelectedOrgId(organization?.id || null);
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
      organization_id: selectedOrgId,
    });
  };

  // Get selected organization for display
  const selectedOrg = selectedOrgId ? organizations.find(o => o.id === selectedOrgId) : null;

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

                    {/* Organization Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Organization
                      </label>
                      <Listbox value={selectedOrgId} onChange={setSelectedOrgId}>
                        <div className="relative mt-1">
                          <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-left focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated">
                            <span className="flex items-center gap-2">
                              <BuildingOfficeIcon className="h-4 w-4 text-gray-400" />
                              <span className="block truncate text-sm text-gray-900 dark:text-white">
                                {selectedOrg ? selectedOrg.name : "No organization (standalone)"}
                              </span>
                            </span>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                              <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                            </span>
                          </Listbox.Button>
                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                          >
                            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-dark-elevated">
                              {/* No organization option */}
                              <Listbox.Option
                                value={null}
                                className={({ active }) =>
                                  `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                    active ? "bg-primary-50 text-primary-900 dark:bg-primary-900/20 dark:text-primary-100" : "text-gray-900 dark:text-white"
                                  }`
                                }
                              >
                                {({ selected }) => (
                                  <>
                                    <span className={`block truncate ${selected ? "font-medium" : "font-normal"}`}>
                                      No organization (standalone)
                                    </span>
                                    {selected && (
                                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600 dark:text-primary-400">
                                        <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                      </span>
                                    )}
                                  </>
                                )}
                              </Listbox.Option>
                              {/* Organization options */}
                              {organizations.map((org) => (
                                <Listbox.Option
                                  key={org.id}
                                  value={org.id}
                                  className={({ active }) =>
                                    `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                                      active ? "bg-primary-50 text-primary-900 dark:bg-primary-900/20 dark:text-primary-100" : "text-gray-900 dark:text-white"
                                    }`
                                  }
                                >
                                  {({ selected }) => (
                                    <>
                                      <span className={`block truncate ${selected ? "font-medium" : "font-normal"}`}>
                                        {org.name}
                                      </span>
                                      {selected && (
                                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600 dark:text-primary-400">
                                          <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                        </span>
                                      )}
                                    </>
                                  )}
                                </Listbox.Option>
                              ))}
                            </Listbox.Options>
                          </Transition>
                        </div>
                      </Listbox>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {selectedOrg
                          ? `This team will be part of ${selectedOrg.name}`
                          : "This team will not belong to any organization"
                        }
                      </p>
                    </div>

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
