/**
 * AI Quick Actions component for document editing.
 * Provides one-click AI operations on selected text or document.
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Maximize2,
  Sparkles,
  ArrowRight,
  List,
  GraduationCap,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { QUICK_ACTIONS, type DocumentAction } from '../../types/ai';
import * as aiService from '../../services/ai';

interface AIQuickActionsProps {
  documentId: string;
  documentContent: string;
  selectedText?: string;
  onInsertContent?: (content: string) => void;
  onReplaceSelection?: (content: string) => void;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  ArrowsPointingOutIcon: Maximize2,
  SparklesIcon: Sparkles,
  ArrowRightIcon: ArrowRight,
  ListBulletIcon: List,
  AcademicCapIcon: GraduationCap,
};

export function AIQuickActions({
  documentId,
  documentContent,
  selectedText,
  onInsertContent,
  onReplaceSelection,
}: AIQuickActionsProps) {
  const [activeAction, setActiveAction] = useState<DocumentAction | null>(null);
  const [generatedContent, setGeneratedContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleAction = async (action: DocumentAction) => {
    setActiveAction(action);
    setGeneratedContent('');
    setError(null);
    setIsLoading(true);

    try {
      const generator = aiService.documentActionStream({
        action,
        document_id: documentId,
        selected_text: selectedText,
        surrounding_context: documentContent.substring(0, 2000),
        stream: true,
      });

      let content = '';
      for await (const chunk of generator) {
        content += chunk;
        setGeneratedContent(content);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsert = () => {
    onInsertContent?.(generatedContent);
    setGeneratedContent('');
    setActiveAction(null);
  };

  const handleReplace = () => {
    onReplaceSelection?.(generatedContent);
    setGeneratedContent('');
    setActiveAction(null);
  };

  const handleRegenerate = () => {
    if (activeAction) {
      handleAction(activeAction);
    }
  };

  const handleClear = () => {
    setGeneratedContent('');
    setActiveAction(null);
    setError(null);
  };

  const availableActions = QUICK_ACTIONS.filter(
    (action) => !action.requiresSelection || selectedText
  );

  return (
    <div className="h-full flex flex-col">
      {/* Actions grid */}
      {!generatedContent && !isLoading && (
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            {selectedText
              ? 'Choose an action for the selected text:'
              : 'Choose an action for your document:'}
          </p>
          <div className="space-y-2">
            {availableActions.map((action) => {
              const Icon = iconMap[action.icon] || Sparkles;
              return (
                <button
                  key={action.action}
                  onClick={() => handleAction(action.action)}
                  disabled={isLoading}
                  className="w-full flex items-center gap-3 p-3 text-left rounded-xl border border-gray-200 dark:border-dark-border hover:border-accent-300 dark:hover:border-accent-600 hover:bg-accent-50 dark:hover:bg-accent-900/20 transition-all hover:shadow-soft group disabled:opacity-50"
                >
                  <div className="p-2 bg-gray-100 dark:bg-dark-elevated rounded-xl group-hover:bg-gradient-to-br group-hover:from-accent-500 group-hover:to-accent-600 transition-all">
                    <Icon className="h-4 w-4 text-gray-600 dark:text-gray-400 group-hover:text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 dark:text-white">{action.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{action.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {!selectedText && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center">
              Tip: Select text in the editor for more actions
            </p>
          )}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex-1 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Loader2 className="h-4 w-4 text-accent-600 dark:text-accent-400 animate-spin" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {activeAction === 'expand' && 'Expanding...'}
              {activeAction === 'simplify' && 'Simplifying...'}
              {activeAction === 'continue' && 'Continuing...'}
              {activeAction === 'structure' && 'Structuring...'}
              {activeAction === 'formalize' && 'Formalizing...'}
            </span>
          </div>
          {generatedContent && (
            <div className="bg-gray-50 dark:bg-dark-elevated rounded-xl p-3 text-sm text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{generatedContent}</ReactMarkdown>
              <span className="inline-block w-2 h-4 bg-accent-500 animate-pulse ml-0.5" />
            </div>
          )}
        </div>
      )}

      {/* Generated content */}
      {generatedContent && !isLoading && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Generated Content
              </span>
              <button
                onClick={handleClear}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                Clear
              </button>
            </div>
            <div className="bg-gray-50 dark:bg-dark-elevated rounded-xl p-3 text-sm text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{generatedContent}</ReactMarkdown>
            </div>
          </div>

          {/* Action buttons */}
          <div className="p-4 border-t border-gray-200 dark:border-dark-border space-y-2">
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-dark-elevated hover:bg-gray-200 dark:hover:bg-dark-base rounded-xl transition-all"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={handleRegenerate}
                className="flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-dark-elevated hover:bg-gray-200 dark:hover:bg-dark-base rounded-xl transition-all"
                title="Regenerate"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2">
              {selectedText && onReplaceSelection && (
                <button
                  onClick={handleReplace}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-white bg-gradient-to-br from-accent-500 to-accent-600 hover:shadow-md rounded-xl transition-all"
                >
                  Replace Selection
                </button>
              )}
              {onInsertContent && (
                <button
                  onClick={handleInsert}
                  className={`flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-xl transition-all ${
                    selectedText && onReplaceSelection
                      ? 'text-accent-600 dark:text-accent-400 border border-accent-300 dark:border-accent-600 hover:bg-accent-50 dark:hover:bg-accent-900/20'
                      : 'flex-1 text-white bg-gradient-to-br from-accent-500 to-accent-600 hover:shadow-md'
                  }`}
                >
                  <Plus className="h-4 w-4" />
                  Insert
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 shadow-soft">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-600 dark:text-red-400 hover:underline mt-1 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
