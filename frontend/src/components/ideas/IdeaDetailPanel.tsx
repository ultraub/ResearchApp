/**
 * Idea Detail Panel - Slide-over panel for viewing and editing ideas
 */

import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, Transition } from "@headlessui/react";
import {
  XMarkIcon,
  TagIcon,
  BookmarkIcon,
  ArchiveBoxIcon,
  TrashIcon,
  FolderPlusIcon,
  ClipboardDocumentListIcon,
  PlusIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolidIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import { format, formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";
import { ideasService } from "@/services/ideas";
import type { Idea } from "@/types";
import OwnerDisplay from "@/components/common/OwnerDisplay";

interface IdeaDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  ideaId: string | null;
  onIdeaChange?: () => void;
  onConvertToProject?: (idea: Idea) => void;
  onConvertToTask?: (idea: Idea) => void;
  onAddTask?: (idea: Idea) => void;
}

const statusOptions = [
  { value: "captured", label: "Captured", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { value: "reviewed", label: "Reviewed", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "converted", label: "Converted", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { value: "archived", label: "Archived", color: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400" },
] as const;

const sourceLabels: Record<string, string> = {
  web: "Web",
  mobile: "Mobile",
  voice: "Voice",
  api: "API",
};

export default function IdeaDetailPanel({
  isOpen,
  onClose,
  ideaId,
  onIdeaChange,
  onConvertToProject,
  onConvertToTask,
  onAddTask,
}: IdeaDetailPanelProps) {
  const queryClient = useQueryClient();

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch idea
  const { data: idea, isLoading } = useQuery({
    queryKey: ["idea", ideaId],
    queryFn: () => ideasService.get(ideaId!),
    enabled: !!ideaId && isOpen,
  });

  // Populate form when idea loads
  useEffect(() => {
    if (idea && isOpen) {
      setTitle(idea.title || "");
      setContent(idea.content || "");
      setTags(idea.tags || []);
      setHasChanges(false);
    }
  }, [idea, isOpen]);

  // Reset form when panel closes
  useEffect(() => {
    if (!isOpen) {
      setTitle("");
      setContent("");
      setTags([]);
      setTagInput("");
      setHasChanges(false);
    }
  }, [isOpen]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: { title?: string; content?: string; tags?: string[]; status?: Idea["status"] }) =>
      ideasService.update(ideaId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["idea", ideaId] });
      toast.success("Idea updated");
      setHasChanges(false);
      onIdeaChange?.();
    },
    onError: () => {
      toast.error("Failed to update idea");
    },
  });

  // Pin mutation
  const pinMutation = useMutation({
    mutationFn: () => ideasService.togglePin(ideaId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["idea", ideaId] });
      onIdeaChange?.();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => ideasService.delete(ideaId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      toast.success("Idea deleted");
      onIdeaChange?.();
      onClose();
    },
    onError: () => {
      toast.error("Failed to delete idea");
    },
  });

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: () => ideasService.update(ideaId!, { status: "archived" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["idea", ideaId] });
      toast.success("Idea archived");
      onIdeaChange?.();
    },
    onError: () => {
      toast.error("Failed to archive idea");
    },
  });

  const handleSave = () => {
    if (!hasChanges) return;

    updateMutation.mutate({
      title: title || undefined,
      content,
      tags,
    });
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setHasChanges(true);
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    setHasChanges(true);
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      const newTags = [...tags, tag];
      setTags(newTags);
      setTagInput("");
      setHasChanges(true);
    }
  };

  const handleRemoveTag = (tag: string) => {
    const newTags = tags.filter((t) => t !== tag);
    setTags(newTags);
    setHasChanges(true);
  };

  const handleStatusChange = (status: Idea["status"]) => {
    updateMutation.mutate({ status });
  };

  const handleClose = () => {
    if (hasChanges) {
      // Auto-save on close with user feedback
      toast.loading("Saving changes...", { id: "auto-save" });
      updateMutation.mutate(
        { title: title || undefined, content, tags },
        {
          onSuccess: () => {
            toast.success("Changes saved", { id: "auto-save" });
            setHasChanges(false);
            onClose();
          },
          onError: () => {
            toast.error("Failed to save changes", { id: "auto-save" });
            // Still close but user knows save failed
            onClose();
          },
        }
      );
    } else {
      onClose();
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
                      <div className="flex items-center justify-between">
                        <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                          {idea?.title || "Idea"}
                        </Dialog.Title>
                        <div className="flex items-center gap-2">
                          {/* Pin button */}
                          <button
                            onClick={() => pinMutation.mutate()}
                            className={clsx(
                              "rounded p-2 transition-colors",
                              idea?.is_pinned
                                ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                            )}
                            title={idea?.is_pinned ? "Unpin" : "Pin"}
                          >
                            {idea?.is_pinned ? (
                              <BookmarkSolidIcon className="h-5 w-5" />
                            ) : (
                              <BookmarkIcon className="h-5 w-5" />
                            )}
                          </button>

                          {/* Archive button */}
                          {idea?.status !== "archived" && (
                            <button
                              onClick={() => archiveMutation.mutate()}
                              className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-elevated"
                              title="Archive"
                            >
                              <ArchiveBoxIcon className="h-5 w-5" />
                            </button>
                          )}

                          {/* Delete button */}
                          <button
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this idea?")) {
                                deleteMutation.mutate();
                              }
                            }}
                            className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-dark-elevated"
                            title="Delete"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>

                          {/* Close button */}
                          <button
                            onClick={handleClose}
                            className="rounded p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-elevated"
                          >
                            <XMarkIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      {/* Status and metadata row */}
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        {/* Status selector */}
                        <div className="flex items-center gap-2">
                          {statusOptions.map((status) => (
                            <button
                              key={status.value}
                              onClick={() => handleStatusChange(status.value)}
                              disabled={status.value === "converted" && idea?.status !== "converted"}
                              className={clsx(
                                "rounded-full px-3 py-1 text-xs font-medium transition-all",
                                idea?.status === status.value
                                  ? status.color + " ring-2 ring-offset-1 ring-gray-400"
                                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-dark-elevated dark:text-gray-400 dark:hover:bg-dark-base",
                                status.value === "converted" && idea?.status !== "converted" && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              {status.label}
                            </button>
                          ))}
                        </div>

                        {/* Source badge */}
                        {idea?.source && (
                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-dark-elevated dark:text-gray-400">
                            {sourceLabels[idea.source] || idea.source}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {isLoading ? (
                        <div className="space-y-4">
                          <div className="h-10 animate-pulse rounded bg-gray-200 dark:bg-dark-elevated" />
                          <div className="h-64 animate-pulse rounded bg-gray-200 dark:bg-dark-elevated" />
                        </div>
                      ) : (
                        <>
                          {/* Title */}
                          <input
                            type="text"
                            value={title}
                            onChange={(e) => handleTitleChange(e.target.value)}
                            placeholder="Add a title (optional)"
                            className="w-full border-b border-gray-200 bg-transparent py-2 text-xl font-semibold text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none dark:border-dark-border dark:text-white"
                          />

                          {/* Content */}
                          <div className="space-y-2">
                            <textarea
                              value={content}
                              onChange={(e) => handleContentChange(e.target.value)}
                              placeholder="Write your idea..."
                              rows={12}
                              className="w-full resize-none rounded-xl border border-gray-200 bg-transparent p-4 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:text-white"
                            />
                          </div>

                          {/* Tags */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                              <TagIcon className="h-4 w-4" />
                              <span>Tags</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-sm dark:bg-dark-elevated"
                                >
                                  #{tag}
                                  <button
                                    onClick={() => handleRemoveTag(tag)}
                                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                  >
                                    <XMarkIcon className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                              <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === ",") {
                                    e.preventDefault();
                                    handleAddTag();
                                  }
                                }}
                                onBlur={handleAddTag}
                                placeholder="Add tag..."
                                className="min-w-[100px] flex-1 border-none bg-transparent text-sm placeholder-gray-400 focus:outline-none dark:text-white"
                              />
                            </div>
                          </div>

                          {/* Converted info */}
                          {idea?.status === "converted" && (
                            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                                <LinkIcon className="h-4 w-4" />
                                <span className="font-medium">Converted</span>
                              </div>
                              <div className="mt-2 text-sm text-green-600 dark:text-green-500">
                                {idea.converted_to_project_id && (
                                  <p>Converted to project</p>
                                )}
                                {idea.converted_to_task_id && (
                                  <p>Converted to task</p>
                                )}
                                {idea.converted_at && (
                                  <p className="text-xs mt-1">
                                    {formatDistanceToNow(new Date(idea.converted_at), { addSuffix: true })}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* AI Summary (if available) */}
                          {idea?.ai_summary && (
                            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-900/20">
                              <p className="text-sm font-medium text-purple-700 dark:text-purple-400">
                                AI Summary
                              </p>
                              <p className="mt-1 text-sm text-purple-600 dark:text-purple-500">
                                {idea.ai_summary}
                              </p>
                            </div>
                          )}

                          {/* Metadata */}
                          <div className="border-t border-gray-200 pt-4 dark:border-dark-border">
                            <div className="grid grid-cols-2 gap-4 text-sm text-gray-500 dark:text-gray-400">
                              <div>
                                <span className="font-medium">Created by</span>
                                <div className="mt-1">
                                  {idea?.user_name ? (
                                    <OwnerDisplay
                                      name={idea.user_name}
                                      email={idea.user_email}
                                      id={idea.user_id}
                                      size="sm"
                                      showName
                                    />
                                  ) : (
                                    <span className="text-gray-400">Unknown</span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="font-medium">Created</span>
                                <p>
                                  {idea?.created_at &&
                                    format(new Date(idea.created_at), "MMM d, yyyy 'at' h:mm a")}
                                </p>
                              </div>
                              <div>
                                <span className="font-medium">Updated</span>
                                <p>
                                  {idea?.updated_at &&
                                    formatDistanceToNow(new Date(idea.updated_at), { addSuffix: true })}
                                </p>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-gray-200 px-6 py-4 dark:border-dark-border">
                      <div className="flex items-center justify-between">
                        {/* Left side - conversion actions */}
                        <div className="flex items-center gap-2">
                          {idea?.status !== "converted" && (
                            <>
                              {/* Add Task button */}
                              {onAddTask && (
                                <button
                                  onClick={() => idea && onAddTask(idea)}
                                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:text-gray-300 dark:hover:bg-dark-elevated"
                                >
                                  <PlusIcon className="h-4 w-4" />
                                  Add Task
                                </button>
                              )}

                              {/* Convert to Project */}
                              {onConvertToProject && (
                                <button
                                  onClick={() => idea && onConvertToProject(idea)}
                                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:text-gray-300 dark:hover:bg-dark-elevated"
                                >
                                  <FolderPlusIcon className="h-4 w-4" />
                                  Convert to Project
                                </button>
                              )}

                              {/* Convert to Task */}
                              {onConvertToTask && (
                                <button
                                  onClick={() => idea && onConvertToTask(idea)}
                                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:text-gray-300 dark:hover:bg-dark-elevated"
                                >
                                  <ClipboardDocumentListIcon className="h-4 w-4" />
                                  Convert to Task
                                </button>
                              )}
                            </>
                          )}
                        </div>

                        {/* Right side - save/close */}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleClose}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
                          >
                            Close
                          </button>
                          {hasChanges && (
                            <button
                              onClick={handleSave}
                              disabled={updateMutation.isPending}
                              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                            >
                              {updateMutation.isPending ? "Saving..." : "Save Changes"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
