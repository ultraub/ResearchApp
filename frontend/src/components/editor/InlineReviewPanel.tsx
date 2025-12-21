/**
 * InlineReviewPanel - Slide-in panel for review comments in the editor
 *
 * This component displays review comment details when a user clicks on
 * highlighted text in the document. It supports both human and AI comments
 * and provides actions for resolving/replying to comments.
 */

import { useState, useEffect, useCallback } from "react";
import { clsx } from "clsx";
import {
  XMarkIcon,
  SparklesIcon,
  UserCircleIcon,
  CheckIcon,
  ChatBubbleLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import type { ReviewComment, CommentType, CommentSeverity } from "@/types";

interface InlineReviewPanelProps {
  comment: ReviewComment | null;
  isOpen: boolean;
  onClose: () => void;
  onResolve?: (commentId: string, notes?: string) => Promise<void>;
  onReply?: (commentId: string, content: string) => Promise<void>;
  onAcceptAI?: (commentId: string, notes?: string) => Promise<void>;
  onDismissAI?: (commentId: string, notes?: string) => Promise<void>;
  position?: { top: number; left: number };
  className?: string;
}

const COMMENT_TYPE_LABELS: Record<CommentType, string> = {
  general: "General",
  inline: "Inline",
  suggestion: "Suggestion",
  question: "Question",
  issue: "Issue",
  gap_identified: "Gap Identified",
  clarity_needed: "Clarity Needed",
  methodology_concern: "Methodology Concern",
  consistency_issue: "Consistency Issue",
};

const SEVERITY_CONFIG: Record<
  CommentSeverity,
  { label: string; color: string; bgColor: string }
> = {
  critical: {
    label: "Critical",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  major: {
    label: "Major",
    color: "text-orange-700 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
  },
  minor: {
    label: "Minor",
    color: "text-yellow-700 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
  },
  suggestion: {
    label: "Suggestion",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
};

export function InlineReviewPanel({
  comment,
  isOpen,
  onClose,
  onResolve,
  onReply,
  onAcceptAI,
  onDismissAI,
  position,
  className,
}: InlineReviewPanelProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [showResolutionInput, setShowResolutionInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReplies, setShowReplies] = useState(true);

  // Reset state when comment changes
  useEffect(() => {
    setIsReplying(false);
    setReplyContent("");
    setResolutionNotes("");
    setShowResolutionInput(false);
  }, [comment?.id]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleReply = useCallback(async () => {
    if (!comment || !onReply || !replyContent.trim()) return;
    setIsSubmitting(true);
    try {
      await onReply(comment.id, replyContent.trim());
      setReplyContent("");
      setIsReplying(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [comment, onReply, replyContent]);

  const handleResolve = useCallback(async () => {
    if (!comment || !onResolve) return;
    setIsSubmitting(true);
    try {
      await onResolve(comment.id, resolutionNotes || undefined);
    } finally {
      setIsSubmitting(false);
    }
  }, [comment, onResolve, resolutionNotes]);

  const handleAcceptAI = useCallback(async () => {
    if (!comment || !onAcceptAI) return;
    setIsSubmitting(true);
    try {
      await onAcceptAI(comment.id, resolutionNotes || undefined);
    } finally {
      setIsSubmitting(false);
    }
  }, [comment, onAcceptAI, resolutionNotes]);

  const handleDismissAI = useCallback(async () => {
    if (!comment || !onDismissAI) return;
    setIsSubmitting(true);
    try {
      await onDismissAI(comment.id, resolutionNotes || undefined);
    } finally {
      setIsSubmitting(false);
    }
  }, [comment, onDismissAI, resolutionNotes]);

  if (!isOpen || !comment) return null;

  const isAI = comment.source === "ai_suggestion";
  const isResolved =
    comment.is_resolved ||
    comment.source === "ai_accepted" ||
    comment.source === "ai_dismissed";
  const severityConfig = comment.severity ? SEVERITY_CONFIG[comment.severity] : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/10"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={clsx(
          "fixed z-50 w-96 max-h-[80vh] overflow-auto rounded-xl bg-white shadow-card dark:bg-dark-card",
          "border border-gray-200 dark:border-dark-border",
          "animate-in slide-in-from-right-2 duration-200",
          className
        )}
        style={
          position
            ? { top: position.top, left: position.left }
            : { top: "10%", right: "1rem" }
        }
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card px-4 py-3">
          <div className="flex items-center gap-2">
            {isAI ? (
              <div className="flex items-center gap-1.5 rounded-full bg-purple-100 dark:bg-purple-900/30 px-2 py-1 text-xs font-medium text-purple-700 dark:text-purple-400">
                <SparklesIcon className="h-3.5 w-3.5" />
                AI Suggestion
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                <UserCircleIcon className="h-4 w-4" />
                Comment
              </div>
            )}

            {severityConfig && (
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  severityConfig.bgColor,
                  severityConfig.color
                )}
              >
                {severityConfig.label}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-elevated hover:text-gray-600 dark:hover:text-gray-300"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Comment type */}
          <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            {COMMENT_TYPE_LABELS[comment.comment_type] || comment.comment_type}
          </div>

          {/* Selected text preview */}
          {comment.selected_text && (
            <div className="mb-3 rounded-xl bg-gray-50 dark:bg-dark-elevated p-2">
              <p className="text-xs italic text-gray-500 dark:text-gray-400">
                &quot;{comment.selected_text}&quot;
              </p>
            </div>
          )}

          {/* Main content */}
          <p className="text-sm text-gray-700 dark:text-gray-300">{comment.content}</p>

          {/* AI-specific content */}
          {isAI && (
            <>
              {comment.question_for_author && (
                <div className="mt-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 p-3">
                  <p className="text-xs font-medium text-purple-800 dark:text-purple-300">
                    Question for you:
                  </p>
                  <p className="mt-1 text-sm text-purple-700 dark:text-purple-400">
                    {comment.question_for_author}
                  </p>
                </div>
              )}

              {comment.why_this_matters && (
                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium">Why this matters: </span>
                  {comment.why_this_matters}
                </div>
              )}

              {comment.ai_confidence !== null && comment.ai_confidence !== undefined && (
                <div className="mt-2 text-xs text-gray-400">
                  AI Confidence: {Math.round(comment.ai_confidence * 100)}%
                </div>
              )}
            </>
          )}

          {/* Replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-4 border-t border-gray-100 dark:border-dark-border pt-4">
              <button
                type="button"
                onClick={() => setShowReplies(!showReplies)}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                {showReplies ? (
                  <ChevronUpIcon className="h-3 w-3" />
                ) : (
                  <ChevronDownIcon className="h-3 w-3" />
                )}
                {comment.replies.length} {comment.replies.length === 1 ? "reply" : "replies"}
              </button>

              {showReplies && (
                <div className="mt-2 space-y-2">
                  {comment.replies.map((reply) => (
                    <div
                      key={reply.id}
                      className="rounded-xl bg-gray-50 dark:bg-dark-elevated p-2"
                    >
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {reply.content}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {new Date(reply.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resolution notes input */}
          {showResolutionInput && (
            <div className="mt-4">
              <textarea
                placeholder="Add notes about how you addressed this..."
                className="w-full rounded-xl border border-gray-300 dark:border-dark-border px-3 py-2 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-dark-elevated dark:text-white"
                rows={2}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
              />
            </div>
          )}

          {/* Reply input */}
          {isReplying && (
            <div className="mt-4">
              <textarea
                placeholder="Write a reply..."
                className="w-full rounded-xl border border-gray-300 dark:border-dark-border px-3 py-2 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-dark-elevated dark:text-white"
                rows={3}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                autoFocus
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsReplying(false);
                    setReplyContent("");
                  }}
                  className="rounded-xl px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-elevated"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReply}
                  disabled={!replyContent.trim() || isSubmitting}
                  className="rounded-xl bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {isSubmitting ? "Sending..." : "Reply"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions footer */}
        {!isResolved && (
          <div className="sticky bottom-0 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-elevated px-4 py-3">
            <div className="flex items-center gap-2">
              {isAI ? (
                // AI suggestion actions
                <>
                  <button
                    type="button"
                    onClick={handleAcceptAI}
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 rounded-xl bg-green-100 dark:bg-green-900/30 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                  >
                    <CheckIcon className="h-4 w-4" />
                    Addressed
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissAI}
                    disabled={isSubmitting}
                    className="rounded-xl bg-gray-100 dark:bg-dark-elevated px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    Dismiss
                  </button>
                </>
              ) : (
                // Human comment actions
                <>
                  <button
                    type="button"
                    onClick={handleResolve}
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 rounded-xl bg-green-100 dark:bg-green-900/30 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                  >
                    <CheckIcon className="h-4 w-4" />
                    Resolve
                  </button>
                  {onReply && !isReplying && (
                    <button
                      type="button"
                      onClick={() => setIsReplying(true)}
                      className="flex items-center gap-1.5 rounded-xl bg-gray-100 dark:bg-dark-elevated px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      <ChatBubbleLeftIcon className="h-4 w-4" />
                      Reply
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={() => setShowResolutionInput(!showResolutionInput)}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showResolutionInput ? "Hide notes" : "Add notes"}
              </button>
            </div>
          </div>
        )}

        {/* Resolved status */}
        {isResolved && (
          <div className="border-t border-gray-200 dark:border-dark-border bg-green-50 dark:bg-green-900/20 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckIcon className="h-4 w-4" />
              <span>
                {comment.source === "ai_accepted"
                  ? "Addressed"
                  : comment.source === "ai_dismissed"
                  ? "Dismissed"
                  : "Resolved"}
              </span>
              {comment.resolution_notes && (
                <span className="text-gray-500 dark:text-gray-400">
                  — {comment.resolution_notes}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default InlineReviewPanel;
