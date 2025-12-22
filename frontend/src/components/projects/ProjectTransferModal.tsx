/**
 * ProjectTransferModal - Transfer project ownership to a different team
 */

import { useState, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, Transition } from "@headlessui/react";
import {
  XMarkIcon,
  ArrowsRightLeftIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { projectsService } from "@/services/projects";
import { teamsService } from "@/services/teams";
import type { Project } from "@/types";

interface ProjectTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onTransferComplete?: () => void;
}

export function ProjectTransferModal({
  isOpen,
  onClose,
  project,
  onTransferComplete,
}: ProjectTransferModalProps) {
  const queryClient = useQueryClient();
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [confirmText, setConfirmText] = useState("");

  // Fetch user's teams
  const { data: teamsData } = useQuery({
    queryKey: ["my-teams"],
    queryFn: () => teamsService.list({ page_size: 100 }),
    enabled: isOpen,
  });

  // Filter out current team and personal teams
  const availableTeams = (teamsData?.items || []).filter(
    (t) => !t.is_personal && t.id !== project.team_id
  );

  // Get selected team info
  const selectedTeam = availableTeams.find((t) => t.id === selectedTeamId);

  // Transfer mutation
  const transferMutation = useMutation({
    mutationFn: (teamId: string) => projectsService.transferToTeam(project.id, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project transferred successfully");
      onTransferComplete?.();
      handleClose();
    },
    onError: () => {
      toast.error("Failed to transfer project");
    },
  });

  const handleClose = () => {
    setSelectedTeamId("");
    setConfirmText("");
    onClose();
  };

  const handleTransfer = () => {
    if (!selectedTeamId) {
      toast.error("Please select a team");
      return;
    }
    if (confirmText !== project.name) {
      toast.error("Please type the project name to confirm");
      return;
    }
    transferMutation.mutate(selectedTeamId);
  };

  const isValid =
    selectedTeamId && confirmText === project.name && !transferMutation.isPending;

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
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                      <ArrowsRightLeftIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                        Transfer Project
                      </Dialog.Title>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {project.name}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="rounded p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-elevated"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                  {/* Warning */}
                  <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 dark:bg-orange-900/20 dark:border-orange-800">
                    <div className="flex items-start gap-2">
                      <ExclamationTriangleIcon className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-orange-800 dark:text-orange-300">
                          This action will change project ownership
                        </p>
                        <p className="text-xs text-orange-700 dark:text-orange-400 mt-1">
                          The new team will become the primary owner. Current team members may
                          lose access unless they're also members of the new team.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Current team info */}
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-dark-elevated">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Current team</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                      {project.team_name || "Unknown team"}
                    </p>
                  </div>

                  {/* Team selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Transfer to team
                    </label>
                    {availableTeams.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No other teams available.{" "}
                        <a href="/teams" className="text-primary-600 hover:underline">
                          Create a new team
                        </a>{" "}
                        or join an existing one.
                      </p>
                    ) : (
                      <select
                        value={selectedTeamId}
                        onChange={(e) => setSelectedTeamId(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                      >
                        <option value="">Select a team...</option>
                        {availableTeams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Selected team info */}
                  {selectedTeam && (
                    <div className="rounded-lg bg-primary-50 p-3 dark:bg-primary-900/20">
                      <p className="text-xs text-primary-600 dark:text-primary-400">
                        New team
                      </p>
                      <p className="text-sm font-medium text-primary-900 dark:text-primary-100 mt-1">
                        {selectedTeam.name}
                      </p>
                      {selectedTeam.description && (
                        <p className="text-xs text-primary-700 dark:text-primary-300 mt-1">
                          {selectedTeam.description}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Confirmation */}
                  {selectedTeamId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Type <span className="font-semibold">{project.name}</span> to confirm
                      </label>
                      <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="Type project name..."
                        className={clsx(
                          "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1",
                          confirmText === project.name
                            ? "border-green-500 focus:border-green-500 focus:ring-green-500"
                            : "border-gray-200 focus:border-primary-500 focus:ring-primary-500 dark:border-dark-border",
                          "dark:bg-dark-elevated dark:text-white"
                        )}
                      />
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-dark-border">
                  <button
                    onClick={handleClose}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleTransfer}
                    disabled={!isValid}
                    className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 transition-all"
                  >
                    {transferMutation.isPending ? "Transferring..." : "Transfer Project"}
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

export default ProjectTransferModal;
