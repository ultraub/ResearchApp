import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { XMarkIcon, FolderIcon } from "@heroicons/react/24/outline";
import { ideasService } from "@/services/ideas";
import { useTeams } from "@/hooks/useTeams";
import type { Idea } from "@/types";

interface ConvertToProjectModalProps {
  isOpen: boolean;
  idea: Idea | null;
  onClose: () => void;
  onSuccess?: (projectId: string) => void;
}

export function ConvertToProjectModal({
  isOpen,
  idea,
  onClose,
  onSuccess,
}: ConvertToProjectModalProps) {
  const queryClient = useQueryClient();
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState("research");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  // Get teams from hook
  const { teams, currentTeamId, isLoading: teamsLoading } = useTeams();

  // Set default team when teams load or modal opens
  useEffect(() => {
    if (isOpen && currentTeamId && !selectedTeamId) {
      setSelectedTeamId(currentTeamId);
    }
  }, [isOpen, currentTeamId, selectedTeamId]);

  const convertMutation = useMutation({
    mutationFn: () =>
      ideasService.convertToProject(idea!.id, {
        project_name: projectName || idea?.title || "New Project",
        team_id: selectedTeamId,
        project_type: projectType,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
      if (onSuccess && data.converted_to_project_id) {
        onSuccess(data.converted_to_project_id);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (idea) {
      convertMutation.mutate();
    }
  };

  if (!isOpen || !idea) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
              <FolderIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Convert to Project
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-elevated"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 rounded-xl bg-gray-50 p-3 dark:bg-dark-base">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Original Idea
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
            {idea.content}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={idea.title || "Enter project name"}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Project Type
            </label>
            <select
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
            >
              <option value="research">Research</option>
              <option value="clinical">Clinical Study</option>
              <option value="data_analysis">Data Analysis</option>
              <option value="literature_review">Literature Review</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Team *
            </label>
            {teamsLoading ? (
              <div className="mt-1 flex h-10 items-center justify-center rounded-lg border border-gray-300 dark:border-dark-border">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-600" />
              </div>
            ) : teams.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No teams available. Join or create a team first.
              </p>
            ) : (
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
              >
                <option value="">Select a team...</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-elevated dark:text-gray-300 dark:hover:bg-dark-base"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={convertMutation.isPending || !selectedTeamId || teams.length === 0}
              className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {convertMutation.isPending ? "Converting..." : "Convert to Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
