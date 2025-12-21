/**
 * DocumentCommentInput - Textarea for document comments with @mention support
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { PaperAirplaneIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import MentionAutocomplete from "@/components/tasks/comments/MentionAutocomplete";
import type { OrganizationMember } from "@/services/users";

interface DocumentCommentInputProps {
  onSubmit: (content: string) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  /** Initial content for editing */
  initialContent?: string;
  /** Show selected text quote if inline comment */
  selectedText?: string;
}

export function DocumentCommentInput({
  onSubmit,
  onCancel,
  isSubmitting,
  placeholder = "Write a comment... (use @ to mention)",
  autoFocus,
  compact,
  initialContent = "",
  selectedText,
}: DocumentCommentInputProps) {
  const [content, setContent] = useState(initialContent);
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

    const lines =
      measureDiv.clientHeight /
      parseFloat(getComputedStyle(textarea).lineHeight);
    document.body.removeChild(measureDiv);

    return {
      top:
        rect.top +
        Math.min(lines, 3) * parseFloat(getComputedStyle(textarea).lineHeight) +
        20,
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
      // Check if we're in a mention (no space after @)
      if (!/\s/.test(textAfterAt)) {
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

    // Replace @query with @email
    const beforeMention = content.slice(0, mentionStartIndex);
    const afterMention = content.slice(
      mentionStartIndex + 1 + mentionQuery.length
    );
    const mentionText = `@${member.email} `;
    const newContent = beforeMention + mentionText + afterMention;

    setContent(newContent);
    setShowMentions(false);
    setMentionQuery("");
    setMentionStartIndex(-1);

    // Focus back on textarea
    if (textareaRef.current) {
      const newCursorPosition = mentionStartIndex + mentionText.length;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        newCursorPosition,
        newCursorPosition
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      if (showMentions) {
        setShowMentions(false);
      } else if (onCancel) {
        onCancel();
      }
    }
  };

  return (
    <div className="relative">
      {/* Selected text quote for inline comments */}
      {selectedText && (
        <div className="mb-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 rounded-r text-sm text-gray-700 dark:text-gray-300">
          <span className="text-gray-500 dark:text-gray-400 mr-1">
            Commenting on:
          </span>
          "{selectedText}"
        </div>
      )}

      <div
        className={clsx(
          "flex items-start gap-2 bg-white dark:bg-dark-card rounded-lg border border-gray-200 dark:border-dark-border transition-all focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20",
          compact ? "p-2" : "p-3"
        )}
      >
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className={clsx(
            "flex-1 resize-none bg-transparent text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none",
            compact ? "text-sm" : "text-sm"
          )}
        />
        <div className="flex items-center gap-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!content.trim() || isSubmitting}
            className={clsx(
              "p-1.5 rounded transition-all",
              content.trim() && !isSubmitting
                ? "text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
            )}
          >
            <PaperAirplaneIcon className="w-4 h-4" />
          </button>
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

      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
        Press Cmd+Enter to submit, Escape to cancel
      </p>
    </div>
  );
}

export default DocumentCommentInput;
