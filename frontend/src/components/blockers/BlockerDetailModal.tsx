/**
 * Blocker Detail Modal - Slide-over panel for viewing and editing blocker details
 */

import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, Transition, Tab } from "@headlessui/react";
import {
  XMarkIcon,
  DocumentTextIcon,
  LinkIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { blockersService } from "@/services/blockers";
import type { Blocker, BlockerUpdate } from "@/types";
import { BlockerStatusBadge } from "./BlockerStatusBadge";
import { BlockerLinkPicker } from "./BlockerLinkPicker";

interface BlockerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockerId: string | null;
  onBlockerUpdate?: (blocker: Blocker) => void;
}

const statusOptions = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "wont_fix", label: "Won't Fix" },
] as const;

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

const impactOptions = [
  { value: "low", label: "Low Impact" },
  { value: "medium", label: "Medium Impact" },
  { value: "high", label: "High Impact" },
  { value: "critical", label: "Critical" },
] as const;

const blockerTypeOptions = [
  { value: "general", label: "General", emoji: "🚧" },
  { value: "external_dependency", label: "External Dependency", emoji: "🔗" },
  { value: "resource", label: "Resource", emoji: "👥" },
  { value: "technical", label: "Technical", emoji: "⚙️" },
  { value: "approval", label: "Approval", emoji: "✅" },
] as const;

const resolutionTypeOptions = [
  { value: "resolved", label: "Resolved" },
  { value: "wont_fix", label: "Won't Fix" },
  { value: "deferred", label: "Deferred" },
  { value: "duplicate", label: "Duplicate" },
] as const;

// Extract plain text from TipTap JSON content or return string as-is
function getDescriptionText(description: string | Record<string, unknown> | null): string {
  if (!description) return "";
  if (typeof description === "string") return description;

  const extractText = (node: Record<string, unknown>): string => {
    if (node.text && typeof node.text === "string") {
      return node.text;
    }
    if (Array.isArray(node.content)) {
      return node.content.map((child) => extractText(child as Record<string, unknown>)).join(" ");
    }
    return "";
  };

  return extractText(description).trim();
}

export function BlockerDetailModal({
  isOpen,
  onClose,
  blockerId,
  onBlockerUpdate,
}: BlockerDetailModalProps) {
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState(0);
  const [editedBlocker, setEditedBlocker] = useState<Partial<Blocker>>({});

  // Fetch blocker details
  const { data: blocker, isLoading } = useQuery({
    queryKey: ["blocker", blockerId],
    queryFn: () => blockersService.get(blockerId!),
    enabled: !!blockerId && isOpen,
  });

  // Fetch blocker links
  const { data: links = [] } = useQuery({
    queryKey: ["blocker-links", blockerId],
    queryFn: () => blockersService.getLinks(blockerId!),
    enabled: !!blockerId && isOpen,
  });

  // Update local state when blocker loads
  useEffect(() => {
    if (blocker) {
      setEditedBlocker({
        title: blocker.title,
        description: blocker.description,
        status: blocker.status,
        priority: blocker.priority,
        blocker_type: blocker.blocker_type,
        impact_level: blocker.impact_level,
        due_date: blocker.due_date,
        tags: blocker.tags,
        resolution_type: blocker.resolution_type,
      });
    }
  }, [blocker]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: BlockerUpdate) => blockersService.update(blockerId!, data),
    onSuccess: (updatedBlocker) => {
      queryClient.invalidateQueries({ queryKey: ["blocker", blockerId] });
      queryClient.invalidateQueries({ queryKey: ["blockers"] });
      // Invalidate task blockers when status changes (resolved blockers no longer block)
      queryClient.invalidateQueries({ queryKey: ["task-blockers"] });
      toast.success("Blocker updated");
      onBlockerUpdate?.(updatedBlocker);
    },
    onError: () => {
      toast.error("Failed to update blocker");
    },
  });

  // Unlink mutation
  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => blockersService.unlinkEntity(blockerId!, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocker-links", blockerId] });
      queryClient.invalidateQueries({ queryKey: ["task-blockers"] });
      toast.success("Link removed");
    },
    onError: () => {
      toast.error("Failed to remove link");
    },
  });

  // Link mutation
  const linkMutation = useMutation({
    mutationFn: ({ entityType, entityId }: { entityType: "task" | "project"; entityId: string }) =>
      blockersService.linkToEntity(blockerId!, {
        blocked_entity_type: entityType,
        blocked_entity_id: entityId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocker-links", blockerId] });
      queryClient.invalidateQueries({ queryKey: ["blockers-for"] });
      queryClient.invalidateQueries({ queryKey: ["task-blockers"] });
      toast.success("Item linked to blocker");
    },
    onError: () => {
      toast.error("Failed to link item");
    },
  });

  const handleClose = () => {
    setSelectedTab(0);
    onClose();
  };

  const handleFieldChange = (field: string, value: unknown) => {
    setEditedBlocker((prev) => ({ ...prev, [field]: value }));
    // Auto-save for select fields
    if (field !== "title" && field !== "tags") {
      updateMutation.mutate({ [field]: value });
    }
  };

  const handleTitleBlur = () => {
    if (editedBlocker.title && editedBlocker.title !== blocker?.title) {
      updateMutation.mutate({ title: editedBlocker.title });
    }
  };

  const isResolved = blocker?.status === "resolved" || blocker?.status === "wont_fix";

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
                  <div className="flex h-full flex-col bg-white shadow-xl dark:bg-gray-900">
                    {/* Header */}
                    <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {isLoading ? (
                            <div className="h-7 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                          ) : (
                            <>
                              <input
                                type="text"
                                value={editedBlocker.title || ""}
                                onChange={(e) =>
                                  setEditedBlocker((prev) => ({
                                    ...prev,
                                    title: e.target.value,
                                  }))
                                }
                                onBlur={handleTitleBlur}
                                className={clsx(
                                  "w-full text-xl font-semibold text-gray-900 dark:text-white bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none",
                                  isResolved && "line-through opacity-60"
                                )}
                              />

                              {/* Blocker type badge */}
                              {blocker && (
                                <div className="mt-2 flex items-center gap-2">
                                  <span className="text-lg">
                                    {blockerTypeOptions.find(
                                      (t) => t.value === blocker.blocker_type
                                    )?.emoji || "🚧"}
                                  </span>
                                  <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {blockerTypeOptions.find(
                                      (t) => t.value === blocker.blocker_type
                                    )?.label || blocker.blocker_type}
                                  </span>
                                  <BlockerStatusBadge status={blocker.status} size="sm" />
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <button
                          onClick={handleClose}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
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
                      ) : blocker ? (
                        <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
                          <Tab.List className="flex border-b border-gray-200 dark:border-gray-700 px-6">
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
                              <LinkIcon className="h-4 w-4" />
                              Blocked Items
                              {links.length > 0 && (
                                <span className="ml-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs dark:bg-gray-700">
                                  {links.length}
                                </span>
                              )}
                            </Tab>
                          </Tab.List>

                          <Tab.Panels className="p-6">
                            {/* Details Tab */}
                            <Tab.Panel className="space-y-6">
                              {/* Status, Priority, Impact Row */}
                              <div className="grid grid-cols-3 gap-4">
                                {/* Status */}
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Status
                                  </label>
                                  <select
                                    value={editedBlocker.status || blocker.status}
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
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Priority
                                  </label>
                                  <select
                                    value={editedBlocker.priority || blocker.priority}
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

                                {/* Impact Level */}
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Impact Level
                                  </label>
                                  <select
                                    value={editedBlocker.impact_level || blocker.impact_level}
                                    onChange={(e) =>
                                      handleFieldChange("impact_level", e.target.value)
                                    }
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:text-white dark:border-gray-600 dark:bg-dark-card"
                                  >
                                    {impactOptions.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {/* Blocker Type and Resolution Type */}
                              <div className="grid grid-cols-2 gap-4">
                                {/* Blocker Type */}
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Blocker Type
                                  </label>
                                  <select
                                    value={editedBlocker.blocker_type || blocker.blocker_type}
                                    onChange={(e) =>
                                      handleFieldChange("blocker_type", e.target.value)
                                    }
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:text-white dark:border-gray-600 dark:bg-dark-card"
                                  >
                                    {blockerTypeOptions.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.emoji} {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Resolution Type (only shown for resolved/wont_fix) */}
                                {isResolved && (
                                  <div>
                                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                      Resolution Type
                                    </label>
                                    <select
                                      value={editedBlocker.resolution_type || blocker.resolution_type || ""}
                                      onChange={(e) =>
                                        handleFieldChange("resolution_type", e.target.value || null)
                                      }
                                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:text-white dark:border-gray-600 dark:bg-dark-card"
                                    >
                                      <option value="">-- Select --</option>
                                      {resolutionTypeOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>

                              {/* Due Date */}
                              <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                  Due Date
                                </label>
                                <input
                                  type="date"
                                  value={editedBlocker.due_date || blocker.due_date || ""}
                                  onChange={(e) =>
                                    handleFieldChange("due_date", e.target.value || null)
                                  }
                                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:text-white dark:border-gray-600 dark:bg-dark-card"
                                />
                              </div>

                              {/* Description */}
                              <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                  Description
                                </label>
                                <textarea
                                  value={getDescriptionText(editedBlocker.description ?? blocker.description)}
                                  onChange={(e) =>
                                    setEditedBlocker((prev) => ({
                                      ...prev,
                                      description: e.target.value,
                                    }))
                                  }
                                  onBlur={() => {
                                    if (editedBlocker.description !== undefined) {
                                      updateMutation.mutate({ description: editedBlocker.description });
                                    }
                                  }}
                                  rows={4}
                                  placeholder="Describe the blocker..."
                                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:text-white dark:border-gray-600 dark:bg-dark-card"
                                />
                              </div>

                              {/* Tags */}
                              <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                  Tags
                                </label>
                                <div className="flex flex-wrap gap-2">
                                  {(editedBlocker.tags ?? blocker.tags).map((tag) => (
                                    <span
                                      key={tag}
                                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-sm text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                    >
                                      {tag}
                                      <button
                                        onClick={() => {
                                          const newTags = (editedBlocker.tags ?? blocker.tags).filter(
                                            (t) => t !== tag
                                          );
                                          setEditedBlocker((prev) => ({ ...prev, tags: newTags }));
                                          updateMutation.mutate({ tags: newTags });
                                        }}
                                        className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                      >
                                        <XMarkIcon className="h-3 w-3" />
                                      </button>
                                    </span>
                                  ))}
                                  <input
                                    type="text"
                                    placeholder="Add tag..."
                                    className="w-24 rounded border-0 bg-transparent px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && e.currentTarget.value.trim()) {
                                        const newTag = e.currentTarget.value.trim();
                                        const currentTags = editedBlocker.tags ?? blocker.tags;
                                        if (!currentTags.includes(newTag)) {
                                          const newTags = [...currentTags, newTag];
                                          setEditedBlocker((prev) => ({ ...prev, tags: newTags }));
                                          updateMutation.mutate({ tags: newTags });
                                        }
                                        e.currentTarget.value = "";
                                      }
                                    }}
                                  />
                                </div>
                              </div>

                              {/* Metadata */}
                              <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400">
                                      Created:
                                    </span>{" "}
                                    <span className="text-gray-700 dark:text-gray-300">
                                      {format(new Date(blocker.created_at), "PPp")}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400">
                                      Updated:
                                    </span>{" "}
                                    <span className="text-gray-700 dark:text-gray-300">
                                      {format(new Date(blocker.updated_at), "PPp")}
                                    </span>
                                  </div>
                                  {blocker.resolved_at && (
                                    <div className="col-span-2">
                                      <span className="text-gray-500 dark:text-gray-400">
                                        Resolved:
                                      </span>{" "}
                                      <span className="text-green-600 dark:text-green-400">
                                        {format(new Date(blocker.resolved_at), "PPp")}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Tab.Panel>

                            {/* Blocked Items Tab */}
                            <Tab.Panel className="space-y-4">
                              {/* Link Picker */}
                              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-dark-card/50">
                                <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                  Link tasks or subprojects that this blocker is blocking:
                                </h4>
                                <BlockerLinkPicker
                                  projectId={blocker.project_id}
                                  existingLinks={links}
                                  onSelect={(entityType, entityId) =>
                                    linkMutation.mutate({ entityType, entityId })
                                  }
                                  disabled={linkMutation.isPending}
                                />
                              </div>

                              {links.length === 0 ? (
                                <div className="py-6 text-center text-gray-500 dark:text-gray-400">
                                  <p className="text-sm">
                                    No items linked yet. Use the picker above to link tasks or subprojects.
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {links.map((link) => (
                                    <div
                                      key={link.id}
                                      className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                                    >
                                      <div className="flex items-center gap-3">
                                        <span
                                          className={clsx(
                                            "rounded-full px-2 py-0.5 text-xs font-medium",
                                            link.blocked_entity_type === "task"
                                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                              : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                          )}
                                        >
                                          {link.blocked_entity_type}
                                        </span>
                                        <span className="font-medium text-gray-900 dark:text-white">
                                          {link.blocked_entity_title || link.blocked_entity_id}
                                        </span>
                                      </div>
                                      <button
                                        onClick={() => unlinkMutation.mutate(link.id)}
                                        disabled={unlinkMutation.isPending}
                                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800"
                                      >
                                        <TrashIcon className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </Tab.Panel>
                          </Tab.Panels>
                        </Tab.Group>
                      ) : (
                        <div className="p-6 text-center text-gray-500">
                          Blocker not found
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
    </Transition>
  );
}

export default BlockerDetailModal;
