/**
 * Journal Entry Card - Card display for journal entries in list view
 */

import { format } from "date-fns";
import {
  CalendarIcon,
  LinkIcon,
  BookmarkIcon,
  DocumentTextIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolidIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import type { JournalEntry, JournalEntryType } from "@/types";

interface JournalEntryCardProps {
  entry: JournalEntry;
  onClick?: () => void;
  onTogglePin?: (entry: JournalEntry) => void;
}

const entryTypeConfig: Record<JournalEntryType, { icon: string; label: string; color: string }> = {
  observation: { icon: "🔬", label: "Observation", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  experiment: { icon: "🧪", label: "Experiment", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  meeting: { icon: "📅", label: "Meeting", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  idea: { icon: "💡", label: "Idea", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  reflection: { icon: "🤔", label: "Reflection", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  protocol: { icon: "📋", label: "Protocol", color: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" },
};

// Extract plain text preview from TipTap content
function getContentPreview(content: Record<string, unknown> | null, maxLength = 150): string | null {
  if (!content) return null;

  const extractText = (node: Record<string, unknown>): string => {
    if (node.text && typeof node.text === "string") {
      return node.text;
    }
    if (Array.isArray(node.content)) {
      return node.content.map((child) => extractText(child as Record<string, unknown>)).join(" ");
    }
    return "";
  };

  const text = extractText(content).trim();
  if (!text) return null;

  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}

export default function JournalEntryCard({ entry, onClick, onTogglePin }: JournalEntryCardProps) {
  const typeConfig = entryTypeConfig[entry.entry_type];
  const contentPreview = entry.content_text?.substring(0, 150) || getContentPreview(entry.content);

  const handlePinClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePin?.(entry);
  };

  return (
    <div
      onClick={onClick}
      className={clsx(
        "cursor-pointer rounded-xl bg-white p-4 shadow-card transition-all hover:shadow-md dark:bg-dark-card",
        "border-l-4",
        entry.scope === "personal" ? "border-l-primary-400" : "border-l-teal-400"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Entry type badge */}
          <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", typeConfig.color)}>
            <span className="mr-1">{typeConfig.icon}</span>
            {typeConfig.label}
          </span>

          {/* Scope indicator with project name */}
          {entry.scope === "personal" ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Personal
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
              <FolderIcon className="h-3 w-3" />
              {entry.project_name || "Project"}
            </span>
          )}
        </div>

        {/* Pin button */}
        <button
          onClick={handlePinClick}
          className={clsx(
            "p-1 rounded transition-colors",
            entry.is_pinned
              ? "text-amber-500 hover:text-amber-600"
              : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          )}
          title={entry.is_pinned ? "Unpin entry" : "Pin entry"}
        >
          {entry.is_pinned ? (
            <BookmarkSolidIcon className="h-4 w-4" />
          ) : (
            <BookmarkIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Title */}
      <h4 className="mt-2 font-medium text-gray-900 dark:text-white line-clamp-2">
        {entry.title || `Journal Entry - ${format(new Date(entry.entry_date), "MMM d, yyyy")}`}
      </h4>

      {/* Content preview */}
      {contentPreview && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
          {contentPreview}
        </p>
      )}

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {entry.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-dark-elevated dark:text-gray-400"
            >
              {tag}
            </span>
          ))}
          {entry.tags.length > 4 && (
            <span className="text-xs text-gray-400">+{entry.tags.length - 4}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-3">
          {/* Entry date */}
          <span className="flex items-center gap-1">
            <CalendarIcon className="h-4 w-4" />
            {format(new Date(entry.entry_date), "MMM d, yyyy")}
          </span>

          {/* Word count */}
          {entry.word_count > 0 && (
            <span className="flex items-center gap-1">
              <DocumentTextIcon className="h-4 w-4" />
              {entry.word_count} words
            </span>
          )}

          {/* Linked items count */}
          {entry.links && entry.links.length > 0 && (
            <span className="flex items-center gap-1">
              <LinkIcon className="h-4 w-4" />
              {entry.links.length} links
            </span>
          )}
        </div>

        {/* Mood indicator */}
        {entry.mood && (
          <span className="text-sm">{entry.mood}</span>
        )}
      </div>
    </div>
  );
}
