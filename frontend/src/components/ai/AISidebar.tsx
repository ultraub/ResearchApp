/**
 * AI Sidebar component for document editing.
 * Provides quick actions, conversational AI assistance, and AI review suggestions.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  X,
  MessageSquare,
  Zap,
  ChevronDown,
  ChevronUp,
  FileSearch,
  Settings,
} from 'lucide-react';
import { AIQuickActions } from './AIQuickActions';
import { AIConversation } from './AIConversation';
import { AISuggestionsPanel } from './AISuggestionsPanel';
import { useAutoReview } from '../../hooks/useAutoReview';
import { useAIEnabled } from '../../hooks/useAIEnabled';

interface AISidebarProps {
  documentId: string;
  documentContent: string;
  selectedText?: string;
  onClose: () => void;
  onInsertContent?: (content: string) => void;
  onReplaceSelection?: (content: string) => void;
  documentType?: string;
}

type TabType = 'actions' | 'chat' | 'review';

export function AISidebar({
  documentId,
  documentContent,
  selectedText,
  onClose,
  onInsertContent,
  onReplaceSelection,
  documentType = 'document',
}: AISidebarProps) {
  const aiEnabled = useAIEnabled();
  const [activeTab, setActiveTab] = useState<TabType>('actions');
  const [isMinimized, setIsMinimized] = useState(false);

  const {
    suggestions,
    isLoading: isReviewLoading,
    error: reviewError,
    overallAssessment,
    triggerReview,
    acceptSuggestion,
    dismissSuggestion,
    clearSuggestions,
  } = useAutoReview({
    documentId,
    documentType,
  });

  const handleTriggerReview = () => {
    triggerReview(documentContent);
  };

  const hasContent = documentContent.trim().length >= 50;
  const pendingSuggestionsCount = suggestions.filter((s) => s.status === 'pending').length;

  // Show disabled state when AI suggestions are turned off
  if (!aiEnabled) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-dark-card border-l border-gray-200 dark:border-dark-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-700/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gray-400 rounded-xl">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="font-medium text-gray-500 dark:text-gray-400">AI Assistant</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/50 dark:hover:bg-dark-elevated rounded-xl transition-all"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Disabled content */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
            <Sparkles className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
            AI Suggestions Disabled
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-xs">
            AI features have been turned off in your preferences. Enable them to use AI assistance.
          </p>
          <Link
            to="/settings/notifications"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300 bg-accent-50 dark:bg-accent-900/20 hover:bg-accent-100 dark:hover:bg-accent-900/30 rounded-xl transition-colors"
          >
            <Settings className="h-4 w-4" />
            Enable in Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-dark-card border-l border-gray-200 dark:border-dark-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-accent-50 to-accent-100 dark:from-accent-900/20 dark:to-accent-800/20">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gradient-to-br from-accent-500 to-accent-600 rounded-xl shadow-soft">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="font-medium text-gray-900 dark:text-white">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/50 dark:hover:bg-dark-elevated rounded-xl transition-all"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/50 dark:hover:bg-dark-elevated rounded-xl transition-all"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-dark-border">
            <button
              onClick={() => setActiveTab('actions')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-all ${
                activeTab === 'actions'
                  ? 'text-accent-600 dark:text-accent-400 border-b-2 border-accent-600 dark:border-accent-400 bg-accent-50/50 dark:bg-accent-900/20'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-elevated'
              }`}
            >
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">Actions</span>
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-all relative ${
                activeTab === 'review'
                  ? 'text-accent-600 dark:text-accent-400 border-b-2 border-accent-600 dark:border-accent-400 bg-accent-50/50 dark:bg-accent-900/20'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-elevated'
              }`}
            >
              <FileSearch className="h-4 w-4" />
              <span className="hidden sm:inline">Review</span>
              {pendingSuggestionsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-xs bg-gradient-to-br from-accent-500 to-accent-600 text-white rounded-full flex items-center justify-center shadow-soft">
                  {pendingSuggestionsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-all ${
                activeTab === 'chat'
                  ? 'text-accent-600 dark:text-accent-400 border-b-2 border-accent-600 dark:border-accent-400 bg-accent-50/50 dark:bg-accent-900/20'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-elevated'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Chat</span>
            </button>
          </div>

          {/* Selected text indicator */}
          {selectedText && activeTab !== 'review' && (
            <div className="px-4 py-2 bg-accent-50 dark:bg-accent-900/20 border-b border-accent-100 dark:border-accent-800">
              <p className="text-xs text-accent-600 dark:text-accent-400 font-medium mb-1">Selected text:</p>
              <p className="text-xs text-accent-800 dark:text-accent-300 line-clamp-2 italic">
                "{selectedText.substring(0, 100)}
                {selectedText.length > 100 ? '...' : ''}"
              </p>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'actions' && (
              <AIQuickActions
                documentId={documentId}
                documentContent={documentContent}
                selectedText={selectedText}
                onInsertContent={onInsertContent}
                onReplaceSelection={onReplaceSelection}
              />
            )}
            {activeTab === 'review' && (
              <AISuggestionsPanel
                suggestions={suggestions}
                isLoading={isReviewLoading}
                error={reviewError}
                overallAssessment={overallAssessment}
                onTriggerReview={handleTriggerReview}
                onAcceptSuggestion={acceptSuggestion}
                onDismissSuggestion={dismissSuggestion}
                onClearSuggestions={clearSuggestions}
                hasContent={hasContent}
              />
            )}
            {activeTab === 'chat' && (
              <AIConversation
                documentId={documentId}
                documentContent={documentContent}
                selectedText={selectedText}
                onInsertContent={onInsertContent}
              />
            )}
          </div>
        </>
      )}

      {/* Minimized state */}
      {isMinimized && (
        <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
          <p>AI Assistant minimized</p>
          <button
            onClick={() => setIsMinimized(false)}
            className="text-accent-600 dark:text-accent-400 hover:underline text-xs mt-1 transition-colors"
          >
            Click to expand
          </button>
        </div>
      )}
    </div>
  );
}
