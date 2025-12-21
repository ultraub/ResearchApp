import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  ClipboardDocumentCheckIcon,
  FunnelIcon,
  CalendarIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { listReviews, getMyAssignments } from "@/services/reviews";
import type {
  Review,
  ReviewAssignment,
  ReviewStatus,
} from "@/types/review";
import {
  REVIEW_STATUS_LABELS as STATUS_LABELS,
  REVIEW_STATUS_COLORS as STATUS_COLORS,
  REVIEW_PRIORITY_LABELS as PRIORITY_LABELS,
  REVIEW_PRIORITY_COLORS as PRIORITY_COLORS,
} from "@/types/review";
import clsx from "clsx";

type TabType = "all" | "assigned" | "requested";

function ReviewCard({ review, onClick }: { review: Review; onClick: () => void }) {
  const statusLabel = STATUS_LABELS[review.status] || review.status;
  const statusColor = STATUS_COLORS[review.status] || "bg-gray-100 text-gray-800";
  const priorityLabel = PRIORITY_LABELS[review.priority] || review.priority;
  const priorityColor = PRIORITY_COLORS[review.priority] || "bg-gray-100 text-gray-800";

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-white p-5 shadow-card transition-all hover:shadow-card-hover dark:bg-dark-card"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/30">
          <ClipboardDocumentCheckIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="flex gap-2">
          <span className={clsx("rounded-full px-2 py-1 text-xs font-medium", priorityColor)}>
            {priorityLabel}
          </span>
          <span className={clsx("rounded-full px-2 py-1 text-xs font-medium", statusColor)}>
            {statusLabel}
          </span>
        </div>
      </div>
      <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">{review.title}</h3>
      <p className="mb-3 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
        {review.description || "No description"}
      </p>
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        {review.due_date && (
          <span className="flex items-center gap-1">
            <CalendarIcon className="h-3.5 w-3.5" />
            {new Date(review.due_date).toLocaleDateString()}
          </span>
        )}
        <span className="flex items-center gap-1">
          <UserCircleIcon className="h-3.5 w-3.5" />
          {review.assignments?.length || 0} reviewers
        </span>
      </div>
    </div>
  );
}

function AssignmentCard({
  assignment,
  onClick,
}: {
  assignment: ReviewAssignment;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-xl bg-white p-5 shadow-card transition-all hover:shadow-card-hover dark:bg-dark-card"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/30">
          <ClipboardDocumentCheckIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
        </div>
        <span
          className={clsx(
            "rounded-full px-2 py-1 text-xs font-medium",
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
      <h3 className="mb-1 font-semibold text-gray-900 dark:text-white">
        Review Assignment
      </h3>
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        Role: {assignment.role}
      </p>
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        {assignment.due_date && (
          <span className="flex items-center gap-1">
            <CalendarIcon className="h-3.5 w-3.5" />
            {new Date(assignment.due_date).toLocaleDateString()}
          </span>
        )}
        {assignment.recommendation && (
          <span className="text-xs">Recommendation: {assignment.recommendation}</span>
        )}
      </div>
    </div>
  );
}

export default function ReviewsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "">("");
  const activeTab = (searchParams.get("tab") as TabType) || "all";

  const {
    data: reviewsData,
    isLoading: reviewsLoading,
    error: reviewsError,
  } = useQuery({
    queryKey: ["reviews", statusFilter, activeTab],
    queryFn: () =>
      listReviews({
        status: statusFilter || undefined,
        assigned_to_me: activeTab === "assigned",
        requested_by_me: activeTab === "requested",
      }),
  });

  const {
    data: assignments,
    isLoading: assignmentsLoading,
  } = useQuery({
    queryKey: ["my-assignments"],
    queryFn: () => getMyAssignments(),
    enabled: activeTab === "assigned",
  });

  const reviews = reviewsData?.items || [];
  const filteredReviews = reviews.filter(
    (r) =>
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleTabChange = (tab: TabType) => {
    setSearchParams({ tab });
  };

  const handleReviewClick = (review: Review) => {
    navigate(`/reviews/${review.id}`);
  };

  const handleAssignmentClick = (assignment: ReviewAssignment) => {
    navigate(`/reviews/${assignment.review_id}`);
  };

  const tabs = [
    { id: "all" as TabType, label: "All Reviews" },
    { id: "assigned" as TabType, label: "Assigned to Me" },
    { id: "requested" as TabType, label: "Requested by Me" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-base">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reviews</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage document reviews and feedback
            </p>
          </div>
          <button
            onClick={() => navigate("/documents")}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            <PlusIcon className="h-4 w-4" />
            Start New Review
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-dark-border">
          <nav className="-mb-px flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={clsx(
                  "border-b-2 pb-3 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search reviews..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-card dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ReviewStatus | "")}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-dark-border dark:bg-dark-card dark:text-white"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="changes_requested">Changes Requested</option>
              <option value="approved">Approved</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Content */}
        {reviewsLoading || (activeTab === "assigned" && assignmentsLoading) ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
          </div>
        ) : reviewsError ? (
          <div className="rounded-lg bg-red-50 p-4 text-center text-red-600 dark:bg-red-900/20 dark:text-red-400">
            Failed to load reviews. Please try again.
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="rounded-xl bg-white p-12 text-center shadow-card dark:bg-dark-card">
            <ClipboardDocumentCheckIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
              No reviews found
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {activeTab === "assigned"
                ? "You don't have any reviews assigned to you."
                : activeTab === "requested"
                ? "You haven't requested any reviews yet."
                : "No reviews have been created yet."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeTab === "assigned" && assignments
              ? assignments.map((assignment) => (
                  <AssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    onClick={() => handleAssignmentClick(assignment)}
                  />
                ))
              : filteredReviews.map((review) => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    onClick={() => handleReviewClick(review)}
                  />
                ))}
          </div>
        )}

        {/* Pagination info */}
        {reviewsData && reviewsData.total > 0 && (
          <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Showing {filteredReviews.length} of {reviewsData.total} reviews
          </div>
        )}
      </div>
    </div>
  );
}
