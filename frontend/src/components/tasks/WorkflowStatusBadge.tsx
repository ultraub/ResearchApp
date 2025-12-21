/**
 * WorkflowStatusBadge - Displays the workflow stage for a task
 * Shows the current position in the task-review workflow with color coding.
 */

import { clsx } from "clsx";
import type { WorkflowStage, OverallReviewStatus } from "@/types";
import {
  WORKFLOW_STAGE_LABELS,
  WORKFLOW_STAGE_COLORS,
  OVERALL_REVIEW_STATUS_LABELS,
  OVERALL_REVIEW_STATUS_COLORS,
} from "@/types";
import {
  ClockIcon,
  PlayIcon,
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  MinusCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";

interface WorkflowStatusBadgeProps {
  stage: WorkflowStage;
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
}

const STAGE_ICONS: Record<WorkflowStage, React.ComponentType<{ className?: string }>> = {
  not_started: MinusCircleIcon,
  in_progress: PlayIcon,
  under_review: EyeIcon,
  review_approved: CheckCircleIcon,
  review_rejected: XCircleIcon,
  completed: CheckCircleIcon,
  unknown: ExclamationCircleIcon,
};

export function WorkflowStatusBadge({
  stage,
  className,
  showIcon = true,
  size = "md",
}: WorkflowStatusBadgeProps) {
  const Icon = STAGE_ICONS[stage];
  const label = WORKFLOW_STAGE_LABELS[stage];
  const colorClass = WORKFLOW_STAGE_COLORS[stage];

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  const iconSizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-medium",
        colorClass,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && <Icon className={iconSizeClasses[size]} />}
      {label}
    </span>
  );
}

interface ReviewStatusBadgeProps {
  status: OverallReviewStatus;
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
}

const REVIEW_STATUS_ICONS: Record<OverallReviewStatus, React.ComponentType<{ className?: string }>> = {
  none: MinusCircleIcon,
  pending: ClockIcon,
  approved: CheckCircleIcon,
  rejected: XCircleIcon,
  mixed: ExclamationCircleIcon,
};

export function ReviewStatusBadge({
  status,
  className,
  showIcon = true,
  size = "md",
}: ReviewStatusBadgeProps) {
  const Icon = REVIEW_STATUS_ICONS[status];
  const label = OVERALL_REVIEW_STATUS_LABELS[status];
  const colorClass = OVERALL_REVIEW_STATUS_COLORS[status];

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-1",
    lg: "text-base px-3 py-1.5",
  };

  const iconSizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-medium",
        colorClass,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && <Icon className={iconSizeClasses[size]} />}
      {label}
    </span>
  );
}
