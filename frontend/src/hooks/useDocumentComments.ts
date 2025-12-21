/**
 * useDocumentComments - Hook for managing document comments with optimistic updates
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  getDocumentComments,
  createComment,
  updateComment,
  deleteComment,
  resolveComment,
  type DocumentComment,
  type CreateCommentRequest,
} from "@/services/documents";

interface UseDocumentCommentsOptions {
  documentId: string;
  includeResolved?: boolean;
  enabled?: boolean;
}

interface UseDocumentCommentsReturn {
  comments: DocumentComment[];
  isLoading: boolean;
  isError: boolean;
  // Thread management
  rootComments: DocumentComment[];
  getReplies: (parentId: string) => DocumentComment[];
  // Actions
  addComment: (content: string, options?: {
    selectionStart?: number;
    selectionEnd?: number;
    selectedText?: string;
    parentId?: string;
  }) => Promise<DocumentComment>;
  editComment: (commentId: string, content: string) => Promise<DocumentComment>;
  removeComment: (commentId: string) => Promise<void>;
  resolveCommentById: (commentId: string) => Promise<DocumentComment>;
  // Mutation states
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  isResolving: boolean;
}

export function useDocumentComments({
  documentId,
  includeResolved = false,
  enabled = true,
}: UseDocumentCommentsOptions): UseDocumentCommentsReturn {
  const queryClient = useQueryClient();
  const queryKey = ["document-comments", documentId, includeResolved];

  // Fetch comments
  const {
    data: comments = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey,
    queryFn: () => getDocumentComments(documentId, includeResolved),
    enabled: enabled && !!documentId,
  });

  // Create comment mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateCommentRequest) => createComment(data),
    onSuccess: (newComment) => {
      queryClient.setQueryData<DocumentComment[]>(queryKey, (old = []) => [
        ...old,
        newComment,
      ]);
      toast.success("Comment added");
    },
    onError: () => {
      toast.error("Failed to add comment");
    },
  });

  // Update comment mutation
  const updateMutation = useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      updateComment(documentId, commentId, content),
    onSuccess: (updatedComment) => {
      queryClient.setQueryData<DocumentComment[]>(queryKey, (old = []) =>
        old.map((c) => (c.id === updatedComment.id ? updatedComment : c))
      );
      toast.success("Comment updated");
    },
    onError: () => {
      toast.error("Failed to update comment");
    },
  });

  // Delete comment mutation
  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => deleteComment(documentId, commentId),
    onSuccess: (_, commentId) => {
      queryClient.setQueryData<DocumentComment[]>(queryKey, (old = []) =>
        old.filter((c) => c.id !== commentId && c.parent_id !== commentId)
      );
      toast.success("Comment deleted");
    },
    onError: () => {
      toast.error("Failed to delete comment");
    },
  });

  // Resolve comment mutation
  const resolveMutation = useMutation({
    mutationFn: (commentId: string) => resolveComment(documentId, commentId),
    onSuccess: (resolvedComment) => {
      queryClient.setQueryData<DocumentComment[]>(queryKey, (old = []) =>
        old.map((c) => (c.id === resolvedComment.id ? resolvedComment : c))
      );
      toast.success("Comment resolved");
    },
    onError: () => {
      toast.error("Failed to resolve comment");
    },
  });

  // Get root comments (no parent)
  const rootComments = comments.filter((c) => !c.parent_id);

  // Get replies to a specific comment
  const getReplies = (parentId: string): DocumentComment[] =>
    comments.filter((c) => c.parent_id === parentId);

  // Action handlers
  const addComment = async (
    content: string,
    options?: {
      selectionStart?: number;
      selectionEnd?: number;
      selectedText?: string;
      parentId?: string;
    }
  ): Promise<DocumentComment> => {
    return createMutation.mutateAsync({
      document_id: documentId,
      content,
      selection_start: options?.selectionStart,
      selection_end: options?.selectionEnd,
      selected_text: options?.selectedText,
      parent_id: options?.parentId,
    });
  };

  const editComment = async (
    commentId: string,
    content: string
  ): Promise<DocumentComment> => {
    return updateMutation.mutateAsync({ commentId, content });
  };

  const removeComment = async (commentId: string): Promise<void> => {
    await deleteMutation.mutateAsync(commentId);
  };

  const resolveCommentById = async (commentId: string): Promise<DocumentComment> => {
    return resolveMutation.mutateAsync(commentId);
  };

  return {
    comments,
    isLoading,
    isError,
    rootComments,
    getReplies,
    addComment,
    editComment,
    removeComment,
    resolveCommentById,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isResolving: resolveMutation.isPending,
  };
}

export default useDocumentComments;
