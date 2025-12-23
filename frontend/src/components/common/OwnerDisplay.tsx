import { clsx } from "clsx";
import { UserCircleIcon } from "@heroicons/react/24/outline";

interface OwnerDisplayProps {
  name: string | null | undefined;
  email: string | null | undefined;
  id?: string | null; // For consistent color generation
  size?: "xs" | "sm" | "md";
  showName?: boolean;
  className?: string;
}

const sizeClasses = {
  xs: "h-4 w-4 text-[8px]",
  sm: "h-5 w-5 text-[10px]",
  md: "h-6 w-6 text-xs",
};

const textSizeClasses = {
  xs: "text-xs",
  sm: "text-xs",
  md: "text-sm",
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

function getColorFromString(str: string | null | undefined): string {
  // Generate a consistent color based on string (id, email, or name)
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

  if (!str) return colors[0];

  // Simple hash from string to pick color
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function OwnerDisplay({
  name,
  email,
  id,
  size = "sm",
  showName = false,
  className,
}: OwnerDisplayProps) {
  const displayName = name || email;

  if (!displayName) {
    return (
      <UserCircleIcon
        className={clsx(
          "text-gray-300 dark:text-gray-600",
          sizeClasses[size],
          className
        )}
      />
    );
  }

  const colorKey = id || email || name || "";

  return (
    <div className={clsx("flex items-center", className)}>
      <div
        className={clsx(
          "flex items-center justify-center rounded-full font-medium",
          sizeClasses[size],
          getColorFromString(colorKey)
        )}
        title={displayName}
      >
        {getInitials(name, email)}
      </div>

      {showName && (
        <span className={clsx(
          "ml-1.5 text-gray-600 dark:text-gray-400 truncate",
          textSizeClasses[size]
        )}>
          {displayName}
        </span>
      )}
    </div>
  );
}

// Also export as named export for flexibility
export { OwnerDisplay };
