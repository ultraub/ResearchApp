/**
 * CreateBlockerModal - Modal for creating a new blocker
 */

import { useState, Fragment } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon, DocumentIcon, FolderIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { blockersService } from "@/services/blockers";
import { BlockerLinkPicker } from "./BlockerLinkPicker";
import type { BlockerCreate } from "@/types";

interface PendingLink {
  entityType: "task" | "project";
  entityId: string;
  title: string;
}

interface CreateBlockerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

const blockerTypeOptions = [
  { value: "general", label: "General", emoji: "🚧", description: "General blocking issue" },
  { value: "external_dependency", label: "External Dependency", emoji: "🔗", description: "Waiting on external party" },
  { value: "resource", label: "Resource", emoji: "👥", description: "Missing people or resources" },
  { value: "technical", label: "Technical", emoji: "⚙️", description: "Technical blocker or bug" },
  { value: "approval", label: "Approval", emoji: "✅", description: "Waiting for approval" },
] as const;

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

const impactOptions = [
  { value: "low", label: "Low - Minor inconvenience" },
  { value: "medium", label: "Medium - Slows progress" },
  { value: "high", label: "High - Blocks major work" },
  { value: "critical", label: "Critical - Complete stop" },
] as const;

export function CreateBlockerModal({
  isOpen,
  onClose,
  projectId,
}: CreateBlockerModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<BlockerCreate>>({
    title: "",
    description: "",
    blocker_type: "general",
    priority: "medium",
    impact_level: "medium",
  });
  const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);

  const createMutation = useMutation({
    mutationFn: async (data: BlockerCreate) => {
      // Create the blocker first
      const blocker = await blockersService.create(data);

      // Then link any pending items
      if (pendingLinks.length > 0) {
        await Promise.all(
          pendingLinks.map((link) =>
            blockersService.linkToEntity(blocker.id, {
              blocked_entity_type: link.entityType,
              blocked_entity_id: link.entityId,
            })
          )
        );
      }

      return blocker;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blockers"] });
      queryClient.invalidateQueries({ queryKey: ["task-blockers"] });
      toast.success("Blocker created");
      handleClose();
    },
    onError: () => {
      toast.error("Failed to create blocker");
    },
  });

  const handleClose = () => {
    setFormData({
      title: "",
      description: "",
      blocker_type: "general",
      priority: "medium",
      impact_level: "medium",
    });
    setPendingLinks([]);
    onClose();
  };

  const handleAddLink = (entityType: "task" | "project", entityId: string, title: string) => {
    // Don't add duplicates
    if (pendingLinks.some((l) => l.entityId === entityId)) return;
    setPendingLinks((prev) => [...prev, { entityType, entityId, title }]);
  };

  const handleRemoveLink = (entityId: string) => {
    setPendingLinks((prev) => prev.filter((l) => l.entityId !== entityId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title?.trim()) {
      toast.error("Title is required");
      return;
    }
    createMutation.mutate({
      ...formData,
      project_id: projectId,
      title: formData.title.trim(),
    } as BlockerCreate);
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

        {/* Modal */}
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
              <Dialog.Panel className="w-full max-w-lg transform rounded-xl bg-white p-6 shadow-xl transition-all dark:bg-gray-900">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                    Create Blocker
                  </Dialog.Title>
                  <button
                    onClick={handleClose}
                    className="rounded-lg p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.title || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, title: e.target.value }))
                      }
                      placeholder="What's blocking progress?"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-dark-card dark:text-white dark:placeholder-gray-400"
                      autoFocus
                    />
                  </div>

                  {/* Blocker Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {blockerTypeOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({ ...prev, blocker_type: opt.value }))
                          }
                          className={`flex items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors ${
                            formData.blocker_type === opt.value
                              ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                              : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                          }`}
                        >
                          <span className="text-lg">{opt.emoji}</span>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {opt.label}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {opt.description}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Priority and Impact */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Priority
                      </label>
                      <select
                        value={formData.priority || "medium"}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, priority: e.target.value as BlockerCreate["priority"] }))
                        }
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-dark-card dark:text-white"
                      >
                        {priorityOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Impact Level
                      </label>
                      <select
                        value={formData.impact_level || "medium"}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, impact_level: e.target.value as BlockerCreate["impact_level"] }))
                        }
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-dark-card dark:text-white"
                      >
                        {impactOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description
                    </label>
                    <textarea
                      value={typeof formData.description === 'string' ? formData.description : ""}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="Add more details about this blocker..."
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-dark-card dark:text-white dark:placeholder-gray-400"
                    />
                  </div>

                  {/* Link to Tasks/Projects */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      What does this block? <span className="text-gray-400 font-normal">(optional)</span>
                    </label>

                    {/* Selected items */}
                    {pendingLinks.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {pendingLinks.map((link) => (
                          <span
                            key={link.entityId}
                            className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-sm dark:bg-gray-700"
                          >
                            {link.entityType === "task" ? (
                              <DocumentIcon className="h-3.5 w-3.5 text-blue-500" />
                            ) : (
                              <FolderIcon className="h-3.5 w-3.5 text-purple-500" />
                            )}
                            <span className="text-gray-700 dark:text-gray-300 max-w-[150px] truncate">
                              {link.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveLink(link.entityId)}
                              className="ml-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                              <XMarkIcon className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Link picker */}
                    <BlockerLinkPicker
                      projectId={projectId}
                      existingLinks={pendingLinks.map((l) => ({
                        id: l.entityId,
                        blocker_id: "",
                        blocked_entity_type: l.entityType,
                        blocked_entity_id: l.entityId,
                        blocked_entity_title: l.title,
                        notes: null,
                        created_by_id: null,
                        created_at: "",
                        updated_at: "",
                      }))}
                      onSelect={(entityType, entityId, title) => {
                        handleAddLink(entityType, entityId, title || "Untitled");
                      }}
                      disabled={createMutation.isPending}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createMutation.isPending || !formData.title?.trim()}
                      className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {createMutation.isPending ? "Creating..." : "Create Blocker"}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export default CreateBlockerModal;
