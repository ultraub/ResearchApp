/**
 * TeamCard - Display card for a team in the teams grid
 */

import { Link } from "react-router-dom";
import { UserGroupIcon, FolderIcon, CogIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import type { TeamDetail, TeamMemberRole } from "@/types";

interface TeamCardProps {
  team: TeamDetail;
  onSettingsClick?: () => void;
}

const ROLE_LABELS: Record<TeamMemberRole, string> = {
  owner: "Owner",
  lead: "Lead",
  member: "Member",
};

const ROLE_COLORS: Record<TeamMemberRole, string> = {
  owner: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  lead: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  member: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

export function TeamCard({ team, onSettingsClick }: TeamCardProps) {
  const canManage = team.current_user_role === "owner" || team.current_user_role === "lead";

  return (
    <div className="group relative rounded-xl border border-gray-200 bg-white p-5 shadow-card transition-all hover:border-primary-200 hover:shadow-md dark:border-dark-border dark:bg-dark-card dark:hover:border-primary-700">
      {/* Settings button (for owners/leads) */}
      {canManage && onSettingsClick && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSettingsClick();
          }}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 opacity-0 transition-all hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100 dark:hover:bg-dark-elevated dark:hover:text-gray-300"
          title="Team settings"
        >
          <CogIcon className="h-5 w-5" />
        </button>
      )}

      <Link to={`/teams/${team.id}`} className="block">
        {/* Team icon and name */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
            <UserGroupIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-white">
              {team.name}
            </h3>
            {team.description && (
              <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                {team.description}
              </p>
            )}
          </div>
        </div>

        {/* Stats and role */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1.5">
              <UserGroupIcon className="h-4 w-4" />
              <span>{team.member_count} member{team.member_count !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FolderIcon className="h-4 w-4" />
              <span>{team.project_count} project{team.project_count !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {team.current_user_role && (
            <span
              className={clsx(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                ROLE_COLORS[team.current_user_role]
              )}
            >
              {ROLE_LABELS[team.current_user_role]}
            </span>
          )}
        </div>

        {/* Personal team badge */}
        {team.is_personal && (
          <div className="mt-3 inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-dark-elevated dark:text-gray-400">
            Personal Team
          </div>
        )}
      </Link>
    </div>
  );
}
