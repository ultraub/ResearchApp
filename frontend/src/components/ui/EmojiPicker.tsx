/**
 * EmojiPicker - A simple emoji picker for selecting project icons
 */

import { useState, useRef, useEffect } from "react";
import { clsx } from "clsx";
import { XMarkIcon, FaceSmileIcon } from "@heroicons/react/24/outline";

// Curated emojis for project organization
const EMOJI_CATEGORIES = {
  "Work": ["📊", "📈", "💼", "📋", "📝", "✅", "🎯", "⚡", "💡", "🔧"],
  "Research": ["🔬", "📚", "🧪", "📖", "🎓", "📐", "🧮", "🔍", "📄", "📑"],
  "Creative": ["🎨", "✨", "🎭", "🎬", "🎵", "📷", "🖌️", "💫", "🌈", "🎪"],
  "Nature": ["🌱", "🌿", "🌳", "🌻", "🌊", "⛰️", "🌙", "☀️", "🌍", "🍃"],
  "Objects": ["🏠", "🚀", "💎", "🔑", "📦", "🎁", "🏆", "🎈", "🔔", "⭐"],
  "Animals": ["🦋", "🐝", "🦊", "🐬", "🦉", "🐢", "🦁", "🐼", "🦄", "🐙"],
  "Food": ["☕", "🍕", "🍎", "🍰", "🌮", "🍿", "🧁", "🍩", "🍓", "🥑"],
  "Symbols": ["❤️", "🔥", "⚡", "💯", "🎯", "✨", "💪", "🙌", "🎉", "🏁"],
};

interface EmojiPickerProps {
  value: string | null;
  onChange: (emoji: string | null) => void;
  className?: string;
}

export function EmojiPicker({ value, onChange, className }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("Work");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (emoji: string) => {
    onChange(emoji);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={clsx("relative", className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "flex items-center justify-center h-10 w-10 rounded-lg border transition-all",
          "bg-white dark:bg-dark-elevated",
          "hover:bg-gray-50 dark:hover:bg-dark-elevated/80",
          "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2",
          value
            ? "border-primary-300 dark:border-primary-700"
            : "border-gray-200 dark:border-dark-border"
        )}
        aria-label={value ? `Selected emoji: ${value}` : "Select an emoji"}
      >
        {value ? (
          <span className="text-xl">{value}</span>
        ) : (
          <FaceSmileIcon className="h-5 w-5 text-gray-400" />
        )}
      </button>

      {/* Dropdown picker */}
      {isOpen && (
        <div className="absolute z-50 mt-2 w-72 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-dark-border">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Icon
            </span>
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"
              >
                <XMarkIcon className="h-3 w-3" />
                Remove
              </button>
            )}
          </div>

          {/* Category tabs */}
          <div className="flex flex-wrap gap-1 px-2 py-2 border-b border-gray-200 dark:border-dark-border">
            {Object.keys(EMOJI_CATEGORIES).map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={clsx(
                  "px-2 py-0.5 text-xs rounded-full transition-colors",
                  activeCategory === category
                    ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-elevated"
                )}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Emoji grid */}
          <div className="p-2 max-h-48 overflow-y-auto">
            <div className="grid grid-cols-5 gap-1">
              {EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES].map(
                (emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleSelect(emoji)}
                    className={clsx(
                      "flex items-center justify-center h-10 w-10 rounded-lg text-xl transition-all",
                      "hover:bg-gray-100 dark:hover:bg-dark-elevated",
                      value === emoji &&
                        "bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500"
                    )}
                    title={emoji}
                  >
                    {emoji}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmojiPicker;
