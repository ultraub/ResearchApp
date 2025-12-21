/**
 * Export dialog component for exporting data in various formats.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  DocumentArrowDownIcon,
  XMarkIcon,
  CheckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { exportsApi } from '../../services/exports';

type ExportType = 'project' | 'tasks' | 'document' | 'ideas' | 'papers' | 'analytics';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  type: ExportType;
  entityId?: string;
  organizationId?: string;
  title?: string;
}

interface FormatOption {
  value: string;
  label: string;
  description: string;
}

const formatsByType: Record<ExportType, FormatOption[]> = {
  project: [
    { value: 'csv', label: 'CSV', description: 'Spreadsheet format for Excel/Sheets' },
    { value: 'pdf', label: 'PDF', description: 'Printable document format' },
  ],
  tasks: [
    { value: 'csv', label: 'CSV', description: 'Spreadsheet format for Excel/Sheets' },
    { value: 'pdf', label: 'PDF', description: 'Printable document format' },
  ],
  document: [
    { value: 'md', label: 'Markdown', description: 'Plain text with formatting' },
    { value: 'html', label: 'HTML', description: 'Web page format' },
    { value: 'pdf', label: 'PDF', description: 'Printable document format' },
  ],
  ideas: [
    { value: 'csv', label: 'CSV', description: 'Spreadsheet format for Excel/Sheets' },
    { value: 'pdf', label: 'PDF', description: 'Printable document format' },
  ],
  papers: [
    { value: 'csv', label: 'CSV', description: 'Spreadsheet format for Excel/Sheets' },
    { value: 'bibtex', label: 'BibTeX', description: 'Citation format for LaTeX' },
  ],
  analytics: [
    { value: 'csv', label: 'CSV', description: 'Spreadsheet format for Excel/Sheets' },
    { value: 'pdf', label: 'PDF', description: 'Printable report format' },
  ],
};

export function ExportDialog({
  isOpen,
  onClose,
  type,
  entityId,
  organizationId,
  title,
}: ExportDialogProps) {
  const formats = formatsByType[type];
  const [selectedFormat, setSelectedFormat] = useState(formats[0].value);
  const [includeOptions, setIncludeOptions] = useState({
    includeTasks: true,
    includeDocuments: true,
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      switch (type) {
        case 'project':
          if (!entityId) throw new Error('Project ID required');
          return exportsApi.exportProject(entityId, {
            format: selectedFormat as 'csv' | 'pdf',
            ...includeOptions,
          });
        case 'tasks':
          if (!organizationId) throw new Error('Organization ID required');
          return exportsApi.exportTasks(organizationId, {
            format: selectedFormat as 'csv' | 'pdf',
          });
        case 'document':
          if (!entityId) throw new Error('Document ID required');
          return exportsApi.exportDocument(entityId, {
            format: selectedFormat as 'md' | 'html' | 'pdf',
          });
        case 'ideas':
          if (!organizationId) throw new Error('Organization ID required');
          return exportsApi.exportIdeas(organizationId, {
            format: selectedFormat as 'csv' | 'pdf',
          });
        case 'papers':
          if (!organizationId) throw new Error('Organization ID required');
          return exportsApi.exportPapers(organizationId, {
            format: selectedFormat as 'csv' | 'bibtex',
          });
        case 'analytics':
          if (!organizationId) throw new Error('Organization ID required');
          return exportsApi.exportAnalytics(organizationId, {
            format: selectedFormat as 'csv' | 'pdf',
          });
        default:
          throw new Error('Unknown export type');
      }
    },
    onSuccess: () => {
      setTimeout(onClose, 1500);
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
              <DocumentArrowDownIcon className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Export {title || type.charAt(0).toUpperCase() + type.slice(1)}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Choose a format for your export
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-elevated dark:hover:text-gray-300"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Format selection */}
        <div className="space-y-2 mb-6">
          {formats.map((format) => (
            <button
              key={format.value}
              onClick={() => setSelectedFormat(format.value)}
              className={clsx(
                'w-full flex items-center justify-between rounded-xl border-2 p-4 text-left transition-colors shadow-soft',
                selectedFormat === format.value
                  ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/30'
                  : 'border-gray-200 hover:border-gray-300 dark:border-dark-border dark:hover:border-gray-500'
              )}
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{format.label}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{format.description}</p>
              </div>
              {selectedFormat === format.value && (
                <CheckIcon className="h-5 w-5 text-primary-600" />
              )}
            </button>
          ))}
        </div>

        {/* Additional options for project export */}
        {type === 'project' && (
          <div className="mb-6 space-y-3 border-t border-gray-200 pt-4 dark:border-dark-border">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Include in export:
            </p>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={includeOptions.includeTasks}
                onChange={(e) =>
                  setIncludeOptions({ ...includeOptions, includeTasks: e.target.checked })
                }
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Tasks</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={includeOptions.includeDocuments}
                onChange={(e) =>
                  setIncludeOptions({ ...includeOptions, includeDocuments: e.target.checked })
                }
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Documents</span>
            </label>
          </div>
        )}

        {/* Error message */}
        {exportMutation.isError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-red-600 dark:bg-red-900/30 dark:text-red-400 shadow-soft">
            <ExclamationTriangleIcon className="h-5 w-5" />
            <span className="text-sm">
              {exportMutation.error instanceof Error
                ? exportMutation.error.message
                : 'Export failed. Please try again.'}
            </span>
          </div>
        )}

        {/* Success message */}
        {exportMutation.isSuccess && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-green-50 p-3 text-green-600 dark:bg-green-900/30 dark:text-green-400 shadow-soft">
            <CheckIcon className="h-5 w-5" />
            <span className="text-sm">Export completed! Your download should start shortly.</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-dark-border dark:text-gray-300 dark:hover:bg-dark-elevated"
          >
            Cancel
          </button>
          <button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending || exportMutation.isSuccess}
            className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 dark:hover:bg-primary-600 disabled:opacity-50"
          >
            {exportMutation.isPending
              ? 'Exporting...'
              : exportMutation.isSuccess
                ? 'Done!'
                : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for easy export dialog usage
export function useExportDialog() {
  const [state, setState] = useState<{
    isOpen: boolean;
    type: ExportType;
    entityId?: string;
    organizationId?: string;
    title?: string;
  }>({
    isOpen: false,
    type: 'project',
  });

  const openExportDialog = (options: {
    type: ExportType;
    entityId?: string;
    organizationId?: string;
    title?: string;
  }) => {
    setState({ isOpen: true, ...options });
  };

  const closeExportDialog = () => {
    setState((prev) => ({ ...prev, isOpen: false }));
  };

  return {
    exportDialogProps: {
      isOpen: state.isOpen,
      onClose: closeExportDialog,
      type: state.type,
      entityId: state.entityId,
      organizationId: state.organizationId,
      title: state.title,
    },
    openExportDialog,
    closeExportDialog,
  };
}
