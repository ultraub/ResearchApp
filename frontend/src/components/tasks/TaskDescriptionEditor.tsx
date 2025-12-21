/**
 * Task Description Editor - Compact TipTap editor for task descriptions
 * Supports rich text with auto-save functionality
 */

import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import { useCallback, useEffect, useRef, useState, Component, type ReactNode } from "react";
import { clsx } from "clsx";

// Error boundary to catch and suppress DOM manipulation errors from browser extensions
class EditorErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: false }; // Don't show error UI, just suppress
  }

  componentDidCatch(error: Error) {
    // Suppress removeChild errors caused by browser extensions (Grammarly, etc.)
    if (error.message?.includes('removeChild') || error.message?.includes('insertBefore')) {
      console.debug('Suppressed DOM manipulation error (likely browser extension):', error.message);
      return;
    }
    console.error('Editor error:', error);
  }

  render() {
    return this.props.children;
  }
}

interface TaskDescriptionEditorProps {
  content: string | Record<string, unknown> | null;
  onChange?: (content: Record<string, unknown>, text: string) => void;
  onSave?: (content: Record<string, unknown>) => void;
  placeholder?: string;
  editable?: boolean;
  autoSave?: boolean;
  autoSaveDelay?: number;
  className?: string;
  minHeight?: string;
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
      "p-1 rounded text-xs transition-colors",
      isActive
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
        : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700",
      disabled && "opacity-50 cursor-not-allowed"
    )}
  >
    {children}
  </button>
);

// Parse content - handle both string and JSONB formats
function parseContent(content: string | Record<string, unknown> | null): Record<string, unknown> {
  if (!content) {
    return { type: "doc", content: [] };
  }
  if (typeof content === "string") {
    // Convert plain text to TipTap format
    return {
      type: "doc",
      content: content.split("\n\n").map((paragraph) => ({
        type: "paragraph",
        content: paragraph ? [{ type: "text", text: paragraph }] : [],
      })),
    };
  }
  return content;
}

export default function TaskDescriptionEditor({
  content,
  onChange,
  onSave,
  placeholder = "Add a description...",
  editable = true,
  autoSave = true,
  autoSaveDelay = 1000,
  className,
  minHeight = "150px",
}: TaskDescriptionEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isUpdatingContent, setIsUpdatingContent] = useState(false);
  const [isDestroying, setIsDestroying] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>("");
  const isInternalUpdate = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Highlight.configure({
        multicolor: true,
      }),
    ],
    content: parseContent(content),
    editable,
    onUpdate: ({ editor }) => {
      // Skip if this is an internal/external content update (not user typing)
      if (isInternalUpdate.current) {
        return;
      }

      const json = editor.getJSON();
      const text = editor.getText();
      const jsonString = JSON.stringify(json);

      onChange?.(json, text);

      // Track unsaved changes
      if (jsonString !== lastSavedContentRef.current) {
        setHasUnsavedChanges(true);

        // Auto-save with debounce
        if (autoSave && onSave) {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
          saveTimeoutRef.current = setTimeout(() => {
            handleSave(json);
          }, autoSaveDelay);
        }
      }
    },
  });

  // Update content when it changes externally
  useEffect(() => {
    if (editor && content) {
      const newContent = parseContent(content);
      const currentContent = editor.getJSON();
      if (JSON.stringify(currentContent) !== JSON.stringify(newContent)) {
        // Flag that we're doing an internal update to prevent onUpdate from firing
        isInternalUpdate.current = true;
        setIsUpdatingContent(true);

        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          editor.commands.setContent(newContent);
          lastSavedContentRef.current = JSON.stringify(newContent);

          // Reset flags after a brief delay to allow React to settle
          setTimeout(() => {
            isInternalUpdate.current = false;
            setIsUpdatingContent(false);
          }, 50);
        });
      }
    }
  }, [editor, content]);

  // Cleanup timeout on unmount and prevent DOM errors during destruction
  useEffect(() => {
    return () => {
      setIsDestroying(true);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Destroy editor explicitly before React unmounts
      if (editor) {
        try {
          editor.destroy();
        } catch {
          // Ignore errors during cleanup
        }
      }
    };
  }, [editor]);

  const handleSave = useCallback(
    async (contentToSave?: Record<string, unknown>) => {
      if (!onSave || !editor) return;

      const json = contentToSave || editor.getJSON();
      setIsSaving(true);

      try {
        await onSave(json);
        lastSavedContentRef.current = JSON.stringify(json);
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error("Failed to save description:", error);
      } finally {
        setIsSaving(false);
      }
    },
    [editor, onSave]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  if (!editor || isDestroying) {
    return (
      <div
        className="animate-pulse bg-gray-100 dark:bg-dark-card rounded-lg"
        style={{ minHeight }}
      />
    );
  }

  return (
    <EditorErrorBoundary>
    <div ref={containerRef} className={clsx("relative border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden shadow-soft", className)}>
      {/* Compact Toolbar */}
      {editable && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 dark:bg-dark-elevated border-b border-gray-200 dark:border-dark-border">
          {/* Text formatting */}
          <MenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
            title="Bold (Cmd+B)"
          >
            <span className="font-bold">B</span>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
            title="Italic (Cmd+I)"
          >
            <span className="italic">I</span>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive("strike")}
            title="Strikethrough"
          >
            <span className="line-through">S</span>
          </MenuButton>

          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Headings */}
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive("heading", { level: 2 })}
            title="Heading"
          >
            H
          </MenuButton>

          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Lists */}
          <MenuButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive("bulletList")}
            title="Bullet list"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive("orderedList")}
            title="Numbered list"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20h14M7 12h14M7 4h14M3 20h.01M3 12h.01M3 4h.01" />
            </svg>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            isActive={editor.isActive("taskList")}
            title="Checklist"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </MenuButton>

          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Code & Quote */}
          <MenuButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            isActive={editor.isActive("codeBlock")}
            title="Code block"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive("blockquote")}
            title="Quote"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </MenuButton>

          <div className="flex-1" />

          {/* Save status */}
          {onSave && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {isSaving ? (
                "Saving..."
              ) : hasUnsavedChanges ? (
                <span className="text-amber-600 dark:text-amber-400">Unsaved</span>
              ) : (
                "Saved"
              )}
            </span>
          )}
        </div>
      )}

      {/* Bubble Menu for selected text - don't render during content updates or destruction to prevent DOM issues */}
      {editable && editor && editor.isEditable && !isUpdatingContent && !isDestroying && editor.view && editor.view.dom && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{
            duration: 100,
            // Prevent portal issues during re-renders
            appendTo: () => document.body,
            // Add slight delay to avoid race conditions
            delay: [100, 0],
            // Prevent showing during transitions
            onShow: () => {
              if (isUpdatingContent || !editor || !editor.isEditable || !editor.view) {
                return false;
              }
            },
          }}
          shouldShow={({ editor: bubbleEditor, state }) => {
            // More defensive checks to prevent DOM errors
            if (!bubbleEditor || !bubbleEditor.isEditable || isUpdatingContent || isDestroying) return false;
            if (!bubbleEditor.view || !bubbleEditor.view.dom) return false;
            // Check if the editor's DOM is still in the document
            if (!document.body.contains(bubbleEditor.view.dom)) return false;
            try {
              const { selection } = state;
              const { empty } = selection;
              // Only show when there's a text selection
              return !empty;
            } catch {
              return false;
            }
          }}
          className="flex items-center gap-0.5 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl shadow-card p-1"
        >
          <MenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
          >
            <span className="font-bold">B</span>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
          >
            <span className="italic">I</span>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            isActive={editor.isActive("highlight")}
          >
            <span className="bg-yellow-200 dark:bg-yellow-800 px-0.5">H</span>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive("code")}
          >
            <code className="text-xs">{"`"}</code>
          </MenuButton>
        </BubbleMenu>
      )}

      {/* Editor Content - wrapped with Grammarly protection */}
      <div
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        suppressContentEditableWarning
      >
        <EditorContent
          editor={editor}
          className={clsx(
            "p-3 bg-white dark:bg-dark-base",
            "text-gray-800 dark:text-gray-100 text-sm",
            "[&_.ProseMirror]:outline-none",
            "[&_.ProseMirror]:min-h-[120px]",
            "[&_.ProseMirror_p]:my-2",
            "[&_.ProseMirror_h1]:text-xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:my-3",
            "[&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:my-2",
            "[&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-medium [&_.ProseMirror_h3]:my-2",
            "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ul]:my-2",
            "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ol]:my-2",
            "[&_.ProseMirror_li]:my-1",
            "[&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-gray-300 [&_.ProseMirror_blockquote]:dark:border-gray-600 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-gray-600 [&_.ProseMirror_blockquote]:dark:text-gray-400",
            "[&_.ProseMirror_pre]:bg-gray-100 [&_.ProseMirror_pre]:dark:bg-dark-card [&_.ProseMirror_pre]:rounded [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:my-2 [&_.ProseMirror_pre]:overflow-x-auto",
            "[&_.ProseMirror_code]:bg-gray-100 [&_.ProseMirror_code]:dark:bg-dark-card [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:text-sm [&_.ProseMirror_code]:font-mono",
            "[&_.ProseMirror_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_.is-editor-empty:first-child::before]:text-gray-400 [&_.ProseMirror_.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_.is-editor-empty:first-child::before]:h-0",
            // Task list styles
            "[&_.ProseMirror_ul[data-type='taskList']]:list-none [&_.ProseMirror_ul[data-type='taskList']]:pl-0",
            "[&_.ProseMirror_ul[data-type='taskList']_li]:flex [&_.ProseMirror_ul[data-type='taskList']_li]:items-start [&_.ProseMirror_ul[data-type='taskList']_li]:gap-2",
            "[&_.ProseMirror_ul[data-type='taskList']_input]:mt-1"
          )}
          style={{ minHeight }}
        />
      </div>
    </div>
    </EditorErrorBoundary>
  );
}
