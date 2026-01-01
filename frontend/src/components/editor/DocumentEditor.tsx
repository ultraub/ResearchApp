import { useEditor, EditorContent, BubbleMenu, FloatingMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { ChatBubbleLeftIcon } from '@heroicons/react/24/outline';
import { useEditorPreferences } from '@/hooks/useEditorPreferences';
import { ReviewCommentMark, reviewCommentMarkStyles } from './extensions/ReviewCommentMark';
import { DocumentCommentMark, documentCommentMarkStyles } from './extensions/DocumentCommentMark';
import { MarkdownPaste } from './extensions/MarkdownPaste';
import { InlineReviewPanel } from './InlineReviewPanel';
import { InlineCommentPopup } from '@/components/documents/comments';
import type { ReviewComment } from '@/types';
import type { DocumentComment } from '@/services/documents';

interface DocumentEditorProps {
  content: Record<string, unknown>;
  onChange?: (content: Record<string, unknown>, text: string) => void;
  onSave?: () => void;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** Review comments to display as inline highlights */
  reviewComments?: ReviewComment[];
  /** Callback when a comment is resolved */
  onResolveComment?: (commentId: string, notes?: string) => Promise<void>;
  /** Callback when replying to a comment */
  onReplyToComment?: (commentId: string, content: string) => Promise<void>;
  /** Callback when accepting an AI suggestion */
  onAcceptAISuggestion?: (commentId: string, notes?: string) => Promise<void>;
  /** Callback when dismissing an AI suggestion */
  onDismissAISuggestion?: (commentId: string, notes?: string) => Promise<void>;
  /** Callback when adding a new comment on selected text */
  onAddComment?: (selectedText: string, anchorData: Record<string, unknown>) => void;
  /** Document comments to display as inline highlights */
  documentComments?: DocumentComment[];
  /** Callback when a document comment is resolved */
  onResolveDocComment?: (commentId: string) => Promise<void>;
  /** Callback when replying to a document comment */
  onReplyToDocComment?: (parentId: string, content: string) => Promise<void>;
  /** Callback when editing a document comment */
  onEditDocComment?: (commentId: string, content: string) => Promise<void>;
  /** Callback when deleting a document comment */
  onDeleteDocComment?: (commentId: string) => Promise<void>;
}

const MenuButton = ({
  onClick,
  isActive = false,
  disabled = false,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={clsx(
      'p-1.5 rounded-xl text-sm transition-colors',
      isActive
        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-elevated',
      disabled && 'opacity-50 cursor-not-allowed'
    )}
  >
    {children}
  </button>
);

export function DocumentEditor({
  content,
  onChange,
  onSave,
  placeholder = 'Start writing...',
  editable = true,
  autoFocus = false,
  className,
  reviewComments = [],
  onResolveComment,
  onReplyToComment,
  onAcceptAISuggestion,
  onDismissAISuggestion,
  onAddComment,
  documentComments = [],
  onResolveDocComment,
  onReplyToDocComment,
  onEditDocComment,
  onDeleteDocComment,
}: DocumentEditorProps) {
  const { fontSize, lineHeight } = useEditorPreferences();
  const [wordCount, setWordCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedComment, setSelectedComment] = useState<ReviewComment | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedDocComment, setSelectedDocComment] = useState<DocumentComment | null>(null);
  const [isDocCommentPopupOpen, setIsDocCommentPopupOpen] = useState(false);
  const [docCommentPopupPosition, setDocCommentPopupPosition] = useState<{ top: number; left: number } | undefined>();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Highlight.configure({
        multicolor: true,
      }),
      ReviewCommentMark,
      DocumentCommentMark,
      MarkdownPaste,
    ],
    content,
    editable,
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const text = editor.getText();
      setWordCount(text.split(/\s+/).filter(Boolean).length);
      onChange?.(json, text);
    },
  });

  // Handle clicking on review comment marks
  useEffect(() => {
    if (!editor) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Check for document comment marks first
      const docCommentMark = target.closest('[data-doc-comment-id]');
      if (docCommentMark) {
        const commentId = docCommentMark.getAttribute('data-doc-comment-id');
        const comment = documentComments.find((c) => c.id === commentId);
        if (comment) {
          // Get position for popup
          const rect = docCommentMark.getBoundingClientRect();
          setDocCommentPopupPosition({
            top: rect.bottom + window.scrollY + 8,
            left: rect.left + window.scrollX,
          });
          setSelectedDocComment(comment);
          setIsDocCommentPopupOpen(true);
          // Close review panel if open
          setIsPanelOpen(false);
          setSelectedComment(null);
        }
        return;
      }

      // Check for review comment marks
      const commentMark = target.closest('[data-comment-id]');
      if (commentMark) {
        const commentId = commentMark.getAttribute('data-comment-id');
        const comment = reviewComments.find((c) => c.id === commentId);
        if (comment) {
          setSelectedComment(comment);
          setIsPanelOpen(true);
          // Close doc comment popup if open
          setIsDocCommentPopupOpen(false);
          setSelectedDocComment(null);
        }
      }
    };

    const editorElement = editor.view.dom;
    editorElement.addEventListener('click', handleClick);

    return () => {
      editorElement.removeEventListener('click', handleClick);
    };
  }, [editor, reviewComments, documentComments]);

  // Handle adding a comment on selected text
  const handleAddComment = useCallback(() => {
    if (!editor || !onAddComment) return;

    const { from, to } = editor.state.selection;
    if (from === to) return; // No text selected

    const selectedText = editor.state.doc.textBetween(from, to);
    const anchorData = {
      from,
      to,
      // Include some surrounding context for fuzzy matching later
      surroundingText: editor.state.doc.textBetween(
        Math.max(0, from - 50),
        Math.min(editor.state.doc.content.size, to + 50)
      ),
    };

    onAddComment(selectedText, anchorData);
  }, [editor, onAddComment]);

  // Close panel handler
  const handleClosePanel = useCallback(() => {
    setIsPanelOpen(false);
    setSelectedComment(null);
  }, []);

  // Close document comment popup handler
  const handleCloseDocCommentPopup = useCallback(() => {
    setIsDocCommentPopupOpen(false);
    setSelectedDocComment(null);
  }, []);

  // Update content when it changes externally
  useEffect(() => {
    if (editor && content && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  // Apply document comment marks to inline comments
  useEffect(() => {
    if (!editor || documentComments.length === 0) return;

    // Get inline comments with position data
    const inlineComments = documentComments.filter(
      (c) => c.selection_start !== null && c.selection_end !== null && !c.parent_id
    );

    if (inlineComments.length === 0) return;

    // Apply marks for each inline comment
    const docSize = editor.state.doc.content.size;
    inlineComments.forEach((comment) => {
      const from = comment.selection_start!;
      const to = comment.selection_end!;

      // Validate positions are within document bounds
      if (from >= 0 && to <= docSize && from < to) {
        editor
          .chain()
          .setTextSelection({ from, to })
          .setDocumentComment({
            commentId: comment.id,
            isResolved: comment.is_resolved,
          })
          .run();
      }
    });

    // Reset selection to end
    editor.commands.setTextSelection(docSize);
  }, [editor, documentComments]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSave]);

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave();
    } finally {
      setIsSaving(false);
    }
  }, [onSave]);

  if (!editor) {
    return (
      <div className="animate-pulse bg-gray-100 dark:bg-dark-card rounded-xl h-64" />
    );
  }

  return (
    <div className={clsx('relative', className)}>
      {/* Toolbar */}
      {editable && (
        <div className="sticky top-0 z-10 bg-white dark:bg-dark-base border-b border-gray-200 dark:border-dark-border px-4 py-2 flex items-center gap-1 flex-wrap">
          {/* Text formatting */}
          <MenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            title="Bold (Cmd+B)"
          >
            <span className="font-bold">B</span>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            title="Italic (Cmd+I)"
          >
            <span className="italic">I</span>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive('strike')}
            title="Strikethrough"
          >
            <span className="line-through">S</span>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            isActive={editor.isActive('highlight')}
            title="Highlight"
          >
            <span className="bg-yellow-200 dark:bg-yellow-800 px-1">H</span>
          </MenuButton>

          <div className="w-px h-6 bg-gray-300 dark:bg-dark-border mx-1" />

          {/* Headings */}
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            title="Heading 1"
          >
            H1
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            H2
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive('heading', { level: 3 })}
            title="Heading 3"
          >
            H3
          </MenuButton>

          <div className="w-px h-6 bg-gray-300 dark:bg-dark-border mx-1" />

          {/* Lists */}
          <MenuButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            title="Bullet list"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            title="Numbered list"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            isActive={editor.isActive('taskList')}
            title="Task list"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </MenuButton>

          <div className="w-px h-6 bg-gray-300 dark:bg-dark-border mx-1" />

          {/* Block elements */}
          <MenuButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            title="Quote"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            isActive={editor.isActive('codeBlock')}
            title="Code block"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Horizontal rule"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16" />
            </svg>
          </MenuButton>

          <div className="flex-1" />

          {/* Word count & Save */}
          <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">
            {wordCount} words
          </span>
          {onSave && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={clsx(
                'px-3 py-1.5 text-sm font-medium rounded-xl transition-colors',
                isSaving
                  ? 'bg-gray-100 dark:bg-dark-elevated text-gray-400 cursor-not-allowed'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              )}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      )}

      {/* Bubble Menu (appears when text is selected) */}
      {editable && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          className="flex items-center gap-1 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl shadow-card p-1"
        >
          <MenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
          >
            <span className="font-bold text-xs">B</span>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
          >
            <span className="italic text-xs">I</span>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            isActive={editor.isActive('highlight')}
          >
            <span className="bg-yellow-200 dark:bg-yellow-800 text-xs px-0.5">H</span>
          </MenuButton>
          {onAddComment && (
            <>
              <div className="w-px h-4 bg-gray-300 dark:bg-dark-border mx-0.5" />
              <MenuButton
                onClick={handleAddComment}
                title="Add Comment"
              >
                <ChatBubbleLeftIcon className="h-4 w-4" />
              </MenuButton>
            </>
          )}
        </BubbleMenu>
      )}

      {/* Floating Menu (appears on empty lines) */}
      {editable && (
        <FloatingMenu
          editor={editor}
          tippyOptions={{ duration: 100 }}
          className="flex items-center gap-1 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl shadow-card p-1"
        >
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            H1
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </MenuButton>
        </FloatingMenu>
      )}

      {/* Editor Content */}
      <EditorContent
        editor={editor}
        className={clsx(
          'min-h-[400px] p-4',
          'bg-white dark:bg-dark-card',
          'text-gray-800 dark:text-gray-100',
          '[&_.ProseMirror]:outline-none',
          '[&_.ProseMirror]:min-h-[400px]'
        )}
        style={{
          '--editor-font-size': `${fontSize}px`,
          '--editor-line-height': `${lineHeight}`,
        } as React.CSSProperties}
      />

      {/* Inline Review Panel */}
      <InlineReviewPanel
        comment={selectedComment}
        isOpen={isPanelOpen}
        onClose={handleClosePanel}
        onResolve={onResolveComment}
        onReply={onReplyToComment}
        onAcceptAI={onAcceptAISuggestion}
        onDismissAI={onDismissAISuggestion}
      />

      {/* Inline Document Comment Popup */}
      <InlineCommentPopup
        comment={selectedDocComment}
        allComments={documentComments}
        isOpen={isDocCommentPopupOpen}
        onClose={handleCloseDocCommentPopup}
        position={docCommentPopupPosition}
        onResolve={onResolveDocComment}
        onReply={onReplyToDocComment}
        onEdit={onEditDocComment}
        onDelete={onDeleteDocComment}
      />

      {/* Comment mark styles and editor preferences */}
      <style dangerouslySetInnerHTML={{ __html: reviewCommentMarkStyles + documentCommentMarkStyles + `
        .ProseMirror {
          font-size: var(--editor-font-size, 14px);
          line-height: var(--editor-line-height, 1.6);
        }
      ` }} />
    </div>
  );
}

export default DocumentEditor;
