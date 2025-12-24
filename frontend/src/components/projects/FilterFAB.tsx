/**
 * FilterFAB - Floating Action Button for opening filter panel
 *
 * Features:
 * - Fixed position above bottom tab bar
 * - Badge showing active filter count
 * - Accessible with proper focus states
 * - Touch-friendly size (56px)
 */

import { clsx } from "clsx";
import { FunnelIcon } from "@heroicons/react/24/outline";
import { FunnelIcon as FunnelIconSolid } from "@heroicons/react/24/solid";

interface FilterFABProps {
  /** Number of active filters */
  activeCount: number;
  /** Click handler to open filter sheet */
  onClick: () => void;
  /** Additional class names */
  className?: string;
}

export function FilterFAB({ activeCount, onClick, className }: FilterFABProps) {
  const hasActiveFilters = activeCount > 0;

  return (
    <button
      onClick={onClick}
      aria-label={`Filters${hasActiveFilters ? ` (${activeCount} active)` : ""}`}
      className={clsx(
        // Position: fixed above bottom tab bar (which is ~64px + safe area)
        "fixed right-4 z-40",
        "bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)]",
        // Size and shape
        "flex h-14 w-14 items-center justify-center rounded-full",
        // Colors
        hasActiveFilters
          ? "bg-primary-600 text-white shadow-lg"
          : "bg-white text-gray-700 shadow-elevated dark:bg-dark-card dark:text-gray-300",
        // Interactions
        "transition-all hover:scale-105 active:scale-95",
        "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-dark-base",
        className
      )}
    >
      {/* Icon */}
      {hasActiveFilters ? (
        <FunnelIconSolid className="h-6 w-6" />
      ) : (
        <FunnelIcon className="h-6 w-6" />
      )}

      {/* Badge for active filter count */}
      {hasActiveFilters && (
        <span
          className={clsx(
            "absolute -right-1 -top-1",
            "flex h-5 w-5 items-center justify-center rounded-full",
            "bg-red-500 text-xs font-bold text-white",
            "ring-2 ring-white dark:ring-dark-base"
          )}
        >
          {activeCount > 9 ? "9+" : activeCount}
        </span>
      )}
    </button>
  );
}

export default FilterFAB;
