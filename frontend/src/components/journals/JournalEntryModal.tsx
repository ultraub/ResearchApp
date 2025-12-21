/**
 * Journal Entry Modal - Slide-over panel for viewing and editing journal entries
 */

import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import {
  XMarkIcon,
  CalendarIcon,
  TagIcon,
  ChevronUpDownIcon,
  CheckIcon,
  ArchiveBoxIcon,
  UserIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  getJournalEntry,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  addJournalEntryLink,
  removeJournalEntryLink,
} from "@/services/journals";
import { projectsService } from "@/services/projects";
import type {
  JournalEntryType,
  JournalScope,
  JournalEntryCreate,
  JournalEntryUpdate,
  JournalEntryLinkCreate,
} from "@/types";
import JournalContentEditor from "./JournalContentEditor";
import JournalLinkedItems from "./JournalLinkedItems";
import JournalLinkPicker from "./JournalLinkPicker";

interface JournalEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entryId: string | null;
  /** If creating new entry, specify the scope */
  defaultScope?: JournalScope;
  /** If creating new entry for a specific project */
  projectId?: string;
  onEntryChange?: () => void;
}

const entryTypeOptions: { value: JournalEntryType; label: string; icon: string }[] = [
  { value: "observation", label: "Observation", icon: "🔬" },
  { value: "experiment", label: "Experiment", icon: "🧪" },
  { value: "meeting", label: "Meeting", icon: "📅" },
  { value: "idea", label: "Idea", icon: "💡" },
  { value: "reflection", label: "Reflection", icon: "🤔" },
  { value: "protocol", label: "Protocol", icon: "📋" },
];

const moodOptions = ["😊", "🤔", "😐", "😓", "🎉", "💪", "🧪", "📚"];

export default function JournalEntryModal({
  isOpen,
  onClose,
  entryId,
  defaultScope = "personal",
  projectId: initialProjectId,
  onEntryChange,
}: JournalEntryModalProps) {
  const queryClient = useQueryClient();
  const isNewEntry = !entryId;

  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<Record<string, unknown> | null>(null);
  const [_contentText, setContentText] = useState("");
  const [entryType, setEntryType] = useState<JournalEntryType>("observation");
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [scope, setScope] = useState<JournalScope>(initialProjectId ? "project" : defaultScope);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId || null);

  // Link picker state
  const [isLinkPickerOpen, setIsLinkPickerOpen] = useState(false);

  // Fetch projects for the selector
  const { data: projectsData } = useQuery({
    queryKey: ["projects-for-journal"],
    queryFn: () => projectsService.list({ status: "active", page_size: 100 }),
    enabled: isOpen && isNewEntry,
  });

  const projects = projectsData?.items || [];

  // Fetch entry if editing
  const { data: entry, isLoading } = useQuery({
    queryKey: ["journal-entry", entryId],
    queryFn: () => getJournalEntry(entryId!),
    enabled: !!entryId && isOpen,
  });

  // Reset form when modal opens for a new entry
  useEffect(() => {
    if (isOpen && isNewEntry) {
      // Always reset for new entry when modal opens
      setTitle("");
      setContent(null);
      setContentText("");
      setEntryType("observation");
      setEntryDate(format(new Date(), "yyyy-MM-dd"));
      setTags([]);
      setMood(null);
      // Use initialProjectId if provided, otherwise use defaultScope
      setScope(initialProjectId ? "project" : defaultScope);
      setSelectedProjectId(initialProjectId || null);
    }
  }, [isOpen, isNewEntry, initialProjectId, defaultScope]);

  // Populate form when editing an existing entry
  useEffect(() => {
    if (entry && isOpen) {
      setTitle(entry.title || "");
      setContent(entry.content);
      setContentText(entry.content_text || "");
      setEntryType(entry.entry_type);
      setEntryDate(entry.entry_date);
      setTags(entry.tags);
      setMood(entry.mood);
      setScope(entry.scope);
      setSelectedProjectId(entry.project_id);
    }
  }, [entry, isOpen]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: JournalEntryCreate) => createJournalEntry(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      toast.success("Journal entry created");
      onEntryChange?.();
      onClose();
    },
    onError: () => {
      toast.error("Failed to create journal entry");
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: JournalEntryUpdate) => updateJournalEntry(entryId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["journal-entry", entryId] });
      toast.success("Journal entry updated");
      onEntryChange?.();
    },
    onError: () => {
      toast.error("Failed to update journal entry");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteJournalEntry(entryId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      toast.success("Journal entry archived");
      onEntryChange?.();
      onClose();
    },
    onError: () => {
      toast.error("Failed to archive journal entry");
    },
  });

  // Add link mutation
  const addLinkMutation = useMutation({
    mutationFn: (data: JournalEntryLinkCreate) => addJournalEntryLink(entryId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entry", entryId] });
      toast.success("Link added");
    },
    onError: () => {
      toast.error("Failed to add link");
    },
  });

  // Remove link mutation
  const removeLinkMutation = useMutation({
    mutationFn: (linkId: string) => removeJournalEntryLink(entryId!, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entry", entryId] });
      toast.success("Link removed");
    },
    onError: () => {
      toast.error("Failed to remove link");
    },
  });

  const handleSave = () => {
    if (scope === "project" && !selectedProjectId) {
      toast.error("Please select a project");
      return;
    }

    if (isNewEntry) {
      createMutation.mutate({
        title: title || undefined,
        content: content || undefined,
        entry_date: entryDate,
        scope,
        project_id: scope === "project" ? selectedProjectId! : undefined,
        entry_type: entryType,
        tags,
        mood: mood || undefined,
      });
    } else {
      updateMutation.mutate({
        title: title || undefined,
        content: content || undefined,
        entry_date: entryDate,
        entry_type: entryType,
        tags,
        mood: mood || undefined,
      });
    }
  };

  const handleContentChange = (newContent: Record<string, unknown>, text: string) => {
    setContent(newContent);
    setContentText(text);
  };

  const handleContentSave = async (newContent: Record<string, unknown>) => {
    if (!isNewEntry) {
      updateMutation.mutate({ content: newContent });
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleClose = () => {
    setIsLinkPickerOpen(false);
    onClose();
  };

  const handleScopeChange = (newScope: JournalScope) => {
    setScope(newScope);
    if (newScope === "personal") {
      setSelectedProjectId(null);
    }
  };

  const selectedTypeOption = entryTypeOptions.find((t) => t.value === entryType)!;
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <>
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
                    <div className="flex h-full flex-col bg-white shadow-xl dark:bg-dark-base">
                      {/* Header */}
                      <div className="border-b border-gray-200 px-6 py-4 dark:border-dark-border">
                        <div className="flex items-center justify-between">
                          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                            {isNewEntry ? "New Journal Entry" : "Edit Journal Entry"}
                          </Dialog.Title>
                          <div className="flex items-center gap-2">
                            {!isNewEntry && (
                              <button
                                onClick={() => deleteMutation.mutate()}
                                className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-dark-elevated"
                                title="Archive entry"
                              >
                                <ArchiveBoxIcon className="h-5 w-5" />
                              </button>
                            )}
                            <button
                              onClick={handleClose}
                              className="rounded p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-elevated"
                            >
                              <XMarkIcon className="h-5 w-5" />
                            </button>
                          </div>
                        </div>

                        {/* Scope selector - only for new entries */}
                        {isNewEntry && (
                          <div className="mt-4 space-y-3">
                            {/* Scope tabs */}
                            <div className="flex rounded-lg bg-gray-100 p-1 dark:bg-dark-elevated">
                              <button
                                onClick={() => handleScopeChange("personal")}
                                className={clsx(
                                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                  scope === "personal"
                                    ? "bg-white text-gray-900 shadow-soft dark:bg-dark-card dark:text-white"
                                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                                )}
                              >
                                <UserIcon className="h-4 w-4" />
                                Personal Journal
                              </button>
                              <button
                                onClick={() => handleScopeChange("project")}
                                className={clsx(
                                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                  scope === "project"
                                    ? "bg-white text-gray-900 shadow-soft dark:bg-dark-card dark:text-white"
                                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                                )}
                              >
                                <FolderIcon className="h-4 w-4" />
                                Project Lab Notebook
                              </button>
                            </div>

                            {/* Project selector - only when scope is project */}
                            {scope === "project" && (
                              <Listbox value={selectedProjectId} onChange={setSelectedProjectId}>
                                <div className="relative">
                                  <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-200 bg-white py-2.5 pl-3 pr-10 text-left text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-card">
                                    {selectedProject ? (
                                      <span className="flex items-center gap-2">
                                        <FolderIcon className="h-4 w-4 text-gray-400" />
                                        <span className="block truncate">{selectedProject.name}</span>
                                      </span>
                                    ) : (
                                      <span className="flex items-center gap-2 text-gray-500">
                                        <FolderIcon className="h-4 w-4" />
                                        <span>Select a project...</span>
                                      </span>
                                    )}
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
                                    <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl bg-white py-1 shadow-card ring-1 ring-black/5 dark:ring-white/10 dark:bg-dark-card">
                                      {projects.length === 0 ? (
                                        <div className="px-3 py-2 text-sm text-gray-500">
                                          No projects available
                                        </div>
                                      ) : (
                                        projects.map((project) => (
                                          <Listbox.Option
                                            key={project.id}
                                            value={project.id}
                                            className={({ active }) =>
                                              clsx(
                                                "cursor-pointer px-3 py-2 text-sm",
                                                active && "bg-gray-100 dark:bg-dark-elevated"
                                              )
                                            }
                                          >
                                            {({ selected }) => (
                                              <div className="flex items-center justify-between">
                                                <span className="flex items-center gap-2">
                                                  <FolderIcon className="h-4 w-4 text-gray-400" />
                                                  <span className={clsx(selected && "font-medium")}>
                                                    {project.name}
                                                  </span>
                                                </span>
                                                {selected && (
                                                  <CheckIcon className="h-4 w-4 text-primary-600" />
                                                )}
                                              </div>
                                            )}
                                          </Listbox.Option>
                                        ))
                                      )}
                                    </Listbox.Options>
                                  </Transition>
                                </div>
                              </Listbox>
                            )}
                          </div>
                        )}

                        {/* Show scope badge for existing entries */}
                        {!isNewEntry && entry && (
                          <div className="mt-3">
                            <span
                              className={clsx(
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                                entry.scope === "personal"
                                  ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
                                  : "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400"
                              )}
                            >
                              {entry.scope === "personal" ? (
                                <>
                                  <UserIcon className="h-3.5 w-3.5" />
                                  Personal Journal
                                </>
                              ) : (
                                <>
                                  <FolderIcon className="h-3.5 w-3.5" />
                                  Project Lab Notebook
                                </>
                              )}
                            </span>
                          </div>
                        )}

                        {/* Metadata row */}
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          {/* Entry type selector */}
                          <Listbox value={entryType} onChange={setEntryType}>
                            <div className="relative">
                              <Listbox.Button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-dark-border dark:bg-dark-card">
                                <span>{selectedTypeOption.icon}</span>
                                <span>{selectedTypeOption.label}</span>
                                <ChevronUpDownIcon className="h-4 w-4 text-gray-400" />
                              </Listbox.Button>
                              <Transition
                                as={Fragment}
                                leave="transition ease-in duration-100"
                                leaveFrom="opacity-100"
                                leaveTo="opacity-0"
                              >
                                <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-48 overflow-auto rounded-xl bg-white py-1 shadow-card ring-1 ring-black/5 dark:ring-white/10 dark:bg-dark-card">
                                  {entryTypeOptions.map((option) => (
                                    <Listbox.Option
                                      key={option.value}
                                      value={option.value}
                                      className={({ active }) =>
                                        clsx(
                                          "cursor-pointer px-3 py-2 text-sm",
                                          active && "bg-gray-100 dark:bg-dark-elevated"
                                        )
                                      }
                                    >
                                      {({ selected }) => (
                                        <div className="flex items-center justify-between">
                                          <span className="flex items-center gap-2">
                                            <span>{option.icon}</span>
                                            <span>{option.label}</span>
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

                          {/* Entry date */}
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-5 w-5 text-gray-400" />
                            <input
                              type="date"
                              value={entryDate}
                              onChange={(e) => setEntryDate(e.target.value)}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-dark-border dark:bg-dark-card dark:text-white"
                            />
                          </div>

                          {/* Mood selector */}
                          <div className="flex items-center gap-1">
                            {moodOptions.map((m) => (
                              <button
                                key={m}
                                onClick={() => setMood(mood === m ? null : m)}
                                className={clsx(
                                  "rounded-full p-1.5 text-lg transition-colors",
                                  mood === m
                                    ? "bg-primary-100 dark:bg-primary-900/30"
                                    : "hover:bg-gray-100 dark:hover:bg-dark-elevated"
                                )}
                              >
                                {m}
                              </button>
                            ))}
                          </div>
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
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder="Entry title (optional)"
                              className="w-full border-b border-gray-200 bg-transparent py-2 text-xl font-semibold text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none dark:border-dark-border dark:text-white"
                            />

                            {/* Content editor */}
                            <JournalContentEditor
                              content={content}
                              onChange={handleContentChange}
                              onSave={!isNewEntry ? handleContentSave : undefined}
                              autoSave={!isNewEntry}
                            />

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
                                    {tag}
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

                            {/* Linked items */}
                            {!isNewEntry && entry && (
                              <JournalLinkedItems
                                links={entry.links || []}
                                onRemoveLink={(linkId) => removeLinkMutation.mutate(linkId)}
                                onAddLink={() => setIsLinkPickerOpen(true)}
                                editable
                              />
                            )}
                          </>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="border-t border-gray-200 px-6 py-4 dark:border-dark-border">
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={handleClose}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-elevated"
                          >
                            {isNewEntry ? "Cancel" : "Close"}
                          </button>
                          {isNewEntry && (
                            <button
                              onClick={handleSave}
                              disabled={createMutation.isPending || (scope === "project" && !selectedProjectId)}
                              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                            >
                              {createMutation.isPending ? "Creating..." : "Create Entry"}
                            </button>
                          )}
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

      {/* Link picker modal */}
      {!isNewEntry && (
        <JournalLinkPicker
          isOpen={isLinkPickerOpen}
          onClose={() => setIsLinkPickerOpen(false)}
          onLinkAdd={(data) => addLinkMutation.mutate(data)}
        />
      )}
    </>
  );
}
