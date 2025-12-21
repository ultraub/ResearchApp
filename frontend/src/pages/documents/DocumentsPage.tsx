import { useState, Fragment, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, Transition, Listbox } from "@headlessui/react";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import {
  PlusIcon,
  DocumentTextIcon,
  ChevronUpDownIcon,
  CheckIcon,
  FolderIcon,
  FunnelIcon,
  XMarkIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";
import { format } from "date-fns";
import { createDocument, getDocuments, type Document } from "../../services/documents";
import { projectsService } from "../../services/projects";
import { tasksService } from "../../services/tasks";
import {
  type DocumentType,
  DOCUMENT_TYPE_OPTIONS,
  DOCUMENT_TYPE_COLORS,
  DEFAULT_DOCUMENT_TYPE,
} from "../../types/document";

export default function DocumentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const [newDocTitle, setNewDocTitle] = useState("Untitled Document");
  const [selectedDocumentType, setSelectedDocumentType] = useState<DocumentType>(DEFAULT_DOCUMENT_TYPE);

  // Auto-open create modal when navigating to /documents/new
  useEffect(() => {
    if (location.pathname === "/documents/new") {
      setShowCreateModal(true);
    }
  }, [location.pathname]);

  // Fetch all projects
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsService.list({ page_size: 100 }),
  });

  const projects = projectsData?.items || [];

  // Fetch tasks for selected project (for create modal)
  const { data: projectTasks = [] } = useQuery({
    queryKey: ["project-tasks", selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return [];
      const result = await tasksService.list({
        project_id: selectedProjectId,
        page_size: 100,
        include_completed: false,
      });
      return result.items;
    },
    enabled: !!selectedProjectId && showCreateModal,
  });

  const selectedTask = projectTasks.find((t) => t.id === selectedTaskId);

  // Fetch documents from all projects
  const { data: allDocsData, isLoading: docsLoading } = useQuery({
    queryKey: ["all-documents", projects.map(p => p.id)],
    queryFn: async () => {
      const docs: (Document & { project_name?: string })[] = [];

      // Fetch from all projects in parallel using proper API service
      const promises = projects.map(async (project) => {
        try {
          const projectDocs = await getDocuments(project.id, { limit: 50 });
          return projectDocs.map((d: Document) => ({
            ...d,
            project_name: project.name,
          }));
        } catch {
          // Skip failed project
          return [];
        }
      });

      const results = await Promise.all(promises);
      results.forEach(items => docs.push(...items));

      // Sort by updated_at descending
      return docs.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    },
    enabled: projects.length > 0,
  });

  const allDocs = allDocsData || [];

  // Filter documents by selected project
  const filteredDocs = useMemo(() => {
    if (!filterProjectId) return allDocs;
    return allDocs.filter(doc => doc.project_id === filterProjectId);
  }, [allDocs, filterProjectId]);

  const filterProject = projects.find((p) => p.id === filterProjectId);

  const isLoading = projectsLoading || (projects.length > 0 && docsLoading);

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; project_id: string; task_id: string | null; document_type: DocumentType }) => {
      // Create the document
      const doc = await createDocument({
        title: data.title,
        project_id: data.project_id,
        document_type: data.document_type,
        content: {
          type: "doc",
          content: [{ type: "paragraph" }],
        },
      });

      // If a task is selected, link the document to it
      if (data.task_id) {
        await tasksService.linkDocuments(data.task_id, {
          document_ids: [doc.id],
          link_type: "deliverable",
          requires_review: true,
          is_primary: true,
        });
      }

      return doc;
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["all-documents"] });
      if (selectedTaskId) {
        queryClient.invalidateQueries({ queryKey: ["task-documents", selectedTaskId] });
      }
      toast.success(selectedTaskId ? "Document created and linked to task" : "Document created");
      setShowCreateModal(false);
      setSelectedTaskId(null);
      navigate(`/projects/${doc.project_id}/documents/${doc.id}`);
    },
    onError: () => {
      toast.error("Failed to create document");
    },
  });

  const handleCreate = () => {
    if (!selectedProjectId) {
      toast.error("Please select a project");
      return;
    }
    createMutation.mutate({
      title: newDocTitle || "Untitled Document",
      project_id: selectedProjectId,
      task_id: selectedTaskId,
      document_type: selectedDocumentType,
    });
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Reset task selection when project changes
  useEffect(() => {
    setSelectedTaskId(null);
  }, [selectedProjectId]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Documents
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Create and manage your research documents
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <PlusIcon className="h-4 w-4" />
          New Document
        </button>
      </div>

      {/* Filter Bar */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <FunnelIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <span className="text-sm text-gray-600 dark:text-gray-400">Filter by project:</span>
        </div>

        <Listbox value={filterProjectId} onChange={setFilterProjectId}>
          <div className="relative">
            <Listbox.Button className="relative min-w-[200px] cursor-pointer rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-10 text-left text-sm shadow-card focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white">
              <span className="flex items-center gap-2">
                {filterProject ? (
                  <>
                    <FolderIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <span className="text-gray-900 dark:text-white">{filterProject.name}</span>
                  </>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400">All Projects</span>
                )}
              </span>
              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                <ChevronUpDownIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              </span>
            </Listbox.Button>
            <Transition
              as={Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 shadow-card ring-1 ring-black/5 focus:outline-none dark:bg-dark-elevated dark:ring-dark-border">
                <Listbox.Option
                  value={null}
                  className={({ active }) =>
                    clsx(
                      "relative cursor-pointer select-none py-2 pl-10 pr-4 text-sm",
                      active
                        ? "bg-primary-100 text-primary-900 dark:bg-primary-900/30 dark:text-primary-100"
                        : "text-gray-900 dark:text-gray-100"
                    )
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={clsx("block truncate", selected ? "font-medium" : "font-normal")}>
                        All Projects
                      </span>
                      {selected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600 dark:text-primary-400">
                          <CheckIcon className="h-5 w-5" />
                        </span>
                      )}
                    </>
                  )}
                </Listbox.Option>
                {projects.map((project) => (
                  <Listbox.Option
                    key={project.id}
                    value={project.id}
                    className={({ active }) =>
                      clsx(
                        "relative cursor-pointer select-none py-2 pl-10 pr-4 text-sm",
                        active
                          ? "bg-primary-100 text-primary-900 dark:bg-primary-900/30 dark:text-primary-100"
                          : "text-gray-900 dark:text-gray-100"
                      )
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className={clsx("block truncate", selected ? "font-medium" : "font-normal")}>
                          {project.name}
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600 dark:text-primary-400">
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

        {filterProjectId && (
          <button
            onClick={() => setFilterProjectId(null)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <XMarkIcon className="h-4 w-4" />
            Clear filter
          </button>
        )}

        <span className="text-sm text-gray-500 dark:text-gray-400">
          {filteredDocs.length} document{filteredDocs.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Documents List or Empty State */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-gray-200 dark:bg-dark-elevated"
            />
          ))}
        </div>
      ) : filteredDocs.length > 0 ? (
        <div className="rounded-xl bg-white shadow-card dark:bg-dark-card">
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredDocs.map((doc) => (
              <li key={doc.id}>
                <Link
                  to={`/projects/${doc.project_id}/documents/${doc.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 text-xl">
                    {DOCUMENT_TYPE_OPTIONS.find(o => o.value === doc.document_type)?.icon || "📄"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-white">
                      {doc.title}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {doc.project_name} · Updated{" "}
                      {format(new Date(doc.updated_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <span
                    className={clsx(
                      "rounded-full px-2 py-1 text-xs font-medium",
                      DOCUMENT_TYPE_COLORS[doc.document_type as DocumentType] ||
                        "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                    )}
                  >
                    {DOCUMENT_TYPE_OPTIONS.find(o => o.value === doc.document_type)?.label || doc.document_type}
                  </span>
                  <span
                    className={clsx(
                      "rounded-full px-2 py-1 text-xs font-medium",
                      doc.status === "draft"
                        ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                        : doc.status === "published"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300"
                    )}
                  >
                    {doc.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl bg-white p-12 text-center shadow-soft dark:bg-dark-card">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <DocumentTextIcon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            {filterProjectId ? "No documents in this project" : "No documents yet"}
          </h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            {filterProjectId
              ? "Create a new document or select a different project"
              : "Create your first document to get started"
            }
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 text-sm font-medium text-white hover:bg-primary-700"
          >
            <PlusIcon className="h-5 w-5" />
            Create Document
          </button>
        </div>
      )}

      {/* Create Document Modal */}
      <Transition appear show={showCreateModal} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setShowCreateModal(false)}
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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-xl bg-white p-6 shadow-card transition-all dark:bg-dark-card">
                  <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white">
                    Create New Document
                  </Dialog.Title>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Document Title
                      </label>
                      <input
                        type="text"
                        value={newDocTitle}
                        onChange={(e) => setNewDocTitle(e.target.value)}
                        placeholder="Untitled Document"
                        className="mt-1 block w-full rounded-lg border-gray-200 shadow-card focus:border-primary-500 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white dark:placeholder-gray-400"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Document Type
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {DOCUMENT_TYPE_OPTIONS.slice(0, 9).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setSelectedDocumentType(option.value)}
                            className={clsx(
                              "flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-center transition-all",
                              selectedDocumentType === option.value
                                ? "border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-900/20"
                                : "border-gray-200 hover:border-gray-300 dark:border-dark-border dark:hover:border-gray-500"
                            )}
                          >
                            <span className="text-xl">{option.icon}</span>
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              {option.label}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">More:</span>
                        {DOCUMENT_TYPE_OPTIONS.slice(9).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setSelectedDocumentType(option.value)}
                            className={clsx(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-all",
                              selectedDocumentType === option.value
                                ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                            )}
                          >
                            <span>{option.icon}</span>
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Project <span className="text-red-500">*</span>
                      </label>
                      <Listbox
                        value={selectedProjectId}
                        onChange={setSelectedProjectId}
                      >
                        <div className="relative mt-1">
                          <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-10 text-left shadow-card focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white">
                            <span className="flex items-center gap-2">
                              {selectedProject ? (
                                <>
                                  <FolderIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                  <span className="text-gray-900 dark:text-white">{selectedProject.name}</span>
                                </>
                              ) : (
                                <span className="text-gray-400 dark:text-gray-500">
                                  Select a project...
                                </span>
                              )}
                            </span>
                            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                              <ChevronUpDownIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                            </span>
                          </Listbox.Button>
                          <Transition
                            as={Fragment}
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100"
                            leaveTo="opacity-0"
                          >
                            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 shadow-card ring-1 ring-black/5 focus:outline-none dark:bg-dark-elevated dark:ring-dark-border">
                              {projects.length === 0 ? (
                                <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                                  No projects found.{" "}
                                  <Link
                                    to="/projects"
                                    className="text-primary-600 hover:underline dark:text-primary-400"
                                  >
                                    Create one first
                                  </Link>
                                </div>
                              ) : (
                                projects.map((project) => (
                                  <Listbox.Option
                                    key={project.id}
                                    value={project.id}
                                    className={({ active }) =>
                                      clsx(
                                        "relative cursor-pointer select-none py-2 pl-10 pr-4",
                                        active
                                          ? "bg-primary-100 text-primary-900 dark:bg-primary-900/30 dark:text-primary-100"
                                          : "text-gray-900 dark:text-gray-100"
                                      )
                                    }
                                  >
                                    {({ selected }) => (
                                      <>
                                        <span
                                          className={clsx(
                                            "block truncate",
                                            selected
                                              ? "font-medium"
                                              : "font-normal"
                                          )}
                                        >
                                          {project.name}
                                        </span>
                                        {selected && (
                                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600 dark:text-primary-400">
                                            <CheckIcon className="h-5 w-5" />
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </Listbox.Option>
                                ))
                              )}
                            </Listbox.Options>
                          </Transition>
                        </div>
                      </Listbox>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Documents must belong to a project
                      </p>
                    </div>

                    {/* Optional Task Association */}
                    {selectedProjectId && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Link to Task <span className="text-gray-400">(optional)</span>
                        </label>
                        <Listbox
                          value={selectedTaskId}
                          onChange={setSelectedTaskId}
                        >
                          <div className="relative mt-1">
                            <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-10 text-left shadow-card focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white">
                              <span className="flex items-center gap-2">
                                {selectedTask ? (
                                  <>
                                    <ClipboardDocumentListIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                    <span className="text-gray-900 dark:text-white truncate">{selectedTask.title}</span>
                                  </>
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500">
                                    No task (standalone document)
                                  </span>
                                )}
                              </span>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                <ChevronUpDownIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                              </span>
                            </Listbox.Button>
                            <Transition
                              as={Fragment}
                              leave="transition ease-in duration-100"
                              leaveFrom="opacity-100"
                              leaveTo="opacity-0"
                            >
                              <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 shadow-card ring-1 ring-black/5 focus:outline-none dark:bg-dark-elevated dark:ring-dark-border">
                                <Listbox.Option
                                  value={null}
                                  className={({ active }) =>
                                    clsx(
                                      "relative cursor-pointer select-none py-2 pl-10 pr-4",
                                      active
                                        ? "bg-primary-100 text-primary-900 dark:bg-primary-900/30 dark:text-primary-100"
                                        : "text-gray-900 dark:text-gray-100"
                                    )
                                  }
                                >
                                  {({ selected }) => (
                                    <>
                                      <span className={clsx("block truncate", selected ? "font-medium" : "font-normal")}>
                                        No task (standalone document)
                                      </span>
                                      {selected && (
                                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600 dark:text-primary-400">
                                          <CheckIcon className="h-5 w-5" />
                                        </span>
                                      )}
                                    </>
                                  )}
                                </Listbox.Option>
                                {projectTasks.length === 0 ? (
                                  <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                                    No active tasks in this project
                                  </div>
                                ) : (
                                  projectTasks.map((task) => (
                                    <Listbox.Option
                                      key={task.id}
                                      value={task.id}
                                      className={({ active }) =>
                                        clsx(
                                          "relative cursor-pointer select-none py-2 pl-10 pr-4",
                                          active
                                            ? "bg-primary-100 text-primary-900 dark:bg-primary-900/30 dark:text-primary-100"
                                            : "text-gray-900 dark:text-gray-100"
                                        )
                                      }
                                    >
                                      {({ selected }) => (
                                        <>
                                          <div>
                                            <span className={clsx("block truncate", selected ? "font-medium" : "font-normal")}>
                                              {task.title}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                              {task.status} · {task.priority}
                                            </span>
                                          </div>
                                          {selected && (
                                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-600 dark:text-primary-400">
                                              <CheckIcon className="h-5 w-5" />
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </Listbox.Option>
                                  ))
                                )}
                              </Listbox.Options>
                            </Transition>
                          </div>
                        </Listbox>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Linking to a task makes this document a deliverable
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-elevated dark:text-gray-300 dark:hover:bg-dark-card"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={!selectedProjectId || createMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {createMutation.isPending ? "Creating..." : selectedTaskId ? "Create & Link to Task" : "Create Document"}
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
