/**
 * TeamBadge component for displaying team context on projects.
 * Shows different styling for personal teams vs organization teams.
 */

import { UserIcon, UsersIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";

interface TeamBadgeProps {
  teamName: string | null | undefined;
  isPersonal?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function TeamBadge({
  teamName,
  isPersonal = false,
  size = "sm",
  className,
}: TeamBadgeProps) {
  if (!teamName) return null;

  const Icon = isPersonal ? UserIcon : UsersIcon;

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "sm" && "px-2 py-0.5 text-xs",
        size === "md" && "px-2.5 py-1 text-sm",
        isPersonal
          ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
        className
      )}
    >
      <Icon className={clsx(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} />
      <span className="truncate max-w-[120px]">{teamName}</span>
    </span>
  );
}

export default TeamBadge;
