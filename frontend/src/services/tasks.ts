import { apiClient, fetchPaginated, fetchOne, createOne, updateOne, deleteOne } from "@/lib/api-client";
import type {
  Task,
  TasksByStatus,
  TaskComment,
  TaskAssignment,
  TaskAssignmentCreate,
  TaskAssignmentUpdate,
  TaskDocument,
  TaskDocumentCreate,
  TaskDocumentUpdate,
  TaskReviewStatus,
  TaskWorkflowState,
  WorkItemsResponse,
  SubmitForReviewRequest,
  SubmitForReviewResponse,
  ReactionSummary,
  CommentReaction,
  IdeaVote,
  IdeaScoreUpdate,
  ConvertToTaskRequest,
  ConvertToProjectRequest,
} from "@/types";

export interface TaskCreateData {
  title: string;
  description?: string;
  project_id: string;
  status?: "idea" | "todo" | "in_progress" | "in_review" | "done";
  priority?: "low" | "medium" | "high" | "urgent";
  task_type?: string;
  assignee_id?: string;
  due_date?: string;
  parent_task_id?: string;
  tags?: string[];
  estimated_hours?: number;
  // Idea-specific fields (when status="idea")
  impact_score?: number;
  effort_score?: number;
}

export interface TaskUpdateData {
  title?: string;
  description?: string;
  status?: "idea" | "todo" | "in_progress" | "in_review" | "done";
  priority?: "low" | "medium" | "high" | "urgent";
  task_type?: string;
  assignee_id?: string;
  due_date?: string;
  tags?: string[];
  estimated_hours?: number;
  actual_hours?: number;
  // Idea-specific fields (when status="idea")
  impact_score?: number;
  effort_score?: number;
}

export interface TaskListParams {
  project_id: string;
  page?: number;
  page_size?: number;
  status?: string;
  priority?: string;
  assignee_id?: string;
  search?: string;
  include_completed?: boolean;
}

export interface TaskCommentCreateData {
  content: string;
  parent_comment_id?: string;
}

/** Simplified blocker data for task hover display */
export interface TaskBlockerSummary {
  id: string;
  title: string;
  impact_level: "low" | "medium" | "high" | "critical";
  status: string;
  due_date: string | null;
}

/** Simplified comment data for task hover display */
export interface TaskCommentSummary {
  id: string;
  author_name: string | null;
  content: string;
  created_at: string;
  is_read: boolean;
}

/** Detailed data for task hover card */
export interface TaskAttentionDetails {
  task_id: string;
  task_title: string;
  blockers: TaskBlockerSummary[];
  recent_comments: TaskCommentSummary[];
  total_comments: number;
  unread_comments: number;
}

export const tasksService = {
  list: async (params: TaskListParams) => {
    return fetchPaginated<Task>("/tasks", params);
  },

  getByStatus: async (projectId: string) => {
    const response = await apiClient.get<TasksByStatus>("/tasks/by-status", {
      params: { project_id: projectId },
    });
    return response.data;
  },

  getByStatusAggregated: async (projectId: string, includeChildren: boolean = false) => {
    const response = await apiClient.get<TasksByStatus>("/tasks/by-status-aggregated", {
      params: { project_id: projectId, include_children: includeChildren },
    });
    return response.data;
  },

  get: async (id: string) => {
    return fetchOne<Task>(`/tasks/${id}`);
  },

  create: async (data: TaskCreateData) => {
    return createOne<Task>("/tasks", data);
  },

  update: async (id: string, data: TaskUpdateData) => {
    return updateOne<Task>(`/tasks/${id}`, data);
  },

  delete: async (id: string) => {
    return deleteOne(`/tasks/${id}`);
  },

  move: async (id: string, newStatus: string, newPosition: number) => {
    const response = await apiClient.post<Task>(`/tasks/${id}/move`, null, {
      params: { new_status: newStatus, new_position: newPosition },
    });
    return response.data;
  },

  // Comments
  getComments: async (taskId: string) => {
    const response = await apiClient.get<TaskComment[]>(`/tasks/${taskId}/comments`);
    return response.data;
  },

  addComment: async (taskId: string, data: TaskCommentCreateData) => {
    const response = await apiClient.post<TaskComment>(`/tasks/${taskId}/comments`, data);
    return response.data;
  },

  updateComment: async (taskId: string, commentId: string, content: string) => {
    const response = await apiClient.patch<TaskComment>(
      `/tasks/${taskId}/comments/${commentId}`,
      { content }
    );
    return response.data;
  },

  deleteComment: async (taskId: string, commentId: string) => {
    await apiClient.delete(`/tasks/${taskId}/comments/${commentId}`);
  },

  // Comment Reactions
  getReactions: async (taskId: string, commentId: string) => {
    const response = await apiClient.get<ReactionSummary[]>(
      `/tasks/${taskId}/comments/${commentId}/reactions`
    );
    return response.data;
  },

  addReaction: async (taskId: string, commentId: string, emoji: string) => {
    const response = await apiClient.post<CommentReaction>(
      `/tasks/${taskId}/comments/${commentId}/reactions`,
      { emoji }
    );
    return response.data;
  },

  removeReaction: async (taskId: string, commentId: string, emoji: string) => {
    await apiClient.delete(`/tasks/${taskId}/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`);
  },

  // Assignments
  getAssignments: async (taskId: string) => {
    const response = await apiClient.get<TaskAssignment[]>(`/tasks/${taskId}/assignments`);
    return response.data;
  },

  assignUsers: async (taskId: string, data: TaskAssignmentCreate) => {
    const response = await apiClient.post<TaskAssignment[]>(`/tasks/${taskId}/assignments`, data);
    return response.data;
  },

  updateAssignment: async (taskId: string, assignmentId: string, data: TaskAssignmentUpdate) => {
    const response = await apiClient.patch<TaskAssignment>(
      `/tasks/${taskId}/assignments/${assignmentId}`,
      data
    );
    return response.data;
  },

  removeAssignment: async (taskId: string, assignmentId: string) => {
    await apiClient.delete(`/tasks/${taskId}/assignments/${assignmentId}`);
  },

  getMyAssignments: async (status?: string) => {
    const params = status ? { status } : {};
    const response = await apiClient.get<TaskAssignment[]>("/tasks/my/assignments", { params });
    return response.data;
  },

  // Task-Document Links
  getDocuments: async (taskId: string, linkType?: string) => {
    const params = linkType ? { link_type: linkType } : {};
    const response = await apiClient.get<TaskDocument[]>(`/tasks/${taskId}/documents`, { params });
    return response.data;
  },

  linkDocuments: async (taskId: string, data: TaskDocumentCreate) => {
    const response = await apiClient.post<TaskDocument[]>(`/tasks/${taskId}/documents`, data);
    return response.data;
  },

  updateDocumentLink: async (taskId: string, linkId: string, data: TaskDocumentUpdate) => {
    const response = await apiClient.patch<TaskDocument>(
      `/tasks/${taskId}/documents/${linkId}`,
      data
    );
    return response.data;
  },

  unlinkDocument: async (taskId: string, linkId: string) => {
    await apiClient.delete(`/tasks/${taskId}/documents/${linkId}`);
  },

  // ==========================================================================
  // Workflow Integration (Task-Review)
  // ==========================================================================

  /**
   * Submit a task for review by creating reviews for linked documents.
   * This creates Review records for all documents linked to the task that require review,
   * and optionally transitions the task to 'in_review' status.
   */
  submitForReview: async (taskId: string, data: SubmitForReviewRequest = {}) => {
    const response = await apiClient.post<SubmitForReviewResponse[]>(
      `/tasks/${taskId}/submit-for-review`,
      data
    );
    return response.data;
  },

  /**
   * Get the aggregate review status for a task.
   * Returns counts of pending/approved/rejected reviews and overall status.
   */
  getReviewStatus: async (taskId: string) => {
    const response = await apiClient.get<TaskReviewStatus>(`/tasks/${taskId}/review-status`);
    return response.data;
  },

  /**
   * Get the complete workflow state for a task.
   * Returns comprehensive information about the task's position in the workflow,
   * including review status, linked documents, and whether it can be submitted for review.
   */
  getWorkflowState: async (taskId: string) => {
    const response = await apiClient.get<TaskWorkflowState>(`/tasks/${taskId}/workflow-state`);
    return response.data;
  },

  /**
   * Get a unified view of the current user's work items (tasks + reviews).
   * Returns tasks assigned to the user and reviews they need to complete,
   * sorted by priority and due date.
   */
  getMyWorkItems: async (params?: {
    include_tasks?: boolean;
    include_reviews?: boolean;
    status_filter?: 'active' | 'completed' | 'all';
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get<WorkItemsResponse>("/tasks/my/work-items", {
      params,
    });
    return response.data;
  },

  // ==========================================================================
  // Idea Voting & Conversion
  // ==========================================================================

  /**
   * Vote for an idea (toggle). If user hasn't voted, adds vote.
   * If user has already voted, this is idempotent (returns existing vote).
   */
  vote: async (taskId: string) => {
    const response = await apiClient.post<IdeaVote>(`/tasks/${taskId}/vote`);
    return response.data;
  },

  /**
   * Remove the current user's vote from an idea.
   */
  removeVote: async (taskId: string) => {
    await apiClient.delete(`/tasks/${taskId}/vote`);
  },

  /**
   * Get all votes for an idea.
   */
  getVotes: async (taskId: string) => {
    const response = await apiClient.get<IdeaVote[]>(`/tasks/${taskId}/votes`);
    return response.data;
  },

  /**
   * Update the impact/effort scores for an idea.
   */
  setScore: async (taskId: string, data: IdeaScoreUpdate) => {
    const response = await apiClient.patch<Task>(`/tasks/${taskId}/score`, data);
    return response.data;
  },

  /**
   * Convert an idea to a regular task.
   * Changes status from 'idea' to the specified status (default: 'todo').
   */
  convertToTask: async (taskId: string, data: ConvertToTaskRequest) => {
    const response = await apiClient.post<Task>(`/tasks/${taskId}/convert-to-task`, data);
    return response.data;
  },

  /**
   * Convert an idea to a new subproject.
   * Creates a new project based on the idea and optionally archives the original idea.
   */
  convertToProject: async (taskId: string, data: ConvertToProjectRequest) => {
    const response = await apiClient.post<{ project_id: string; project_name: string }>(
      `/tasks/${taskId}/convert-to-project`,
      data
    );
    return response.data;
  },

  // ==========================================================================
  // Attention Details (for hover cards)
  // ==========================================================================

  /**
   * Get attention-related details for a task (blockers and comments).
   * Used for hover card display with summaries of blockers and recent comments.
   */
  getAttentionDetails: async (taskId: string) => {
    const response = await apiClient.get<TaskAttentionDetails>(
      `/tasks/${taskId}/attention-details`
    );
    return response.data;
  },
};
