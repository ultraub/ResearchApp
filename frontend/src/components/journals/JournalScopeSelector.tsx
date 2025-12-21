/**
 * Journal Scope Selector - Personal/Project/All tabs for filtering journal entries
 */

import { clsx } from "clsx";
import { UserIcon, FolderIcon, GlobeAltIcon } from "@heroicons/react/24/outline";

type JournalScopeFilter = "personal" | "project" | "all";

interface JournalScopeSelectorProps {
  value: JournalScopeFilter;
  onChange: (scope: JournalScopeFilter) => void;
  personalCount?: number;
  projectCount?: number;
  className?: string;
}

const scopes: { value: JournalScopeFilter; label: string; icon: typeof UserIcon }[] = [
  { value: "all", label: "All", icon: GlobeAltIcon },
  { value: "personal", label: "Personal", icon: UserIcon },
  { value: "project", label: "Project", icon: FolderIcon },
];

export default function JournalScopeSelector({
  value,
  onChange,
  personalCount,
  projectCount,
  className,
}: JournalScopeSelectorProps) {
  const getCount = (scope: JournalScopeFilter): number | undefined => {
    if (scope === "personal") return personalCount;
    if (scope === "project") return projectCount;
    if (scope === "all" && personalCount !== undefined && projectCount !== undefined) {
      return personalCount + projectCount;
    }
    return undefined;
  };

  return (
    <div className={clsx("flex rounded-lg bg-gray-100 p-1 dark:bg-dark-elevated", className)}>
      {scopes.map((scope) => {
        const Icon = scope.icon;
        const count = getCount(scope.value);
        const isActive = value === scope.value;

        return (
          <button
            key={scope.value}
            onClick={() => onChange(scope.value)}
            className={clsx(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-white text-gray-900 shadow-soft dark:bg-dark-card dark:text-white"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{scope.label}</span>
            {count !== undefined && (
              <span
                className={clsx(
                  "ml-1 rounded-full px-1.5 py-0.5 text-xs",
                  isActive
                    ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
                    : "bg-gray-200 text-gray-600 dark:bg-dark-elevated dark:text-gray-400"
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
