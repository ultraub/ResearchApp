import { useState, useCallback, useEffect } from 'react';
import { clsx } from 'clsx';
import { marked } from 'marked';
import { PencilIcon, EyeIcon } from '@heroicons/react/24/outline';

// Configure marked for safe HTML output
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert \n to <br>
});

interface MarkdownEditorProps {
  content: string;
  onChange?: (content: string) => void;
  onSave?: () => void;
  editable?: boolean;
  className?: string;
}

type TabMode = 'preview' | 'edit';

export function MarkdownEditor({
  content,
  onChange,
  onSave,
  editable = true,
  className,
}: MarkdownEditorProps) {
  const [activeTab, setActiveTab] = useState<TabMode>('preview');
  const [localContent, setLocalContent] = useState(content);
  const [wordCount, setWordCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Sync local content with prop
  useEffect(() => {
    setLocalContent(content);
  }, [content]);

  // Update word count
  useEffect(() => {
    const words = localContent.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);
  }, [localContent]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Toggle between preview/edit with Cmd+E
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        setActiveTab((prev) => (prev === 'preview' ? 'edit' : 'preview'));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSave, localContent]);

  const handleContentChange = useCallback(
    (newContent: string) => {
      setLocalContent(newContent);
      onChange?.(newContent);
    },
    [onChange]
  );

  const handleSave = useCallback(async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave();
    } finally {
      setIsSaving(false);
    }
  }, [onSave]);

  // Render markdown to HTML
  const renderedHtml = marked.parse(localContent) as string;

  return (
    <div className={clsx('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-white dark:bg-dark-base border-b border-gray-200 dark:border-dark-border px-4 py-2 flex items-center gap-2">
        {/* Tab Toggle */}
        <div className="flex items-center bg-gray-100 dark:bg-dark-elevated rounded-lg p-1">
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              activeTab === 'preview'
                ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <EyeIcon className="w-4 h-4" />
            Preview
          </button>
          {editable && (
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                activeTab === 'edit'
                  ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              <PencilIcon className="w-4 h-4" />
              Edit
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* Word count & Save */}
        <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">
          {wordCount} words
        </span>
        {onSave && editable && (
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

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'preview' ? (
          /* Preview Mode */
          <div
            className="prose prose-sm sm:prose dark:prose-invert max-w-none p-6
                       prose-headings:font-semibold
                       prose-h1:text-2xl prose-h1:border-b prose-h1:border-gray-200 prose-h1:dark:border-dark-border prose-h1:pb-2
                       prose-h2:text-xl prose-h2:mt-6
                       prose-h3:text-lg
                       prose-table:border-collapse prose-table:w-full
                       prose-th:border prose-th:border-gray-300 prose-th:dark:border-dark-border prose-th:px-3 prose-th:py-2 prose-th:bg-gray-50 prose-th:dark:bg-dark-elevated prose-th:text-left
                       prose-td:border prose-td:border-gray-300 prose-td:dark:border-dark-border prose-td:px-3 prose-td:py-2
                       prose-code:bg-gray-100 prose-code:dark:bg-dark-elevated prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
                       prose-pre:bg-gray-900 prose-pre:dark:bg-dark-elevated
                       prose-hr:border-gray-200 prose-hr:dark:border-dark-border"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          /* Edit Mode */
          <textarea
            value={localContent}
            onChange={(e) => handleContentChange(e.target.value)}
            placeholder="Write your markdown here..."
            className="w-full h-full min-h-[400px] p-6 bg-white dark:bg-dark-card
                       text-gray-800 dark:text-gray-100
                       font-mono text-sm leading-relaxed
                       border-none outline-none resize-none
                       placeholder:text-gray-400 dark:placeholder:text-gray-500"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}

export default MarkdownEditor;
