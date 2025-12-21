/**
 * DocumentCommentsSidebar - Sidebar panel for viewing and managing document comments
 */

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { clsx } from "clsx";
import {
  ChatBubbleLeftIcon,
  CheckCircleIcon,
  XMarkIcon,
  FunnelIcon,
  PencilIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolidIcon } from "@heroicons/react/24/solid";
import { useDocumentComments } from "@/hooks/useDocumentComments";
import { useDocumentCommentReads } from "@/hooks/useCommentReads";
import { DocumentCommentInput } from "./DocumentCommentInput";
import MentionText from "@/components/tasks/comments/MentionText";
import type { DocumentComment } from "@/services/documents";

interface PendingInlineComment {
  selectedText: string;
  anchorData: { from: number; to: number; surroundingText: string };
}

interface DocumentCommentsSidebarProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Callback when user clicks on inline comment to scroll to it */
  onJumpToSelection?: (start: number, end: number) => void;
  /** Pending inline comment when user selects text and clicks add comment */
  pendingInlineComment?: PendingInlineComment | null;
  /** Handler for submitting the pending inline comment */
  onSubmitInlineComment?: (content: string) => Promise<void>;
  /** Handler for canceling the pending inline comment */
  onCancelInlineComment?: () => void;
}

type FilterType = "all" | "unresolved" | "resolved";

export function DocumentCommentsSidebar({
  documentId,
  isOpen,
  onClose,
  onJumpToSelection,
  pendingInlineComment,
  onSubmitInlineComment,
  onCancelInlineComment,
}: DocumentCommentsSidebarProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const {
    comments,
    rootComments,
    getReplies,
    addComment,
    editComment,
    removeComment,
    resolveCommentById,
    isLoading,
    isCreating,
    isUpdating,
  } = useDocumentComments({
    documentId,
    includeResolved: filter !== "unresolved",
  });

  // Extract comment IDs for read tracking
  const commentIds = useMemo(
    () => comments.map((c) => c.id),
    [comments]
  );

  // Track read status for comments
  const { isRead } = useDocumentCommentReads(commentIds, {
    enabled: commentIds.length > 0 && isOpen,
    autoMarkRead: true,
    autoMarkDelay: 2000,
  });

  // Filter comments based on selected filter
  const filteredRootComments = rootComments.filter((comment) => {
    if (filter === "resolved") return comment.is_resolved;
    if (filter === "unresolved") return !comment.is_resolved;
    return true;
  });

  // Separate inline vs general comments
  const inlineComments = filteredRootComments.filter(
    (c) => c.selection_start !== null
  );
  const generalComments = filteredRootComments.filter(
    (c) => c.selection_start === null
  );

  const handleAddComment = async (content: string) => {
    await addComment(content);
  };

  const handleReply = async (parentId: string, content: string) => {
    await addComment(content, { parentId });
    setReplyingTo(null);
  };

  const handleEdit = async (commentId: string, content: string) => {
    await editComment(commentId, content);
    setEditingId(null);
  };

  const handleDelete = async (commentId: string) => {
    if (confirm("Are you sure you want to delete this comment?")) {
      await removeComment(commentId);
    }
  };

  const handleResolve = async (commentId: string) => {
    await resolveCommentById(commentId);
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 border-l border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
        <div className="flex items-center gap-2">
          <ChatBubbleLeftIcon className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Comments
          </h3>
          <span className="px-1.5 py-0.5 text-xs font-medium bg-gray-100 dark:bg-dark-elevated text-gray-600 dark:text-gray-300 rounded">
            {comments.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-dark-border">
        <FunnelIcon className="w-4 h-4 text-gray-400" />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterType)}
          className="text-sm bg-transparent text-gray-700 dark:text-gray-300 border-none focus:ring-0"
        >
          <option value="all">All comments</option>
          <option value="unresolved">Unresolved</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {/* Pending Inline Comment Input */}
      {pendingInlineComment && onSubmitInlineComment && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <div className="mb-2">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              Commenting on selected text:
            </span>
            <p className="mt-1 text-xs italic text-amber-600 dark:text-amber-500 line-clamp-2 bg-white dark:bg-dark-card p-2 rounded border border-amber-200 dark:border-amber-700">
              &quot;{pendingInlineComment.selectedText}&quot;
            </p>
          </div>
          <DocumentCommentInput
            onSubmit={async (content) => {
              await onSubmitInlineComment(content);
            }}
            onCancel={onCancelInlineComment}
            placeholder="Add your comment..."
            autoFocus
          />
        </div>
      )}

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 bg-gray-100 dark:bg-dark-elevated rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <ChatBubbleLeftIcon className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm">No comments yet</p>
            <p className="text-xs mt-1">
              Add a comment below or select text to comment inline
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-4">
            {/* Inline Comments Section */}
            {inlineComments.length > 0 && (
              <div>
                <h4 className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Inline Comments
                </h4>
                <div className="space-y-2">
                  {inlineComments.map((comment) => (
                    <CommentThread
                      key={comment.id}
                      comment={comment}
                      replies={getReplies(comment.id)}
                      onReply={(id) => setReplyingTo(id)}
                      onEdit={(id) => setEditingId(id)}
                      onDelete={handleDelete}
                      onResolve={handleResolve}
                      onJumpToSelection={onJumpToSelection}
                      replyingTo={replyingTo}
                      editingId={editingId}
                      onSubmitReply={handleReply}
                      onSubmitEdit={handleEdit}
                      onCancelReply={() => setReplyingTo(null)}
                      onCancelEdit={() => setEditingId(null)}
                      isSubmitting={isCreating || isUpdating}
                      isRead={isRead}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* General Comments Section */}
            {generalComments.length > 0 && (
              <div>
                <h4 className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  General Comments
                </h4>
                <div className="space-y-2">
                  {generalComments.map((comment) => (
                    <CommentThread
                      key={comment.id}
                      comment={comment}
                      replies={getReplies(comment.id)}
                      onReply={(id) => setReplyingTo(id)}
                      onEdit={(id) => setEditingId(id)}
                      onDelete={handleDelete}
                      onResolve={handleResolve}
                      replyingTo={replyingTo}
                      editingId={editingId}
                      onSubmitReply={handleReply}
                      onSubmitEdit={handleEdit}
                      onCancelReply={() => setReplyingTo(null)}
                      onCancelEdit={() => setEditingId(null)}
                      isSubmitting={isCreating || isUpdating}
                      isRead={isRead}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Comment Input */}
      <div className="p-4 border-t border-gray-200 dark:border-dark-border">
        <DocumentCommentInput
          onSubmit={handleAddComment}
          isSubmitting={isCreating}
          placeholder="Add a comment..."
          compact
        />
      </div>
    </div>
  );
}

interface CommentThreadProps {
  comment: DocumentComment;
  replies: DocumentComment[];
  onReply: (commentId: string) => void;
  onEdit: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onResolve: (commentId: string) => void;
  onJumpToSelection?: (start: number, end: number) => void;
  replyingTo: string | null;
  editingId: string | null;
  onSubmitReply: (parentId: string, content: string) => void;
  onSubmitEdit: (commentId: string, content: string) => void;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  isSubmitting: boolean;
  /** Function to check if a comment has been read */
  isRead?: (commentId: string) => boolean;
}

function CommentThread({
  comment,
  replies,
  onReply,
  onEdit,
  onDelete,
  onResolve,
  onJumpToSelection,
  replyingTo,
  editingId,
  onSubmitReply,
  onSubmitEdit,
  onCancelReply,
  onCancelEdit,
  isSubmitting,
  isRead,
}: CommentThreadProps) {
  const isInline = comment.selection_start !== null;
  const isUnread = isRead ? !isRead(comment.id) : false;

  return (
    <div
      className={clsx(
        "rounded-xl border relative shadow-soft transition-all",
        comment.is_resolved
          ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10"
          : isUnread
          ? "border-primary-300 bg-primary-50/30 dark:border-primary-700 dark:bg-primary-900/10"
          : "border-gray-200 bg-white dark:border-dark-border dark:bg-dark-card"
      )}
    >
      {/* Unread indicator */}
      {isUnread && (
        <div className="absolute -left-1 top-3 w-2 h-2 rounded-full bg-primary-500" />
      )}
      {/* Inline quote */}
      {isInline && comment.selected_text && (
        <button
          onClick={() =>
            onJumpToSelection?.(comment.selection_start!, comment.selection_end!)
          }
          className="w-full px-3 py-2 text-left border-b border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-elevated/50 transition-colors"
        >
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
            Selected text:
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 italic">
            "{comment.selected_text}"
          </div>
        </button>
      )}

      {/* Main comment */}
      <CommentItem
        comment={comment}
        onReply={() => onReply(comment.id)}
        onEdit={() => onEdit(comment.id)}
        onDelete={() => onDelete(comment.id)}
        onResolve={() => onResolve(comment.id)}
        isEditing={editingId === comment.id}
        onSubmitEdit={(content) => onSubmitEdit(comment.id, content)}
        onCancelEdit={onCancelEdit}
        isSubmitting={isSubmitting}
      />

      {/* Replies */}
      {replies.length > 0 && (
        <div className="border-t border-gray-100 dark:border-dark-border">
          {replies.map((reply) => (
            <div key={reply.id} className="pl-4 border-l-2 border-gray-200 dark:border-dark-border ml-3">
              <CommentItem
                comment={reply}
                onEdit={() => onEdit(reply.id)}
                onDelete={() => onDelete(reply.id)}
                isEditing={editingId === reply.id}
                onSubmitEdit={(content) => onSubmitEdit(reply.id, content)}
                onCancelEdit={onCancelEdit}
                isSubmitting={isSubmitting}
                isReply
              />
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      {replyingTo === comment.id && (
        <div className="p-3 border-t border-gray-100 dark:border-dark-border">
          <DocumentCommentInput
            onSubmit={(content) => onSubmitReply(comment.id, content)}
            onCancel={onCancelReply}
            isSubmitting={isSubmitting}
            placeholder="Write a reply..."
            autoFocus
            compact
          />
        </div>
      )}
    </div>
  );
}

interface CommentItemProps {
  comment: DocumentComment;
  onReply?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onResolve?: () => void;
  isEditing: boolean;
  onSubmitEdit: (content: string) => void;
  onCancelEdit: () => void;
  isSubmitting: boolean;
  isReply?: boolean;
}

function CommentItem({
  comment,
  onReply,
  onEdit,
  onDelete,
  onResolve,
  isEditing,
  onSubmitEdit,
  onCancelEdit,
  isSubmitting,
  isReply,
}: CommentItemProps) {
  // Generate initials from user name or email
  const initials =
    comment.user_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ||
    comment.user_email?.slice(0, 2).toUpperCase() ||
    "??";

  if (isEditing) {
    return (
      <div className="p-3">
        <DocumentCommentInput
          onSubmit={onSubmitEdit}
          onCancel={onCancelEdit}
          isSubmitting={isSubmitting}
          initialContent={comment.content}
          autoFocus
          compact
        />
      </div>
    );
  }

  return (
    <div className={clsx("p-3", isReply && "py-2")}>
      {/* Header */}
      <div className="flex items-start gap-2">
        <div
          className={clsx(
            "flex-shrink-0 rounded-full flex items-center justify-center text-white font-medium",
            isReply ? "w-6 h-6 text-xs" : "w-8 h-8 text-sm",
            comment.is_resolved ? "bg-green-500" : "bg-primary-500"
          )}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {comment.user_name || comment.user_email || "Unknown"}
            </span>
            {comment.is_resolved && (
              <CheckCircleSolidIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {format(new Date(comment.created_at), "MMM d, h:mm a")}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className={clsx("mt-2", isReply ? "text-sm" : "text-sm")}>
        <MentionText content={comment.content} mentions={comment.mentions} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-2">
        {onReply && !comment.is_resolved && (
          <button
            onClick={onReply}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
            Reply
          </button>
        )}
        <button
          onClick={onEdit}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <PencilIcon className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
        >
          <TrashIcon className="w-3.5 h-3.5" />
          Delete
        </button>
        {onResolve && !comment.is_resolved && (
          <button
            onClick={onResolve}
            className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 ml-auto"
          >
            <CheckCircleIcon className="w-3.5 h-3.5" />
            Resolve
          </button>
        )}
      </div>
    </div>
  );
}

export default DocumentCommentsSidebar;
