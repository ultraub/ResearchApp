/**
 * WorkItemsList - Unified view of user's tasks and review assignments
 * Shows all work items sorted by priority and due date.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { tasksService } from "@/services/tasks";
import type { WorkItem } from "@/types";
import {
  CheckIcon,
  DocumentTextIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { formatDistanceToNow } from "date-fns";

interface WorkItemsListProps {
  statusFilter?: "active" | "completed" | "all";
  limit?: number;
  className?: string;
  onItemClick?: (item: WorkItem) => void;
}

const PRIORITY_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  urgent: {
    color: "text-red-700 bg-red-100 ring-1 ring-red-200 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-800",
    icon: <ExclamationCircleIcon className="h-3 w-3" />,
  },
  high: {
    color: "text-orange-700 bg-orange-100 ring-1 ring-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:ring-orange-800",
    icon: <ExclamationTriangleIcon className="h-3 w-3" />,
  },
  normal: {
    color: "text-blue-700 bg-blue-100 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-800",
    icon: null,
  },
  medium: {
    color: "text-blue-700 bg-blue-100 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-800",
    icon: null,
  },
  low: {
    color: "text-gray-600 bg-gray-100 ring-1 ring-gray-200 dark:bg-gray-700 dark:ring-gray-600",
    icon: null,
  },
};

function WorkItemCard({
  item,
  onClick,
}: {
  item: WorkItem;
  onClick?: () => void;
}) {
  const priorityConfig = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
  const isOverdue =
    item.due_date && new Date(item.due_date) < new Date() && item.status !== "completed";

  return (
    <div
      className={clsx(
        "cursor-pointer rounded-xl border bg-white p-3 shadow-soft transition-all duration-200",
        "hover:bg-gray-50 hover:shadow-elevated hover:scale-[1.01] dark:bg-dark-card dark:hover:bg-dark-elevated",
        isOverdue && "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-900/10"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {item.type === "task" ? (
            <CheckIcon className="h-4 w-4 flex-shrink-0 text-blue-500" />
          ) : (
            <DocumentTextIcon className="h-4 w-4 flex-shrink-0 text-purple-500" />
          )}
          <span className="truncate font-semibold text-gray-900 dark:text-white">
            {item.title}
          </span>
        </div>
        <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
          {item.type === "task" ? "Task" : "Review"}
        </span>

        <span
          className={clsx(
            "flex items-center gap-1 rounded-full px-2 py-0.5",
            priorityConfig.color
          )}
        >
          {priorityConfig.icon}
          {item.priority}
        </span>

        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
          {item.assignment_status}
        </span>

        {item.due_date && (
          <span
            className={clsx(
              "flex items-center gap-1",
              isOverdue ? "text-red-600" : "text-gray-500 dark:text-gray-400"
            )}
          >
            <ClockIcon className="h-3 w-3" />
            {isOverdue
              ? `Overdue by ${formatDistanceToNow(new Date(item.due_date))}`
              : `Due ${formatDistanceToNow(new Date(item.due_date), { addSuffix: true })}`}
          </span>
        )}
      </div>
    </div>
  );
}

export default function WorkItemsList({
  statusFilter = "active",
  limit = 50,
  className,
  onItemClick,
}: WorkItemsListProps) {
  const [activeTab, setActiveTab] = useState<"all" | "tasks" | "reviews">("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["work-items", statusFilter, limit],
    queryFn: () =>
      tasksService.getMyWorkItems({
        status_filter: statusFilter,
        limit,
      }),
  });

  if (isLoading) {
    return (
      <div className={clsx("space-y-3", className)}>
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={clsx(
          "rounded-lg border border-red-200 bg-white p-6 text-center dark:border-red-900 dark:bg-dark-card",
          className
        )}
      >
        <ExclamationCircleIcon className="mx-auto h-6 w-6 text-red-600" />
        <p className="mt-2 text-red-600">Failed to load work items</p>
      </div>
    );
  }

  if (!data || data.combined.length === 0) {
    return (
      <div
        className={clsx(
          "rounded-lg border bg-white p-8 text-center dark:bg-dark-card",
          className
        )}
      >
        <CheckIcon className="mx-auto h-8 w-8 text-gray-400" />
        <p className="mt-2 text-gray-500 dark:text-gray-400">No work items to show</p>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          {statusFilter === "active"
            ? "You have no active tasks or reviews assigned."
            : "No items match the current filter."}
        </p>
      </div>
    );
  }

  const tabItems = [
    { id: "all" as const, label: "All", count: data.combined.length },
    { id: "tasks" as const, label: "Tasks", count: data.tasks.length },
    { id: "reviews" as const, label: "Reviews", count: data.reviews.length },
  ];

  const displayItems =
    activeTab === "all"
      ? data.combined
      : activeTab === "tasks"
      ? data.tasks
      : data.reviews;

  return (
    <div className={clsx("rounded-xl border bg-white shadow-soft dark:bg-dark-card dark:border-dark-border", className)}>
      <div className="border-b px-4 py-3 dark:border-dark-border">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            My Work Items
          </h3>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>{data.total_tasks} tasks</span>
            <span>|</span>
            <span>{data.total_reviews} reviews</span>
          </div>
        </div>
      </div>

      <div className="border-b px-4 dark:border-dark-border">
        <div className="flex gap-4">
          {tabItems.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "border-b-2 py-2 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              )}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 p-4">
        {displayItems.length === 0 ? (
          <p className="py-4 text-center text-gray-500 dark:text-gray-400">
            {activeTab === "tasks" ? "No task assignments" : "No review assignments"}
          </p>
        ) : (
          displayItems.map((item) => (
            <WorkItemCard
              key={`${item.type}-${item.id}`}
              item={item}
              onClick={() => onItemClick?.(item)}
            />
          ))
        )}
      </div>
    </div>
  );
}
