/**
 * TaskDocumentsTab - Manages documents linked to a task
 * Supports viewing, creating, and linking documents.
 */

import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import {
  DocumentTextIcon,
  LinkIcon,
  TrashIcon,
  CheckIcon,
  ChevronUpDownIcon,
  DocumentPlusIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { tasksService } from "@/services/tasks";
import { createDocument, getDocuments } from "@/services/documents";
import type { Task, TaskDocumentCreate } from "@/types";
import {
  type DocumentType,
  DOCUMENT_TYPE_OPTIONS,
  DOCUMENT_TYPE_COLORS,
  DEFAULT_DOCUMENT_TYPE,
} from "@/types/document";

interface TaskDocumentsTabProps {
  task: Task;
}

const LINK_TYPE_OPTIONS = [
  { value: "reference", label: "Reference", description: "Related material" },
  { value: "deliverable", label: "Deliverable", description: "Output of this task" },
  { value: "input", label: "Input", description: "Required to complete task" },
  { value: "attachment", label: "Attachment", description: "Supporting document" },
] as const;

const LINK_TYPE_COLORS: Record<string, string> = {
  reference: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  deliverable: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  input: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  attachment: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  output: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
};

export default function TaskDocumentsTab({ task }: TaskDocumentsTabProps) {
  const queryClient = useQueryClient();
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch linked documents
  const { data: linkedDocs = [], isLoading } = useQuery({
    queryKey: ["task-documents", task.id],
    queryFn: () => tasksService.getDocuments(task.id),
  });

  // Unlink mutation
  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => tasksService.unlinkDocument(task.id, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-documents", task.id] });
      toast.success("Document unlinked");
    },
    onError: () => {
      toast.error("Failed to unlink document");
    },
  });

  const handleUnlink = (linkId: string, docTitle: string) => {
    if (confirm(`Unlink "${docTitle}" from this task?`)) {
      unlinkMutation.mutate(linkId);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <DocumentPlusIcon className="h-4 w-4" />
          New Document
        </button>
        <button
          onClick={() => setShowLinkModal(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-dark-card dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <LinkIcon className="h-4 w-4" />
          Link Existing
        </button>
      </div>

      {/* Document List */}
      {linkedDocs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
          <DocumentTextIcon className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No documents linked to this task
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Create a new document or link an existing one
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200 shadow-soft dark:divide-dark-border dark:border-dark-border">
          {linkedDocs.map((link) => (
            <li
              key={link.id}
              className="flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-dark-elevated/50 transition-all"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-lg">
                {DOCUMENT_TYPE_OPTIONS.find(o => o.value === link.document_type)?.icon || "📄"}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/projects/${task.project_id}/documents/${link.document_id}`}
                    className="truncate font-medium text-gray-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                  >
                    {link.document_title || "Untitled Document"}
                  </Link>
                  {link.is_primary && (
                    <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300">
                      Primary
                    </span>
                  )}
                  {link.requires_review && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/50 dark:text-red-300">
                      Review Required
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span
                    className={clsx(
                      "rounded px-1.5 py-0.5 text-xs",
                      LINK_TYPE_COLORS[link.link_type] || LINK_TYPE_COLORS.reference
                    )}
                  >
                    {link.link_type}
                  </span>
                  {link.document_type && (
                    <span className={clsx(
                      "rounded px-1 py-0.5 text-xs",
                      DOCUMENT_TYPE_COLORS[link.document_type as DocumentType] || "bg-gray-100 text-gray-600"
                    )}>
                      {DOCUMENT_TYPE_OPTIONS.find(o => o.value === link.document_type)?.label || link.document_type}
                    </span>
                  )}
                  <span className="text-gray-400">
                    · {format(new Date(link.created_at), "MMM d")}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Link
                  to={`/projects/${task.project_id}/documents/${link.document_id}`}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                  title="Open document"
                >
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </Link>
                <button
                  onClick={() =>
                    handleUnlink(link.id, link.document_title || "this document")
                  }
                  className="rounded p-1.5 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
                  title="Unlink document"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Link Existing Document Modal */}
      <LinkDocumentModal
        isOpen={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        task={task}
        linkedDocIds={linkedDocs.map((d) => d.document_id)}
      />

      {/* Create New Document Modal */}
      <CreateDocumentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        task={task}
      />
    </div>
  );
}

// ============================================================================
// Link Existing Document Modal
// ============================================================================

interface LinkDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  linkedDocIds: string[];
}

function LinkDocumentModal({
  isOpen,
  onClose,
  task,
  linkedDocIds,
}: LinkDocumentModalProps) {
  const queryClient = useQueryClient();
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [linkType, setLinkType] = useState<string>("reference");
  const [requiresReview, setRequiresReview] = useState(false);

  // Fetch project documents
  const { data: projectDocs = [], isLoading } = useQuery({
    queryKey: ["documents", task.project_id],
    queryFn: () => getDocuments(task.project_id, { limit: 100 }),
    enabled: isOpen,
  });

  // Filter out already linked documents
  const availableDocs = projectDocs.filter(
    (doc) => !linkedDocIds.includes(doc.id)
  );

  const linkMutation = useMutation({
    mutationFn: (data: TaskDocumentCreate) =>
      tasksService.linkDocuments(task.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-documents", task.id] });
      toast.success("Documents linked successfully");
      handleClose();
    },
    onError: () => {
      toast.error("Failed to link documents");
    },
  });

  const handleClose = () => {
    setSelectedDocIds([]);
    setLinkType("reference");
    setRequiresReview(false);
    onClose();
  };

  const handleLink = () => {
    if (selectedDocIds.length === 0) {
      toast.error("Select at least one document");
      return;
    }
    linkMutation.mutate({
      document_ids: selectedDocIds,
      link_type: linkType as TaskDocumentCreate["link_type"],
      requires_review: requiresReview,
    });
  };

  const toggleDoc = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId]
    );
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25 dark:bg-black/50" />
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
              <Dialog.Panel className="w-full max-w-md transform rounded-xl bg-white p-6 shadow-card transition-all dark:bg-dark-card">
                <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white">
                  Link Documents
                </Dialog.Title>

                <div className="mt-4 space-y-4">
                  {/* Link Type */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Link Type
                    </label>
                    <Listbox value={linkType} onChange={setLinkType}>
                      <div className="relative">
                        <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-left text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                          <span>{LINK_TYPE_OPTIONS.find((o) => o.value === linkType)?.label}</span>
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
                          <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5 dark:ring-white/10 dark:bg-gray-700">
                            {LINK_TYPE_OPTIONS.map((opt) => (
                              <Listbox.Option
                                key={opt.value}
                                value={opt.value}
                                className={({ active }) =>
                                  clsx(
                                    "relative cursor-pointer select-none py-2 pl-10 pr-4 text-sm",
                                    active
                                      ? "bg-primary-100 text-primary-900 dark:bg-primary-900/30"
                                      : "text-gray-900 dark:text-gray-100"
                                  )
                                }
                              >
                                {({ selected }) => (
                                  <>
                                    <div>
                                      <span className={clsx("block", selected && "font-medium")}>
                                        {opt.label}
                                      </span>
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {opt.description}
                                      </span>
                                    </div>
                                    {selected && (
                                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600">
                                        <CheckIcon className="h-5 w-5" />
                                      </span>
                                    )}
                                  </>
                                )}
                              </Listbox.Option>
                            ))}
                          </Listbox.Options>
                        </Transition>
                      </div>
                    </Listbox>
                  </div>

                  {/* Requires Review Checkbox */}
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={requiresReview}
                      onChange={(e) => setRequiresReview(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Requires review before task completion
                    </span>
                  </label>

                  {/* Document Selection */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Select Documents
                    </label>
                    {isLoading ? (
                      <div className="h-32 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
                    ) : availableDocs.length === 0 ? (
                      <p className="py-4 text-center text-sm text-gray-500">
                        No available documents in this project
                      </p>
                    ) : (
                      <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-600">
                        {availableDocs.map((doc) => (
                          <label
                            key={doc.id}
                            className={clsx(
                              "flex cursor-pointer items-center gap-2 rounded-lg p-2 transition-colors",
                              selectedDocIds.includes(doc.id)
                                ? "bg-primary-50 dark:bg-primary-900/20"
                                : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selectedDocIds.includes(doc.id)}
                              onChange={() => toggleDoc(doc.id)}
                              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-gray-900 dark:text-white">
                                {doc.title}
                              </p>
                              <p className="text-xs text-gray-500">
                                {doc.document_type} · {doc.status}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleLink}
                    disabled={selectedDocIds.length === 0 || linkMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {linkMutation.isPending ? "Linking..." : `Link ${selectedDocIds.length} Document${selectedDocIds.length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

// ============================================================================
// Create New Document Modal
// ============================================================================

interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
}

function CreateDocumentModal({ isOpen, onClose, task }: CreateDocumentModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>(DEFAULT_DOCUMENT_TYPE);
  const [linkType, setLinkType] = useState<string>("deliverable");
  const [requiresReview, setRequiresReview] = useState(true);

  const createMutation = useMutation({
    mutationFn: async () => {
      // First create the document
      const doc = await createDocument({
        title: title || "Untitled Document",
        project_id: task.project_id,
        document_type: documentType,
        content: {
          type: "doc",
          content: [{ type: "paragraph" }],
        },
      });

      // Then link it to the task
      await tasksService.linkDocuments(task.id, {
        document_ids: [doc.id],
        link_type: linkType as TaskDocumentCreate["link_type"],
        requires_review: requiresReview,
        is_primary: true,
      });

      return doc;
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ["task-documents", task.id] });
      queryClient.invalidateQueries({ queryKey: ["documents", task.project_id] });
      toast.success("Document created and linked");
      handleClose();
      // Navigate to the new document
      navigate(`/projects/${task.project_id}/documents/${doc.id}`);
    },
    onError: () => {
      toast.error("Failed to create document");
    },
  });

  const handleClose = () => {
    setTitle("");
    setDocumentType(DEFAULT_DOCUMENT_TYPE);
    setLinkType("deliverable");
    setRequiresReview(true);
    onClose();
  };

  const handleCreate = () => {
    createMutation.mutate();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25 dark:bg-black/50" />
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
              <Dialog.Panel className="w-full max-w-md transform rounded-xl bg-white p-6 shadow-card transition-all dark:bg-dark-card">
                <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white">
                  Create Document for Task
                </Dialog.Title>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Create a new document and automatically link it to this task.
                </p>

                <div className="mt-4 space-y-4">
                  {/* Document Title */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Document Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={`Document for: ${task.title}`}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>

                  {/* Document Type */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Document Type
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {DOCUMENT_TYPE_OPTIONS.slice(0, 8).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setDocumentType(option.value)}
                          className={clsx(
                            "flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-center transition-all",
                            documentType === option.value
                              ? "border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-900/20"
                              : "border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500"
                          )}
                        >
                          <span className="text-lg">{option.icon}</span>
                          <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300 leading-tight">
                            {option.label}
                          </span>
                        </button>
                      ))}
                    </div>
                    {DOCUMENT_TYPE_OPTIONS.length > 8 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <span className="text-xs text-gray-400">More:</span>
                        {DOCUMENT_TYPE_OPTIONS.slice(8).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setDocumentType(option.value)}
                            className={clsx(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                              documentType === option.value
                                ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400"
                            )}
                          >
                            <span>{option.icon}</span>
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Link Type */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Link Type
                    </label>
                    <Listbox value={linkType} onChange={setLinkType}>
                      <div className="relative">
                        <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-left text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                          <span>{LINK_TYPE_OPTIONS.find((o) => o.value === linkType)?.label}</span>
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
                          <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5 dark:ring-white/10 dark:bg-gray-700">
                            {LINK_TYPE_OPTIONS.map((opt) => (
                              <Listbox.Option
                                key={opt.value}
                                value={opt.value}
                                className={({ active }) =>
                                  clsx(
                                    "relative cursor-pointer select-none py-2 pl-10 pr-4 text-sm",
                                    active
                                      ? "bg-primary-100 text-primary-900 dark:bg-primary-900/30"
                                      : "text-gray-900 dark:text-gray-100"
                                  )
                                }
                              >
                                {({ selected }) => (
                                  <>
                                    <div>
                                      <span className={clsx("block", selected && "font-medium")}>
                                        {opt.label}
                                      </span>
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {opt.description}
                                      </span>
                                    </div>
                                    {selected && (
                                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600">
                                        <CheckIcon className="h-5 w-5" />
                                      </span>
                                    )}
                                  </>
                                )}
                              </Listbox.Option>
                            ))}
                          </Listbox.Options>
                        </Transition>
                      </div>
                    </Listbox>
                  </div>

                  {/* Requires Review Checkbox */}
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={requiresReview}
                      onChange={(e) => setRequiresReview(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Requires review before task completion
                    </span>
                  </label>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    <DocumentPlusIcon className="h-4 w-4" />
                    {createMutation.isPending ? "Creating..." : "Create & Link"}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
