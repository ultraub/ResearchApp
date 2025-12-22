import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon,
  DocumentTextIcon,
  TrashIcon,
  LinkIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import {
  getProjectPapers,
  getPapers,
  linkPaperToProject,
  getPaperLinks,
  deletePaperLink,
  importPaperByDOI,
  importPaperByPMID,
  type Paper,
} from '@/services/knowledge';

interface ProjectPapersSectionProps {
  projectId: string;
  organizationId: string;
}

export function ProjectPapersSection({ projectId, organizationId }: ProjectPapersSectionProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<'doi' | 'pmid'>('doi');
  const [importIdentifier, setImportIdentifier] = useState('');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: linkedPapers, isLoading } = useQuery({
    queryKey: ['project-papers', projectId],
    queryFn: () => getProjectPapers(projectId),
  });

  const { data: allPapers } = useQuery({
    queryKey: ['papers', organizationId],
    queryFn: () => getPapers(organizationId),
    enabled: isAddModalOpen,
  });

  const linkMutation = useMutation({
    mutationFn: (paperId: string) => linkPaperToProject(paperId, projectId),
    onSuccess: () => {
      toast.success('Paper added to project');
      queryClient.invalidateQueries({ queryKey: ['project-papers', projectId] });
      setIsAddModalOpen(false);
    },
    onError: (error: any) => {
      if (error?.response?.status === 409) {
        toast.error('Paper is already in this project');
      } else {
        toast.error('Failed to add paper');
      }
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (paperId: string) => {
      // Find the link ID for this paper-project combination
      const links = await getPaperLinks(paperId);
      const link = (links || []).find(
        (l) => l.linked_entity_type === 'project' && l.linked_entity_id === projectId
      );
      if (link) {
        await deletePaperLink(link.id);
      }
    },
    onSuccess: () => {
      toast.success('Paper removed from project');
      queryClient.invalidateQueries({ queryKey: ['project-papers', projectId] });
    },
    onError: () => {
      toast.error('Failed to remove paper');
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      // Import the paper
      const paper = importType === 'doi'
        ? await importPaperByDOI(importIdentifier, organizationId)
        : await importPaperByPMID(importIdentifier, organizationId);
      // Link it to the project
      await linkPaperToProject(paper.id, projectId);
      return paper;
    },
    onSuccess: (paper) => {
      toast.success(`Imported and added: ${paper.title}`);
      queryClient.invalidateQueries({ queryKey: ['project-papers', projectId] });
      queryClient.invalidateQueries({ queryKey: ['papers', organizationId] });
      setIsImportModalOpen(false);
      setImportIdentifier('');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.detail || 'Failed to import paper';
      toast.error(message);
    },
  });

  const linkedPaperIds = new Set(linkedPapers?.map((p) => p.id) || []);
  const availablePapers = allPapers?.filter(
    (p) => !linkedPaperIds.has(p.id) && p.title.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Papers ({linkedPapers?.length || 0})
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            <DocumentArrowDownIcon className="h-4 w-4" />
            Import Paper
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-dark-elevated rounded-lg hover:bg-gray-200 dark:hover:bg-dark-base transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            From Library
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-gray-500">Loading papers...</div>
      ) : linkedPapers?.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg">
          <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No papers</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Import papers by DOI/PMID or add from your library
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              <DocumentArrowDownIcon className="h-4 w-4" />
              Import Paper
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <LinkIcon className="h-4 w-4" />
              From Library
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {linkedPapers?.map((paper) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              onRemove={() => unlinkMutation.mutate(paper.id)}
              isRemoving={unlinkMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Add Paper Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setIsAddModalOpen(false)} />

            <div className="relative w-full max-w-lg bg-white dark:bg-dark-card rounded-xl shadow-card">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Add Paper to Project
                </h2>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4">
                <div className="relative mb-4">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search papers in your library..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                <div className="max-h-80 overflow-y-auto space-y-2">
                  {availablePapers.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      {search ? 'No papers found' : 'All papers are already linked'}
                    </div>
                  ) : (
                    availablePapers.map((paper) => (
                      <button
                        key={paper.id}
                        onClick={() => linkMutation.mutate(paper.id)}
                        disabled={linkMutation.isPending}
                        className="w-full p-3 rounded-lg border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-elevated transition-colors text-left disabled:opacity-50"
                      >
                        <p className="font-medium text-gray-900 dark:text-white line-clamp-2">
                          {paper.title}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          {paper.authors?.slice(0, 2).join(', ')}
                          {paper.authors?.length > 2 && ' et al.'}
                          {paper.journal && ` - ${paper.journal}`}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Paper Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setIsImportModalOpen(false)} />

            <div className="relative w-full max-w-md bg-white dark:bg-dark-card rounded-xl shadow-card">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Import Paper
                </h2>
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* Import Type Toggle */}
                <div className="flex rounded-lg bg-gray-100 dark:bg-dark-elevated p-1">
                  <button
                    onClick={() => setImportType('doi')}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                      importType === 'doi'
                        ? 'bg-white dark:bg-dark-base text-gray-900 dark:text-white shadow-soft'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    DOI
                  </button>
                  <button
                    onClick={() => setImportType('pmid')}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                      importType === 'pmid'
                        ? 'bg-white dark:bg-dark-base text-gray-900 dark:text-white shadow-soft'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    PubMed ID
                  </button>
                </div>

                {/* Identifier Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {importType === 'doi' ? 'DOI' : 'PubMed ID'}
                  </label>
                  <input
                    type="text"
                    value={importIdentifier}
                    onChange={(e) => setImportIdentifier(e.target.value)}
                    placeholder={importType === 'doi' ? '10.1234/example.2024' : '12345678'}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {importType === 'doi'
                      ? 'Enter the DOI of the paper (e.g., 10.1038/nature12373)'
                      : 'Enter the PubMed ID number'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border">
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-dark-elevated rounded-lg hover:bg-gray-200 dark:hover:bg-dark-base transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => importMutation.mutate()}
                  disabled={!importIdentifier.trim() || importMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {importMutation.isPending ? 'Importing...' : 'Import & Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaperCard({
  paper,
  onRemove,
  isRemoving,
}: {
  paper: Paper;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  return (
    <div className="p-4 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 dark:text-white line-clamp-2">
            {paper.title}
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            {paper.authors?.slice(0, 3).join(', ')}
            {paper.authors?.length > 3 && ' et al.'}
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            {paper.journal && <span>{paper.journal}</span>}
            {paper.doi && (
              <a
                href={`https://doi.org/${paper.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:underline"
              >
                DOI
              </a>
            )}
            {paper.pmid && (
              <a
                href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:underline"
              >
                PubMed
              </a>
            )}
          </div>
        </div>
        <button
          onClick={onRemove}
          disabled={isRemoving}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
          title="Remove from project"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
