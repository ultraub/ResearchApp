/**
 * InlineCommentPopup - Popup panel for inline document comments
 *
 * This component displays when a user clicks on highlighted text
 * associated with a document comment. It shows the comment content,
 * allows replies, and provides resolve/edit/delete actions.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { clsx } from "clsx";
import {
  XMarkIcon,
  CheckIcon,
  ChatBubbleLeftIcon,
  PencilIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolidIcon } from "@heroicons/react/24/solid";
import MentionText from "@/components/tasks/comments/MentionText";
import { DocumentCommentInput } from "./DocumentCommentInput";
import type { DocumentComment } from "@/services/documents";

interface InlineCommentPopupProps {
  /** The comment to display */
  comment: DocumentComment | null;
  /** All comments for threading context */
  allComments?: DocumentComment[];
  /** Whether the popup is visible */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Position for the popup */
  position?: { top: number; left: number };
  /** Resolve comment handler */
  onResolve?: (commentId: string) => Promise<void>;
  /** Reply handler */
  onReply?: (parentId: string, content: string) => Promise<void>;
  /** Edit handler */
  onEdit?: (commentId: string, content: string) => Promise<void>;
  /** Delete handler */
  onDelete?: (commentId: string) => Promise<void>;
  /** Additional class name */
  className?: string;
}

export function InlineCommentPopup({
  comment,
  allComments = [],
  isOpen,
  onClose,
  position,
  onResolve,
  onReply,
  onEdit,
  onDelete,
  className,
}: InlineCommentPopupProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Get replies for this comment
  const replies = allComments.filter((c) => c.parent_id === comment?.id);

  // Reset state when comment changes
  useEffect(() => {
    setIsReplying(false);
    setIsEditing(false);
    setEditContent("");
    setShowDeleteConfirm(false);
  }, [comment?.id]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (isReplying) {
          setIsReplying(false);
        } else if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isReplying, isEditing, onClose]);

  // Adjust position to stay in viewport
  useEffect(() => {
    if (!popupRef.current || !position || !isOpen) return;

    const popup = popupRef.current;
    const rect = popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust horizontal position
    if (rect.right > viewportWidth - 16) {
      popup.style.left = `${viewportWidth - rect.width - 16}px`;
    }

    // Adjust vertical position
    if (rect.bottom > viewportHeight - 16) {
      popup.style.top = `${Math.max(16, viewportHeight - rect.height - 16)}px`;
    }
  }, [position, isOpen]);

  const handleReply = useCallback(
    async (content: string) => {
      if (!comment || !onReply || !content.trim()) return;
      setIsSubmitting(true);
      try {
        await onReply(comment.id, content.trim());
        setIsReplying(false);
      } finally {
        setIsSubmitting(false);
      }
    },
    [comment, onReply]
  );

  const handleEdit = useCallback(async () => {
    if (!comment || !onEdit || !editContent.trim()) return;
    setIsSubmitting(true);
    try {
      await onEdit(comment.id, editContent.trim());
      setIsEditing(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [comment, onEdit, editContent]);

  const handleResolve = useCallback(async () => {
    if (!comment || !onResolve) return;
    setIsSubmitting(true);
    try {
      await onResolve(comment.id);
    } finally {
      setIsSubmitting(false);
    }
  }, [comment, onResolve]);

  const handleDelete = useCallback(async () => {
    if (!comment || !onDelete) return;
    setIsSubmitting(true);
    try {
      await onDelete(comment.id);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }, [comment, onDelete, onClose]);

  const startEditing = useCallback(() => {
    if (comment) {
      setEditContent(comment.content);
      setIsEditing(true);
    }
  }, [comment]);

  if (!isOpen || !comment) return null;

  // Generate user initials
  const initials = comment.user_name
    ? comment.user_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : comment.user_email?.[0].toUpperCase() || "?";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Popup */}
      <div
        ref={popupRef}
        className={clsx(
          "fixed z-50 w-80 max-h-[70vh] overflow-auto rounded-xl bg-white shadow-card dark:bg-dark-card",
          "border border-gray-200 dark:border-dark-border",
          "animate-in fade-in-0 zoom-in-95 duration-150",
          className
        )}
        style={
          position
            ? { top: position.top, left: position.left }
            : { top: "20%", right: "1rem" }
        }
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2 dark:border-dark-border dark:bg-dark-card">
          <div className="flex items-center gap-2">
            {/* User avatar */}
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700 dark:bg-primary-900/50 dark:text-primary-300">
              {initials}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {comment.user_name || comment.user_email || "Unknown"}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {format(new Date(comment.created_at), "MMM d, h:mm a")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {comment.is_resolved && (
              <CheckCircleSolidIcon className="h-4 w-4 text-green-500" />
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-elevated dark:hover:text-gray-300 transition-colors"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3">
          {/* Selected text preview */}
          {comment.selected_text && (
            <div className="mb-3 rounded-md bg-amber-50 p-2 dark:bg-amber-900/20">
              <p className="text-xs italic text-amber-700 dark:text-amber-400 line-clamp-2">
                &quot;{comment.selected_text}&quot;
              </p>
            </div>
          )}

          {/* Comment content or edit mode */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-dark-border dark:bg-dark-elevated dark:text-white transition-all"
                rows={3}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-elevated transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEdit}
                  disabled={!editContent.trim() || isSubmitting}
                  className="rounded bg-gradient-to-br from-primary-500 to-primary-600 px-2 py-1 text-xs font-medium text-white hover:from-primary-600 hover:to-primary-700 transition-all shadow-soft disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-700 dark:text-gray-300">
              <MentionText
                content={comment.content}
                mentions={comment.mentions}
              />
            </div>
          )}

          {/* Replies section */}
          {replies.length > 0 && (
            <div className="mt-3 border-t border-gray-100 pt-3 dark:border-dark-border">
              <button
                type="button"
                onClick={() => setShowReplies(!showReplies)}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
              >
                {showReplies ? (
                  <ChevronUpIcon className="h-3 w-3" />
                ) : (
                  <ChevronDownIcon className="h-3 w-3" />
                )}
                {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </button>

              {showReplies && (
                <div className="mt-2 space-y-2">
                  {replies.map((reply) => (
                    <div
                      key={reply.id}
                      className="rounded-md bg-gray-50 p-2 dark:bg-dark-base"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {reply.user_name || reply.user_email || "Unknown"}
                        </span>
                        <span className="text-xs text-gray-400">
                          {format(new Date(reply.created_at), "MMM d")}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        <MentionText
                          content={reply.content}
                          mentions={reply.mentions}
                        />
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reply input */}
          {isReplying && (
            <div className="mt-3 border-t border-gray-100 pt-3 dark:border-dark-border">
              <DocumentCommentInput
                onSubmit={handleReply}
                onCancel={() => setIsReplying(false)}
                placeholder="Write a reply..."
                isSubmitting={isSubmitting}
                autoFocus
              />
            </div>
          )}

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="mt-3 rounded-md bg-red-50 p-3 dark:bg-red-900/20">
              <p className="text-sm text-red-700 dark:text-red-400 mb-2">
                Delete this comment?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-elevated transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="flex-1 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 transition-all shadow-soft disabled:opacity-50"
                >
                  {isSubmitting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions footer */}
        {!isEditing && !showDeleteConfirm && !comment.is_resolved && (
          <div className="sticky bottom-0 flex items-center gap-1 border-t border-gray-200 bg-gray-50 px-3 py-2 dark:border-dark-border dark:bg-dark-base">
            {/* Resolve button */}
            {onResolve && (
              <button
                type="button"
                onClick={handleResolve}
                disabled={isSubmitting}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/30 transition-all"
              >
                <CheckIcon className="h-3.5 w-3.5" />
                Resolve
              </button>
            )}

            {/* Reply button */}
            {onReply && !isReplying && (
              <button
                type="button"
                onClick={() => setIsReplying(true)}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-elevated transition-all"
              >
                <ChatBubbleLeftIcon className="h-3.5 w-3.5" />
                Reply
              </button>
            )}

            <div className="flex-1" />

            {/* Edit button */}
            {onEdit && (
              <button
                type="button"
                onClick={startEditing}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-elevated dark:hover:text-gray-300 transition-all"
                title="Edit"
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Delete button */}
            {onDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded p-1.5 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-all"
                title="Delete"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Resolved footer */}
        {comment.is_resolved && (
          <div className="border-t border-gray-200 bg-green-50 px-3 py-2 dark:border-dark-border dark:bg-green-900/20">
            <div className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
              <CheckCircleSolidIcon className="h-3.5 w-3.5" />
              <span>Resolved</span>
              {comment.resolved_at && (
                <span className="text-gray-500 dark:text-gray-400">
                  — {format(new Date(comment.resolved_at), "MMM d")}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default InlineCommentPopup;
