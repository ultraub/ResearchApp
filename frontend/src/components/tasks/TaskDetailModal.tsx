/**
 * Task Detail Modal - Slide-over panel for viewing and editing task details
 */

import { useState, useEffect, Fragment, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, Transition, Tab } from "@headlessui/react";
import {
  XMarkIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  HandThumbUpIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { HandThumbUpIcon as HandThumbUpSolidIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { tasksService, type TaskUpdateData } from "@/services/tasks";
import type { Task, TaskAssignmentCreate } from "@/types";
import { CommentSection } from "./comments";
import TaskDescriptionEditor from "./TaskDescriptionEditor";
import TaskMetadataPanel from "./TaskMetadataPanel";
import TaskDocumentsTab from "./TaskDocumentsTab";
import SubmitForReviewButton from "./SubmitForReviewButton";
import { BlockedBySection, BlockerWarningModal } from "@/components/blockers";
import { blockersService } from "@/services/blockers";
import type { Blocker } from "@/types";

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string | null;
  onTaskUpdate?: (task: Task) => void;
}

const statusOptions = [
  { value: "idea", label: "Idea", color: "bg-amber-400" },
  { value: "todo", label: "To Do", color: "bg-gray-400" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-500" },
  { value: "in_review", label: "In Review", color: "bg-purple-500" },
  { value: "done", label: "Done", color: "bg-green-500" },
] as const;

const priorityOptions = [
  { value: "low", label: "Low", color: "text-gray-500" },
  { value: "medium", label: "Medium", color: "text-blue-500" },
  { value: "high", label: "High", color: "text-orange-500" },
  { value: "urgent", label: "Urgent", color: "text-red-500" },
] as const;

const taskTypeOptions = [
  { value: "general", label: "General", emoji: "📋" },
  { value: "paper_review", label: "Paper Review", emoji: "📄" },
  { value: "data_analysis", label: "Data Analysis", emoji: "📊" },
  { value: "writing", label: "Writing", emoji: "✍️" },
  { value: "meeting", label: "Meeting", emoji: "📅" },
] as const;

export default function TaskDetailModal({
  isOpen,
  onClose,
  taskId,
  onTaskUpdate,
}: TaskDetailModalProps) {
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState(0);
  const [isEditing, setIsEditing] = useState(true);
  const [editedTask, setEditedTask] = useState<Partial<Task>>({});

  // Blocker warning state
  const [showBlockerWarning, setShowBlockerWarning] = useState(false);
  const [activeBlockers, setActiveBlockers] = useState<Blocker[]>([]);
  const [pendingStatusChange, setPendingStatusChange] = useState<string | null>(null);

  // Fetch task details
  const { data: task, isLoading } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => tasksService.get(taskId!),
    enabled: !!taskId && isOpen,
  });

  // Fetch linked documents for review submission
  const { data: linkedDocs = [] } = useQuery({
    queryKey: ["task-documents", taskId],
    queryFn: () => tasksService.getDocuments(taskId!),
    enabled: !!taskId && isOpen,
  });

  // Calculate reviewable documents (deliverable or requires_review)
  const reviewableDocCount = linkedDocs.filter(
    (doc) => doc.link_type === "deliverable" || doc.requires_review
  ).length;
  const canSubmitForReview = reviewableDocCount > 0 && task?.status !== "done" && task?.status !== "in_review";
  const reviewBlockedReason = reviewableDocCount === 0
    ? "No reviewable documents linked"
    : task?.status === "in_review"
    ? "Already in review"
    : task?.status === "done"
    ? "Task is completed"
    : null;

  // Update local state when task loads
  useEffect(() => {
    if (task) {
      setEditedTask({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        task_type: task.task_type,
        due_date: task.due_date,
        tags: task.tags,
        estimated_hours: task.estimated_hours,
        actual_hours: task.actual_hours,
      });
    }
  }, [task]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: TaskUpdateData) => tasksService.update(taskId!, data),
    onSuccess: (updatedTask) => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task updated");
      setIsEditing(false);
      onTaskUpdate?.(updatedTask);
    },
    onError: () => {
      toast.error("Failed to update task");
    },
  });

  // Assignee mutation
  const assigneeMutation = useMutation({
    mutationFn: (data: TaskAssignmentCreate) => tasksService.assignUsers(taskId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Assignees updated");
    },
    onError: () => {
      toast.error("Failed to update assignees");
    },
  });

  // Vote mutation for ideas
  const voteMutation = useMutation({
    mutationFn: async () => {
      if (task?.user_voted) {
        await tasksService.removeVote(taskId!);
      } else {
        await tasksService.vote(taskId!);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: () => {
      toast.error("Failed to update vote");
    },
  });

  // Score mutation for ideas
  const scoreMutation = useMutation({
    mutationFn: (data: { impact_score: number; effort_score: number }) =>
      tasksService.setScore(taskId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Scores updated");
    },
    onError: () => {
      toast.error("Failed to update scores");
    },
  });

  // Convert idea to task mutation
  const convertToTaskMutation = useMutation({
    mutationFn: () => tasksService.convertToTask(taskId!, { target_status: "todo" }),
    onSuccess: (updatedTask) => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Idea converted to task");
      onTaskUpdate?.(updatedTask);
    },
    onError: () => {
      toast.error("Failed to convert idea");
    },
  });

  // Handle assignee changes
  const handleAssigneesChange = useCallback((userIds: string[]) => {
    if (!taskId) return;

    // Get current assignment IDs for users we want to keep
    const currentAssignments = task?.assignments || [];
    const currentUserIds = currentAssignments.map(a => a.user_id);

    // Find users to add (in new list but not in current)
    const usersToAdd = userIds.filter(id => !currentUserIds.includes(id));

    // Find assignments to remove (in current but not in new list)
    const assignmentsToRemove = currentAssignments.filter(a => !userIds.includes(a.user_id));

    // Add new users
    if (usersToAdd.length > 0) {
      assigneeMutation.mutate({ user_ids: usersToAdd, role: "assignee" });
    }

    // Remove users - do this one at a time
    assignmentsToRemove.forEach(assignment => {
      tasksService.removeAssignment(taskId, assignment.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["task", taskId] });
        })
        .catch(err => {
          console.error("Failed to remove assignment:", err);
          toast.error("Failed to remove assignee");
        });
    });
  }, [taskId, task?.assignments, assigneeMutation, queryClient]);

  const handleSave = () => {
    if (!editedTask.title?.trim()) {
      toast.error("Title is required");
      return;
    }
    // Convert description to string if it's an object
    const descriptionValue = typeof editedTask.description === 'object'
      ? JSON.stringify(editedTask.description)
      : editedTask.description;

    updateMutation.mutate({
      title: editedTask.title,
      description: descriptionValue || undefined,
      status: editedTask.status,
      priority: editedTask.priority,
      task_type: editedTask.task_type,
      due_date: editedTask.due_date || undefined,
      tags: editedTask.tags,
      estimated_hours: editedTask.estimated_hours || undefined,
      actual_hours: editedTask.actual_hours || undefined,
    });
  };

  const handleClose = () => {
    setIsEditing(false);
    setSelectedTab(0);
    onClose();
  };

  const handleFieldChange = async (field: string, value: unknown) => {
    setEditedTask((prev) => ({ ...prev, [field]: value }));

    // Check for blockers when completing a task
    if (field === "status" && value === "done" && taskId) {
      try {
        const blockers = await blockersService.getActiveForTask(taskId);
        if (blockers.length > 0) {
          setActiveBlockers(blockers);
          setPendingStatusChange(value as string);
          setShowBlockerWarning(true);
          // Reset the select to current value
          setEditedTask((prev) => ({ ...prev, status: task?.status }));
          return;
        }
      } catch (error) {
        console.error("Failed to check blockers:", error);
      }
    }

    // Auto-save for non-text fields
    if (field !== "title" && field !== "description" && field !== "tags") {
      updateMutation.mutate({ [field]: value });
    }
  };

  const handleProceedWithBlockers = () => {
    if (pendingStatusChange) {
      updateMutation.mutate({ status: pendingStatusChange as "idea" | "todo" | "in_progress" | "in_review" | "done" });
      setPendingStatusChange(null);
    }
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

        {/* Slide-over panel */}
        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-2xl">
                  <div className="flex h-full flex-col bg-white shadow-card dark:bg-dark-base">
                    {/* Header */}
                    <div className="border-b border-gray-200 px-6 py-4 dark:border-dark-border">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {isLoading ? (
                            <div className="h-7 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                          ) : isEditing ? (
                            <input
                              type="text"
                              value={editedTask.title || ""}
                              onChange={(e) =>
                                setEditedTask((prev) => ({
                                  ...prev,
                                  title: e.target.value,
                                }))
                              }
                              className="w-full text-xl font-semibold text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-600 focus:border-primary-500 focus:outline-none"
                              autoFocus
                            />
                          ) : (
                            <Dialog.Title className="text-xl font-semibold text-gray-900 dark:text-white">
                              {task?.title}
                            </Dialog.Title>
                          )}

                          {/* Task type badge */}
                          {task && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-lg">
                                {taskTypeOptions.find(
                                  (t) => t.value === task.task_type
                                )?.emoji || "📋"}
                              </span>
                              <span className="text-sm text-gray-500 dark:text-gray-400">
                                {taskTypeOptions.find(
                                  (t) => t.value === task.task_type
                                )?.label || task.task_type}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => {
                                  setIsEditing(false);
                                  if (task) {
                                    setEditedTask({
                                      title: task.title,
                                      description: task.description,
                                    });
                                  }
                                }}
                                className="rounded-xl px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-elevated transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleSave}
                                disabled={updateMutation.isPending}
                                className="rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 px-3 py-1.5 text-sm text-white shadow-soft hover:from-primary-600 hover:to-primary-700 hover:shadow-md transition-all disabled:opacity-50"
                              >
                                {updateMutation.isPending ? "Saving..." : "Save"}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setIsEditing(true)}
                              className="rounded-xl px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-elevated transition-all"
                            >
                              Edit
                            </button>
                          )}
                          <button
                            onClick={handleClose}
                            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-elevated transition-all"
                          >
                            <XMarkIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto">
                      {isLoading ? (
                        <div className="p-6">
                          <div className="space-y-4">
                            <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                            <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                            <div className="h-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                          </div>
                        </div>
                      ) : task ? (
                        <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
                          <Tab.List className="flex border-b border-gray-200 dark:border-dark-border px-6">
                            <Tab
                              className={({ selected }) =>
                                clsx(
                                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                                  selected
                                    ? "border-primary-500 text-primary-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
                                )
                              }
                            >
                              <DocumentTextIcon className="h-4 w-4" />
                              Details
                            </Tab>
                            <Tab
                              className={({ selected }) =>
                                clsx(
                                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                                  selected
                                    ? "border-primary-500 text-primary-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
                                )
                              }
                            >
                              <ChatBubbleLeftRightIcon className="h-4 w-4" />
                              Comments
                              {task.comment_count != null && task.comment_count > 0 && (
                                <span className="ml-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs dark:bg-gray-700">
                                  {task.comment_count}
                                </span>
                              )}
                            </Tab>
                            <Tab
                              className={({ selected }) =>
                                clsx(
                                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                                  selected
                                    ? "border-primary-500 text-primary-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
                                )
                              }
                            >
                              <DocumentTextIcon className="h-4 w-4" />
                              Documents
                            </Tab>
                          </Tab.List>

                          <Tab.Panels className="p-6">
                            {/* Details Tab */}
                            <Tab.Panel className="space-y-6">
                              {/* Blockers Warning */}
                              <BlockedBySection
                                entityType="task"
                                entityId={task.id}
                                compact={false}
                              />

                              {/* Idea-specific section */}
                              {task.status === "idea" && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-soft dark:border-amber-800 dark:bg-amber-900/20">
                                  <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xl">💡</span>
                                      <h3 className="font-medium text-amber-900 dark:text-amber-100">
                                        Idea
                                      </h3>
                                    </div>
                                    {/* Vote button */}
                                    <button
                                      onClick={() => voteMutation.mutate()}
                                      disabled={voteMutation.isPending}
                                      className={clsx(
                                        "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                                        task.user_voted
                                          ? "bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100"
                                          : "bg-white text-amber-700 hover:bg-amber-100 dark:bg-dark-card dark:text-amber-400 dark:hover:bg-amber-900/30"
                                      )}
                                    >
                                      {task.user_voted ? (
                                        <HandThumbUpSolidIcon className="h-5 w-5" />
                                      ) : (
                                        <HandThumbUpIcon className="h-5 w-5" />
                                      )}
                                      <span>{task.vote_count || 0} votes</span>
                                    </button>
                                  </div>

                                  {/* Impact/Effort scoring */}
                                  <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                      <label className="block text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                                        Impact (1-5)
                                      </label>
                                      <select
                                        value={task.impact_score || ""}
                                        onChange={(e) => {
                                          const impact = e.target.value ? parseInt(e.target.value) : undefined;
                                          if (impact) {
                                            scoreMutation.mutate({
                                              impact_score: impact,
                                              effort_score: task.effort_score || 3,
                                            });
                                          }
                                        }}
                                        className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm dark:border-amber-700 dark:bg-dark-card"
                                      >
                                        <option value="">Not scored</option>
                                        <option value="1">1 - Very Low</option>
                                        <option value="2">2 - Low</option>
                                        <option value="3">3 - Medium</option>
                                        <option value="4">4 - High</option>
                                        <option value="5">5 - Very High</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                                        Effort (1-5)
                                      </label>
                                      <select
                                        value={task.effort_score || ""}
                                        onChange={(e) => {
                                          const effort = e.target.value ? parseInt(e.target.value) : undefined;
                                          if (effort) {
                                            scoreMutation.mutate({
                                              impact_score: task.impact_score || 3,
                                              effort_score: effort,
                                            });
                                          }
                                        }}
                                        className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm dark:border-amber-700 dark:bg-dark-card"
                                      >
                                        <option value="">Not scored</option>
                                        <option value="1">1 - Very Low</option>
                                        <option value="2">2 - Low</option>
                                        <option value="3">3 - Medium</option>
                                        <option value="4">4 - High</option>
                                        <option value="5">5 - Very High</option>
                                      </select>
                                    </div>
                                  </div>

                                  {/* Convert to task button */}
                                  <div className="flex justify-end">
                                    <button
                                      onClick={() => convertToTaskMutation.mutate()}
                                      disabled={convertToTaskMutation.isPending}
                                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                                    >
                                      <ArrowPathIcon className="h-4 w-4" />
                                      {convertToTaskMutation.isPending ? "Converting..." : "Convert to Task"}
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Source Idea section - show when task was created from personal idea */}
                              {task.source_idea && (
                                <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 shadow-soft dark:border-purple-800 dark:bg-purple-900/20">
                                  <div className="flex items-center gap-2 mb-3">
                                    <span className="text-lg">💭</span>
                                    <h3 className="font-medium text-purple-900 dark:text-purple-100">
                                      Created from Personal Idea
                                    </h3>
                                    <span className="ml-auto text-xs text-purple-600 dark:text-purple-400">
                                      {task.source_idea.source}
                                    </span>
                                  </div>
                                  <div className="rounded-lg bg-white/50 dark:bg-dark-card/50 p-3">
                                    {task.source_idea.title && (
                                      <p className="font-medium text-purple-900 dark:text-purple-100 mb-1">
                                        {task.source_idea.title}
                                      </p>
                                    )}
                                    <p className="text-sm text-purple-800 dark:text-purple-200 whitespace-pre-wrap line-clamp-4">
                                      {task.source_idea.content}
                                    </p>
                                    {task.source_idea.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        {task.source_idea.tags.map((tag) => (
                                          <span
                                            key={tag}
                                            className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-800 dark:text-purple-200"
                                          >
                                            #{tag}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Status and Priority Row */}
                              <div className="flex gap-4">
                                {/* Status */}
                                <div className="flex-1">
                                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Status
                                  </label>
                                  <select
                                    value={editedTask.status || task.status}
                                    onChange={(e) =>
                                      handleFieldChange("status", e.target.value)
                                    }
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:text-white dark:border-gray-600 dark:bg-dark-card"
                                  >
                                    {statusOptions.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Priority */}
                                <div className="flex-1">
                                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Priority
                                  </label>
                                  <select
                                    value={editedTask.priority || task.priority}
                                    onChange={(e) =>
                                      handleFieldChange("priority", e.target.value)
                                    }
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:text-white dark:border-gray-600 dark:bg-dark-card"
                                  >
                                    {priorityOptions.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Task Type */}
                                <div className="flex-1">
                                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Type
                                  </label>
                                  <select
                                    value={editedTask.task_type || task.task_type}
                                    onChange={(e) =>
                                      handleFieldChange("task_type", e.target.value)
                                    }
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:text-white dark:border-gray-600 dark:bg-dark-card"
                                  >
                                    {taskTypeOptions.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.emoji} {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {/* Submit for Review Button - only show when task has reviewable docs and is in progress */}
                              {task.status !== "idea" && linkedDocs.length > 0 && (
                                <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-border dark:bg-dark-elevated">
                                  <div>
                                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                                      Document Review
                                    </h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {reviewableDocCount > 0
                                        ? `${reviewableDocCount} document${reviewableDocCount !== 1 ? "s" : ""} ready for review`
                                        : "Link deliverable documents to enable review"}
                                    </p>
                                  </div>
                                  <SubmitForReviewButton
                                    taskId={task.id}
                                    taskTitle={task.title}
                                    canSubmit={canSubmitForReview}
                                    blockedReason={reviewBlockedReason}
                                    linkedDocumentCount={reviewableDocCount}
                                    onSuccess={() => {
                                      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
                                      queryClient.invalidateQueries({ queryKey: ["reviews"] });
                                    }}
                                  />
                                </div>
                              )}

                              {/* Description - Rich Text Editor */}
                              <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                  Description
                                </label>
                                <TaskDescriptionEditor
                                  key={`task-desc-${task.id}`}
                                  content={task.description}
                                  editable={isEditing}
                                  placeholder="Add a description..."
                                  onSave={(content) => {
                                    updateMutation.mutate({ description: JSON.stringify(content) });
                                  }}
                                  onChange={(content) => {
                                    setEditedTask((prev) => ({
                                      ...prev,
                                      description: JSON.stringify(content),
                                    }));
                                  }}
                                  autoSave={true}
                                  autoSaveDelay={1500}
                                  minHeight="150px"
                                />
                              </div>

                              {/* Metadata Panel - Due Date, Time Tracking, Tags, Assignees */}
                              <TaskMetadataPanel
                                task={{
                                  ...task,
                                  due_date: editedTask.due_date ?? task.due_date,
                                  estimated_hours: editedTask.estimated_hours ?? task.estimated_hours,
                                  actual_hours: editedTask.actual_hours ?? task.actual_hours,
                                  tags: editedTask.tags ?? task.tags,
                                }}
                                isEditing={isEditing}
                                onChange={handleFieldChange}
                                onAssigneesChange={handleAssigneesChange}
                              />

                              {/* Metadata */}
                              <div className="border-t border-gray-200 pt-4 dark:border-dark-border">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400">
                                      Created:
                                    </span>{" "}
                                    <span className="text-gray-700 dark:text-gray-300">
                                      {format(new Date(task.created_at), "PPp")}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400">
                                      Updated:
                                    </span>{" "}
                                    <span className="text-gray-700 dark:text-gray-300">
                                      {format(new Date(task.updated_at), "PPp")}
                                    </span>
                                  </div>
                                  {task.completed_at && (
                                    <div className="col-span-2">
                                      <span className="text-gray-500 dark:text-gray-400">
                                        Completed:
                                      </span>{" "}
                                      <span className="text-green-600 dark:text-green-400">
                                        {format(new Date(task.completed_at), "PPp")}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Tab.Panel>

                            {/* Comments Tab */}
                            <Tab.Panel>
                              <CommentSection taskId={task.id} />
                            </Tab.Panel>

                            {/* Documents Tab */}
                            <Tab.Panel>
                              <TaskDocumentsTab task={task} />
                            </Tab.Panel>
                          </Tab.Panels>
                        </Tab.Group>
                      ) : (
                        <div className="p-6 text-center text-gray-500">
                          Task not found
                        </div>
                      )}
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Blocker Warning Modal */}
      <BlockerWarningModal
        isOpen={showBlockerWarning}
        onClose={() => {
          setShowBlockerWarning(false);
          setPendingStatusChange(null);
        }}
        onProceed={handleProceedWithBlockers}
        blockers={activeBlockers}
        entityType="task"
        entityTitle={task?.title}
      />
    </Transition>
  );
}
