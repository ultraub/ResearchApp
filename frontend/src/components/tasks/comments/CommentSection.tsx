/**
 * Comment Section - Container for task comments with threading support
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tasksService } from "@/services/tasks";
import CommentList from "./CommentList";
import CommentInput from "./CommentInput";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useTaskCommentReads } from "@/hooks/useCommentReads";

interface CommentSectionProps {
  taskId: string;
}

export default function CommentSection({ taskId }: CommentSectionProps) {
  const queryClient = useQueryClient();

  // Fetch comments
  const { data: comments, isLoading } = useQuery({
    queryKey: ["taskComments", taskId],
    queryFn: () => tasksService.getComments(taskId),
    enabled: !!taskId,
  });

  // Extract comment IDs for read tracking
  const commentIds = useMemo(
    () => comments?.map((c) => c.id) || [],
    [comments]
  );

  // Track read status for comments
  const { isRead } = useTaskCommentReads(commentIds, {
    enabled: commentIds.length > 0,
    autoMarkRead: true,
    autoMarkDelay: 2000, // Mark as read after 2 seconds of viewing
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: (data: { content: string; parentCommentId?: string }) =>
      tasksService.addComment(taskId, {
        content: data.content,
        parent_comment_id: data.parentCommentId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskComments", taskId] });
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      toast.success("Comment added");
    },
    onError: () => {
      toast.error("Failed to add comment");
    },
  });

  // Update comment mutation
  const updateCommentMutation = useMutation({
    mutationFn: (data: { commentId: string; content: string }) =>
      tasksService.updateComment(taskId, data.commentId, data.content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskComments", taskId] });
      toast.success("Comment updated");
    },
    onError: () => {
      toast.error("Failed to update comment");
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => tasksService.deleteComment(taskId, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["taskComments", taskId] });
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      toast.success("Comment deleted");
    },
    onError: () => {
      toast.error("Failed to delete comment");
    },
  });

  const handleAddComment = (content: string, parentCommentId?: string) => {
    addCommentMutation.mutate({ content, parentCommentId });
  };

  const handleUpdateComment = (commentId: string, content: string) => {
    updateCommentMutation.mutate({ commentId, content });
  };

  const handleDeleteComment = (commentId: string) => {
    if (window.confirm("Are you sure you want to delete this comment?")) {
      deleteCommentMutation.mutate(commentId);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-12 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const topLevelComments = comments?.filter((c) => !c.parent_comment_id) || [];

  return (
    <div className="space-y-6">
      {/* Add comment input */}
      <CommentInput
        onSubmit={handleAddComment}
        isSubmitting={addCommentMutation.isPending}
        placeholder="Add a comment..."
      />

      {/* Comments list */}
      {topLevelComments.length > 0 ? (
        <CommentList
          taskId={taskId}
          comments={comments || []}
          onReply={handleAddComment}
          onEdit={handleUpdateComment}
          onDelete={handleDeleteComment}
          isReplying={addCommentMutation.isPending}
          isRead={isRead}
        />
      ) : (
        <div className="text-center py-8">
          <ChatBubbleLeftRightIcon className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No comments yet. Be the first to comment!
          </p>
        </div>
      )}
    </div>
  );
}
