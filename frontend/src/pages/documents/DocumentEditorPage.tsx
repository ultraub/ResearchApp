import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import {
  ArrowLeftIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  EllipsisVerticalIcon,
  CheckCircleIcon,
  SparklesIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { DocumentEditor, MarkdownEditor } from '../../components/editor';
import {
  getDocument,
  updateDocument,
  getDocumentVersions,
  restoreDocumentVersion,
  type DocumentVersion,
} from '../../services/documents';
import { DocumentCommentsSidebar } from '../../components/documents';
import { AISidebar } from '../../components/ai';
import OwnerDisplay from '@/components/common/OwnerDisplay';
import { useDocumentComments } from '../../hooks/useDocumentComments';
import { BottomSheet } from '@/components/ui/BottomSheet';

const DOCUMENT_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In Review' },
  { value: 'published', label: 'Published' },
];

export function DocumentEditorPage() {
  const { projectId, documentId } = useParams<{ projectId: string; documentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [contentText, setContentText] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  const { data: document, isLoading } = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => getDocument(documentId!),
    enabled: !!documentId,
  });

  const { data: versions = [] } = useQuery({
    queryKey: ['documentVersions', documentId],
    queryFn: () => getDocumentVersions(documentId!),
    enabled: !!documentId && showVersionHistory,
  });

  // Use comments hook for inline comments and sidebar
  const {
    comments,
    addComment,
    editComment,
    removeComment,
    resolveCommentById,
  } = useDocumentComments({
    documentId: documentId!,
    includeResolved: true,
    enabled: !!documentId,
  });

  // State for pending inline comment (when user selects text and clicks add comment)
  const [pendingInlineComment, setPendingInlineComment] = useState<{
    selectedText: string;
    anchorData: { from: number; to: number; surroundingText: string };
  } | null>(null);

  // Initialize local state from document
  useEffect(() => {
    if (document) {
      setTitle(document.title);
      setContent(document.content);
      setContentText(document.content_text || '');
    }
  }, [document]);

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateDocument>[1]) =>
      updateDocument(documentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['documentVersions', documentId] });
      setHasUnsavedChanges(false);
      toast.success('Document saved');
    },
    onError: () => {
      toast.error('Failed to save document');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) => restoreDocumentVersion(documentId!, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['documentVersions', documentId] });
      setShowVersionHistory(false);
      toast.success('Version restored');
    },
    onError: () => {
      toast.error('Failed to restore version');
    },
  });

  const handleContentChange = useCallback(
    (newContent: Record<string, unknown>, newText: string) => {
      setContent(newContent);
      setContentText(newText);
      setHasUnsavedChanges(true);
    },
    []
  );

  // Handler for markdown editor content changes (plain text)
  const handleMarkdownContentChange = useCallback(
    (newText: string) => {
      setContentText(newText);
      // For markdown mode, store minimal content object
      setContent({ type: 'markdown', text: newText });
      setHasUnsavedChanges(true);
    },
    []
  );

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setHasUnsavedChanges(true);
  };

  const handleSave = useCallback(
    async (createVersion = false) => {
      await updateMutation.mutateAsync({
        title,
        content,
        content_text: contentText,
        create_version: createVersion,
        change_summary: createVersion ? `Saved at ${format(new Date(), 'PPp')}` : undefined,
      });
    },
    [updateMutation, title, content, contentText]
  );

  const handleStatusChange = (status: string) => {
    updateMutation.mutate({ status });
  };

  const handleToggleMarkdownMode = () => {
    updateMutation.mutate(
      { markdown_mode: !document?.markdown_mode },
      {
        onSuccess: () => {
          toast.success(
            document?.markdown_mode
              ? 'Switched to rich text editor'
              : 'Switched to markdown mode'
          );
        },
      }
    );
  };

  // Handler for when user clicks "Add Comment" on selected text
  const handleAddInlineComment = useCallback(
    (selectedText: string, anchorData: Record<string, unknown>) => {
      setPendingInlineComment({
        selectedText,
        anchorData: anchorData as { from: number; to: number; surroundingText: string },
      });
      // Open comments sidebar to show the input
      setShowComments(true);
    },
    []
  );

  // Handler for submitting inline comment
  const handleSubmitInlineComment = useCallback(
    async (content: string) => {
      if (!pendingInlineComment) return;

      await addComment(content, {
        selectedText: pendingInlineComment.selectedText,
        selectionStart: pendingInlineComment.anchorData.from,
        selectionEnd: pendingInlineComment.anchorData.to,
      });

      setPendingInlineComment(null);
    },
    [addComment, pendingInlineComment]
  );

  // Handler for resolving document comments (for inline popup)
  const handleResolveDocComment = useCallback(
    async (commentId: string) => {
      await resolveCommentById(commentId);
    },
    [resolveCommentById]
  );

  // Handler for replying to document comments (for inline popup)
  const handleReplyToDocComment = useCallback(
    async (parentId: string, content: string) => {
      await addComment(content, { parentId });
    },
    [addComment]
  );

  // Handler for editing document comments (for inline popup)
  const handleEditDocComment = useCallback(
    async (commentId: string, content: string) => {
      await editComment(commentId, content);
    },
    [editComment]
  );

  // Handler for deleting document comments (for inline popup)
  const handleDeleteDocComment = useCallback(
    async (commentId: string) => {
      await removeComment(commentId);
    },
    [removeComment]
  );

  // Warn about unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  if (isLoading || !document) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-base px-4 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/projects/${projectId}/documents`)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="flex-1 text-lg font-medium bg-transparent border-none focus:outline-none focus:ring-0 text-gray-900 dark:text-white"
            placeholder="Untitled Document"
          />

          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <span className="text-sm text-yellow-600 dark:text-yellow-400">Unsaved changes</span>
            )}

            <select
              value={document.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="text-sm border border-gray-200 dark:border-dark-border rounded-lg px-2 py-1 bg-white dark:bg-dark-elevated text-gray-900 dark:text-gray-100"
            >
              {DOCUMENT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowVersionHistory(!showVersionHistory)}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                showVersionHistory
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-elevated'
              )}
              title="Version history"
            >
              <ClockIcon className="w-5 h-5" />
            </button>

            <button
              onClick={() => setShowComments(!showComments)}
              className={clsx(
                'p-2 rounded-lg transition-colors relative',
                showComments
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-elevated'
              )}
              title="Comments"
            >
              <ChatBubbleLeftRightIcon className="w-5 h-5" />
              {comments.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 text-xs bg-primary-600 text-white rounded-full flex items-center justify-center">
                  {comments.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowAI(!showAI)}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                showAI
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-elevated'
              )}
              title="AI Assistant"
            >
              <SparklesIcon className="w-5 h-5" />
            </button>

            <button
              onClick={() => handleToggleMarkdownMode()}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                document.markdown_mode
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-elevated'
              )}
              title={document.markdown_mode ? 'Markdown paste mode (ON)' : 'Markdown paste mode (OFF)'}
            >
              <DocumentTextIcon className="w-5 h-5" />
            </button>

            <Menu as="div" className="relative">
              <Menu.Button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200">
                <EllipsisVerticalIcon className="w-5 h-5" />
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
                        onClick={() => handleSave(true)}
                        className={clsx(
                          'w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200',
                          active ? 'bg-gray-100 dark:bg-gray-700' : ''
                        )}
                      >
                        <CheckCircleIcon className="w-4 h-4" />
                        Save as new version
                      </button>
                    )}
                  </Menu.Item>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>
        </div>

        {/* Creator/Editor info */}
        {(document.created_by_name || document.last_edited_by_name) && (
          <div className="flex items-center gap-4 mt-2 ml-12 text-xs text-gray-500 dark:text-gray-400">
            {document.created_by_name && (
              <span className="flex items-center gap-1">
                <span>Created by</span>
                <OwnerDisplay
                  name={document.created_by_name}
                  email={document.created_by_email}
                  id={document.created_by_id}
                  size="xs"
                  showName
                />
              </span>
            )}
            {document.last_edited_by_name && document.last_edited_by_id !== document.created_by_id && (
              <span className="flex items-center gap-1">
                <span>•</span>
                <span>Last edited by</span>
                <OwnerDisplay
                  name={document.last_edited_by_name}
                  email={document.last_edited_by_email}
                  id={document.last_edited_by_id}
                  size="xs"
                  showName
                />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-auto bg-white dark:bg-dark-card">
          {document.markdown_mode ? (
            <MarkdownEditor
              content={contentText}
              onChange={handleMarkdownContentChange}
              onSave={() => handleSave(false)}
            />
          ) : (
            <DocumentEditor
              content={content}
              onChange={handleContentChange}
              onSave={() => handleSave(false)}
              placeholder="Start writing your document..."
              autoFocus
              documentComments={comments}
              onAddComment={handleAddInlineComment}
              onResolveDocComment={handleResolveDocComment}
              onReplyToDocComment={handleReplyToDocComment}
              onEditDocComment={handleEditDocComment}
              onDeleteDocComment={handleDeleteDocComment}
            />
          )}
        </div>

        {/* DESKTOP: Version History Sidebar */}
        {showVersionHistory && (
          <div className="hidden md:block w-80 flex-shrink-0 border-l border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-base overflow-auto">
            <div className="p-4">
              <h3 className="font-medium text-gray-900 dark:text-white mb-4">Version History</h3>
              <div className="space-y-3">
                {/* Current version */}
                <div className="p-3 bg-white dark:bg-dark-card rounded-lg border border-primary-200 dark:border-primary-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                      Current (v{document.version})
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {format(new Date(document.updated_at), 'PPp')}
                  </p>
                </div>

                {/* Previous versions */}
                {versions.map((version) => (
                  <VersionCard
                    key={version.id}
                    version={version}
                    onRestore={() => restoreMutation.mutate(version.id)}
                    isRestoring={restoreMutation.isPending}
                  />
                ))}

                {versions.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    No previous versions
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* DESKTOP: Comments Sidebar */}
        <div className="hidden md:block">
          <DocumentCommentsSidebar
            documentId={documentId!}
            isOpen={showComments}
            onClose={() => setShowComments(false)}
            onJumpToSelection={(start, end) => {
              // TODO: Implement scroll to selection in editor
              console.log('Jump to selection:', start, end);
            }}
            pendingInlineComment={pendingInlineComment}
            onSubmitInlineComment={handleSubmitInlineComment}
            onCancelInlineComment={() => setPendingInlineComment(null)}
          />
        </div>

        {/* DESKTOP: AI Assistant Sidebar */}
        {showAI && (
          <div className="hidden md:block w-96 flex-shrink-0">
            <AISidebar
              documentId={documentId!}
              documentContent={contentText}
              selectedText={selectedText}
              documentType={document.document_type || 'document'}
              onClose={() => setShowAI(false)}
              onInsertContent={(text) => {
                // Insert at cursor position - for now append to content
                setContentText((prev) => prev + '\n\n' + text);
                setHasUnsavedChanges(true);
                toast.success('Content inserted');
              }}
              onReplaceSelection={(text) => {
                if (selectedText) {
                  setContentText((prev) => prev.replace(selectedText, text));
                  setSelectedText('');
                  setHasUnsavedChanges(true);
                  toast.success('Selection replaced');
                }
              }}
            />
          </div>
        )}
      </div>

      {/* MOBILE: Version History Bottom Sheet */}
      <BottomSheet
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        title="Version History"
        mobileOnly
      >
        <div className="space-y-3">
          {/* Current version */}
          <div className="p-3 bg-white dark:bg-dark-card rounded-lg border border-primary-200 dark:border-primary-800">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                Current (v{document.version})
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {format(new Date(document.updated_at), 'PPp')}
            </p>
          </div>

          {/* Previous versions */}
          {versions.map((version) => (
            <VersionCard
              key={version.id}
              version={version}
              onRestore={() => restoreMutation.mutate(version.id)}
              isRestoring={restoreMutation.isPending}
            />
          ))}

          {versions.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No previous versions
            </p>
          )}
        </div>
      </BottomSheet>

      {/* MOBILE: Comments Bottom Sheet */}
      <BottomSheet
        isOpen={showComments}
        onClose={() => setShowComments(false)}
        title={`Comments ${comments.length > 0 ? `(${comments.length})` : ''}`}
        snapPoints={[0.6, 0.9]}
        mobileOnly
      >
        <DocumentCommentsSidebar
          documentId={documentId!}
          isOpen={true}
          onClose={() => setShowComments(false)}
          onJumpToSelection={(start, end) => {
            setShowComments(false);
            console.log('Jump to selection:', start, end);
          }}
          pendingInlineComment={pendingInlineComment}
          onSubmitInlineComment={handleSubmitInlineComment}
          onCancelInlineComment={() => setPendingInlineComment(null)}
        />
      </BottomSheet>

      {/* MOBILE: AI Assistant Bottom Sheet */}
      <BottomSheet
        isOpen={showAI}
        onClose={() => setShowAI(false)}
        title="AI Assistant"
        snapPoints={[0.6, 0.9]}
        mobileOnly
      >
        <AISidebar
          documentId={documentId!}
          documentContent={contentText}
          selectedText={selectedText}
          documentType={document.document_type || 'document'}
          onClose={() => setShowAI(false)}
          onInsertContent={(text) => {
            setContentText((prev) => prev + '\n\n' + text);
            setHasUnsavedChanges(true);
            setShowAI(false);
            toast.success('Content inserted');
          }}
          onReplaceSelection={(text) => {
            if (selectedText) {
              setContentText((prev) => prev.replace(selectedText, text));
              setSelectedText('');
              setHasUnsavedChanges(true);
              setShowAI(false);
              toast.success('Selection replaced');
            }
          }}
        />
      </BottomSheet>
    </div>
  );
}

interface VersionCardProps {
  version: DocumentVersion;
  onRestore: () => void;
  isRestoring: boolean;
}

function VersionCard({ version, onRestore, isRestoring }: VersionCardProps) {
  return (
    <div className="p-3 bg-white dark:bg-dark-card rounded-lg border border-gray-200 dark:border-dark-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          Version {version.version}
        </span>
        <button
          onClick={onRestore}
          disabled={isRestoring}
          className="text-xs text-primary-600 hover:text-primary-700 disabled:opacity-50"
        >
          Restore
        </button>
      </div>
      {version.change_summary && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
          {version.change_summary}
        </p>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {format(new Date(version.created_at), 'PPp')}
      </p>
      {version.word_count !== null && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {version.word_count} words
        </p>
      )}
    </div>
  );
}

export default DocumentEditorPage;
