/**
 * Comment read tracking API service.
 *
 * Provides unified read tracking across all comment types:
 * - task: TaskComment
 * - document: DocumentComment
 * - review: ReviewComment
 * - generic: Comment (sharing)
 */

import { api } from './api';

// Comment type enum matching backend
export type CommentType = 'task' | 'document' | 'review' | 'generic';

// Request/Response types
export interface MarkReadRequest {
  comment_type: CommentType;
  comment_ids: string[];
}

export interface MarkReadResponse {
  marked_count: number;
  comment_type: string;
}

export interface CommentReadStatus {
  comment_id: string;
  is_read: boolean;
  read_at: string | null;
}

export interface BatchReadStatusRequest {
  comment_type: CommentType;
  comment_ids: string[];
}

export interface UnreadCountResponse {
  resource_type: string;
  resource_id: string;
  unread_count: number;
}

// Comment Reads API
export const commentReadsApi = {
  /**
   * Mark one or more comments as read.
   * Uses upsert to handle both new reads and re-reads.
   */
  async markRead(params: MarkReadRequest): Promise<MarkReadResponse> {
    const response = await api.post<MarkReadResponse>('/comment-reads/mark-read', params);
    return response.data;
  },

  /**
   * Get read status for a batch of comments.
   * Returns read status for each comment ID in the request.
   */
  async getReadStatus(params: BatchReadStatusRequest): Promise<CommentReadStatus[]> {
    const response = await api.post<CommentReadStatus[]>('/comment-reads/read-status', params);
    return response.data;
  },

  /**
   * Get unread comment count for a resource.
   * Note: The frontend typically calculates this from loaded comments + read status.
   */
  async getUnreadCount(
    commentType: CommentType,
    resourceId: string
  ): Promise<UnreadCountResponse> {
    const response = await api.get<UnreadCountResponse>(
      `/comment-reads/unread-count/${commentType}/${resourceId}`
    );
    return response.data;
  },

  /**
   * Mark a comment as unread (remove read record).
   * Useful for "mark as unread" functionality.
   */
  async markUnread(
    commentType: CommentType,
    commentId: string
  ): Promise<{ status: string }> {
    const response = await api.delete<{ status: string }>(
      `/comment-reads/${commentType}/${commentId}`
    );
    return response.data;
  },
};

// Helper functions for common use cases

/**
 * Mark task comments as read.
 */
export async function markTaskCommentsRead(commentIds: string[]): Promise<MarkReadResponse> {
  return commentReadsApi.markRead({
    comment_type: 'task',
    comment_ids: commentIds,
  });
}

/**
 * Mark document comments as read.
 */
export async function markDocumentCommentsRead(commentIds: string[]): Promise<MarkReadResponse> {
  return commentReadsApi.markRead({
    comment_type: 'document',
    comment_ids: commentIds,
  });
}

/**
 * Mark review comments as read.
 */
export async function markReviewCommentsRead(commentIds: string[]): Promise<MarkReadResponse> {
  return commentReadsApi.markRead({
    comment_type: 'review',
    comment_ids: commentIds,
  });
}

/**
 * Mark generic comments as read (sharing/conversation).
 */
export async function markGenericCommentsRead(commentIds: string[]): Promise<MarkReadResponse> {
  return commentReadsApi.markRead({
    comment_type: 'generic',
    comment_ids: commentIds,
  });
}

/**
 * Get read status for task comments.
 */
export async function getTaskCommentsReadStatus(
  commentIds: string[]
): Promise<CommentReadStatus[]> {
  return commentReadsApi.getReadStatus({
    comment_type: 'task',
    comment_ids: commentIds,
  });
}

/**
 * Get read status for document comments.
 */
export async function getDocumentCommentsReadStatus(
  commentIds: string[]
): Promise<CommentReadStatus[]> {
  return commentReadsApi.getReadStatus({
    comment_type: 'document',
    comment_ids: commentIds,
  });
}

// Task unread info for displaying on task cards
export interface TaskUnreadInfo {
  task_id: string;
  total_comments: number;
  unread_count: number;
}

/**
 * Get unread comment counts for all tasks in a project.
 * Returns a map of task_id -> unread info.
 */
export async function getProjectTaskUnreadCounts(
  projectId: string
): Promise<Record<string, TaskUnreadInfo>> {
  const response = await api.get<Record<string, TaskUnreadInfo>>(
    `/comment-reads/tasks/project/${projectId}`
  );
  return response.data;
}

// Document unread info for displaying on document cards
export interface DocumentUnreadInfo {
  document_id: string;
  total_comments: number;
  unread_count: number;
}

/**
 * Get unread comment counts for all documents in a project.
 * Returns a map of document_id -> unread info.
 */
export async function getProjectDocumentUnreadCounts(
  projectId: string
): Promise<Record<string, DocumentUnreadInfo>> {
  const response = await api.get<Record<string, DocumentUnreadInfo>>(
    `/comment-reads/documents/project/${projectId}`
  );
  return response.data;
}
