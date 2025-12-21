/**
 * Comment Item - Individual comment display with actions
 */

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { PencilIcon, TrashIcon, ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import type { TaskComment } from "@/types";
import CommentInput from "./CommentInput";
import ReactionBar from "./ReactionBar";
import MentionText from "./MentionText";

interface CommentItemProps {
  taskId: string;
  comment: TaskComment;
  onReply: (content: string, parentCommentId: string) => void;
  onEdit: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
  isReplying?: boolean;
  isReply?: boolean;
  /** Whether this comment is unread by the current user */
  isUnread?: boolean;
}

export default function CommentItem({
  taskId,
  comment,
  onReply,
  onEdit,
  onDelete,
  isReplying,
  isReply,
  isUnread,
}: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isReplyingTo, setIsReplyingTo] = useState(false);
  const [editedContent, setEditedContent] = useState(comment.content);

  // Extract initials from user info (fallback to first 2 chars of user_id)
  const displayName = comment.user_name || comment.user_email?.split("@")[0] || "User";
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleEditSave = () => {
    if (editedContent.trim() && editedContent !== comment.content) {
      onEdit(comment.id, editedContent.trim());
    }
    setIsEditing(false);
  };

  const handleReply = (content: string) => {
    onReply(content, comment.id);
    setIsReplyingTo(false);
  };

  return (
    <div className={clsx(
      "group",
      isUnread && "relative"
    )}>
      {/* Unread indicator */}
      {isUnread && (
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary-500" />
      )}
      <div className="flex gap-3">
        {/* Avatar */}
        <div
          className={clsx(
            "flex items-center justify-center rounded-full font-medium text-white",
            isReply ? "h-6 w-6 text-xs" : "h-8 w-8 text-sm",
            "bg-primary-500"
          )}
        >
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white text-sm">
              {displayName}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
            {comment.edited_at && (
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                (edited)
              </span>
            )}
          </div>

          {/* Content */}
          {isEditing ? (
            <div className="mt-2">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-soft dark:text-white dark:border-dark-border dark:bg-dark-card focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none transition-all"
                rows={3}
                autoFocus
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleEditSave}
                  className="rounded px-3 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditedContent(comment.content);
                  }}
                  className="rounded px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              <MentionText content={comment.content} mentions={comment.mentions} />
            </p>
          )}

          {/* Reactions */}
          <ReactionBar
            taskId={taskId}
            commentId={comment.id}
            reactions={comment.reactions || []}
          />

          {/* Actions */}
          {!isEditing && (
            <div className="mt-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setIsReplyingTo(true)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                Reply
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <PencilIcon className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                onClick={() => onDelete(comment.id)}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          )}

          {/* Reply input */}
          {isReplyingTo && (
            <div className="mt-3">
              <CommentInput
                onSubmit={handleReply}
                onCancel={() => setIsReplyingTo(false)}
                isSubmitting={isReplying}
                placeholder={`Reply to ${displayName}...`}
                autoFocus
                compact
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
