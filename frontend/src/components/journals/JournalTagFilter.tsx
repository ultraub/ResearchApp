/**
 * Journal Tag Filter - Tag filter chips for filtering journal entries
 */

import { useState } from "react";
import { XMarkIcon, TagIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";

interface JournalTagFilterProps {
  availableTags: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  className?: string;
}

export default function JournalTagFilter({
  availableTags,
  selectedTags,
  onTagsChange,
  className,
}: JournalTagFilterProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter((t) => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const clearAll = () => {
    onTagsChange([]);
  };

  // Show first 8 tags, rest are hidden until expanded
  const visibleTags = isExpanded ? availableTags : availableTags.slice(0, 8);
  const hiddenCount = availableTags.length - 8;

  if (availableTags.length === 0) {
    return null;
  }

  return (
    <div className={clsx("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
          <TagIcon className="h-4 w-4" />
          <span>Filter by tags</span>
        </div>
        {selectedTags.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {visibleTags.map((tag) => {
          const isSelected = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={clsx(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                isSelected
                  ? "bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-elevated dark:text-gray-400 dark:hover:bg-gray-600"
              )}
            >
              {tag}
              {isSelected && <XMarkIcon className="h-3 w-3" />}
            </button>
          );
        })}

        {!isExpanded && hiddenCount > 0 && (
          <button
            onClick={() => setIsExpanded(true)}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:bg-dark-elevated dark:text-gray-400 dark:hover:bg-gray-600"
          >
            +{hiddenCount} more
            <ChevronDownIcon className="h-3 w-3" />
          </button>
        )}

        {isExpanded && hiddenCount > 0 && (
          <button
            onClick={() => setIsExpanded(false)}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:bg-dark-elevated dark:text-gray-400 dark:hover:bg-gray-600"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}
