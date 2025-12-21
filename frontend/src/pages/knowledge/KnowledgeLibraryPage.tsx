import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  BookOpenIcon,
  FolderIcon,
  FolderPlusIcon,
  StarIcon,
  EllipsisVerticalIcon,
  TrashIcon,
  DocumentArrowDownIcon,
  LinkIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { Menu, Transition, Dialog } from '@headlessui/react';
import { Fragment } from 'react';
import {
  getPapers,
  getCollections,
  createPaper,
  updatePaper,
  deletePaper,
  createCollection,
  importPaperByDOI,
  importPaperByPMID,
  type Paper,
  type Collection,
} from '../../services/knowledge';
import { PaperSummary } from '../../components/ai';
import { LinkPaperToProjectModal } from '../../components/knowledge/LinkPaperToProjectModal';

interface KnowledgeLibraryPageProps {
  organizationId: string;
}

export function KnowledgeLibraryPage({ organizationId }: KnowledgeLibraryPageProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [readStatusFilter, setReadStatusFilter] = useState<string | undefined>();
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | undefined>();
  const [view, setView] = useState<'papers' | 'collections'>('papers');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddPaperModal, setShowAddPaperModal] = useState(false);
  const [showAddCollectionModal, setShowAddCollectionModal] = useState(false);
  const [paperToLink, setPaperToLink] = useState<Paper | null>(null);

  const { data: papers = [], isLoading: papersLoading } = useQuery({
    queryKey: ['papers', organizationId, search, readStatusFilter, selectedCollectionId],
    queryFn: () =>
      getPapers(organizationId, {
        search: search || undefined,
        read_status: readStatusFilter,
        collection_id: selectedCollectionId,
      }),
  });

  const { data: collections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: ['collections', organizationId],
    queryFn: () => getCollections(organizationId),
  });

  const updatePaperMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updatePaper>[1] }) =>
      updatePaper(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['papers'] });
    },
  });

  const deletePaperMutation = useMutation({
    mutationFn: deletePaper,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      toast.success('Paper deleted');
    },
    onError: () => {
      toast.error('Failed to delete paper');
    },
  });

  const handleSetReadStatus = (paper: Paper, status: 'unread' | 'reading' | 'read') => {
    updatePaperMutation.mutate({ id: paper.id, data: { read_status: status } });
  };

  const handleSetRating = (paper: Paper, rating: number) => {
    updatePaperMutation.mutate({ id: paper.id, data: { rating } });
  };

  const handleDeletePaper = (paperId: string) => {
    if (confirm('Are you sure you want to delete this paper?')) {
      deletePaperMutation.mutate(paperId);
    }
  };

  const isLoading = papersLoading || collectionsLoading;

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-dark-elevated rounded w-1/4" />
          <div className="h-12 bg-gray-200 dark:bg-dark-elevated rounded" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-dark-elevated rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Knowledge Library</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-elevated transition-colors"
          >
            <DocumentArrowDownIcon className="w-5 h-5" />
            Import
          </button>
          <button
            onClick={() => setShowAddPaperModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            Add Paper
          </button>
        </div>
      </div>

      {/* View Toggle & Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center bg-gray-100 dark:bg-dark-elevated rounded-lg p-1">
          <button
            onClick={() => setView('papers')}
            className={clsx(
              'px-4 py-2 rounded-md text-sm font-medium transition-colors',
              view === 'papers'
                ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-soft'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <BookOpenIcon className="w-4 h-4 inline mr-2" />
            Papers
          </button>
          <button
            onClick={() => setView('collections')}
            className={clsx(
              'px-4 py-2 rounded-md text-sm font-medium transition-colors',
              view === 'collections'
                ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-soft'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <FolderIcon className="w-4 h-4 inline mr-2" />
            Collections
          </button>
        </div>

        {view === 'papers' && (
          <>
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search papers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-2">
              <FunnelIcon className="w-5 h-5 text-gray-400" />
              <select
                value={readStatusFilter || ''}
                onChange={(e) => setReadStatusFilter(e.target.value || undefined)}
                className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card text-gray-900 dark:text-white"
              >
                <option value="">All statuses</option>
                <option value="unread">Unread</option>
                <option value="reading">Reading</option>
                <option value="read">Read</option>
              </select>

              <select
                value={selectedCollectionId || ''}
                onChange={(e) => setSelectedCollectionId(e.target.value || undefined)}
                className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card text-gray-900 dark:text-white"
              >
                <option value="">All collections</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      {view === 'papers' ? (
        <PapersList
          papers={papers}
          onSetReadStatus={handleSetReadStatus}
          onSetRating={handleSetRating}
          onDelete={handleDeletePaper}
          onLinkToProject={(paper) => setPaperToLink(paper)}
        />
      ) : (
        <CollectionsList
          collections={collections}
          onAddCollection={() => setShowAddCollectionModal(true)}
        />
      )}

      {/* Import Modal */}
      <ImportPaperModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        organizationId={organizationId}
      />

      {/* Add Paper Modal */}
      <AddPaperModal
        isOpen={showAddPaperModal}
        onClose={() => setShowAddPaperModal(false)}
        organizationId={organizationId}
      />

      {/* Add Collection Modal */}
      <AddCollectionModal
        isOpen={showAddCollectionModal}
        onClose={() => setShowAddCollectionModal(false)}
        organizationId={organizationId}
      />

      {/* Link to Project Modal */}
      {paperToLink && (
        <LinkPaperToProjectModal
          isOpen={!!paperToLink}
          onClose={() => setPaperToLink(null)}
          paper={paperToLink}
        />
      )}
    </div>
  );
}

// Papers List Component
interface PapersListProps {
  papers: Paper[];
  onSetReadStatus: (paper: Paper, status: 'unread' | 'reading' | 'read') => void;
  onSetRating: (paper: Paper, rating: number) => void;
  onDelete: (paperId: string) => void;
  onLinkToProject: (paper: Paper) => void;
}

function PapersList({ papers, onSetReadStatus, onSetRating, onDelete, onLinkToProject }: PapersListProps) {
  if (papers.length === 0) {
    return (
      <div className="text-center py-12">
        <BookOpenIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No papers yet
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Add papers to your library to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {papers.map((paper) => (
        <PaperCard
          key={paper.id}
          paper={paper}
          onSetReadStatus={onSetReadStatus}
          onSetRating={onSetRating}
          onDelete={onDelete}
          onLinkToProject={onLinkToProject}
        />
      ))}
    </div>
  );
}

// Paper Card Component
interface PaperCardProps {
  paper: Paper;
  onSetReadStatus: (paper: Paper, status: 'unread' | 'reading' | 'read') => void;
  onSetRating: (paper: Paper, rating: number) => void;
  onDelete: (paperId: string) => void;
  onLinkToProject: (paper: Paper) => void;
}

const READ_STATUS_COLORS: Record<string, string> = {
  unread: 'bg-gray-100 text-gray-700 dark:bg-dark-card dark:text-gray-300',
  reading: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  read: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
};

function PaperCard({ paper, onSetReadStatus, onSetRating, onDelete, onLinkToProject }: PaperCardProps) {
  const [showSummary, setShowSummary] = useState(false);

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600 transition-colors group">
      <div className="p-4 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
            {paper.title}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {paper.authors.slice(0, 3).join(', ')}
            {paper.authors.length > 3 && ` +${paper.authors.length - 3} more`}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span
              className={clsx(
                'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded',
                READ_STATUS_COLORS[paper.read_status]
              )}
            >
              {paper.read_status}
            </span>
            {paper.journal && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {paper.journal}
              </span>
            )}
            {paper.publication_date && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {format(new Date(paper.publication_date), 'yyyy')}
              </span>
            )}
            {paper.doi && (
              <a
                href={`https://doi.org/${paper.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <LinkIcon className="w-3 h-3" />
                DOI
              </a>
            )}
            <button
              onClick={() => setShowSummary(!showSummary)}
              className={clsx(
                'text-xs flex items-center gap-1 transition-colors',
                showSummary
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400'
              )}
            >
              <SparklesIcon className="w-3 h-3" />
              AI Summary
            </button>
          </div>
          {paper.ai_summary && !showSummary && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
              {paper.ai_summary}
            </p>
          )}
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => onSetRating(paper, star)}
              className="p-0.5 hover:scale-110 transition-transform"
            >
              {paper.rating && paper.rating >= star ? (
                <StarIconSolid className="w-4 h-4 text-yellow-400" />
              ) : (
                <StarIcon className="w-4 h-4 text-gray-300 dark:text-gray-600" />
              )}
            </button>
          ))}
        </div>

        {/* Actions Menu */}
        <Menu as="div" className="relative">
          <Menu.Button className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-dark-elevated transition-opacity">
            <EllipsisVerticalIcon className="w-5 h-5 text-gray-500" />
          </Menu.Button>
          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className="absolute right-0 mt-2 w-48 bg-white dark:bg-dark-card rounded-xl shadow-card border border-gray-200 dark:border-dark-border py-1 z-10">
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => onSetReadStatus(paper, 'unread')}
                    className={clsx(
                      'w-full text-left px-4 py-2 text-sm',
                      active ? 'bg-gray-100 dark:bg-dark-elevated' : ''
                    )}
                  >
                    Mark as Unread
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => onSetReadStatus(paper, 'reading')}
                    className={clsx(
                      'w-full text-left px-4 py-2 text-sm',
                      active ? 'bg-gray-100 dark:bg-dark-elevated' : ''
                    )}
                  >
                    Mark as Reading
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => onSetReadStatus(paper, 'read')}
                    className={clsx(
                      'w-full text-left px-4 py-2 text-sm',
                      active ? 'bg-gray-100 dark:bg-dark-elevated' : ''
                    )}
                  >
                    Mark as Read
                  </button>
                )}
              </Menu.Item>
              <div className="h-px bg-gray-200 dark:bg-dark-border my-1" />
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => onLinkToProject(paper)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300',
                      active ? 'bg-gray-100 dark:bg-gray-700' : ''
                    )}
                  >
                    <FolderPlusIcon className="w-4 h-4" />
                    Link to Project
                  </button>
                )}
              </Menu.Item>
              <div className="h-px bg-gray-200 dark:bg-dark-border my-1" />
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => onDelete(paper.id)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600',
                      active ? 'bg-gray-100 dark:bg-gray-700' : ''
                    )}
                  >
                    <TrashIcon className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </Menu.Item>
            </Menu.Items>
          </Transition>
        </Menu>
      </div>

      {/* AI Summary Section */}
      {showSummary && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-dark-border">
          <PaperSummary
            paperId={paper.id}
            paperTitle={paper.title}
            existingSummary={paper.ai_summary}
          />
        </div>
      )}
    </div>
  );
}

// Collections List Component
interface CollectionsListProps {
  collections: Collection[];
  onAddCollection: () => void;
}

function CollectionsList({ collections, onAddCollection }: CollectionsListProps) {
  if (collections.length === 0) {
    return (
      <div className="text-center py-12">
        <FolderIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No collections yet
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          Create collections to organize your papers
        </p>
        <button
          onClick={onAddCollection}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <PlusIcon className="w-5 h-5" />
          New Collection
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {collections.map((collection) => (
        <div
          key={collection.id}
          className="p-4 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: collection.color || '#6B7280' }}
            >
              <FolderIcon className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-medium text-gray-900 dark:text-white">{collection.name}</h3>
          </div>
          {collection.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 line-clamp-2">
              {collection.description}
            </p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {collection.paper_count} papers
          </p>
        </div>
      ))}
      <button
        onClick={onAddCollection}
        className="p-4 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-xl hover:border-gray-400 dark:hover:border-gray-500 transition-colors flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400"
      >
        <PlusIcon className="w-8 h-8" />
        <span className="text-sm">New Collection</span>
      </button>
    </div>
  );
}

// Import Paper Modal
interface ImportPaperModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
}

function ImportPaperModal({ isOpen, onClose, organizationId }: ImportPaperModalProps) {
  const queryClient = useQueryClient();
  const [importType, setImportType] = useState<'doi' | 'pmid'>('doi');
  const [identifier, setIdentifier] = useState('');

  const importByDOIMutation = useMutation({
    mutationFn: (doi: string) => importPaperByDOI(doi, organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      toast.success('Paper imported successfully');
      onClose();
      setIdentifier('');
    },
    onError: () => {
      toast.error('Failed to import paper');
    },
  });

  const importByPMIDMutation = useMutation({
    mutationFn: (pmid: string) => importPaperByPMID(pmid, organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      toast.success('Paper imported successfully');
      onClose();
      setIdentifier('');
    },
    onError: () => {
      toast.error('Failed to import paper');
    },
  });

  const handleImport = () => {
    if (importType === 'doi') {
      importByDOIMutation.mutate(identifier);
    } else {
      importByPMIDMutation.mutate(identifier);
    }
  };

  const isLoading = importByDOIMutation.isPending || importByPMIDMutation.isPending;

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-md bg-white dark:bg-dark-card rounded-xl shadow-card">
          <div className="p-6">
            <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Import Paper
            </Dialog.Title>

            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setImportType('doi')}
                  className={clsx(
                    'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
                    importType === 'doi'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-dark-elevated text-gray-700 dark:text-gray-300'
                  )}
                >
                  DOI
                </button>
                <button
                  onClick={() => setImportType('pmid')}
                  className={clsx(
                    'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
                    importType === 'pmid'
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 dark:bg-dark-elevated text-gray-700 dark:text-gray-300'
                  )}
                >
                  PMID
                </button>
              </div>

              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={importType === 'doi' ? '10.1234/example' : '12345678'}
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-elevated rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!identifier || isLoading}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {isLoading ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

// Add Paper Modal
interface AddPaperModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
}

function AddPaperModal({ isOpen, onClose, organizationId }: AddPaperModalProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [journal, setJournal] = useState('');
  const [doi, setDoi] = useState('');

  const createMutation = useMutation({
    mutationFn: createPaper,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      toast.success('Paper added');
      onClose();
      setTitle('');
      setAuthors('');
      setJournal('');
      setDoi('');
    },
    onError: () => {
      toast.error('Failed to add paper');
    },
  });

  const handleSubmit = () => {
    createMutation.mutate({
      title,
      authors: authors.split(',').map((a) => a.trim()).filter(Boolean),
      journal: journal || undefined,
      doi: doi || undefined,
      organization_id: organizationId,
    });
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-md bg-white dark:bg-dark-card rounded-xl shadow-card">
          <div className="p-6">
            <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Add Paper Manually
            </Dialog.Title>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Authors (comma-separated)
                </label>
                <input
                  type="text"
                  value={authors}
                  onChange={(e) => setAuthors(e.target.value)}
                  placeholder="Smith J, Doe A"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Journal
                </label>
                <input
                  type="text"
                  value={journal}
                  onChange={(e) => setJournal(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  DOI
                </label>
                <input
                  type="text"
                  value={doi}
                  onChange={(e) => setDoi(e.target.value)}
                  placeholder="10.1234/example"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-elevated rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!title || createMutation.isPending}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Adding...' : 'Add Paper'}
              </button>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

// Add Collection Modal
interface AddCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
}

function AddCollectionModal({ isOpen, onClose, organizationId }: AddCollectionModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6B7280');

  const createMutation = useMutation({
    mutationFn: createCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      toast.success('Collection created');
      onClose();
      setName('');
      setDescription('');
      setColor('#6B7280');
    },
    onError: () => {
      toast.error('Failed to create collection');
    },
  });

  const handleSubmit = () => {
    createMutation.mutate({
      name,
      description: description || undefined,
      color,
      organization_id: organizationId,
    });
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-md bg-white dark:bg-dark-card rounded-xl shadow-card">
          <div className="p-6">
            <Dialog.Title className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Create Collection
            </Dialog.Title>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-elevated text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-12 h-10 rounded border border-gray-300 dark:border-gray-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-elevated rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!name || createMutation.isPending}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}

export default KnowledgeLibraryPage;
