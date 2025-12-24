/**
 * QuickFilterChips - Horizontal scrollable filter chips for mobile
 *
 * Features:
 * - Horizontal overflow scroll with hidden scrollbar
 * - Touch-friendly chip sizes (44px height)
 * - Visual active/inactive states
 * - My Tasks, Status, and Team quick filters
 */

import { clsx } from "clsx";
import { UserIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import type { TeamDetail } from "@/types";

interface QuickFilterChipsProps {
  /** Whether "My Tasks" filter is active */
  showOnlyMyTasks: boolean;
  /** Toggle "My Tasks" filter */
  onToggleMyTasks: () => void;
  /** Current status filter value */
  statusFilter: string;
  /** Set status filter */
  onStatusChange: (status: string) => void;
  /** Current team filter value */
  teamFilter: string;
  /** Set team filter */
  onTeamChange: (teamId: string) => void;
  /** Available teams for quick select */
  teams: TeamDetail[];
  /** Maximum number of team chips to show (rest available in full filter) */
  maxTeamChips?: number;
  /** Additional class names */
  className?: string;
}

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}

function FilterChip({ label, active, onClick, icon }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2",
        "text-sm font-medium transition-colors",
        "min-h-[44px] flex-shrink-0", // Touch target
        active
          ? "bg-primary-600 text-white shadow-sm"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-dark-elevated dark:text-gray-300 dark:hover:bg-dark-border"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function QuickFilterChips({
  showOnlyMyTasks,
  onToggleMyTasks,
  statusFilter,
  onStatusChange,
  teamFilter,
  onTeamChange,
  teams,
  maxTeamChips = 2,
  className,
}: QuickFilterChipsProps) {
  // Get non-personal teams for quick chips
  const quickTeams = teams
    .filter((t) => !t.is_personal)
    .slice(0, maxTeamChips);

  return (
    <div
      className={clsx(
        "flex gap-2 overflow-x-auto pb-2 -mb-2",
        // Hide scrollbar but allow scrolling
        "scrollbar-none",
        className
      )}
      style={{
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      {/* My Tasks - always first */}
      <FilterChip
        label="My Tasks"
        active={showOnlyMyTasks}
        onClick={onToggleMyTasks}
        icon={<UserIcon className="h-4 w-4" />}
      />

      {/* Active status quick filter */}
      <FilterChip
        label="Active"
        active={statusFilter === "active"}
        onClick={() =>
          onStatusChange(statusFilter === "active" ? "" : "active")
        }
        icon={<CheckCircleIcon className="h-4 w-4" />}
      />

      {/* Quick team chips (first 2 non-personal teams) */}
      {quickTeams.map((team) => (
        <FilterChip
          key={team.id}
          label={team.name}
          active={teamFilter === team.id}
          onClick={() => onTeamChange(teamFilter === team.id ? "" : team.id)}
        />
      ))}
    </div>
  );
}

export default QuickFilterChips;
