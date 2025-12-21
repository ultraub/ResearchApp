/**
 * AI Suggestions Panel - Display AI review suggestions for document editing
 * Provides a panel for viewing and acting on AI-generated review suggestions
 */

import { useState } from 'react';
import { clsx } from 'clsx';
import {
  SparklesIcon,
  CheckIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlayIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
  QuestionMarkCircleIcon,
  MagnifyingGlassIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import type { AIReviewSuggestion } from '../../hooks/useAutoReview';

interface AISuggestionsPanelProps {
  suggestions: AIReviewSuggestion[];
  isLoading: boolean;
  error: string | null;
  overallAssessment: string | null;
  onTriggerReview: () => void;
  onAcceptSuggestion: (suggestionId: string, notes?: string) => void;
  onDismissSuggestion: (suggestionId: string, notes?: string) => void;
  onClearSuggestions: () => void;
  hasContent: boolean;
}

const SUGGESTION_TYPE_CONFIG: Record<
  AIReviewSuggestion['type'],
  { label: string; icon: typeof MagnifyingGlassIcon; color: string }
> = {
  gap_identified: {
    label: 'Gap Identified',
    icon: MagnifyingGlassIcon,
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  clarity_needed: {
    label: 'Clarity Needed',
    icon: QuestionMarkCircleIcon,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  methodology_concern: {
    label: 'Methodology',
    icon: Cog6ToothIcon,
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  },
  consistency_issue: {
    label: 'Consistency',
    icon: ArrowPathIcon,
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  },
  general: {
    label: 'General',
    icon: LightBulbIcon,
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  },
};

const SEVERITY_CONFIG: Record<
  AIReviewSuggestion['severity'],
  { label: string; color: string; dotColor: string }
> = {
  critical: {
    label: 'Critical',
    color: 'text-red-700 dark:text-red-400',
    dotColor: 'bg-red-500',
  },
  major: {
    label: 'Major',
    color: 'text-orange-700 dark:text-orange-400',
    dotColor: 'bg-orange-500',
  },
  minor: {
    label: 'Minor',
    color: 'text-yellow-700 dark:text-yellow-400',
    dotColor: 'bg-yellow-500',
  },
  suggestion: {
    label: 'Suggestion',
    color: 'text-blue-700 dark:text-blue-400',
    dotColor: 'bg-blue-500',
  },
};

interface SuggestionCardProps {
  suggestion: AIReviewSuggestion;
  onAccept: (notes?: string) => void;
  onDismiss: (notes?: string) => void;
}

function SuggestionCard({ suggestion, onAccept, onDismiss }: SuggestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showNotesInput, setShowNotesInput] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isActioning, setIsActioning] = useState(false);

  const typeConfig = SUGGESTION_TYPE_CONFIG[suggestion.type];
  const severityConfig = SEVERITY_CONFIG[suggestion.severity];
  const TypeIcon = typeConfig.icon;

  const handleAccept = async () => {
    setIsActioning(true);
    try {
      onAccept(resolutionNotes || undefined);
    } finally {
      setIsActioning(false);
    }
  };

  const handleDismiss = async () => {
    setIsActioning(true);
    try {
      onDismiss(resolutionNotes || undefined);
    } finally {
      setIsActioning(false);
    }
  };

  // Already resolved - show status
  if (suggestion.status !== 'pending') {
    return (
      <div
        className={clsx(
          'rounded-lg border p-3',
          suggestion.status === 'accepted'
            ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
            : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-dark-card/50'
        )}
      >
        <div className="flex items-center gap-2 text-sm">
          {suggestion.status === 'accepted' ? (
            <>
              <CheckIcon className="h-4 w-4 text-green-600" />
              <span className="text-green-700 dark:text-green-400">Addressed</span>
            </>
          ) : (
            <>
              <XMarkIcon className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500">Dismissed</span>
            </>
          )}
          {suggestion.resolution_notes && (
            <span className="text-gray-500 dark:text-gray-400">
              — {suggestion.resolution_notes}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
          {suggestion.content}
        </p>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'rounded-xl border-l-4 border-accent-400 bg-white shadow-soft dark:bg-dark-card transition-all hover:shadow-md',
        'ring-1 ring-accent-100 dark:ring-accent-900/30'
      )}
    >
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between p-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* Type badge */}
          <span
            className={clsx(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
              typeConfig.color
            )}
          >
            <TypeIcon className="h-3 w-3" />
            {typeConfig.label}
          </span>

          {/* Severity indicator */}
          <span className={clsx('flex items-center gap-1 text-xs', severityConfig.color)}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', severityConfig.dotColor)} />
            {severityConfig.label}
          </span>

          {/* Confidence */}
          <span className="text-xs text-gray-400">
            {Math.round(suggestion.confidence * 100)}%
          </span>
        </div>

        <button type="button" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          {isExpanded ? (
            <ChevronUpIcon className="h-4 w-4" />
          ) : (
            <ChevronDownIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-3 pb-3 dark:border-dark-border">
          {/* Location indicator */}
          {suggestion.location?.text_snippet && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic truncate">
              &quot;{suggestion.location.text_snippet.slice(0, 60)}...&quot;
            </div>
          )}

          {/* Main issue content */}
          <div className="mt-2">
            <p className="text-sm text-gray-700 dark:text-gray-300">{suggestion.content}</p>
          </div>

          {/* Question for author */}
          {suggestion.question_for_author && (
            <div className="mt-3 rounded-xl bg-accent-50 p-2 dark:bg-accent-900/20">
              <p className="text-xs font-medium text-accent-800 dark:text-accent-300">
                Question for you:
              </p>
              <p className="mt-1 text-xs text-accent-700 dark:text-accent-400">
                {suggestion.question_for_author}
              </p>
            </div>
          )}

          {/* Why this matters */}
          {suggestion.why_this_matters && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium">Why this matters: </span>
              {suggestion.why_this_matters}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-3 space-y-2">
            {showNotesInput && (
              <textarea
                placeholder="Add notes (optional)"
                className="w-full rounded-xl border border-gray-300 px-2 py-1.5 text-xs placeholder-gray-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white transition-all"
                rows={2}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
              />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAccept}
                disabled={isActioning}
                className={clsx(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  'bg-green-100 text-green-700 hover:bg-green-200',
                  'dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50',
                  isActioning && 'cursor-not-allowed opacity-50'
                )}
              >
                <CheckIcon className="h-3 w-3" />
                {isActioning ? 'Marking...' : 'Addressed'}
              </button>

              <button
                type="button"
                onClick={handleDismiss}
                disabled={isActioning}
                className={clsx(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  'bg-gray-100 text-gray-600 hover:bg-gray-200',
                  'dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600',
                  isActioning && 'cursor-not-allowed opacity-50'
                )}
              >
                <XMarkIcon className="h-3 w-3" />
                Dismiss
              </button>

              <button
                type="button"
                onClick={() => setShowNotesInput(!showNotesInput)}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showNotesInput ? 'Hide' : 'Notes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AISuggestionsPanel({
  suggestions,
  isLoading,
  error,
  overallAssessment,
  onTriggerReview,
  onAcceptSuggestion,
  onDismissSuggestion,
  onClearSuggestions,
  hasContent,
}: AISuggestionsPanelProps) {
  // Add defensive check for undefined suggestions
  const safeSuggestions = suggestions || [];
  const pendingSuggestions = safeSuggestions.filter((s) => s.status === 'pending');
  const resolvedSuggestions = safeSuggestions.filter((s) => s.status !== 'pending');

  return (
    <div className="h-full flex flex-col">
      {/* Header with trigger button */}
      <div className="p-4 border-b border-gray-200 dark:border-dark-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-accent-600 dark:text-accent-400" />
            <span className="font-medium text-gray-900 dark:text-white">AI Review</span>
          </div>
          {safeSuggestions.length > 0 && (
            <button
              onClick={onClearSuggestions}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        <button
          onClick={onTriggerReview}
          disabled={isLoading || !hasContent}
          className={clsx(
            'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
            isLoading || !hasContent
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-dark-elevated dark:text-gray-500'
              : 'bg-gradient-to-br from-accent-500 to-accent-600 text-white hover:shadow-md'
          )}
        >
          {isLoading ? (
            <>
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <PlayIcon className="h-4 w-4" />
              Analyze Document
            </>
          )}
        </button>

        {!hasContent && !isLoading && (
          <p className="mt-2 text-xs text-gray-400 text-center">
            Add content to your document to enable AI review
          </p>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl shadow-soft">
            <ExclamationTriangleIcon className="h-4 w-4 text-red-600 mt-0.5" />
            <div>
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              <button
                onClick={() => onTriggerReview()}
                className="text-xs text-red-600 hover:text-red-700 mt-1 transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overall assessment */}
      {overallAssessment && (
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <div className="p-3 bg-accent-50 dark:bg-accent-900/20 rounded-xl shadow-soft">
            <p className="text-xs font-medium text-accent-800 dark:text-accent-300 mb-1">
              Overall Assessment
            </p>
            <p className="text-sm text-accent-700 dark:text-accent-400">{overallAssessment}</p>
          </div>
        </div>
      )}

      {/* Suggestions list */}
      <div className="flex-1 overflow-y-auto p-4">
        {safeSuggestions.length === 0 && !isLoading && !error && (
          <div className="text-center py-8">
            <SparklesIcon className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              No suggestions yet
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Click "Analyze Document" to get AI feedback
            </p>
          </div>
        )}

        {/* Pending suggestions */}
        {pendingSuggestions.length > 0 && (
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Suggestions ({pendingSuggestions.length})
              </span>
            </div>
            {pendingSuggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onAccept={(notes) => onAcceptSuggestion(suggestion.id, notes)}
                onDismiss={(notes) => onDismissSuggestion(suggestion.id, notes)}
              />
            ))}
          </div>
        )}

        {/* Resolved suggestions */}
        {resolvedSuggestions.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              Resolved ({resolvedSuggestions.length})
            </span>
            {resolvedSuggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onAccept={() => {}}
                onDismiss={() => {}}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AISuggestionsPanel;
