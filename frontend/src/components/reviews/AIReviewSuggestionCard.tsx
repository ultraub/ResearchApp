/**
 * AIReviewSuggestionCard - Display and interact with AI-generated review suggestions
 *
 * This component renders AI suggestions with visual distinction from human comments.
 * It prominently displays the question for the author and provides accept/dismiss actions.
 */

import { useState } from "react";
import { clsx } from "clsx";
import {
  SparklesIcon,
  CheckIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";
import type {
  ReviewComment,
  CommentType,
  CommentSeverity,
  ReviewCommentAnchor,
} from "@/types";

interface AIReviewSuggestionCardProps {
  comment: ReviewComment;
  onAccept?: (commentId: string, resolutionNotes?: string) => Promise<void>;
  onDismiss?: (commentId: string, resolutionNotes?: string) => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

const COMMENT_TYPE_CONFIG: Record<
  CommentType,
  { label: string; icon: string; color: string }
> = {
  gap_identified: {
    label: "Gap Identified",
    icon: "🔍",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  clarity_needed: {
    label: "Clarity Needed",
    icon: "🔮",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  methodology_concern: {
    label: "Methodology Concern",
    icon: "⚙️",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  },
  consistency_issue: {
    label: "Consistency Issue",
    icon: "🔄",
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
  general: {
    label: "General",
    icon: "💬",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  },
  inline: {
    label: "Inline",
    icon: "📍",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  },
  suggestion: {
    label: "Suggestion",
    icon: "💡",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  },
  question: {
    label: "Question",
    icon: "❓",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  },
  issue: {
    label: "Issue",
    icon: "⚠️",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  },
};

const SEVERITY_CONFIG: Record<
  CommentSeverity,
  { label: string; color: string; dotColor: string }
> = {
  critical: {
    label: "Critical",
    color: "text-red-700 dark:text-red-400",
    dotColor: "bg-red-500",
  },
  major: {
    label: "Major",
    color: "text-orange-700 dark:text-orange-400",
    dotColor: "bg-orange-500",
  },
  minor: {
    label: "Minor",
    color: "text-yellow-700 dark:text-yellow-400",
    dotColor: "bg-yellow-500",
  },
  suggestion: {
    label: "Suggestion",
    color: "text-blue-700 dark:text-blue-400",
    dotColor: "bg-blue-500",
  },
};

export function AIReviewSuggestionCard({
  comment,
  onAccept,
  onDismiss,
  isLoading = false,
  className,
}: AIReviewSuggestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [isActioning, setIsActioning] = useState(false);
  const [showNotesInput, setShowNotesInput] = useState(false);

  const typeConfig = COMMENT_TYPE_CONFIG[comment.comment_type] || COMMENT_TYPE_CONFIG.general;
  const severityConfig = comment.severity
    ? SEVERITY_CONFIG[comment.severity]
    : null;

  const anchor = comment.anchor_data as ReviewCommentAnchor | null;
  const isTaskSource = anchor?.source_type === "task";
  const documentTitle = anchor?.document_title;

  const handleAccept = async () => {
    if (!onAccept) return;
    setIsActioning(true);
    try {
      await onAccept(comment.id, resolutionNotes || undefined);
    } finally {
      setIsActioning(false);
    }
  };

  const handleDismiss = async () => {
    if (!onDismiss) return;
    setIsActioning(true);
    try {
      await onDismiss(comment.id, resolutionNotes || undefined);
    } finally {
      setIsActioning(false);
    }
  };

  // Already resolved - show status
  if (comment.source === "ai_accepted" || comment.source === "ai_dismissed") {
    return (
      <div
        className={clsx(
          "rounded-lg border p-4",
          comment.source === "ai_accepted"
            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
            : "border-gray-200 bg-gray-50 dark:border-dark-border dark:bg-dark-base",
          className
        )}
      >
        <div className="flex items-center gap-2 text-sm">
          {comment.source === "ai_accepted" ? (
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
          {comment.resolution_notes && (
            <span className="text-gray-500 dark:text-gray-400">
              — {comment.resolution_notes}
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
          {comment.content}
        </p>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "rounded-xl border-l-4 border-purple-400 bg-white shadow-soft dark:bg-dark-card",
        "ring-1 ring-purple-100 dark:ring-purple-900/30",
        className
      )}
    >
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between p-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {/* AI badge */}
          <div className="flex items-center gap-1.5 rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
            <SparklesIcon className="h-3.5 w-3.5" />
            AI
          </div>

          {/* Type badge */}
          <span
            className={clsx(
              "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
              typeConfig.color
            )}
          >
            <span>{typeConfig.icon}</span>
            {typeConfig.label}
          </span>

          {/* Severity indicator */}
          {severityConfig && (
            <span className={clsx("flex items-center gap-1 text-xs", severityConfig.color)}>
              <span className={clsx("h-2 w-2 rounded-full", severityConfig.dotColor)} />
              {severityConfig.label}
            </span>
          )}

          {/* Confidence indicator */}
          {comment.ai_confidence !== null && comment.ai_confidence !== undefined && (
            <span className="text-xs text-gray-400">
              {Math.round(comment.ai_confidence * 100)}% confident
            </span>
          )}
        </div>

        <button
          type="button"
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          {isExpanded ? (
            <ChevronUpIcon className="h-5 w-5" />
          ) : (
            <ChevronDownIcon className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 pb-4 dark:border-dark-border">
          {/* Location indicator */}
          {anchor && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              {isTaskSource ? (
                <>
                  <ClipboardDocumentListIcon className="h-4 w-4" />
                  <span>Task Description</span>
                </>
              ) : (
                <>
                  <DocumentTextIcon className="h-4 w-4" />
                  <span>{documentTitle || "Document"}</span>
                </>
              )}
              {anchor.text_snippet && (
                <span className="ml-1 truncate italic text-gray-400">
                  &quot;{anchor.text_snippet.slice(0, 50)}...&quot;
                </span>
              )}
            </div>
          )}

          {/* Main issue content */}
          <div className="mt-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">{comment.content}</p>
          </div>

          {/* Question for author - prominently displayed */}
          {comment.question_for_author && (
            <div className="mt-4 rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20">
              <p className="text-sm font-medium text-purple-800 dark:text-purple-300">
                Question for you:
              </p>
              <p className="mt-1 text-sm text-purple-700 dark:text-purple-400">
                {comment.question_for_author}
              </p>
            </div>
          )}

          {/* Why this matters */}
          {comment.why_this_matters && (
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium">Why this matters: </span>
              {comment.why_this_matters}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-4 space-y-3">
            {showNotesInput && (
              <div>
                <textarea
                  placeholder="Add notes about how you addressed this (optional)"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white dark:placeholder-gray-500"
                  rows={2}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAccept}
                disabled={isLoading || isActioning}
                className={clsx(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  "bg-green-100 text-green-700 hover:bg-green-200",
                  "dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50",
                  (isLoading || isActioning) && "cursor-not-allowed opacity-50"
                )}
              >
                <CheckIcon className="h-4 w-4" />
                {isActioning ? "Marking..." : "Mark as Addressed"}
              </button>

              <button
                type="button"
                onClick={handleDismiss}
                disabled={isLoading || isActioning}
                className={clsx(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  "dark:bg-dark-elevated dark:text-gray-400 dark:hover:bg-dark-base",
                  (isLoading || isActioning) && "cursor-not-allowed opacity-50"
                )}
              >
                <XMarkIcon className="h-4 w-4" />
                Dismiss
              </button>

              <button
                type="button"
                onClick={() => setShowNotesInput(!showNotesInput)}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showNotesInput ? "Hide notes" : "Add notes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * AIReviewSuggestionsList - Display a list of AI suggestions with bulk actions
 */
interface AIReviewSuggestionsListProps {
  comments: ReviewComment[];
  onAccept?: (commentId: string, resolutionNotes?: string) => Promise<void>;
  onDismiss?: (commentId: string, resolutionNotes?: string) => Promise<void>;
  onBulkAccept?: (commentIds: string[]) => Promise<void>;
  onBulkDismiss?: (commentIds: string[]) => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

export function AIReviewSuggestionsList({
  comments,
  onAccept,
  onDismiss,
  onBulkAccept,
  onBulkDismiss,
  isLoading = false,
  className,
}: AIReviewSuggestionsListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const pendingSuggestions = comments.filter((c) => c.source === "ai_suggestion");
  const resolvedSuggestions = comments.filter(
    (c) => c.source === "ai_accepted" || c.source === "ai_dismissed"
  );

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    setSelectedIds(new Set(pendingSuggestions.map((c) => c.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkAccept = async () => {
    if (onBulkAccept && selectedIds.size > 0) {
      await onBulkAccept(Array.from(selectedIds));
      clearSelection();
    }
  };

  const handleBulkDismiss = async () => {
    if (onBulkDismiss && selectedIds.size > 0) {
      await onBulkDismiss(Array.from(selectedIds));
      clearSelection();
    }
  };

  if (comments.length === 0) {
    return (
      <div className={clsx("text-center text-gray-500 dark:text-gray-400", className)}>
        <SparklesIcon className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
        <p className="mt-2 text-sm">No AI suggestions yet</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Bulk actions header */}
      {pendingSuggestions.length > 0 && (onBulkAccept || onBulkDismiss) && (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-dark-card">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedIds.size === pendingSuggestions.length && pendingSuggestions.length > 0}
              onChange={() =>
                selectedIds.size === pendingSuggestions.length ? clearSelection() : selectAll()
              }
              className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {selectedIds.size > 0
                ? `${selectedIds.size} selected`
                : `${pendingSuggestions.length} pending suggestions`}
            </span>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              {onBulkAccept && (
                <button
                  type="button"
                  onClick={handleBulkAccept}
                  disabled={isLoading}
                  className="flex items-center gap-1 rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
                >
                  <CheckIcon className="h-3 w-3" />
                  Accept All
                </button>
              )}
              {onBulkDismiss && (
                <button
                  type="button"
                  onClick={handleBulkDismiss}
                  disabled={isLoading}
                  className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:bg-dark-elevated dark:text-gray-400"
                >
                  <XMarkIcon className="h-3 w-3" />
                  Dismiss All
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pending suggestions */}
      {pendingSuggestions.length > 0 && (
        <div className="space-y-3">
          {pendingSuggestions.map((comment) => (
            <div key={comment.id} className="flex items-start gap-2">
              {(onBulkAccept || onBulkDismiss) && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(comment.id)}
                  onChange={() => toggleSelection(comment.id)}
                  className="mt-5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
              )}
              <AIReviewSuggestionCard
                comment={comment}
                onAccept={onAccept}
                onDismiss={onDismiss}
                isLoading={isLoading}
                className="flex-1"
              />
            </div>
          ))}
        </div>
      )}

      {/* Resolved suggestions */}
      {resolvedSuggestions.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-3 text-sm font-medium text-gray-500 dark:text-gray-400">
            Resolved ({resolvedSuggestions.length})
          </h4>
          <div className="space-y-2">
            {resolvedSuggestions.map((comment) => (
              <AIReviewSuggestionCard
                key={comment.id}
                comment={comment}
                isLoading={isLoading}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AIReviewSuggestionCard;
