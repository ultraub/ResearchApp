/**
 * TeamSettingsModal - Team settings and danger zone
 */

import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon, Cog6ToothIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { teamsService } from "@/services/teams";
import type { TeamDetail, TeamUpdate } from "@/types";

interface TeamSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: TeamDetail;
}

export function TeamSettingsModal({ isOpen, onClose, team }: TeamSettingsModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description || "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const isOwner = team.current_user_role === "owner";

  // Update team mutation
  const updateMutation = useMutation({
    mutationFn: (data: TeamUpdate) => teamsService.update(team.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["team", team.id] });
      toast.success("Team updated successfully");
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update team");
    },
  });

  // Delete team mutation
  const deleteMutation = useMutation({
    mutationFn: () => teamsService.delete(team.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      toast.success("Team deleted");
      onClose();
      navigate("/teams");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete team");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Team name is required");
      return;
    }

    updateMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
    });
  };

  const handleDelete = () => {
    if (deleteConfirmText !== team.name) {
      toast.error("Please type the team name to confirm");
      return;
    }
    deleteMutation.mutate();
  };

  const handleClose = () => {
    setName(team.name);
    setDescription(team.description || "");
    setShowDeleteConfirm(false);
    setDeleteConfirmText("");
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
                      <Cog6ToothIcon className="h-5 w-5 text-white" />
                    </div>
                    <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                      Team Settings
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={handleClose}
                    className="rounded p-2 text-gray-400 transition-all hover:bg-gray-100 dark:hover:bg-dark-elevated"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6">
                  {!showDeleteConfirm ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {/* Team Name */}
                      <div>
                        <label
                          htmlFor="team-name"
                          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          Team Name
                        </label>
                        <input
                          id="team-name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
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
                          rows={3}
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                        />
                      </div>

                      {/* Save button */}
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={updateMutation.isPending}
                          className="rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 px-4 py-2 text-sm font-medium text-white shadow-soft transition-all hover:shadow-md disabled:opacity-50"
                        >
                          {updateMutation.isPending ? "Saving..." : "Save Changes"}
                        </button>
                      </div>

                      {/* Danger Zone */}
                      {isOwner && (
                        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                            <ExclamationTriangleIcon className="h-5 w-5" />
                            <h4 className="font-medium">Danger Zone</h4>
                          </div>
                          <p className="mt-2 text-sm text-red-600 dark:text-red-300">
                            Deleting this team will remove all members from the team. Projects will
                            remain but will no longer be associated with this team.
                          </p>
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="mt-3 rounded-lg border border-red-600 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-900/30"
                          >
                            Delete Team
                          </button>
                        </div>
                      )}
                    </form>
                  ) : (
                    /* Delete confirmation */
                    <div className="space-y-4">
                      <div className="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
                        <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                          <ExclamationTriangleIcon className="h-5 w-5" />
                          <h4 className="font-medium">Confirm Deletion</h4>
                        </div>
                        <p className="mt-2 text-sm text-red-600 dark:text-red-300">
                          This action cannot be undone. Type <strong>{team.name}</strong> to confirm.
                        </p>
                      </div>

                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="Type team name to confirm"
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                      />

                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeleteConfirmText("");
                          }}
                          className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDelete}
                          disabled={deleteConfirmText !== team.name || deleteMutation.isPending}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-soft transition-all hover:bg-red-700 hover:shadow-md disabled:opacity-50"
                        >
                          {deleteMutation.isPending ? "Deleting..." : "Delete Team"}
                        </button>
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
