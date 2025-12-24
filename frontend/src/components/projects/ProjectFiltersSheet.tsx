/**
 * ProjectFiltersSheet - Bottom sheet with all project filters
 *
 * Features:
 * - Full filter controls in a mobile-friendly bottom sheet
 * - Team, Status, Person filters
 * - My Tasks toggle
 * - Clear all filters action
 * - Mobile-only rendering
 */

import { clsx } from "clsx";
import {
  UserIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { BottomSheet, BottomSheetHeader } from "@/components/ui/BottomSheet";
import type { TeamDetail, TeamMember } from "@/types";

interface ProjectFiltersSheetProps {
  /** Whether the sheet is open */
  isOpen: boolean;
  /** Close the sheet */
  onClose: () => void;
  /** My Tasks filter state */
  showOnlyMyTasks: boolean;
  /** Toggle My Tasks filter */
  onToggleMyTasks: () => void;
  /** Current status filter */
  statusFilter: string;
  /** Set status filter */
  onStatusChange: (status: string) => void;
  /** Current team filter */
  teamFilter: string;
  /** Set team filter */
  onTeamChange: (teamId: string) => void;
  /** Current person filter */
  personFilter: string;
  /** Set person filter */
  onPersonChange: (personId: string) => void;
  /** Available teams */
  teams: TeamDetail[];
  /** Team members for selected team */
  teamMembers?: TeamMember[];
  /** Clear all filters callback */
  onClearAll: () => void;
  /** Count of active filters */
  activeFilterCount: number;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Projects" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "archived", label: "Archived" },
];

interface FilterOptionProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterOption({ label, active, onClick }: FilterOptionProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full flex items-center justify-between p-3 rounded-lg",
        "text-left text-sm transition-colors min-h-[44px]",
        active
          ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
          : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-dark-elevated"
      )}
    >
      <span>{label}</span>
      {active && (
        <span className="text-primary-600 dark:text-primary-400">✓</span>
      )}
    </button>
  );
}

export function ProjectFiltersSheet({
  isOpen,
  onClose,
  showOnlyMyTasks,
  onToggleMyTasks,
  statusFilter,
  onStatusChange,
  teamFilter,
  onTeamChange,
  personFilter,
  onPersonChange,
  teams,
  teamMembers,
  onClearAll,
  activeFilterCount,
}: ProjectFiltersSheetProps) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Filter Projects"
      mobileOnly
      snapPoints={[0.7, 0.9]}
    >
      <div className="space-y-6">
        {/* Clear All button */}
        {activeFilterCount > 0 && (
          <button
            onClick={() => {
              onClearAll();
              onClose();
            }}
            className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 hover:underline"
          >
            <XMarkIcon className="h-4 w-4" />
            Clear all filters ({activeFilterCount})
          </button>
        )}

        {/* My Tasks Toggle */}
        <div>
          <BottomSheetHeader>Assigned To</BottomSheetHeader>
          <button
            onClick={() => {
              onToggleMyTasks();
            }}
            className={clsx(
              "w-full flex items-center gap-3 p-4 rounded-xl",
              "transition-colors min-h-[56px]",
              showOnlyMyTasks
                ? "bg-primary-50 border-2 border-primary-500 dark:bg-primary-900/30 dark:border-primary-500"
                : "bg-gray-50 border-2 border-transparent dark:bg-dark-elevated"
            )}
          >
            <div
              className={clsx(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                showOnlyMyTasks
                  ? "bg-primary-500 text-white"
                  : "bg-gray-200 text-gray-500 dark:bg-dark-border dark:text-gray-400"
              )}
            >
              <UserIcon className="h-5 w-5" />
            </div>
            <div className="text-left">
              <div
                className={clsx(
                  "font-medium",
                  showOnlyMyTasks
                    ? "text-primary-700 dark:text-primary-400"
                    : "text-gray-900 dark:text-white"
                )}
              >
                My Tasks Only
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Show only projects with tasks assigned to me
              </div>
            </div>
          </button>
        </div>

        {/* Team Filter */}
        <div>
          <BottomSheetHeader>Team</BottomSheetHeader>
          <div className="space-y-1">
            <FilterOption
              label="All Teams"
              active={!teamFilter}
              onClick={() => onTeamChange("")}
            />
            {teams.map((team) => (
              <FilterOption
                key={team.id}
                label={team.is_personal ? "Personal" : team.name}
                active={teamFilter === team.id}
                onClick={() => onTeamChange(team.id)}
              />
            ))}
          </div>
        </div>

        {/* Person Filter (when team selected) */}
        {teamFilter && teamMembers && teamMembers.length > 0 && (
          <div>
            <BottomSheetHeader>Person</BottomSheetHeader>
            <div className="space-y-1">
              <FilterOption
                label="All People"
                active={!personFilter}
                onClick={() => onPersonChange("")}
              />
              <FilterOption
                label="Unassigned"
                active={personFilter === "unassigned"}
                onClick={() => onPersonChange("unassigned")}
              />
              {teamMembers.map((member) => (
                <FilterOption
                  key={member.user_id}
                  label={
                    member.display_name ||
                    member.email ||
                    "Unknown"
                  }
                  active={personFilter === member.user_id}
                  onClick={() => onPersonChange(member.user_id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Status Filter */}
        <div>
          <BottomSheetHeader>Status</BottomSheetHeader>
          <div className="space-y-1">
            {STATUS_OPTIONS.map((option) => (
              <FilterOption
                key={option.value}
                label={option.label}
                active={statusFilter === option.value}
                onClick={() => onStatusChange(option.value)}
              />
            ))}
          </div>
        </div>

        {/* Apply button */}
        <div className="pt-4 border-t border-gray-200 dark:border-dark-border">
          <button
            onClick={onClose}
            className={clsx(
              "w-full py-3 px-4 rounded-xl",
              "bg-primary-600 text-white font-medium",
              "hover:bg-primary-700 transition-colors",
              "min-h-[48px]"
            )}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

export default ProjectFiltersSheet;
