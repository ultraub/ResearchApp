/**
 * Idea List View - Horizontal list layout for ideas with more visible content
 */

import { formatDistanceToNow } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  BookmarkIcon,
  TrashIcon,
  ArchiveBoxIcon,
} from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolidIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import type { Idea } from "@/types";
import { ideasService } from "@/services/ideas";

interface IdeaListViewProps {
  ideas: Idea[];
  onIdeaClick?: (idea: Idea) => void;
}

const statusColors = {
  captured: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  reviewed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  converted: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

interface IdeaListItemProps {
  idea: Idea;
  onClick?: (idea: Idea) => void;
}

function IdeaListItem({ idea, onClick }: IdeaListItemProps) {
  const queryClient = useQueryClient();

  const pinMutation = useMutation({
    mutationFn: () => ideasService.togglePin(idea.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => ideasService.delete(idea.id),
    onSuccess: () => {
      toast.success("Idea deleted");
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => ideasService.update(idea.id, { status: "archived" }),
    onSuccess: () => {
      toast.success("Idea archived");
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
    },
  });

  const handleClick = () => {
    onClick?.(idea);
  };

  return (
    <div
      onClick={handleClick}
      className={clsx(
        "group relative rounded-xl border bg-white p-5 shadow-soft transition-all hover:shadow-card dark:bg-dark-card",
        onClick && "cursor-pointer",
        idea.is_pinned
          ? "border-amber-200 dark:border-amber-800"
          : "border-gray-200 dark:border-dark-border"
      )}
    >
      <div className="flex gap-4">
        {/* Pin indicator */}
        <div className="flex-shrink-0 pt-1">
          {idea.is_pinned ? (
            <BookmarkSolidIcon className="h-5 w-5 text-amber-500" />
          ) : (
            <div className="h-5 w-5" />
          )}
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Header row */}
          <div className="mb-2 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {idea.title && (
                <h3 className="text-lg font-medium text-gray-900 dark:text-white truncate">
                  {idea.title}
                </h3>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", statusColors[idea.status])}>
                  {idea.status}
                </span>
                <span className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(idea.created_at), { addSuffix: true })}
                </span>
                {idea.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {idea.tags.slice(0, 5).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-dark-elevated dark:text-gray-400"
                      >
                        #{tag}
                      </span>
                    ))}
                    {idea.tags.length > 5 && (
                      <span className="text-xs text-gray-400">
                        +{idea.tags.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  pinMutation.mutate();
                }}
                className={clsx(
                  "rounded-lg p-2 transition-colors",
                  idea.is_pinned
                    ? "text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                )}
                title={idea.is_pinned ? "Unpin" : "Pin"}
              >
                {idea.is_pinned ? (
                  <BookmarkSolidIcon className="h-4 w-4" />
                ) : (
                  <BookmarkIcon className="h-4 w-4" />
                )}
              </button>

              {idea.status !== "archived" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    archiveMutation.mutate();
                  }}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-elevated"
                  title="Archive"
                >
                  <ArchiveBoxIcon className="h-4 w-4" />
                </button>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("Are you sure you want to delete this idea?")) {
                    deleteMutation.mutate();
                  }
                }}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-dark-elevated"
                title="Delete"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content - more visible in list view */}
          <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
            {idea.content.length > 500 ? idea.content.slice(0, 500) + "..." : idea.content}
          </p>

          {/* AI summary if available */}
          {idea.ai_summary && (
            <div className="mt-3 rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20">
              <p className="text-xs font-medium text-purple-700 dark:text-purple-400">AI Summary</p>
              <p className="mt-1 text-sm text-purple-600 dark:text-purple-500">{idea.ai_summary}</p>
            </div>
          )}

          {/* Converted indicator */}
          {idea.status === "converted" && (
            <div className="mt-3 text-xs text-green-600 dark:text-green-400">
              {idea.converted_to_project_id && "Converted to project"}
              {idea.converted_to_task_id && "Converted to task"}
              {idea.converted_at && (
                <span className="ml-1 text-gray-400">
                  • {formatDistanceToNow(new Date(idea.converted_at), { addSuffix: true })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IdeaListView({ ideas, onIdeaClick }: IdeaListViewProps) {
  return (
    <div className="space-y-4">
      {ideas.map((idea) => (
        <IdeaListItem
          key={idea.id}
          idea={idea}
          onClick={onIdeaClick}
        />
      ))}
    </div>
  );
}
