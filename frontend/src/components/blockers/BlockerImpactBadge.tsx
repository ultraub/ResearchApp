/**
 * BlockerImpactBadge - Displays the impact level of a blocker.
 */

import { clsx } from "clsx";
import type { BlockerImpactLevel } from "@/types";
import {
  ArrowDownIcon,
  MinusIcon,
  ArrowUpIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";

interface BlockerImpactBadgeProps {
  impact: BlockerImpactLevel;
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
}

const IMPACT_LABELS: Record<BlockerImpactLevel, string> = {
  low: "Low Impact",
  medium: "Medium Impact",
  high: "High Impact",
  critical: "Critical",
};

const IMPACT_COLORS: Record<BlockerImpactLevel, string> = {
  low: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const IMPACT_ICONS: Record<BlockerImpactLevel, React.ComponentType<{ className?: string }>> = {
  low: ArrowDownIcon,
  medium: MinusIcon,
  high: ArrowUpIcon,
  critical: ExclamationTriangleIcon,
};

export function BlockerImpactBadge({
  impact,
  className,
  showIcon = true,
  size = "md",
}: BlockerImpactBadgeProps) {
  const Icon = IMPACT_ICONS[impact];
  const label = IMPACT_LABELS[impact];
  const colorClass = IMPACT_COLORS[impact];

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

export default BlockerImpactBadge;
