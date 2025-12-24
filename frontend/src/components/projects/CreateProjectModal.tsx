/**
 * Create Project Modal component.
 */

import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { X, FolderPlus, ChevronRight } from "lucide-react";
import { projectsService, type ProjectCreateData } from "@/services/projects";
import { useOrganizationStore } from "@/stores/organization";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import toast from "react-hot-toast";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (projectId: string) => void;
  /** Pre-selected parent project ID (for "Create Subproject" mode) */
  defaultParentId?: string;
}

const PROJECT_COLORS = [
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
];

export function CreateProjectModal({
  isOpen,
  onClose,
  onSuccess,
  defaultParentId,
}: CreateProjectModalProps) {
  const queryClient = useQueryClient();
  const { currentTeamId, teams } = useOrganizationStore();
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    visibility: "private" | "team" | "organization";
    color: string;
    emoji: string | null;
    project_type: string;
    parent_id: string | null;
    team_id: string;
  }>({
    name: "",
    description: "",
    visibility: "team",
    color: PROJECT_COLORS[0],
    emoji: null,
    project_type: "research",
    parent_id: defaultParentId || null,
    team_id: currentTeamId || "",
  });

  // Update team_id when currentTeamId changes
  useEffect(() => {
    if (isOpen && currentTeamId && !formData.team_id) {
      setFormData((prev) => ({ ...prev, team_id: currentTeamId }));
    }
  }, [isOpen, currentTeamId]);

  // Fetch parent project to inherit its team_id for subprojects
  const { data: parentProject } = useQuery({
    queryKey: ["project", defaultParentId],
    queryFn: () => projectsService.get(defaultParentId!),
    enabled: isOpen && !!defaultParentId,
  });

  // Update parent_id and inherit team_id when defaultParentId changes
  useEffect(() => {
    if (isOpen && defaultParentId) {
      setFormData((prev) => ({ ...prev, parent_id: defaultParentId }));
    }
  }, [isOpen, defaultParentId]);

  // When parent project loads, inherit its team_id
  useEffect(() => {
    if (parentProject?.team_id) {
      setFormData((prev) => ({ ...prev, team_id: parentProject.team_id }));
    }
  }, [parentProject?.team_id]);

  // Fetch available parent projects (top-level projects only)
  const { data: parentProjectsData } = useQuery({
    queryKey: ["projects", "top-level", currentTeamId],
    queryFn: () =>
      currentTeamId ? projectsService.getTopLevelProjects(currentTeamId) : null,
    enabled: isOpen && !!currentTeamId,
  });

  const availableParentProjects = parentProjectsData?.items || [];

  const createMutation = useMutation({
    mutationFn: (data: ProjectCreateData) => projectsService.create(data),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project created successfully!");
      onClose();
      resetForm();
      if (onSuccess) {
        onSuccess(project.id);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create project");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      visibility: "team",
      color: PROJECT_COLORS[0],
      emoji: null,
      project_type: "research",
      parent_id: defaultParentId || null,
      team_id: currentTeamId || "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Project name is required");
      return;
    }

    if (!formData.team_id) {
      toast.error("Please select a team for this project.");
      return;
    }

    createMutation.mutate({
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      visibility: formData.visibility,
      color: formData.color,
      emoji: formData.emoji || undefined,
      project_type: formData.project_type,
      team_id: formData.team_id,
      parent_id: formData.parent_id || undefined,
    });
  };

  const handleClose = () => {
    if (!createMutation.isPending) {
      resetForm();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-dark-card rounded-xl shadow-card w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
              <FolderPlus className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {formData.parent_id ? "Create Subproject" : "Create New Project"}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formData.parent_id
                  ? "Add a subproject to organize your work"
                  : "Start a new research project"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={createMutation.isPending}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Project Name */}
          <div>
            <label
              htmlFor="project-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              id="project-name"
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., Machine Learning Study"
              className="w-full border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 bg-white dark:bg-dark-elevated text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="project-description"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Description
            </label>
            <textarea
              id="project-description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Describe your research project..."
              rows={3}
              className="w-full border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 bg-white dark:bg-dark-elevated text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
            />
          </div>

          {/* Team Selection - disabled for subprojects (inherit from parent) */}
          <div>
            <label
              htmlFor="project-team"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Team <span className="text-red-500">*</span>
            </label>
            <select
              id="project-team"
              value={formData.team_id}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, team_id: e.target.value }))
              }
              disabled={!!defaultParentId}
              className="w-full border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 bg-white dark:bg-dark-elevated text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-dark-elevated dark:disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              <option value="">Select a team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            {defaultParentId && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Subprojects inherit the team from their parent project
              </p>
            )}
          </div>

          {/* Parent Project (Optional - for creating subprojects) */}
          <div>
            <label
              htmlFor="parent-project"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Parent Project{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              id="parent-project"
              value={formData.parent_id || ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  parent_id: e.target.value || null,
                }))
              }
              className="w-full border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 bg-white dark:bg-dark-elevated text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              disabled={!!defaultParentId}
            >
              <option value="">None (Top-level project)</option>
              {availableParentProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            {formData.parent_id && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                This will be a subproject of the selected parent
              </p>
            )}
          </div>

          {/* Project Type */}
          <div>
            <label
              htmlFor="project-type"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Project Type
            </label>
            <select
              id="project-type"
              value={formData.project_type}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, project_type: e.target.value }))
              }
              className="w-full border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 bg-white dark:bg-dark-elevated text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="research">Research</option>
              <option value="experiment">Experiment</option>
              <option value="literature_review">Literature Review</option>
              <option value="data_analysis">Data Analysis</option>
              <option value="writing">Writing</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Visibility */}
          <div>
            <label
              htmlFor="project-visibility"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Visibility
            </label>
            <select
              id="project-visibility"
              value={formData.visibility}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  visibility: e.target.value as "private" | "team" | "organization",
                }))
              }
              className="w-full border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 bg-white dark:bg-dark-elevated text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="private">Private - Only you</option>
              <option value="team">Team - Team members only</option>
              <option value="organization">Organization - Everyone in org</option>
            </select>
          </div>

          {/* Color and Emoji */}
          <div className="grid grid-cols-2 gap-4">
            {/* Color */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Color
              </label>
              <div className="flex flex-wrap gap-2">
                {PROJECT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, color }))}
                    className={`h-8 w-8 rounded-full transition-transform ${
                      formData.color === color
                        ? "ring-2 ring-offset-2 ring-primary-500 scale-110"
                        : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>
            </div>

            {/* Emoji Icon */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Icon{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <EmojiPicker
                value={formData.emoji}
                onChange={(emoji) =>
                  setFormData((prev) => ({ ...prev, emoji }))
                }
              />
              {formData.emoji && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Emoji will be shown instead of folder icon
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
            <button
              type="button"
              onClick={handleClose}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-elevated border border-gray-200 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-elevated/80 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !formData.name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg hover:from-primary-600 hover:to-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all shadow-soft"
            >
              {createMutation.isPending ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating...
                </>
              ) : (
                <>
                  <FolderPlus className="h-4 w-4" />
                  {formData.parent_id ? "Create Subproject" : "Create Project"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
