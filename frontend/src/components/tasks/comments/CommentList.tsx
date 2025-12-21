/**
 * Comment List - Renders threaded comments with replies
 */

import type { TaskComment } from "@/types";
import CommentItem from "./CommentItem";

interface CommentListProps {
  taskId: string;
  comments: TaskComment[];
  onReply: (content: string, parentCommentId: string) => void;
  onEdit: (commentId: string, content: string) => void;
  onDelete: (commentId: string) => void;
  isReplying?: boolean;
  /** Function to check if a comment has been read */
  isRead?: (commentId: string) => boolean;
}

export default function CommentList({
  taskId,
  comments,
  onReply,
  onEdit,
  onDelete,
  isReplying,
  isRead,
}: CommentListProps) {
  // Group comments by parent - add defensive check for undefined
  const safeComments = comments || [];
  const topLevelComments = safeComments.filter((c) => !c.parent_comment_id);
  const repliesMap = new Map<string, TaskComment[]>();

  safeComments.forEach((comment) => {
    if (comment.parent_comment_id) {
      const existing = repliesMap.get(comment.parent_comment_id) || [];
      repliesMap.set(comment.parent_comment_id, [...existing, comment]);
    }
  });

  // Sort comments by created_at (oldest first)
  const sortByDate = (a: TaskComment, b: TaskComment) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

  const sortedTopLevel = [...topLevelComments].sort(sortByDate);

  return (
    <div className="space-y-4">
      {sortedTopLevel.map((comment) => {
        const replies = repliesMap.get(comment.id) || [];
        const sortedReplies = [...replies].sort(sortByDate);

        return (
          <div key={comment.id}>
            <CommentItem
              taskId={taskId}
              comment={comment}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              isReplying={isReplying}
              isUnread={isRead ? !isRead(comment.id) : false}
            />
            {/* Replies */}
            {sortedReplies.length > 0 && (
              <div className="ml-10 mt-3 space-y-3 border-l-2 border-gray-200 pl-4 dark:border-dark-border">
                {sortedReplies.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    taskId={taskId}
                    comment={reply}
                    onReply={onReply}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    isReplying={isReplying}
                    isReply
                    isUnread={isRead ? !isRead(reply.id) : false}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
