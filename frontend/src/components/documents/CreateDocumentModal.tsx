/**
 * CreateDocumentModal - Modal for quick document creation from project context
 */

import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { XMarkIcon, DocumentPlusIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import {
  createDocument,
  getDocumentTemplates,
  type CreateDocumentRequest,
} from "@/services/documents";
import {
  DOCUMENT_TYPE_OPTIONS,
  DEFAULT_DOCUMENT_TYPE,
  type DocumentType,
} from "@/types/document";

interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess?: (documentId: string) => void;
  /** If true, navigate to editor after creation */
  navigateOnCreate?: boolean;
}

export function CreateDocumentModal({
  isOpen,
  onClose,
  projectId,
  onSuccess,
  navigateOnCreate = true,
}: CreateDocumentModalProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<{
    title: string;
    document_type: DocumentType;
    template_id: string | null;
  }>({
    title: "",
    document_type: DEFAULT_DOCUMENT_TYPE,
    template_id: null,
  });

  // Fetch templates
  const { data: templates = [] } = useQuery({
    queryKey: ["document-templates"],
    queryFn: () => getDocumentTemplates(),
    enabled: isOpen,
  });

  // Filter templates by selected document type
  const filteredTemplates = templates.filter(
    (t) => t.document_type === formData.document_type || !t.document_type
  );

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        title: "",
        document_type: DEFAULT_DOCUMENT_TYPE,
        template_id: null,
      });
    }
  }, [isOpen]);

  const createMutation = useMutation({
    mutationFn: (data: CreateDocumentRequest) => createDocument(data),
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ["documents", projectId] });
      toast.success("Document created");
      onClose();
      if (navigateOnCreate) {
        navigate(`/projects/${projectId}/documents/${doc.id}`);
      }
      onSuccess?.(doc.id);
    },
    onError: () => {
      toast.error("Failed to create document");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const title = formData.title.trim() || "Untitled Document";

    createMutation.mutate({
      title,
      project_id: projectId,
      document_type: formData.document_type,
      template_id: formData.template_id || undefined,
      content: {
        type: "doc",
        content: [{ type: "paragraph" }],
      },
    });
  };

  const handleClose = () => {
    if (!createMutation.isPending) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-dark-card rounded-xl shadow-card w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
              <DocumentPlusIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Create Document
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Add a new document to this project
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={createMutation.isPending}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded disabled:opacity-50"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Document Title */}
          <div>
            <label
              htmlFor="doc-title"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Title
            </label>
            <input
              id="doc-title"
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Document title..."
              className="w-full border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 bg-white dark:bg-dark-elevated text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              autoFocus
            />
          </div>

          {/* Document Type */}
          <div>
            <label
              htmlFor="doc-type"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Document Type
            </label>
            <select
              id="doc-type"
              value={formData.document_type}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  document_type: e.target.value as DocumentType,
                  template_id: null, // Reset template when type changes
                }))
              }
              className="w-full border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 bg-white dark:bg-dark-elevated text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.icon} {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Template (Optional) */}
          {filteredTemplates.length > 0 && (
            <div>
              <label
                htmlFor="doc-template"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Template{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                id="doc-template"
                value={formData.template_id || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    template_id: e.target.value || null,
                  }))
                }
                className="w-full border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 bg-white dark:bg-dark-elevated text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Blank document</option>
                {filteredTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
            <button
              type="button"
              onClick={handleClose}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-elevated border border-gray-200 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-elevated/80 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg hover:from-primary-600 hover:to-primary-700 transition-all shadow-soft disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {createMutation.isPending ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating...
                </>
              ) : (
                <>
                  <DocumentPlusIcon className="h-4 w-4" />
                  Create Document
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateDocumentModal;
