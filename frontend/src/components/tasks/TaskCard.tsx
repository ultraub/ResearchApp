import { useMemo, useState } from "react";
import { format, isPast, isToday, formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  CalendarIcon,
  ChatBubbleLeftIcon,
  UserCircleIcon,
  ExclamationTriangleIcon,
  HandThumbUpIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { HandThumbUpIcon as HandThumbUpSolidIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import type { Task } from "@/types";
import AssigneeAvatarGroup from "./AssigneeAvatarGroup";
import { ReviewStatusBadge, type ReviewStatusSummary } from "@/components/common/ReviewStatusBadge";
import OwnerDisplay from "@/components/common/OwnerDisplay";
import { HoverCard, HoverCardHeader, HoverCardContent, HoverCardFooter } from "@/components/common/HoverCard";
import { tasksService } from "@/services/tasks";

/** Information about blockers affecting this task */
export interface TaskBlockerInfo {
  isBlocked: boolean;
  /** Highest impact level among all blockers */
  maxImpact: "low" | "medium" | "high" | "critical" | null;
  /** Number of active blockers */
  blockerCount: number;
}

/** Unread comment info for a task */
export interface TaskUnreadInfo {
  totalComments: number;
  unreadCount: number;
}

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  isDragging?: boolean;
  /** Optional review status for displaying review badge */
  reviewStatus?: ReviewStatusSummary;
  /** Optional blocker information for displaying blocked indicator */
  blockerInfo?: TaskBlockerInfo;
  /** Optional unread comment information */
  unreadInfo?: TaskUnreadInfo;
  /** Callback for when vote button is clicked on an idea */
  onVote?: (taskId: string) => void;
}

const priorityColors = {
  low: "border-l-gray-300",
  medium: "border-l-primary-400",
  high: "border-l-accent-400",
  urgent: "border-l-red-500",
};

const priorityLabels = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const taskTypeIcons: Record<string, string> = {
  general: "📋",
  paper_review: "📄",
  data_analysis: "📊",
  writing: "✍️",
  meeting: "📅",
};

// Impact level colors for blocker indicators
const IMPACT_DOT_COLORS = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-blue-500",
  low: "bg-gray-400",
} as const;

const IMPACT_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

/** Blocker indicator with hover card */
function BlockerHoverIndicator({
  task,
  blockerInfo,
}: {
  task: Task;
  blockerInfo: TaskBlockerInfo;
}) {
  const [shouldFetch, setShouldFetch] = useState(false);
  const { data: details } = useQuery({
    queryKey: ["task-attention", task.id],
    queryFn: () => tasksService.getAttentionDetails(task.id),
    enabled: shouldFetch,
  });

  const trigger = (
    <div
      className={clsx(
        "flex h-7 w-7 items-center justify-center rounded-full shadow-sm cursor-default ring-2 ring-white dark:ring-dark-card",
        blockerInfo.maxImpact === "critical" || blockerInfo.maxImpact === "high"
          ? "bg-red-500 text-white"
          : "bg-yellow-400 text-yellow-900"
      )}
      title={`Blocked by ${blockerInfo.blockerCount} blocker${blockerInfo.blockerCount > 1 ? "s" : ""}`}
    >
      <ExclamationTriangleIcon className="h-4 w-4" />
    </div>
  );

  return (
    <HoverCard
      trigger={trigger}
      placement="bottom"
      maxWidth={320}
      triggerClassName="inline-flex"
    >
      <div onMouseEnter={() => setShouldFetch(true)}>
        <HoverCardHeader className="flex items-center gap-2">
          <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
          <span>Blockers ({blockerInfo.blockerCount})</span>
        </HoverCardHeader>

        <HoverCardContent className="space-y-2 py-2">
          {details?.blockers && details.blockers.length > 0 ? (
            details.blockers.map((blocker) => (
              <div key={blocker.id} className="flex items-start gap-2 text-sm">
                <span
                  className={clsx(
                    "flex-shrink-0 w-2 h-2 rounded-full mt-1.5",
                    IMPACT_DOT_COLORS[blocker.impact_level] || "bg-gray-400"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {blocker.title}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className={clsx(
                      blocker.impact_level === "critical" && "text-red-600 dark:text-red-400",
                      blocker.impact_level === "high" && "text-orange-600 dark:text-orange-400"
                    )}>
                      {IMPACT_LABELS[blocker.impact_level] || blocker.impact_level}
                    </span>
                    <span>•</span>
                    <span className="capitalize">{blocker.status.replace("_", " ")}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
          )}
        </HoverCardContent>

        <HoverCardFooter>
          <Link
            to={`/projects/${task.project_id}/tasks/${task.id}`}
            className="flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            View task details
            <ArrowRightIcon className="h-3 w-3" />
          </Link>
        </HoverCardFooter>
      </div>
    </HoverCard>
  );
}

/** Comment indicator with hover card */
function CommentHoverIndicator({
  taskId,
  totalComments,
  unreadCount,
}: {
  taskId: string;
  totalComments: number;
  unreadCount: number;
}) {
  const [shouldFetch, setShouldFetch] = useState(false);
  const { data: details } = useQuery({
    queryKey: ["task-attention", taskId],
    queryFn: () => tasksService.getAttentionDetails(taskId),
    enabled: shouldFetch,
  });

  const hasUnread = unreadCount > 0;

  const trigger = (
    <span className={clsx(
      "flex items-center gap-1 relative cursor-default",
      hasUnread ? "text-primary-600 dark:text-primary-400" : "text-gray-500 dark:text-gray-400"
    )}>
      <span className="relative">
        <ChatBubbleLeftIcon className="h-4 w-4" />
        {hasUnread && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary-500 text-[9px] font-bold text-white ring-2 ring-white dark:ring-dark-card">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </span>
      {totalComments}
    </span>
  );

  return (
    <HoverCard
      trigger={trigger}
      placement="bottom"
      maxWidth={320}
      triggerClassName="inline-flex"
    >
      <div onMouseEnter={() => setShouldFetch(true)}>
        <HoverCardHeader className="flex items-center gap-2">
          <ChatBubbleLeftIcon className="h-4 w-4 text-primary-500" />
          <span>
            Comments ({totalComments})
            {hasUnread && <span className="text-primary-600 dark:text-primary-400"> • {unreadCount} unread</span>}
          </span>
        </HoverCardHeader>

        <HoverCardContent className="space-y-3 py-2">
          {details?.recent_comments && details.recent_comments.length > 0 ? (
            details.recent_comments.slice(0, 3).map((comment) => (
              <div key={comment.id} className="text-sm">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {!comment.is_read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                  )}
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {comment.author_name || "Unknown"}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500">•</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="text-gray-600 dark:text-gray-300 line-clamp-2 pl-3">
                  "{comment.content.slice(0, 100)}{comment.content.length > 100 ? "..." : ""}"
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
          )}
        </HoverCardContent>

        <HoverCardFooter>
          <div className="flex items-center gap-1 text-primary-600 dark:text-primary-400 text-xs">
            View task for all comments
            <ArrowRightIcon className="h-3 w-3" />
          </div>
        </HoverCardFooter>
      </div>
    </HoverCard>
  );
}

// Extract plain text from TipTap JSON content or return string as-is
function getDescriptionText(description: string | Record<string, unknown> | null): string | null {
  if (!description) return null;
  if (typeof description === "string") return description;

  // TipTap JSON format - extract text recursively
  const extractText = (node: Record<string, unknown>): string => {
    if (node.text && typeof node.text === "string") {
      return node.text;
    }
    if (Array.isArray(node.content)) {
      return node.content.map((child) => extractText(child as Record<string, unknown>)).join(" ");
    }
    return "";
  };

  return extractText(description).trim() || null;
}

export default function TaskCard({ task, onClick, isDragging, reviewStatus, blockerInfo, unreadInfo, onVote }: TaskCardProps) {
  const isIdea = task.status === "idea";

  const handleVoteClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    onVote?.(task.id);
  };
  const descriptionText = useMemo(() => getDescriptionText(task.description), [task.description]);

  const isOverdue = useMemo(() => {
    if (!task.due_date || task.status === "done") return false;
    return isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date));
  }, [task.due_date, task.status]);

  const isDueToday = useMemo(() => {
    if (!task.due_date) return false;
    return isToday(new Date(task.due_date));
  }, [task.due_date]);

  return (
    <div
      onClick={onClick}
      className={clsx(
        "card card-interactive relative border-l-4 p-4 transition-all duration-200",
        "hover:scale-[1.01] hover:shadow-elevated",
        isIdea ? "border-l-amber-400" : priorityColors[task.priority],
        isDragging && "rotate-2 scale-105 shadow-elevated"
      )}
    >
      {/* Blocked indicator - top right corner with hover card */}
      {blockerInfo?.isBlocked && (
        <div className="absolute -right-1 -top-1">
          <BlockerHoverIndicator task={task} blockerInfo={blockerInfo} />
        </div>
      )}

      {/* Task type indicator and project badge */}
      <div className="mb-2.5 flex items-center gap-2 flex-wrap">
        <span className={clsx(
          "emoji-icon text-sm",
          isIdea && "emoji-icon-accent"
        )}>
          {isIdea ? "💡" : taskTypeIcons[task.task_type] || "📋"}
        </span>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          {isIdea ? "Idea" : task.task_type.replace("_", " ")}
        </span>
        {task.project_name && (
          <span className="rounded-full bg-gradient-to-r from-primary-100 to-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 ring-1 ring-primary-200/50 dark:from-primary-900/30 dark:to-primary-900/10 dark:text-primary-400 dark:ring-primary-700/30">
            {task.project_name}
          </span>
        )}
        {/* In Review status indicator */}
        {task.status === "in_review" && (
          <span className="rounded-full bg-gradient-to-r from-info-100 to-info-50 px-2.5 py-0.5 text-xs font-medium text-info-700 ring-1 ring-info-200/50 dark:from-info-900/30 dark:to-info-900/10 dark:text-info-400 dark:ring-info-700/30">
            In Review
          </span>
        )}
        {/* Impact/Effort badge for ideas */}
        {isIdea && task.impact_score && task.effort_score && (
          <span className="rounded-full bg-gradient-to-r from-amber-100 to-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200/50 dark:from-amber-900/30 dark:to-amber-900/10 dark:text-amber-400 dark:ring-amber-700/30">
            I:{task.impact_score} E:{task.effort_score}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="font-semibold text-gray-900 dark:text-white line-clamp-2">
        {task.title}
      </h4>

      {/* Description preview */}
      {descriptionText && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
          {descriptionText}
        </p>
      )}

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:bg-dark-elevated dark:text-gray-400 dark:hover:bg-dark-border"
            >
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">+{task.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          {/* Vote button for ideas */}
          {isIdea && (
            <button
              onClick={handleVoteClick}
              className={clsx(
                "flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-card",
                task.user_voted
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-gray-100 text-gray-500 hover:bg-amber-100 hover:text-amber-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-amber-900/30 dark:hover:text-amber-400"
              )}
            >
              {task.user_voted ? (
                <HandThumbUpSolidIcon className="h-4 w-4" />
              ) : (
                <HandThumbUpIcon className="h-4 w-4" />
              )}
              <span className="font-medium">{task.vote_count || 0}</span>
            </button>
          )}

          {/* Due date */}
          {task.due_date && (
            <span
              className={clsx(
                "flex items-center gap-1",
                isOverdue
                  ? "text-red-500"
                  : isDueToday
                  ? "text-orange-500"
                  : "text-gray-500 dark:text-gray-400"
              )}
            >
              <CalendarIcon className="h-4 w-4" />
              {isOverdue
                ? "Overdue"
                : isDueToday
                ? "Today"
                : format(new Date(task.due_date), "MMM d")}
            </span>
          )}

          {/* Comments count with unread indicator - hover card with recent comments */}
          {(task.comment_count && task.comment_count > 0) || (unreadInfo && unreadInfo.totalComments > 0) ? (
            <CommentHoverIndicator
              taskId={task.id}
              totalComments={unreadInfo?.totalComments ?? task.comment_count ?? 0}
              unreadCount={unreadInfo?.unreadCount ?? 0}
            />
          ) : null}

          {/* Review status badge */}
          {reviewStatus && reviewStatus.status !== "none" && (
            <ReviewStatusBadge summary={reviewStatus} size="sm" />
          )}

          {/* Creator */}
          {task.created_by_name && (
            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500">
              <span className="text-[10px]">by</span>
              <OwnerDisplay
                name={task.created_by_name}
                email={task.created_by_email}
                id={task.created_by_id}
                size="xs"
              />
            </span>
          )}
        </div>

        {/* Assignees */}
        {task.assignments && task.assignments.length > 0 ? (
          <AssigneeAvatarGroup assignments={task.assignments} size="sm" maxDisplay={3} />
        ) : task.assignee_id ? (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
            A
          </div>
        ) : (
          <UserCircleIcon className="h-6 w-6 text-gray-300 dark:text-gray-600" />
        )}
      </div>

      {/* Priority indicator for high/urgent */}
      {(task.priority === "high" || task.priority === "urgent") && (
        <div
          className={clsx(
            "mt-2 rounded px-2 py-0.5 text-xs font-medium ring-1",
            task.priority === "urgent"
              ? "bg-red-100 text-red-700 ring-red-200 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-800"
              : "bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:ring-orange-800"
          )}
        >
          {priorityLabels[task.priority]}
        </div>
      )}
    </div>
  );
}
