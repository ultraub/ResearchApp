import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XMarkIcon, ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";
import { ideasService } from "@/services/ideas";
import { projectsService } from "@/services/projects";
import type { Idea } from "@/types";

interface ConvertToTaskModalProps {
  isOpen: boolean;
  idea: Idea | null;
  onClose: () => void;
  onSuccess?: (taskId: string) => void;
}

export function ConvertToTaskModal({
  isOpen,
  idea,
  onClose,
  onSuccess,
}: ConvertToTaskModalProps) {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [initialStatus, setInitialStatus] = useState<"idea" | "todo">("idea");

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects", { status: "active" }],
    queryFn: () => projectsService.list({ status: "active", page_size: 100 }),
    enabled: isOpen,
  });

  const projects = projectsData?.items || [];

  const convertMutation = useMutation({
    mutationFn: () =>
      ideasService.convertToTask(idea!.id, {
        project_id: projectId,
        task_title: taskTitle || undefined,
        initial_status: initialStatus,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
      if (onSuccess && data.converted_to_task_id) {
        onSuccess(data.converted_to_task_id);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (idea && projectId) {
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <ClipboardDocumentCheckIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Convert to Task
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
              Select Project *
            </label>
            {projectsLoading ? (
              <div className="mt-1 flex h-10 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-600" />
              </div>
            ) : projects.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No active projects. Create a project first.
              </p>
            ) : (
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
              >
                <option value="">Select a project...</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Task Title (optional)
            </label>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder={idea.title || "Uses idea content if empty"}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Leave empty to use the idea content as the task title
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              How should this be added?
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-base">
                <input
                  type="radio"
                  name="initialStatus"
                  value="idea"
                  checked={initialStatus === "idea"}
                  onChange={() => setInitialStatus("idea")}
                  className="mt-0.5 h-4 w-4 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    For team review (recommended)
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Appears in Ideas column for voting and scoring before becoming actionable
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-base">
                <input
                  type="radio"
                  name="initialStatus"
                  value="todo"
                  checked={initialStatus === "todo"}
                  onChange={() => setInitialStatus("todo")}
                  className="mt-0.5 h-4 w-4 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Ready for action
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Goes directly to Todo column, skipping team review
                  </p>
                </div>
              </label>
            </div>
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
              disabled={convertMutation.isPending || !projectId || projects.length === 0}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {convertMutation.isPending ? "Converting..." : "Convert to Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
