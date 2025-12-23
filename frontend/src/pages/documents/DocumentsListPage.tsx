import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, Link } from "react-router-dom";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import {
  PlusIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArchiveBoxIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import {
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  type Document,
} from "@/services/documents";
import { projectsService } from "@/services/projects";
import { DocumentCard } from "@/components/documents";

export function DocumentsListPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [showArchived, setShowArchived] = useState(false);

  // Fetch project details
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsService.get(projectId!),
    enabled: !!projectId,
  });

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents", projectId, search, statusFilter, showArchived],
    queryFn: () =>
      getDocuments(projectId!, {
        search: search || undefined,
        status: statusFilter,
      }),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: createDocument,
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
      navigate(`/projects/${projectId}/documents/${doc.id}`);
      toast.success("Document created");
    },
    onError: () => {
      toast.error("Failed to create document");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Parameters<typeof updateDocument>[1];
    }) => updateDocument(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
      toast.success("Document deleted");
    },
    onError: () => {
      toast.error("Failed to delete document");
    },
  });

  const handleCreateDocument = () => {
    createMutation.mutate({
      title: "Untitled Document",
      project_id: projectId!,
      content: {
        type: "doc",
        content: [{ type: "paragraph" }],
      },
    });
  };

  const handleTogglePin = (doc: Document) => {
    updateMutation.mutate({
      id: doc.id,
      data: { is_pinned: !doc.is_pinned },
    });
  };

  const handleArchive = (doc: Document) => {
    updateMutation.mutate({
      id: doc.id,
      data: { is_archived: !doc.is_archived },
    });
  };

  const handleDelete = (docId: string) => {
    if (confirm("Are you sure you want to delete this document?")) {
      deleteMutation.mutate(docId);
    }
  };

  const filteredDocuments = documents.filter((doc) =>
    showArchived ? doc.is_archived : !doc.is_archived
  );

  const pinnedDocs = filteredDocuments.filter((doc) => doc.is_pinned);
  const unpinnedDocs = filteredDocuments.filter((doc) => !doc.is_pinned);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
          <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 bg-gray-200 dark:bg-dark-elevated rounded"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm">
        <Link
          to="/documents"
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          All Documents
        </Link>
        <ChevronRightIcon className="w-4 h-4 text-gray-400" />
        <span className="text-gray-900 dark:text-white font-medium">
          {project?.name || "Project Documents"}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Documents
          </h1>
          {project && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              in {project.name}
            </p>
          )}
        </div>
        <button
          onClick={handleCreateDocument}
          disabled={createMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          <PlusIcon className="w-5 h-5" />
          New Document
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2">
          <FunnelIcon className="w-5 h-5 text-gray-400" />
          <select
            value={statusFilter || ""}
            onChange={(e) => setStatusFilter(e.target.value || undefined)}
            className="px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-white"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="in_review">In Review</option>
            <option value="published">Published</option>
          </select>
        </div>

        <button
          onClick={() => setShowArchived(!showArchived)}
          className={clsx(
            "px-3 py-2 rounded-lg border transition-colors",
            showArchived
              ? "bg-gray-100 dark:bg-dark-card border-gray-400 dark:border-gray-500"
              : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
          )}
        >
          <ArchiveBoxIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Document List */}
      {filteredDocuments.length === 0 ? (
        <div className="text-center py-12">
          <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No documents yet
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Create your first document to get started
          </p>
          <button
            onClick={handleCreateDocument}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <PlusIcon className="w-5 h-5" />
            New Document
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pinned Documents */}
          {pinnedDocs.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                <StarIconSolid className="w-4 h-4 text-yellow-500" />
                Pinned
              </h2>
              <div className="space-y-2">
                {pinnedDocs.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    onClick={() =>
                      navigate(`/projects/${projectId}/documents/${doc.id}`)
                    }
                    onTogglePin={() => handleTogglePin(doc)}
                    onArchive={() => handleArchive(doc)}
                    onDelete={() => handleDelete(doc.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other Documents */}
          {unpinnedDocs.length > 0 && (
            <div>
              {pinnedDocs.length > 0 && (
                <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                  All Documents
                </h2>
              )}
              <div className="space-y-2">
                {unpinnedDocs.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    onClick={() =>
                      navigate(`/projects/${projectId}/documents/${doc.id}`)
                    }
                    onTogglePin={() => handleTogglePin(doc)}
                    onArchive={() => handleArchive(doc)}
                    onDelete={() => handleDelete(doc.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DocumentsListPage;
