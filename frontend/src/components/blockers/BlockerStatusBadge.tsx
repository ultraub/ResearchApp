/**
 * BlockerStatusBadge - Displays the status of a blocker with appropriate styling.
 */

import { clsx } from "clsx";
import type { BlockerStatus } from "@/types";
import {
  ExclamationCircleIcon,
  PlayCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

interface BlockerStatusBadgeProps {
  status: BlockerStatus;
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
}

const STATUS_LABELS: Record<BlockerStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  wont_fix: "Won't Fix",
};

const STATUS_COLORS: Record<BlockerStatus, string> = {
  open: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  in_progress: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  resolved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  wont_fix: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

const STATUS_ICONS: Record<BlockerStatus, React.ComponentType<{ className?: string }>> = {
  open: ExclamationCircleIcon,
  in_progress: PlayCircleIcon,
  resolved: CheckCircleIcon,
  wont_fix: XCircleIcon,
};

export function BlockerStatusBadge({
  status,
  className,
  showIcon = true,
  size = "md",
}: BlockerStatusBadgeProps) {
  const Icon = STATUS_ICONS[status];
  const label = STATUS_LABELS[status];
  const colorClass = STATUS_COLORS[status];

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

export default BlockerStatusBadge;
