/**
 * Review workflow service.
 */

import { api } from './api';
import type {
  Review,
  ReviewListResponse,
  ReviewStats,
  ReviewAssignment,
  ReviewComment,
  CreateReviewRequest,
  UpdateReviewRequest,
  CreateAssignmentRequest,
  UpdateAssignmentRequest,
  CreateCommentRequest,
  UpdateCommentRequest,
  ReviewFilters,
} from '../types/review';

// =============================================================================
// Review CRUD
// =============================================================================

export async function createReview(data: CreateReviewRequest): Promise<Review> {
  const response = await api.post<Review>('/reviews/', data);
  return response.data;
}

export async function listReviews(filters?: ReviewFilters): Promise<ReviewListResponse> {
  const response = await api.get<ReviewListResponse>('/reviews/', {
    params: filters as Record<string, unknown>,
  });
  return response.data;
}

export async function getReview(reviewId: string): Promise<Review> {
  const response = await api.get<Review>(`/reviews/${reviewId}`);
  return response.data;
}

export async function updateReview(reviewId: string, data: UpdateReviewRequest): Promise<Review> {
  const response = await api.patch<Review>(`/reviews/${reviewId}`, data);
  return response.data;
}

export async function deleteReview(reviewId: string): Promise<void> {
  await api.delete(`/reviews/${reviewId}`);
}

export async function getReviewStats(reviewId: string): Promise<ReviewStats> {
  const response = await api.get<ReviewStats>(`/reviews/${reviewId}/stats`);
  return response.data;
}

// =============================================================================
// Assignment Operations
// =============================================================================

export async function addReviewer(
  reviewId: string,
  data: CreateAssignmentRequest
): Promise<ReviewAssignment> {
  const response = await api.post<ReviewAssignment>(
    `/reviews/${reviewId}/assignments`,
    data
  );
  return response.data;
}

export async function updateAssignment(
  reviewId: string,
  assignmentId: string,
  data: UpdateAssignmentRequest
): Promise<ReviewAssignment> {
  const response = await api.patch<ReviewAssignment>(
    `/reviews/${reviewId}/assignments/${assignmentId}`,
    data
  );
  return response.data;
}

export async function removeReviewer(reviewId: string, assignmentId: string): Promise<void> {
  await api.delete(`/reviews/${reviewId}/assignments/${assignmentId}`);
}

// =============================================================================
// Comment Operations
// =============================================================================

export async function listComments(
  reviewId: string,
  options?: { include_resolved?: boolean; comment_type?: string }
): Promise<ReviewComment[]> {
  const response = await api.get<ReviewComment[]>(`/reviews/${reviewId}/comments`, {
    params: options as Record<string, unknown>,
  });
  return response.data || [];
}

export async function addComment(
  reviewId: string,
  data: CreateCommentRequest
): Promise<ReviewComment> {
  const response = await api.post<ReviewComment>(`/reviews/${reviewId}/comments`, data);
  return response.data;
}

export async function updateComment(
  reviewId: string,
  commentId: string,
  data: UpdateCommentRequest
): Promise<ReviewComment> {
  const response = await api.patch<ReviewComment>(
    `/reviews/${reviewId}/comments/${commentId}`,
    data
  );
  return response.data;
}

export async function deleteComment(reviewId: string, commentId: string): Promise<void> {
  await api.delete(`/reviews/${reviewId}/comments/${commentId}`);
}

// =============================================================================
// User Assignments
// =============================================================================

export async function getMyAssignments(options?: {
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<ReviewAssignment[]> {
  const response = await api.get<ReviewAssignment[]>('/reviews/my/assignments', {
    params: options as Record<string, unknown>,
  });
  return response.data || [];
}

// =============================================================================
// Export all functions as a service object
// =============================================================================

export const reviewService = {
  // Reviews
  createReview,
  listReviews,
  getReview,
  updateReview,
  deleteReview,
  getReviewStats,
  // Assignments
  addReviewer,
  updateAssignment,
  removeReviewer,
  // Comments
  listComments,
  addComment,
  updateComment,
  deleteComment,
  // User assignments
  getMyAssignments,
};
