/**
 * Comment Input - Textarea for adding new comments with @mention support
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import MentionAutocomplete from "./MentionAutocomplete";
import type { OrganizationMember } from "@/services/users";

interface CommentInputProps {
  onSubmit: (content: string) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
}

export default function CommentInput({
  onSubmit,
  onCancel,
  isSubmitting,
  placeholder = "Write a comment... (use @ to mention)",
  autoFocus,
  compact,
}: CommentInputProps) {
  const [content, setContent] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [content]);

  const handleSubmit = () => {
    if (!content.trim() || isSubmitting) return;
    onSubmit(content.trim());
    setContent("");
    setShowMentions(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  // Calculate position for mention dropdown
  const calculateMentionPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return { top: 0, left: 0 };

    const rect = textarea.getBoundingClientRect();
    const cursorPosition = textarea.selectionStart;

    // Create a hidden div to measure text
    const measureDiv = document.createElement("div");
    let lines = 1;

    try {
      measureDiv.style.cssText = `
        position: absolute;
        visibility: hidden;
        white-space: pre-wrap;
        word-wrap: break-word;
        font: ${getComputedStyle(textarea).font};
        width: ${textarea.clientWidth}px;
        padding: ${getComputedStyle(textarea).padding};
      `;
      measureDiv.textContent = content.slice(0, cursorPosition);
      document.body.appendChild(measureDiv);

      lines = measureDiv.clientHeight / parseFloat(getComputedStyle(textarea).lineHeight);
      document.body.removeChild(measureDiv);
    } catch (error) {
      // Suppress DOM manipulation errors (often caused by browser extensions)
      console.debug("Suppressed DOM measurement error:", error);
    }

    return {
      top: rect.top + Math.min(lines, 3) * parseFloat(getComputedStyle(textarea).lineHeight) + 20,
      left: rect.left + 10,
    };
  }, [content]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPosition = e.target.selectionStart;
    setContent(newContent);

    // Check for @ trigger
    const textBeforeCursor = newContent.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // Show mentions if there's an @ and no space after it (or it's at the end)
      if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
        setMentionQuery(textAfterAt);
        setMentionStartIndex(lastAtIndex);
        setMentionPosition(calculateMentionPosition());
        setShowMentions(true);
        return;
      }
    }

    setShowMentions(false);
    setMentionQuery("");
    setMentionStartIndex(-1);
  };

  const handleMentionSelect = (member: OrganizationMember) => {
    if (mentionStartIndex === -1) return;

    const cursorPosition = textareaRef.current?.selectionStart || content.length;
    const beforeMention = content.slice(0, mentionStartIndex);
    const afterMention = content.slice(cursorPosition);

    // Use email for the mention (more reliable for lookup)
    const mentionText = `@${member.email} `;
    const newContent = beforeMention + mentionText + afterMention;

    setContent(newContent);
    setShowMentions(false);
    setMentionQuery("");
    setMentionStartIndex(-1);

    // Focus and move cursor after the mention
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = beforeMention.length + mentionText.length;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Close mentions on Escape
    if (e.key === "Escape" && showMentions) {
      e.preventDefault();
      setShowMentions(false);
      return;
    }

    // Submit on Cmd/Ctrl + Enter
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Cancel on Escape
    if (e.key === "Escape" && onCancel) {
      onCancel();
    }
  };

  return (
    <div className="relative">
      <div
        className={clsx(
          "rounded-xl border bg-white shadow-soft dark:bg-dark-card",
          "border-gray-300 dark:border-dark-border",
          "focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 transition-all"
        )}
      >
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={compact ? 2 : 3}
          className={clsx(
            "w-full resize-none border-0 bg-transparent px-3 py-2 text-sm",
            "text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400",
            "focus:outline-none focus:ring-0"
          )}
          disabled={isSubmitting}
        />
        <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 dark:border-dark-border">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            <kbd className="rounded bg-gray-100 px-1 dark:bg-gray-700">@</kbd> to mention ·{" "}
            <kbd className="rounded bg-gray-100 px-1 dark:bg-gray-700">Cmd</kbd>+
            <kbd className="rounded bg-gray-100 px-1 dark:bg-gray-700">Enter</kbd> to send
          </span>
          <div className="flex gap-2">
            {onCancel && (
              <button
                onClick={onCancel}
                className="rounded px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!content.trim() || isSubmitting}
              className={clsx(
                "flex items-center gap-1 rounded px-3 py-1 text-xs font-medium",
                "bg-primary-600 text-white hover:bg-primary-700",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSubmitting ? (
                <>
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Sending...
                </>
              ) : (
                <>
                  <PaperAirplaneIcon className="h-3 w-3" />
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mention autocomplete dropdown */}
      <MentionAutocomplete
        isOpen={showMentions}
        query={mentionQuery}
        position={mentionPosition}
        onSelect={handleMentionSelect}
        onClose={() => setShowMentions(false)}
      />
    </div>
  );
}
