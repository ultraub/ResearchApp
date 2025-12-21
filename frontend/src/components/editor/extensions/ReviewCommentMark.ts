/**
 * ReviewCommentMark - TipTap extension for inline review comment highlighting
 *
 * This extension creates a mark that highlights text associated with review comments.
 * It supports different colors based on comment severity and shows visual indicators
 * for AI vs human comments.
 */

import { Mark, mergeAttributes } from "@tiptap/core";

export interface ReviewCommentMarkOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    reviewComment: {
      /**
       * Set a review comment mark
       */
      setReviewComment: (attributes: {
        commentId: string;
        severity?: "critical" | "major" | "minor" | "suggestion";
        isAI?: boolean;
      }) => ReturnType;
      /**
       * Toggle a review comment mark
       */
      toggleReviewComment: (attributes: {
        commentId: string;
        severity?: "critical" | "major" | "minor" | "suggestion";
        isAI?: boolean;
      }) => ReturnType;
      /**
       * Unset a review comment mark
       */
      unsetReviewComment: () => ReturnType;
    };
  }
}

// Color mapping for different severities
const SEVERITY_COLORS: Record<string, { bg: string; border: string }> = {
  critical: {
    bg: "rgba(239, 68, 68, 0.2)", // red-500 with opacity
    border: "rgb(239, 68, 68)",
  },
  major: {
    bg: "rgba(249, 115, 22, 0.2)", // orange-500 with opacity
    border: "rgb(249, 115, 22)",
  },
  minor: {
    bg: "rgba(234, 179, 8, 0.2)", // yellow-500 with opacity
    border: "rgb(234, 179, 8)",
  },
  suggestion: {
    bg: "rgba(59, 130, 246, 0.2)", // blue-500 with opacity
    border: "rgb(59, 130, 246)",
  },
};

// AI indicator color (purple accent)
const AI_INDICATOR_COLOR = "rgb(168, 85, 247)"; // purple-500

export const ReviewCommentMark = Mark.create<ReviewCommentMarkOptions>({
  name: "reviewComment",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes) => {
          if (!attributes.commentId) {
            return {};
          }
          return {
            "data-comment-id": attributes.commentId,
          };
        },
      },
      severity: {
        default: "minor",
        parseHTML: (element) => element.getAttribute("data-severity") || "minor",
        renderHTML: (attributes) => {
          return {
            "data-severity": attributes.severity || "minor",
          };
        },
      },
      isAI: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-is-ai") === "true",
        renderHTML: (attributes) => {
          return {
            "data-is-ai": attributes.isAI ? "true" : "false",
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-comment-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const severity = HTMLAttributes["data-severity"] || "minor";
    const isAI = HTMLAttributes["data-is-ai"] === "true";
    const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS.minor;

    // Build inline styles for the highlight
    const style = [
      `background-color: ${colors.bg}`,
      `border-bottom: 2px solid ${colors.border}`,
      "cursor: pointer",
      "transition: background-color 0.15s ease",
      "position: relative",
    ].join("; ");

    // Add AI indicator if needed
    const className = isAI ? "review-comment-mark review-comment-ai" : "review-comment-mark";

    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: className,
        style,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setReviewComment:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      toggleReviewComment:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attributes);
        },
      unsetReviewComment:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});

/**
 * CSS styles for the review comment marks
 * Include these in your global styles or component
 */
export const reviewCommentMarkStyles = `
  .review-comment-mark {
    position: relative;
  }

  .review-comment-mark:hover {
    filter: brightness(0.95);
  }

  /* AI indicator - small purple dot in top-right corner */
  .review-comment-ai::after {
    content: '';
    position: absolute;
    top: -2px;
    right: -2px;
    width: 6px;
    height: 6px;
    background-color: ${AI_INDICATOR_COLOR};
    border-radius: 50%;
    border: 1px solid white;
  }

  /* Severity-specific styles for dark mode */
  .dark .review-comment-mark[data-severity="critical"] {
    background-color: rgba(239, 68, 68, 0.3);
  }

  .dark .review-comment-mark[data-severity="major"] {
    background-color: rgba(249, 115, 22, 0.3);
  }

  .dark .review-comment-mark[data-severity="minor"] {
    background-color: rgba(234, 179, 8, 0.3);
  }

  .dark .review-comment-mark[data-severity="suggestion"] {
    background-color: rgba(59, 130, 246, 0.3);
  }
`;

export default ReviewCommentMark;
