/**
 * Project Settings Modal - Edit project settings with danger zone
 */

import { useState, useEffect, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import { useNavigate } from "react-router-dom";
import {
  XMarkIcon,
  Cog6ToothIcon,
  ChevronUpDownIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  ArchiveBoxIcon,
  TrashIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import { projectsService, type ProjectUpdateData } from "@/services/projects";
import { teamsService } from "@/services/teams";
import { ProjectTransferModal } from "./ProjectTransferModal";
import type { Project } from "@/types";

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onProjectUpdate?: () => void;
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

const STATUS_OPTIONS: { value: Project["status"]; label: string; color: string }[] = [
  { value: "active", label: "Active", color: "bg-green-100 text-green-700" },
  { value: "on_hold", label: "On Hold", color: "bg-yellow-100 text-yellow-700" },
  { value: "completed", label: "Completed", color: "bg-blue-100 text-blue-700" },
  { value: "archived", label: "Archived", color: "bg-gray-100 text-gray-700" },
];

const VISIBILITY_OPTIONS: { value: Project["visibility"]; label: string; description: string }[] = [
  { value: "private", label: "Private", description: "Only you can access" },
  { value: "team", label: "Team", description: "Team members only" },
  { value: "organization", label: "Organization", description: "Everyone in org" },
];

const PROJECT_TYPES = [
  { value: "research", label: "Research" },
  { value: "experiment", label: "Experiment" },
  { value: "literature_review", label: "Literature Review" },
  { value: "data_analysis", label: "Data Analysis" },
  { value: "writing", label: "Writing" },
  { value: "other", label: "Other" },
];

export function ProjectSettingsModal({
  isOpen,
  onClose,
  project,
  onProjectUpdate,
}: ProjectSettingsModalProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [showScopeChangeConfirm, setShowScopeChangeConfirm] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [pendingScopeChange, setPendingScopeChange] = useState<{
    newScope: Project["visibility"];
    teamId?: string;
  } | null>(null);

  // Determine if this is a personal project
  const isPersonalProject = project.team_is_personal ?? false;

  // Fetch user's teams for team selection when changing scope
  const { data: teamsData } = useQuery({
    queryKey: ["my-teams"],
    queryFn: () => teamsService.list({ page_size: 100 }),
    enabled: isOpen,
  });

  // Filter out personal teams for scope change (only show non-personal teams)
  const availableTeams = (teamsData?.items || []).filter((t) => !t.is_personal);

  // Form state
  const [formData, setFormData] = useState({
    name: project.name,
    description: project.description || "",
    color: project.color || PROJECT_COLORS[0],
    project_type: project.project_type,
    status: project.status,
    visibility: project.visibility,
    start_date: project.start_date || "",
    target_end_date: project.target_end_date || "",
  });

  // Reset form when project changes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: project.name,
        description: project.description || "",
        color: project.color || PROJECT_COLORS[0],
        project_type: project.project_type,
        status: project.status,
        visibility: project.visibility,
        start_date: project.start_date || "",
        target_end_date: project.target_end_date || "",
      });
      setShowDeleteConfirm(false);
      setDeleteConfirmText("");
    }
  }, [isOpen, project]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: ProjectUpdateData) => projectsService.update(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project updated successfully");
      onProjectUpdate?.();
      onClose();
    },
    onError: () => {
      toast.error("Failed to update project");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => projectsService.delete(project.id),
    onSuccess: () => {
      // Invalidate the main projects list
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      // Invalidate the deleted project's own query
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      // If this is a subproject, invalidate the parent's children query
      if (project.parent_id) {
        queryClient.invalidateQueries({ queryKey: ["project", project.parent_id, "children"] });
      }
      toast.success("Project deleted");
      onClose();
      // Navigate to parent project if this was a subproject, otherwise to projects list
      if (project.parent_id) {
        navigate(`/projects/${project.parent_id}`);
      } else {
        navigate("/projects");
      }
    },
    onError: () => {
      toast.error("Failed to delete project");
    },
  });

  // Scope change mutation
  const scopeChangeMutation = useMutation({
    mutationFn: (data: { new_scope: Project["visibility"]; team_id?: string }) =>
      projectsService.changeScope(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project scope updated");
      setShowScopeChangeConfirm(false);
      setPendingScopeChange(null);
      onProjectUpdate?.();
    },
    onError: () => {
      toast.error("Failed to change project scope");
    },
  });

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error("Project name is required");
      return;
    }

    const updates: ProjectUpdateData = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      color: formData.color,
      status: formData.status,
      // Note: visibility/scope changes are handled separately via the scope change dialog
      start_date: formData.start_date || undefined,
      target_end_date: formData.target_end_date || undefined,
    };

    updateMutation.mutate(updates);
  };

  const handleArchive = () => {
    updateMutation.mutate({ status: "archived" });
  };

  const handleDelete = () => {
    if (deleteConfirmText !== project.name) {
      toast.error("Please type the project name to confirm");
      return;
    }
    deleteMutation.mutate();
  };

  const hasChanges =
    formData.name !== project.name ||
    formData.description !== (project.description || "") ||
    formData.color !== (project.color || PROJECT_COLORS[0]) ||
    formData.status !== project.status ||
    formData.start_date !== (project.start_date || "") ||
    formData.target_end_date !== (project.target_end_date || "");
    // Note: visibility/scope changes are handled separately via scope change dialog

  return (
    <>
      <Transition show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={onClose}>
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
                <Dialog.Panel className="w-full max-w-lg rounded-xl bg-white shadow-card dark:bg-dark-card">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-dark-border">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
                        <Cog6ToothIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                      </div>
                      <div>
                        <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                          Project Settings
                        </Dialog.Title>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {project.name}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={onClose}
                      className="rounded p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-elevated"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="max-h-[60vh] overflow-y-auto p-6 space-y-6">
                    {/* General Settings */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                        General
                      </h3>

                      {/* Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Project Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, name: e.target.value }))
                          }
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Description
                        </label>
                        <textarea
                          value={formData.description}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, description: e.target.value }))
                          }
                          rows={3}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white resize-none"
                        />
                      </div>

                      {/* Project Type */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Project Type
                        </label>
                        <select
                          value={formData.project_type}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, project_type: e.target.value }))
                          }
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                        >
                          {PROJECT_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>

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
                              className={clsx(
                                "h-8 w-8 rounded-full transition-transform",
                                formData.color === color
                                  ? "ring-2 ring-offset-2 ring-primary-500 scale-110"
                                  : "hover:scale-110"
                              )}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Status & Dates */}
                    <div className="space-y-4 border-t border-gray-200 pt-6 dark:border-dark-border">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                        Status & Dates
                      </h3>

                      {/* Status */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Status
                        </label>
                        <Listbox
                          value={formData.status}
                          onChange={(value) =>
                            setFormData((prev) => ({ ...prev, status: value }))
                          }
                        >
                          <div className="relative">
                            <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-10 text-left text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated">
                              <span
                                className={clsx(
                                  "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                                  STATUS_OPTIONS.find((s) => s.value === formData.status)?.color
                                )}
                              >
                                {STATUS_OPTIONS.find((s) => s.value === formData.status)?.label}
                              </span>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                              </span>
                            </Listbox.Button>
                            <Transition
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <Listbox.Options className="absolute z-10 mt-1 w-full overflow-auto rounded-xl bg-white py-1 shadow-card ring-1 ring-black/5 dark:ring-white/10 dark:bg-dark-elevated">
                                {STATUS_OPTIONS.map((status) => (
                                  <Listbox.Option
                                    key={status.value}
                                    value={status.value}
                                    className={({ active }) =>
                                      clsx(
                                        "cursor-pointer px-3 py-2",
                                        active && "bg-gray-100 dark:bg-dark-elevated/50"
                                      )
                                    }
                                  >
                                    {({ selected }) => (
                                      <div className="flex items-center justify-between">
                                        <span
                                          className={clsx(
                                            "rounded-full px-2 py-0.5 text-xs font-medium",
                                            status.color
                                          )}
                                        >
                                          {status.label}
                                        </span>
                                        {selected && (
                                          <CheckIcon className="h-4 w-4 text-primary-600" />
                                        )}
                                      </div>
                                    )}
                                  </Listbox.Option>
                                ))}
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </Listbox>
                      </div>

                      {/* Dates */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Start Date
                          </label>
                          <input
                            type="date"
                            value={formData.start_date}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, start_date: e.target.value }))
                            }
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Target End Date
                          </label>
                          <input
                            type="date"
                            value={formData.target_end_date}
                            onChange={(e) =>
                              setFormData((prev) => ({ ...prev, target_end_date: e.target.value }))
                            }
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Visibility */}
                    <div className="space-y-4 border-t border-gray-200 pt-6 dark:border-dark-border">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                        Visibility & Access
                      </h3>

                      {/* Current visibility display with change button */}
                      <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-dark-border">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {VISIBILITY_OPTIONS.find((v) => v.value === project.visibility)?.label}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {VISIBILITY_OPTIONS.find((v) => v.value === project.visibility)?.description}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowScopeChangeConfirm(true)}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-dark-elevated"
                        >
                          <ArrowsRightLeftIcon className="h-4 w-4" />
                          Change
                        </button>
                      </div>

                      {/* Info about current team */}
                      {project.team_name && (
                        <div className="rounded-lg bg-gray-50 p-3 dark:bg-dark-elevated">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {isPersonalProject ? (
                              "This is a personal project. You can invite individual collaborators or promote it to a team project."
                            ) : (
                              <>Current team: <span className="font-medium text-gray-700 dark:text-gray-300">{project.team_name}</span></>
                            )}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Danger Zone */}
                    <div className="space-y-4 border-t border-red-200 pt-6 dark:border-red-900/50">
                      <h3 className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
                        <ExclamationTriangleIcon className="h-4 w-4" />
                        Danger Zone
                      </h3>

                      <div className="space-y-3">
                        {/* Archive */}
                        {project.status !== "archived" && (
                          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-dark-border">
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                Archive this project
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Hide from active projects list
                              </p>
                            </div>
                            <button
                              onClick={handleArchive}
                              disabled={updateMutation.isPending}
                              className="flex items-center gap-1.5 rounded-lg border border-yellow-300 px-3 py-1.5 text-sm font-medium text-yellow-700 hover:bg-yellow-50 dark:border-yellow-700 dark:text-yellow-400 dark:hover:bg-yellow-900/20"
                            >
                              <ArchiveBoxIcon className="h-4 w-4" />
                              Archive
                            </button>
                          </div>
                        )}

                        {/* Transfer (only for non-personal projects) */}
                        {!isPersonalProject && (
                          <div className="flex items-center justify-between rounded-lg border border-orange-200 p-3 dark:border-orange-900/50">
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                Transfer to another team
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Change primary team ownership
                              </p>
                            </div>
                            <button
                              onClick={() => setShowTransferModal(true)}
                              className="flex items-center gap-1.5 rounded-lg border border-orange-300 px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20"
                            >
                              <ArrowsRightLeftIcon className="h-4 w-4" />
                              Transfer
                            </button>
                          </div>
                        )}

                        {/* Delete */}
                        <div className="flex items-center justify-between rounded-lg border border-red-200 p-3 dark:border-red-900/50">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              Delete this project
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Permanently delete all data
                            </p>
                          </div>
                          <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                          >
                            <TrashIcon className="h-4 w-4" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-dark-border">
                    <button
                      onClick={onClose}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!hasChanges || updateMutation.isPending}
                      className="rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 px-4 py-2 text-sm font-medium text-white hover:from-primary-600 hover:to-primary-700 disabled:opacity-50 transition-all"
                    >
                      {updateMutation.isPending ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Delete confirmation dialog */}
      <Transition show={showDeleteConfirm} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setShowDeleteConfirm(false)}
        >
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
                <Dialog.Panel className="w-full max-w-sm rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
                  <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
                    <ExclamationTriangleIcon className="h-6 w-6" />
                    <Dialog.Title className="text-lg font-semibold">
                      Delete Project
                    </Dialog.Title>
                  </div>
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    This action cannot be undone. This will permanently delete the project
                    and all associated data including tasks, documents, and journal entries.
                  </p>
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    Type <span className="font-medium text-gray-900 dark:text-white">{project.name}</span> to confirm:
                  </p>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
                    placeholder="Type project name..."
                  />
                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmText("");
                      }}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleteConfirmText !== project.name || deleteMutation.isPending}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? "Deleting..." : "Delete Project"}
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Scope change dialog */}
      <Transition show={showScopeChangeConfirm} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => {
            setShowScopeChangeConfirm(false);
            setPendingScopeChange(null);
          }}
        >
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
                <Dialog.Panel className="w-full max-w-md rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
                  <Dialog.Title className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                    <ArrowsRightLeftIcon className="h-5 w-5 text-primary-600" />
                    Change Project Scope
                  </Dialog.Title>

                  <div className="mt-4 space-y-4">
                    {/* Scope selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        New Visibility
                      </label>
                      <div className="space-y-2">
                        {VISIBILITY_OPTIONS.map((option) => (
                          <label
                            key={option.value}
                            className={clsx(
                              "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                              pendingScopeChange?.newScope === option.value
                                ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                                : "border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600"
                            )}
                          >
                            <input
                              type="radio"
                              name="scope"
                              value={option.value}
                              checked={pendingScopeChange?.newScope === option.value}
                              onChange={() =>
                                setPendingScopeChange({
                                  newScope: option.value,
                                  teamId: option.value === "private" ? undefined : pendingScopeChange?.teamId,
                                })
                              }
                              className="mt-1"
                            />
                            <div>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {option.label}
                              </span>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {option.description}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Team selection (when changing from personal to team/org) */}
                    {isPersonalProject &&
                      pendingScopeChange?.newScope &&
                      pendingScopeChange.newScope !== "private" && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Select Team
                          </label>
                          {availableTeams.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              You don't have any teams yet.{" "}
                              <a href="/teams" className="text-primary-600 hover:underline">
                                Create a team first
                              </a>
                            </p>
                          ) : (
                            <select
                              value={pendingScopeChange.teamId || ""}
                              onChange={(e) =>
                                setPendingScopeChange({
                                  ...pendingScopeChange,
                                  teamId: e.target.value || undefined,
                                })
                              }
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
                      )}

                    {/* Warning when changing to private */}
                    {pendingScopeChange?.newScope === "private" && !isPersonalProject && (
                      <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 dark:bg-yellow-900/20 dark:border-yellow-800">
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                          <strong>Warning:</strong> Changing to private will remove access for all team members.
                          Only you and explicit project members will retain access.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowScopeChangeConfirm(false);
                        setPendingScopeChange(null);
                      }}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!pendingScopeChange?.newScope) {
                          toast.error("Please select a new scope");
                          return;
                        }
                        if (
                          isPersonalProject &&
                          pendingScopeChange.newScope !== "private" &&
                          !pendingScopeChange.teamId
                        ) {
                          toast.error("Please select a team");
                          return;
                        }
                        scopeChangeMutation.mutate({
                          new_scope: pendingScopeChange.newScope,
                          team_id: pendingScopeChange.teamId,
                        });
                      }}
                      disabled={
                        !pendingScopeChange?.newScope ||
                        scopeChangeMutation.isPending ||
                        (isPersonalProject &&
                          pendingScopeChange?.newScope !== "private" &&
                          !pendingScopeChange?.teamId)
                      }
                      className="rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 px-4 py-2 text-sm font-medium text-white hover:from-primary-600 hover:to-primary-700 disabled:opacity-50 transition-all"
                    >
                      {scopeChangeMutation.isPending ? "Changing..." : "Change Scope"}
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Transfer modal */}
      <ProjectTransferModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        project={project}
        onTransferComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["project", project.id] });
          queryClient.invalidateQueries({ queryKey: ["projects"] });
          onProjectUpdate?.();
        }}
      />
    </>
  );
}
