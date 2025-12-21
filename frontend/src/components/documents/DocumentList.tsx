/**
 * DocumentList - Reusable document list component with search, filtering, and actions
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { clsx } from "clsx";
import toast from "react-hot-toast";
import {
  PlusIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArchiveBoxIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import {
  getDocuments,
  updateDocument,
  deleteDocument,
  type Document,
} from "@/services/documents";
import { getProjectDocumentUnreadCounts } from "@/services/commentReads";
import { DocumentCard } from "./DocumentCard";

export interface DocumentListProps {
  projectId: string;
  limit?: number;
  showFilters?: boolean;
  showViewAll?: boolean;
  showCreateButton?: boolean;
  compact?: boolean;
  onDocumentClick?: (doc: Document) => void;
  onCreateClick?: () => void;
  viewAllUrl?: string;
}

export function DocumentList({
  projectId,
  limit,
  showFilters = true,
  showViewAll = true,
  showCreateButton = true,
  compact = false,
  onDocumentClick,
  onCreateClick,
  viewAllUrl,
}: DocumentListProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [showArchived, setShowArchived] = useState(false);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents", projectId, search, statusFilter, showArchived],
    queryFn: () =>
      getDocuments(projectId, {
        search: search || undefined,
        status: statusFilter,
        limit: limit,
      }),
    enabled: !!projectId,
  });

  // Fetch unread comment counts for all documents in the project
  const { data: unreadCounts = {} } = useQuery({
    queryKey: ["document-unread-counts", projectId],
    queryFn: () => getProjectDocumentUnreadCounts(projectId),
    enabled: !!projectId,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Helper to get unread info for a document
  const getUnreadInfo = (docId: string) => {
    const info = unreadCounts[docId];
    if (!info) return undefined;
    return {
      totalComments: info.total_comments,
      unreadCount: info.unread_count,
    };
  };

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

  // Apply limit after filtering
  const limitedDocuments = limit
    ? filteredDocuments.slice(0, limit)
    : filteredDocuments;

  const pinnedDocs = limitedDocuments.filter((doc) => doc.is_pinned);
  const unpinnedDocs = limitedDocuments.filter((doc) => !doc.is_pinned);

  const hasMoreDocuments = limit && filteredDocuments.length > limit;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {showFilters && (
          <div className="h-10 bg-gray-200 dark:bg-dark-elevated rounded-xl animate-pulse" />
        )}
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 bg-gray-200 dark:bg-dark-elevated rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      {showFilters && (
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2">
            <FunnelIcon className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter || ""}
              onChange={(e) => setStatusFilter(e.target.value || undefined)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card text-gray-900 dark:text-white"
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
              "p-2 rounded-lg border transition-all",
              showArchived
                ? "bg-gray-100 dark:bg-dark-elevated border-gray-400 dark:border-gray-500"
                : "border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-elevated"
            )}
            title={showArchived ? "Hide archived" : "Show archived"}
          >
            <ArchiveBoxIcon className="w-4 h-4 text-gray-500" />
          </button>

          {showCreateButton && onCreateClick && (
            <button
              onClick={onCreateClick}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-br from-primary-500 to-primary-600 text-white text-sm font-medium rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all shadow-soft"
            >
              <PlusIcon className="w-4 h-4" />
              New
            </button>
          )}
        </div>
      )}

      {/* Document List */}
      {limitedDocuments.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border shadow-soft">
          <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No documents yet
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Create your first document to get started
          </p>
          {onCreateClick && (
            <button
              onClick={onCreateClick}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all shadow-soft"
            >
              <PlusIcon className="w-5 h-5" />
              New Document
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pinned Documents */}
          {pinnedDocs.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                <StarIconSolid className="w-3.5 h-3.5 text-yellow-500" />
                Pinned
              </h2>
              <div className="space-y-2">
                {pinnedDocs.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    onClick={() => onDocumentClick?.(doc)}
                    onTogglePin={() => handleTogglePin(doc)}
                    onArchive={() => handleArchive(doc)}
                    onDelete={() => handleDelete(doc.id)}
                    compact={compact}
                    unreadInfo={getUnreadInfo(doc.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other Documents */}
          {unpinnedDocs.length > 0 && (
            <div>
              {pinnedDocs.length > 0 && (
                <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                  All Documents
                </h2>
              )}
              <div className="space-y-2">
                {unpinnedDocs.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    onClick={() => onDocumentClick?.(doc)}
                    onTogglePin={() => handleTogglePin(doc)}
                    onArchive={() => handleArchive(doc)}
                    onDelete={() => handleDelete(doc.id)}
                    compact={compact}
                    unreadInfo={getUnreadInfo(doc.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* View All Link */}
      {showViewAll && (hasMoreDocuments || viewAllUrl) && (
        <div className="pt-2 border-t border-gray-200 dark:border-dark-border">
          <Link
            to={viewAllUrl || `/projects/${projectId}/documents`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
          >
            View all documents
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
          {hasMoreDocuments && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              ({filteredDocuments.length} total)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default DocumentList;
