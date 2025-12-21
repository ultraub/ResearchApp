import { formatDistanceToNow } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  EllipsisHorizontalIcon,
  BookmarkIcon,
  TrashIcon,
  FolderPlusIcon,
  ClipboardDocumentListIcon,
  ArchiveBoxIcon,
} from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolidIcon } from "@heroicons/react/24/solid";
import { Menu, Transition } from "@headlessui/react";
import type { Idea } from "@/types";
import { ideasService } from "@/services/ideas";
import { clsx } from "clsx";

interface IdeaCardProps {
  idea: Idea;
  onClick?: (idea: Idea) => void;
  onConvertToProject?: (idea: Idea) => void;
  onConvertToTask?: (idea: Idea) => void;
}

export default function IdeaCard({
  idea,
  onClick,
  onConvertToProject,
  onConvertToTask,
}: IdeaCardProps) {
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

  const statusColors = {
    captured: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    reviewed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    converted: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    archived: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  };

  const handleCardClick = () => {
    onClick?.(idea);
  };

  return (
    <div
      onClick={handleCardClick}
      className={clsx(
        "group relative rounded-xl border bg-white p-5 shadow-soft transition-all hover:shadow-card dark:bg-dark-card",
        onClick && "cursor-pointer",
        idea.is_pinned
          ? "border-amber-200 dark:border-amber-800"
          : "border-gray-200 dark:border-dark-border"
      )}
    >
      {/* Pin indicator */}
      {idea.is_pinned && (
        <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white">
          <BookmarkSolidIcon className="h-3 w-3" />
        </div>
      )}

      {/* Content */}
      <div className="mb-3">
        {idea.title && (
          <h3 className="mb-1 font-medium text-gray-900 dark:text-white">
            {idea.title}
          </h3>
        )}
        <p className="text-sm text-gray-600 line-clamp-5 dark:text-gray-300">
          {idea.content}
        </p>
      </div>

      {/* Tags */}
      {idea.tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {idea.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-dark-elevated dark:text-gray-400"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={clsx("rounded-full px-2 py-0.5 text-xs", statusColors[idea.status])}>
            {idea.status}
          </span>
          <span className="text-xs text-gray-400">
            {formatDistanceToNow(new Date(idea.created_at), { addSuffix: true })}
          </span>
        </div>

        {/* Actions menu */}
        <Menu as="div" className="relative" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <Menu.Button className="rounded-lg p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100 dark:hover:bg-dark-elevated">
            <EllipsisHorizontalIcon className="h-5 w-5" />
          </Menu.Button>

          <Transition
            enter="transition duration-100 ease-out"
            enterFrom="transform scale-95 opacity-0"
            enterTo="transform scale-100 opacity-100"
            leave="transition duration-75 ease-in"
            leaveFrom="transform scale-100 opacity-100"
            leaveTo="transform scale-95 opacity-0"
          >
            <Menu.Items className="absolute right-0 z-10 mt-1 w-48 rounded-xl bg-white py-1 shadow-card ring-1 ring-gray-200 dark:bg-dark-elevated dark:ring-dark-border">
              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => pinMutation.mutate()}
                    className={clsx(
                      "flex w-full items-center gap-2 px-4 py-2 text-sm",
                      active ? "bg-gray-100 dark:bg-dark-base" : ""
                    )}
                  >
                    <BookmarkIcon className="h-4 w-4" />
                    {idea.is_pinned ? "Unpin" : "Pin"}
                  </button>
                )}
              </Menu.Item>

              {idea.status !== "converted" && (
                <>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => onConvertToProject?.(idea)}
                        className={clsx(
                          "flex w-full items-center gap-2 px-4 py-2 text-sm",
                          active ? "bg-gray-100 dark:bg-dark-base" : ""
                        )}
                      >
                        <FolderPlusIcon className="h-4 w-4" />
                        Convert to Project
                      </button>
                    )}
                  </Menu.Item>

                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => onConvertToTask?.(idea)}
                        className={clsx(
                          "flex w-full items-center gap-2 px-4 py-2 text-sm",
                          active ? "bg-gray-100 dark:bg-dark-base" : ""
                        )}
                      >
                        <ClipboardDocumentListIcon className="h-4 w-4" />
                        Convert to Task
                      </button>
                    )}
                  </Menu.Item>
                </>
              )}

              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => archiveMutation.mutate()}
                    className={clsx(
                      "flex w-full items-center gap-2 px-4 py-2 text-sm",
                      active ? "bg-gray-100 dark:bg-dark-base" : ""
                    )}
                  >
                    <ArchiveBoxIcon className="h-4 w-4" />
                    Archive
                  </button>
                )}
              </Menu.Item>

              <div className="my-1 border-t border-gray-200 dark:border-dark-border" />

              <Menu.Item>
                {({ active }) => (
                  <button
                    onClick={() => deleteMutation.mutate()}
                    className={clsx(
                      "flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600",
                      active ? "bg-red-50 dark:bg-red-900/20" : ""
                    )}
                  >
                    <TrashIcon className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </Menu.Item>
            </Menu.Items>
          </Transition>
        </Menu>
      </div>
    </div>
  );
}
