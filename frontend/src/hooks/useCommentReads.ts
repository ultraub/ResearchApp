/**
 * Hook for tracking comment read status.
 *
 * Provides functionality to:
 * - Fetch read status for a batch of comments
 * - Mark comments as read
 * - Track unread comment count
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  commentReadsApi,
  type CommentType,
  type CommentReadStatus,
} from "@/services/commentReads";

interface UseCommentReadsOptions {
  /** Type of comments being tracked */
  commentType: CommentType;
  /** Array of comment IDs to track */
  commentIds: string[];
  /** Whether to auto-mark comments as read after a delay */
  autoMarkRead?: boolean;
  /** Delay in ms before auto-marking as read (default: 2000) */
  autoMarkDelay?: number;
  /** Whether the hook is enabled */
  enabled?: boolean;
}

interface UseCommentReadsResult {
  /** Map of comment ID to read status */
  readStatusMap: Map<string, CommentReadStatus>;
  /** Count of unread comments */
  unreadCount: number;
  /** Whether read status is loading */
  isLoading: boolean;
  /** Mark specific comments as read */
  markAsRead: (ids: string[]) => void;
  /** Mark a comment as unread */
  markAsUnread: (id: string) => void;
  /** Check if a specific comment is read */
  isRead: (id: string) => boolean;
  /** Whether marking as read is in progress */
  isMarkingRead: boolean;
}

export function useCommentReads({
  commentType,
  commentIds,
  autoMarkRead = true,
  autoMarkDelay = 2000,
  enabled = true,
}: UseCommentReadsOptions): UseCommentReadsResult {
  const queryClient = useQueryClient();
  const autoMarkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const markedIdsRef = useRef<Set<string>>(new Set());

  // Query key for this specific set of comments
  const queryKey = ["commentReadStatus", commentType, commentIds.sort().join(",")];

  // Fetch read status for all comments
  const { data: readStatuses, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      commentReadsApi.getReadStatus({
        comment_type: commentType,
        comment_ids: commentIds,
      }),
    enabled: enabled && commentIds.length > 0,
    staleTime: 30000, // Consider fresh for 30 seconds
  });

  // Create a map for easy lookup
  const readStatusMap = useMemo(() => {
    const map = new Map<string, CommentReadStatus>();
    readStatuses?.forEach((status) => {
      map.set(status.comment_id, status);
    });
    return map;
  }, [readStatuses]);

  // Calculate unread count
  const unreadCount = useMemo(() => {
    return commentIds.filter((id) => {
      const status = readStatusMap.get(id);
      return !status?.is_read;
    }).length;
  }, [commentIds, readStatusMap]);

  // Mark as read mutation
  const markReadMutation = useMutation({
    mutationFn: (ids: string[]) =>
      commentReadsApi.markRead({
        comment_type: commentType,
        comment_ids: ids,
      }),
    onSuccess: (_, ids) => {
      // Optimistically update the cache
      queryClient.setQueryData<CommentReadStatus[]>(queryKey, (old) => {
        if (!old) return old;
        return old.map((status) => {
          if (ids.includes(status.comment_id)) {
            return {
              ...status,
              is_read: true,
              read_at: new Date().toISOString(),
            };
          }
          return status;
        });
      });
      // Add to tracked set to prevent re-marking
      ids.forEach((id) => markedIdsRef.current.add(id));
    },
  });

  // Mark as unread mutation
  const markUnreadMutation = useMutation({
    mutationFn: (id: string) => commentReadsApi.markUnread(commentType, id),
    onSuccess: (_, id) => {
      // Update the cache
      queryClient.setQueryData<CommentReadStatus[]>(queryKey, (old) => {
        if (!old) return old;
        return old.map((status) => {
          if (status.comment_id === id) {
            return {
              ...status,
              is_read: false,
              read_at: null,
            };
          }
          return status;
        });
      });
      // Remove from tracked set
      markedIdsRef.current.delete(id);
    },
  });

  // Mark specific comments as read
  const markAsRead = useCallback(
    (ids: string[]) => {
      // Filter out already-read and already-marked comments
      const idsToMark = ids.filter((id) => {
        const status = readStatusMap.get(id);
        return !status?.is_read && !markedIdsRef.current.has(id);
      });

      if (idsToMark.length > 0) {
        markReadMutation.mutate(idsToMark);
      }
    },
    [readStatusMap, markReadMutation]
  );

  // Mark a comment as unread
  const markAsUnread = useCallback(
    (id: string) => {
      markUnreadMutation.mutate(id);
    },
    [markUnreadMutation]
  );

  // Check if a specific comment is read
  const isRead = useCallback(
    (id: string): boolean => {
      const status = readStatusMap.get(id);
      return status?.is_read ?? false;
    },
    [readStatusMap]
  );

  // Auto-mark comments as read after delay
  useEffect(() => {
    if (!autoMarkRead || !enabled || isLoading || commentIds.length === 0) {
      return;
    }

    // Find unread comments that haven't been marked yet
    const unreadIds = commentIds.filter((id) => {
      const status = readStatusMap.get(id);
      return !status?.is_read && !markedIdsRef.current.has(id);
    });

    if (unreadIds.length === 0) {
      return;
    }

    // Clear any existing timer
    if (autoMarkTimerRef.current) {
      clearTimeout(autoMarkTimerRef.current);
    }

    // Set timer to mark as read
    autoMarkTimerRef.current = setTimeout(() => {
      markAsRead(unreadIds);
    }, autoMarkDelay);

    return () => {
      if (autoMarkTimerRef.current) {
        clearTimeout(autoMarkTimerRef.current);
      }
    };
  }, [autoMarkRead, enabled, isLoading, commentIds, readStatusMap, autoMarkDelay, markAsRead]);

  return {
    readStatusMap,
    unreadCount,
    isLoading,
    markAsRead,
    markAsUnread,
    isRead,
    isMarkingRead: markReadMutation.isPending,
  };
}

/**
 * Hook for tracking task comment reads.
 */
export function useTaskCommentReads(
  commentIds: string[],
  options?: Omit<UseCommentReadsOptions, "commentType" | "commentIds">
) {
  return useCommentReads({
    commentType: "task",
    commentIds,
    ...options,
  });
}

/**
 * Hook for tracking document comment reads.
 */
export function useDocumentCommentReads(
  commentIds: string[],
  options?: Omit<UseCommentReadsOptions, "commentType" | "commentIds">
) {
  return useCommentReads({
    commentType: "document",
    commentIds,
    ...options,
  });
}

/**
 * Hook for tracking review comment reads.
 */
export function useReviewCommentReads(
  commentIds: string[],
  options?: Omit<UseCommentReadsOptions, "commentType" | "commentIds">
) {
  return useCommentReads({
    commentType: "review",
    commentIds,
    ...options,
  });
}

/**
 * Hook for tracking generic comment reads (sharing).
 */
export function useGenericCommentReads(
  commentIds: string[],
  options?: Omit<UseCommentReadsOptions, "commentType" | "commentIds">
) {
  return useCommentReads({
    commentType: "generic",
    commentIds,
    ...options,
  });
}
