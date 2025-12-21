import { clsx } from "clsx";
import { UserCircleIcon } from "@heroicons/react/24/outline";
import type { TaskAssignment } from "@/types";

interface AssigneeAvatarGroupProps {
  assignments: TaskAssignment[];
  maxDisplay?: number;
  size?: "sm" | "md" | "lg";
  showNames?: boolean;
}

const sizeClasses = {
  sm: "h-5 w-5 text-[10px]",
  md: "h-6 w-6 text-xs",
  lg: "h-8 w-8 text-sm",
};

const overlapClasses = {
  sm: "-ml-1.5",
  md: "-ml-2",
  lg: "-ml-2.5",
};

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name) {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  if (email) {
    return email.substring(0, 2).toUpperCase();
  }
  return "??";
}

function getColorFromId(id: string): string {
  // Generate a consistent color based on user ID
  const colors = [
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
  ];

  // Simple hash from ID to pick color
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash;
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function AssigneeAvatarGroup({
  assignments,
  maxDisplay = 3,
  size = "md",
  showNames = false,
}: AssigneeAvatarGroupProps) {
  if (!assignments || assignments.length === 0) {
    return (
      <UserCircleIcon
        className={clsx(
          "text-gray-300 dark:text-gray-600",
          sizeClasses[size]
        )}
      />
    );
  }

  const displayAssignments = assignments.slice(0, maxDisplay);
  const remainingCount = assignments.length - maxDisplay;

  return (
    <div className="flex items-center">
      <div className="flex">
        {displayAssignments.map((assignment, index) => (
          <div
            key={assignment.id}
            className={clsx(
              "flex items-center justify-center rounded-full font-medium ring-2 ring-white dark:ring-gray-800",
              sizeClasses[size],
              getColorFromId(assignment.user_id),
              index > 0 && overlapClasses[size]
            )}
            title={assignment.user_name || assignment.user_email || "Assignee"}
          >
            {getInitials(assignment.user_name, assignment.user_email)}
          </div>
        ))}

        {remainingCount > 0 && (
          <div
            className={clsx(
              "flex items-center justify-center rounded-full bg-gray-200 font-medium text-gray-600 ring-2 ring-white dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-800",
              sizeClasses[size],
              overlapClasses[size]
            )}
          >
            +{remainingCount}
          </div>
        )}
      </div>

      {showNames && assignments.length === 1 && (
        <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
          {assignments[0].user_name || assignments[0].user_email}
        </span>
      )}

      {showNames && assignments.length > 1 && (
        <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
          {assignments.length} assignees
        </span>
      )}
    </div>
  );
}
