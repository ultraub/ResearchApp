/**
 * CommentSummaryHoverCard - Hover card wrapper showing comment summary
 *
 * Displays a summary of recent comments when hovering over a comment indicator.
 * Shows the last 3 comments with author, excerpt, and timestamp.
 * Includes unread count badge and "View all" link.
 */

import { Link } from "react-router-dom";
import { clsx } from "clsx";
import {
  ChatBubbleLeftIcon,
  ChevronRightIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import {
  HoverCard,
  HoverCardHeader,
  HoverCardContent,
  HoverCardFooter,
  type HoverCardProps,
} from "@/components/common/HoverCard";

/** Simplified comment data for hover display */
export interface CommentSummaryItem {
  id: string;
  /** Author display name */
  author_name: string | null;
  /** First part of content (will be truncated) */
  content: string;
  /** ISO timestamp */
  created_at: string;
  /** Whether this comment is unread */
  is_unread?: boolean;
  /** Optional: task or document title for context */
  context_title?: string | null;
}

interface CommentSummaryHoverCardProps extends Omit<HoverCardProps, "children"> {
  /** List of recent comments to display (shows last 3) */
  comments: CommentSummaryItem[];
  /** Total count of comments */
  totalCount: number;
  /** Number of unread comments */
  unreadCount?: number;
  /** URL to navigate to when clicking "View all" */
  viewAllUrl?: string;
  /** Label for the view all link */
  viewAllLabel?: string;
  /** Custom header text (default: "Comments (X)" or "Comments (X) • Y unread") */
  headerText?: string;
  /** Whether to show the "View all" footer link */
  showViewAll?: boolean;
  /** Whether to show context titles in the comment list */
  showContextTitles?: boolean;
}

/** Truncate text to a maximum length with ellipsis */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

/** Format relative time (e.g., "2 hours ago") */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function CommentSummaryHoverCard({
  trigger,
  comments,
  totalCount,
  unreadCount = 0,
  viewAllUrl,
  viewAllLabel = "View all comments",
  headerText,
  showViewAll = true,
  showContextTitles = false,
  placement = "bottom",
  maxWidth = 340,
  ...hoverCardProps
}: CommentSummaryHoverCardProps) {
  const displayComments = comments.slice(0, 3);

  // Build default header text
  const defaultHeaderText = unreadCount > 0
    ? `Comments (${totalCount}) • ${unreadCount} unread`
    : `Comments (${totalCount})`;

  // If no comments, show a simple "no comments" message
  if (totalCount === 0) {
    return (
      <HoverCard
        trigger={trigger}
        placement={placement}
        maxWidth={maxWidth}
        {...hoverCardProps}
      >
        <HoverCardContent>
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
            <ChatBubbleLeftIcon className="h-4 w-4" />
            <span>No comments yet</span>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }

  return (
    <HoverCard
      trigger={trigger}
      placement={placement}
      maxWidth={maxWidth}
      {...hoverCardProps}
    >
      <HoverCardHeader className="flex items-center gap-2">
        <ChatBubbleLeftIcon className="h-4 w-4 text-primary-500" />
        <span>{headerText ?? defaultHeaderText}</span>
        {unreadCount > 0 && (
          <span className="ml-auto inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary-500 text-white text-xs font-medium">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </HoverCardHeader>

      <HoverCardContent className="space-y-3 py-2">
        {displayComments.map((comment) => (
          <div
            key={comment.id}
            className={clsx(
              "text-sm",
              comment.is_unread && "bg-primary-50 dark:bg-primary-900/20 -mx-3 px-3 py-1.5 rounded-xl"
            )}
          >
            {/* Context title if provided */}
            {showContextTitles && comment.context_title && (
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate mb-0.5">
                on "{truncate(comment.context_title, 30)}"
              </div>
            )}

            {/* Author and time */}
            <div className="flex items-center gap-1.5 mb-0.5">
              <UserCircleIcon className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {comment.author_name || "Unknown"}
              </span>
              <span className="text-gray-400 dark:text-gray-500">•</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                {formatRelativeTime(comment.created_at)}
              </span>
              {comment.is_unread && (
                <span className="ml-auto flex-shrink-0 w-2 h-2 rounded-full bg-primary-500" />
              )}
            </div>

            {/* Comment content excerpt */}
            <div className="text-gray-600 dark:text-gray-300 line-clamp-2 pl-5.5">
              "{truncate(comment.content, 100)}"
            </div>
          </div>
        ))}

        {totalCount > displayComments.length && (
          <div className="text-xs text-gray-500 dark:text-gray-400 pt-1">
            +{totalCount - displayComments.length} more comments
          </div>
        )}
      </HoverCardContent>

      {showViewAll && viewAllUrl && (
        <HoverCardFooter>
          <Link
            to={viewAllUrl}
            className="flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          >
            {viewAllLabel}
            <ChevronRightIcon className="h-3 w-3" />
          </Link>
        </HoverCardFooter>
      )}
    </HoverCard>
  );
}

/**
 * Helper to convert TaskComment objects to CommentSummaryItem
 */
export function toCommentSummaryItems(
  comments: Array<{
    id: string;
    content: string;
    created_at: string;
    user_name?: string | null;
  }>,
  unreadIds?: Set<string>
): CommentSummaryItem[] {
  return comments.map((c) => ({
    id: c.id,
    author_name: c.user_name ?? null,
    content: c.content,
    created_at: c.created_at,
    is_unread: unreadIds?.has(c.id) ?? false,
  }));
}

export default CommentSummaryHoverCard;
