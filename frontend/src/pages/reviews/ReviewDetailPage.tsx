import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  DocumentTextIcon,
  UserCircleIcon,
  CalendarIcon,
  ChatBubbleLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  getReview,
  getReviewStats,
  listComments,
  addComment,
  updateComment,
  deleteComment,
  updateReview,
} from "@/services/reviews";
import type {
  ReviewComment,
  CreateCommentRequest,
  UpdateReviewRequest,
} from "@/types/review";
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_COLORS,
  REVIEW_PRIORITY_LABELS,
  REVIEW_PRIORITY_COLORS,
  COMMENT_TYPE_LABELS,
  COMMENT_SEVERITY_LABELS,
  COMMENT_SEVERITY_COLORS,
} from "@/types/review";
import clsx from "clsx";

function CommentItem({
  comment,
  onResolve,
  onDelete,
  level = 0,
}: {
  comment: ReviewComment;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
  level?: number;
}) {
  const [showReplies, setShowReplies] = useState(true);

  return (
    <div className={clsx("border-l-2 pl-4", level > 0 ? "ml-6 border-gray-200 dark:border-dark-border" : "border-primary-500")}>
      <div className="rounded-xl bg-white p-4 shadow-soft dark:bg-dark-card">
        <div className="mb-2 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <UserCircleIcon className="h-6 w-6 text-gray-400" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              User
            </span>
            <span className="text-xs text-gray-500">
              {new Date(comment.created_at).toLocaleString()}
            </span>
            {comment.edited_at && (
              <span className="text-xs text-gray-400">(edited)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {comment.severity && (
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  COMMENT_SEVERITY_COLORS[comment.severity]
                )}
              >
                {COMMENT_SEVERITY_LABELS[comment.severity]}
              </span>
            )}
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
              {COMMENT_TYPE_LABELS[comment.comment_type]}
            </span>
          </div>
        </div>

        {comment.selected_text && (
          <div className="mb-2 rounded-lg bg-yellow-50 p-2 text-sm italic text-gray-600 dark:bg-yellow-900/20 dark:text-gray-400">
            "{comment.selected_text}"
          </div>
        )}

        <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">{comment.content}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {comment.is_resolved ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircleIcon className="h-4 w-4" />
                Resolved
              </span>
            ) : (
              <button
                onClick={() => onResolve(comment.id, true)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-green-600"
              >
                <CheckCircleIcon className="h-4 w-4" />
                Mark Resolved
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDelete(comment.id)}
              className="text-xs text-gray-400 hover:text-red-600"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowReplies(!showReplies)}
            className="mb-2 text-xs text-gray-500 hover:text-gray-700"
          >
            {showReplies ? "Hide" : "Show"} {comment.replies.length} replies
          </button>
          {showReplies &&
            comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                onResolve={onResolve}
                onDelete={onDelete}
                level={level + 1}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function AddCommentForm({
  reviewId,
  onSuccess,
}: {
  reviewId: string;
  onSuccess: () => void;
}) {
  const [content, setContent] = useState("");
  const [commentType, setCommentType] = useState<string>("general");
  const [severity, setSeverity] = useState<string>("");
  const queryClient = useQueryClient();

  const addCommentMutation = useMutation({
    mutationFn: (data: CreateCommentRequest) => addComment(reviewId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-comments", reviewId] });
      queryClient.invalidateQueries({ queryKey: ["review-stats", reviewId] });
      setContent("");
      setCommentType("general");
      setSeverity("");
      onSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    addCommentMutation.mutate({
      content: content.trim(),
      comment_type: commentType as CreateCommentRequest["comment_type"],
      severity: severity ? (severity as CreateCommentRequest["severity"]) : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-white p-4 shadow-soft dark:bg-dark-card">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Add a comment..."
        rows={3}
        className="mb-3 w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-elevated dark:text-white"
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={commentType}
            onChange={(e) => setCommentType(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-elevated"
          >
            <option value="general">General</option>
            <option value="suggestion">Suggestion</option>
            <option value="question">Question</option>
            <option value="issue">Issue</option>
          </select>
          {commentType === "issue" && (
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-dark-border dark:bg-dark-elevated"
            >
              <option value="">Severity</option>
              <option value="critical">Critical</option>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
              <option value="suggestion">Suggestion</option>
            </select>
          )}
        </div>
        <button
          type="submit"
          disabled={!content.trim() || addCommentMutation.isPending}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {addCommentMutation.isPending ? "Adding..." : "Add Comment"}
        </button>
      </div>
    </form>
  );
}

export default function ReviewDetailPage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: review,
    isLoading: reviewLoading,
    error: reviewError,
  } = useQuery({
    queryKey: ["review", reviewId],
    queryFn: () => getReview(reviewId!),
    enabled: !!reviewId,
  });

  const { data: stats } = useQuery({
    queryKey: ["review-stats", reviewId],
    queryFn: () => getReviewStats(reviewId!),
    enabled: !!reviewId,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["review-comments", reviewId],
    queryFn: () => listComments(reviewId!),
    enabled: !!reviewId,
  });

  const updateReviewMutation = useMutation({
    mutationFn: (data: UpdateReviewRequest) => updateReview(reviewId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review", reviewId] });
    },
  });

  const resolveCommentMutation = useMutation({
    mutationFn: ({ commentId, resolved }: { commentId: string; resolved: boolean }) =>
      updateComment(reviewId!, commentId, { is_resolved: resolved }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-comments", reviewId] });
      queryClient.invalidateQueries({ queryKey: ["review-stats", reviewId] });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteComment(reviewId!, commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-comments", reviewId] });
      queryClient.invalidateQueries({ queryKey: ["review-stats", reviewId] });
    },
  });

  const handleResolveComment = (commentId: string, resolved: boolean) => {
    resolveCommentMutation.mutate({ commentId, resolved });
  };

  const handleDeleteComment = (commentId: string) => {
    if (confirm("Are you sure you want to delete this comment?")) {
      deleteCommentMutation.mutate(commentId);
    }
  };


  const handleDecision = (decision: string) => {
    updateReviewMutation.mutate({
      decision: decision as UpdateReviewRequest["decision"],
      status: decision === "approved" ? "approved" : "changes_requested",
    });
  };

  if (reviewLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  if (reviewError || !review) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 dark:bg-dark-base">
        <div className="mx-auto max-w-4xl rounded-xl bg-red-50 p-4 text-center text-red-600 dark:bg-red-900/20 dark:text-red-400">
          Failed to load review. Please try again.
        </div>
      </div>
    );
  }

  const statusLabel = REVIEW_STATUS_LABELS[review.status] || review.status;
  const statusColor = REVIEW_STATUS_COLORS[review.status] || "bg-gray-100 text-gray-800";
  const priorityLabel = REVIEW_PRIORITY_LABELS[review.priority] || review.priority;
  const priorityColor = REVIEW_PRIORITY_COLORS[review.priority] || "bg-gray-100 text-gray-800";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-base">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back button */}
        <button
          onClick={() => navigate("/reviews")}
          className="mb-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Reviews
        </button>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Review header */}
            <div className="rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {review.title}
                  </h1>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Document version {review.document_version}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={clsx("rounded-full px-3 py-1 text-sm font-medium", priorityColor)}>
                    {priorityLabel}
                  </span>
                  <span className={clsx("rounded-full px-3 py-1 text-sm font-medium", statusColor)}>
                    {statusLabel}
                  </span>
                </div>
              </div>

              {review.description && (
                <p className="mb-4 text-gray-600 dark:text-gray-400">{review.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                {review.due_date && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="h-4 w-4" />
                    Due: {new Date(review.due_date).toLocaleDateString()}
                  </span>
                )}
                <button
                  onClick={() => navigate(`/documents/${review.document_id}`)}
                  className="flex items-center gap-1 text-primary-600 hover:text-primary-700"
                >
                  <DocumentTextIcon className="h-4 w-4" />
                  View Document
                </button>
              </div>

              {/* Actions */}
              {review.status !== "completed" && review.status !== "cancelled" && (
                <div className="mt-6 flex items-center gap-3 border-t border-gray-200 pt-6 dark:border-dark-border">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Decision:
                  </span>
                  <button
                    onClick={() => handleDecision("approved")}
                    className="flex items-center gap-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                  >
                    <CheckCircleIcon className="h-4 w-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleDecision("needs_revision")}
                    className="flex items-center gap-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                  >
                    <PencilIcon className="h-4 w-4" />
                    Request Changes
                  </button>
                  <button
                    onClick={() => handleDecision("rejected")}
                    className="flex items-center gap-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    <XCircleIcon className="h-4 w-4" />
                    Reject
                  </button>
                </div>
              )}
            </div>

            {/* Comments section */}
            <div className="rounded-xl bg-gray-100 p-6 dark:bg-dark-elevated/50">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                <ChatBubbleLeftIcon className="h-5 w-5" />
                Comments ({comments.length})
              </h2>

              <div className="space-y-4">
                <AddCommentForm reviewId={reviewId!} onSuccess={() => {}} />

                {comments.length === 0 ? (
                  <div className="rounded-xl bg-white p-8 text-center dark:bg-dark-card">
                    <ChatBubbleLeftIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      No comments yet. Be the first to add feedback.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <CommentItem
                        key={comment.id}
                        comment={comment}
                        onResolve={handleResolveComment}
                        onDelete={handleDeleteComment}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Stats */}
            {stats && (
              <div className="rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
                <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Statistics</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Total Comments</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {stats.total_comments}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Resolved</span>
                    <span className="font-medium text-green-600">{stats.resolved_comments}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Unresolved</span>
                    <span className="font-medium text-orange-600">{stats.unresolved_comments}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-3 dark:border-dark-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Completion</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {stats.completion_percentage.toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-gray-200 dark:bg-dark-elevated">
                      <div
                        className="h-2 rounded-full bg-primary-600"
                        style={{ width: `${stats.completion_percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Reviewers */}
            <div className="rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
              <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">
                Reviewers ({review.assignments?.length || 0})
              </h3>
              {review.assignments && review.assignments.length > 0 ? (
                <div className="space-y-3">
                  {review.assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-dark-elevated/50"
                    >
                      <div className="flex items-center gap-2">
                        <UserCircleIcon className="h-8 w-8 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            Reviewer
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {assignment.role}
                          </p>
                        </div>
                      </div>
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          assignment.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : assignment.status === "in_progress"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-yellow-100 text-yellow-800"
                        )}
                      >
                        {assignment.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No reviewers assigned</p>
              )}
            </div>

            {/* Tags */}
            {review.tags && review.tags.length > 0 && (
              <div className="rounded-xl bg-white p-6 shadow-card dark:bg-dark-card">
                <h3 className="mb-4 font-semibold text-gray-900 dark:text-white">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {review.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 dark:bg-dark-elevated dark:text-gray-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
