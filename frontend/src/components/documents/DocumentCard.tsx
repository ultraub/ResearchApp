/**
 * DocumentCard - Reusable document row/card component for displaying document info with actions
 */

import { Fragment } from "react";
import { format } from "date-fns";
import { clsx } from "clsx";
import { Menu, Transition } from "@headlessui/react";
import {
  DocumentTextIcon,
  StarIcon,
  ArchiveBoxIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  ChatBubbleLeftIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import type { Document } from "@/services/documents";

export const DOCUMENT_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-dark-card dark:text-gray-300",
  in_review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  published: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  archived: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export const DOCUMENT_TYPE_ICONS: Record<string, string> = {
  protocol: "text-purple-500",
  literature_review: "text-blue-500",
  meeting_notes: "text-green-500",
  grant_proposal: "text-orange-500",
  progress_report: "text-teal-500",
  note: "text-blue-500",
  research: "text-purple-500",
  meeting: "text-green-500",
  report: "text-orange-500",
  design: "text-pink-500",
  proposal: "text-yellow-500",
  specification: "text-cyan-500",
  documentation: "text-indigo-500",
  analysis: "text-teal-500",
  plan: "text-violet-500",
  general: "text-gray-500",
  other: "text-gray-500",
};

export interface DocumentCardProps {
  document: Document;
  onClick?: () => void;
  onTogglePin?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
  compact?: boolean;
  /** Unread comment info for displaying comment indicator */
  unreadInfo?: { totalComments: number; unreadCount: number };
}

export function DocumentCard({
  document,
  onClick,
  onTogglePin,
  onArchive,
  onDelete,
  showActions = true,
  compact = false,
  unreadInfo,
}: DocumentCardProps) {
  const hasActions = showActions && (onTogglePin || onArchive || onDelete);
  const hasComments = unreadInfo && unreadInfo.totalComments > 0;
  const hasUnreadComments = unreadInfo && unreadInfo.unreadCount > 0;

  return (
    <div
      className={clsx(
        "flex items-center gap-4 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600 transition-all hover:shadow-md group",
        compact ? "p-3" : "p-4",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <div
        className={clsx(
          "flex-shrink-0 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-dark-elevated",
          DOCUMENT_TYPE_ICONS[document.document_type] || "text-gray-500",
          compact ? "w-8 h-8" : "w-10 h-10"
        )}
      >
        <DocumentTextIcon className={compact ? "w-4 h-4" : "w-5 h-5"} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3
            className={clsx(
              "font-medium text-gray-900 dark:text-white truncate",
              compact ? "text-sm" : "text-sm"
            )}
          >
            {document.title}
          </h3>
          {document.is_pinned && (
            <StarIconSolid className="w-4 h-4 text-yellow-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span
            className={clsx(
              "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded",
              DOCUMENT_STATUS_COLORS[document.status]
            )}
          >
            {document.status.replace("_", " ")}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            v{document.version}
          </span>
          {/* Comment count indicator */}
          {hasComments && (
            <span
              className={clsx(
                "flex items-center gap-1 text-xs",
                hasUnreadComments
                  ? "text-primary-600 dark:text-primary-400"
                  : "text-gray-500 dark:text-gray-400"
              )}
            >
              <span className="relative">
                <ChatBubbleLeftIcon className="w-3.5 h-3.5" />
                {hasUnreadComments && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-primary-500 text-[7px] font-bold text-white">
                    {unreadInfo!.unreadCount > 9 ? "9+" : unreadInfo!.unreadCount}
                  </span>
                )}
              </span>
              {unreadInfo!.totalComments}
            </span>
          )}
          {!compact && (
            <>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {document.word_count || 0} words
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Updated {format(new Date(document.updated_at), "MMM d, yyyy")}
              </span>
            </>
          )}
        </div>
      </div>

      {hasActions && (
        <Menu as="div" className="relative">
          <Menu.Button
            onClick={(e) => e.stopPropagation()}
            className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-dark-elevated transition-opacity"
          >
            <EllipsisVerticalIcon className="w-5 h-5 text-gray-500" />
          </Menu.Button>
          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className="absolute right-0 mt-2 w-48 bg-white dark:bg-dark-card rounded-xl shadow-card border border-gray-200 dark:border-dark-border py-1 z-10">
              {onTogglePin && (
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin();
                      }}
                      className={clsx(
                        "w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300",
                        active ? "bg-gray-100 dark:bg-dark-elevated" : ""
                      )}
                    >
                      <StarIcon className="w-4 h-4" />
                      {document.is_pinned ? "Unpin" : "Pin"}
                    </button>
                  )}
                </Menu.Item>
              )}
              {onArchive && (
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchive();
                      }}
                      className={clsx(
                        "w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300",
                        active ? "bg-gray-100 dark:bg-dark-elevated" : ""
                      )}
                    >
                      <ArchiveBoxIcon className="w-4 h-4" />
                      {document.is_archived ? "Unarchive" : "Archive"}
                    </button>
                  )}
                </Menu.Item>
              )}
              {onDelete && (
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                      }}
                      className={clsx(
                        "w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600",
                        active ? "bg-gray-100 dark:bg-dark-elevated" : ""
                      )}
                    >
                      <TrashIcon className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                </Menu.Item>
              )}
            </Menu.Items>
          </Transition>
        </Menu>
      )}
    </div>
  );
}

export default DocumentCard;
