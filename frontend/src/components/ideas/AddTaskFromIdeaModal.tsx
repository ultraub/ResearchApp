/**
 * Add Task From Idea Modal
 * Creates a task in a project based on an idea WITHOUT converting the idea.
 * The idea remains active and can be referenced later.
 */

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XMarkIcon, PlusIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { tasksService, type TaskCreateData } from "@/services/tasks";
import { projectsService } from "@/services/projects";
import type { Idea } from "@/types";

interface AddTaskFromIdeaModalProps {
  isOpen: boolean;
  idea: Idea | null;
  onClose: () => void;
  onSuccess?: (taskId: string) => void;
}

const priorityOptions = [
  { value: "low", label: "Low", color: "text-gray-600" },
  { value: "medium", label: "Medium", color: "text-blue-600" },
  { value: "high", label: "High", color: "text-orange-600" },
  { value: "urgent", label: "Urgent", color: "text-red-600" },
] as const;

export function AddTaskFromIdeaModal({
  isOpen,
  idea,
  onClose,
  onSuccess,
}: AddTaskFromIdeaModalProps) {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [includeIdeaContent, setIncludeIdeaContent] = useState(true);

  // Fetch active projects
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects", { status: "active" }],
    queryFn: () => projectsService.list({ status: "active", page_size: 100 }),
    enabled: isOpen,
  });

  const projects = projectsData?.items || [];

  // Pre-fill task title when idea changes
  useEffect(() => {
    if (idea && isOpen) {
      setTaskTitle(idea.title || idea.content.slice(0, 100));
    }
  }, [idea, isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setProjectId("");
      setTaskTitle("");
      setPriority("medium");
      setIncludeIdeaContent(true);
    }
  }, [isOpen]);

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async () => {
      // Build task description
      let description = "";
      if (includeIdeaContent) {
        description = idea!.content;
        if (idea!.tags.length > 0) {
          description += `\n\nTags: ${idea!.tags.map((t) => `#${t}`).join(" ")}`;
        }
      }
      description += `\n\n---\n_Created from idea: ${idea!.id}_`;

      const taskData: TaskCreateData = {
        title: taskTitle,
        description,
        project_id: projectId,
        priority,
        status: "todo",
      };

      return tasksService.create(taskData);
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Task created successfully");
      onClose();
      if (onSuccess) {
        onSuccess(task.id);
      }
    },
    onError: () => {
      toast.error("Failed to create task");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (idea && projectId && taskTitle) {
      createTaskMutation.mutate();
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
              <PlusIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Add Task to Project
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Creates a task without converting the idea
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-elevated"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Original Idea Preview */}
        <div className="mb-4 rounded-xl bg-gray-50 p-3 dark:bg-dark-base">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            From Idea
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
            {idea.title || idea.content}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Project *
            </label>
            {projectsLoading ? (
              <div className="mt-1 flex h-10 items-center justify-center rounded-lg border border-gray-300 dark:border-dark-border">
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

          {/* Task Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Task Title *
            </label>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Enter task title"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
            >
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Include idea content */}
          <div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={includeIdeaContent}
                onChange={(e) => setIncludeIdeaContent(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Include idea content in task description
            </label>
          </div>

          {/* Actions */}
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
              disabled={createTaskMutation.isPending || !projectId || !taskTitle || projects.length === 0}
              className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {createTaskMutation.isPending ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddTaskFromIdeaModal;
