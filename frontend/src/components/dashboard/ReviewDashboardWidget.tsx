/**
 * Review Dashboard Widget - Shows pending reviews and AI suggestions.
 */

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  ClipboardDocumentCheckIcon,
  SparklesIcon,
  ClockIcon,
  ExclamationCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { reviewService } from '@/services/reviews';
import { REVIEW_PRIORITY_COLORS, REVIEW_STATUS_LABELS } from '@/types/review';
import { clsx } from 'clsx';

interface ReviewDashboardWidgetProps {
  className?: string;
}

export function ReviewDashboardWidget({ className }: ReviewDashboardWidgetProps) {
  // Fetch user's pending review assignments
  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['my-assignments', 'pending'],
    queryFn: () => reviewService.getMyAssignments({ status: 'pending' }),
    staleTime: 30000,
  });

  // Fetch reviews assigned to me to get AI suggestion counts
  const { data: reviewsData, isLoading: reviewsLoading } = useQuery({
    queryKey: ['reviews', 'assigned_to_me'],
    queryFn: () => reviewService.listReviews({ assigned_to_me: true, status: 'pending' }),
    staleTime: 30000,
  });

  const isLoading = assignmentsLoading || reviewsLoading;
  const pendingCount = assignments?.length || 0;
  const reviews = reviewsData?.items || [];

  // Calculate AI suggestions count (would need a separate endpoint for accurate count)
  // For now, we show pending reviews count
  const hasItems = pendingCount > 0;

  if (isLoading) {
    return (
      <div className={clsx('rounded-xl bg-white p-6 shadow-soft dark:bg-dark-card', className)}>
        <div className="animate-pulse">
          <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
          <div className="space-y-3">
            <div className="h-12 bg-gray-100 dark:bg-gray-700 rounded" />
            <div className="h-12 bg-gray-100 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('rounded-xl bg-white p-6 shadow-soft dark:bg-dark-card', className)}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardDocumentCheckIcon className="h-5 w-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Reviews
          </h2>
        </div>
        {hasItems && (
          <Link
            to="/reviews"
            className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
          >
            View all
            <ArrowRightIcon className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Stats row */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-primary-50 p-3 dark:bg-primary-900/20">
          <div className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
            <span className="text-xs text-primary-600 dark:text-primary-400">Pending</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-primary-700 dark:text-primary-300">
            {pendingCount}
          </p>
        </div>
        <div className="rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span className="text-xs text-purple-600 dark:text-purple-400">AI Suggestions</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-purple-700 dark:text-purple-300">
            {reviews.length > 0 ? '~' : '0'}
          </p>
        </div>
      </div>

      {/* Pending reviews list */}
      {hasItems ? (
        <div className="space-y-2">
          {reviews.slice(0, 4).map((review) => (
            <Link
              key={review.id}
              to={`/reviews/${review.id}`}
              className="block rounded-lg border border-gray-100 p-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {review.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className={clsx('px-1.5 py-0.5 rounded', REVIEW_PRIORITY_COLORS[review.priority])}>
                      {review.priority}
                    </span>
                    <span>{REVIEW_STATUS_LABELS[review.status]}</span>
                    {review.due_date && (
                      <span className="flex items-center gap-1">
                        <ClockIcon className="h-3 w-3" />
                        {formatDistanceToNow(new Date(review.due_date), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
                {review.priority === 'urgent' && (
                  <ExclamationCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
                )}
              </div>
            </Link>
          ))}
          {reviews.length > 4 && (
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 pt-2">
              +{reviews.length - 4} more reviews
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
            <ClipboardDocumentCheckIcon className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            No pending reviews
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            You're all caught up!
          </p>
        </div>
      )}
    </div>
  );
}

export default ReviewDashboardWidget;
