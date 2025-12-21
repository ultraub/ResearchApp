/**
 * DocumentCommentMark - TipTap extension for inline document comment highlighting
 *
 * This extension creates a mark that highlights text associated with document comments.
 * It supports different colors for resolved vs unresolved comments.
 */

import { Mark, mergeAttributes } from "@tiptap/core";

export interface DocumentCommentMarkOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentComment: {
      /**
       * Set a document comment mark
       */
      setDocumentComment: (attributes: {
        commentId: string;
        isResolved?: boolean;
      }) => ReturnType;
      /**
       * Toggle a document comment mark
       */
      toggleDocumentComment: (attributes: {
        commentId: string;
        isResolved?: boolean;
      }) => ReturnType;
      /**
       * Unset a document comment mark
       */
      unsetDocumentComment: () => ReturnType;
      /**
       * Update a document comment mark (e.g., when resolved)
       */
      updateDocumentComment: (
        commentId: string,
        attributes: { isResolved?: boolean }
      ) => ReturnType;
    };
  }
}

// Color mapping for comment states
const COMMENT_COLORS = {
  unresolved: {
    bg: "rgba(251, 191, 36, 0.25)", // amber-400 with opacity
    border: "rgb(251, 191, 36)", // amber-400
  },
  resolved: {
    bg: "rgba(34, 197, 94, 0.15)", // green-500 with opacity
    border: "rgb(34, 197, 94)", // green-500
  },
};

export const DocumentCommentMark = Mark.create<DocumentCommentMarkOptions>({
  name: "documentComment",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-doc-comment-id"),
        renderHTML: (attributes) => {
          if (!attributes.commentId) {
            return {};
          }
          return {
            "data-doc-comment-id": attributes.commentId,
          };
        },
      },
      isResolved: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-is-resolved") === "true",
        renderHTML: (attributes) => {
          return {
            "data-is-resolved": attributes.isResolved ? "true" : "false",
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-doc-comment-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const isResolved = HTMLAttributes["data-is-resolved"] === "true";
    const colors = isResolved ? COMMENT_COLORS.resolved : COMMENT_COLORS.unresolved;

    // Build inline styles for the highlight
    const style = [
      `background-color: ${colors.bg}`,
      `border-bottom: 2px solid ${colors.border}`,
      "cursor: pointer",
      "transition: background-color 0.15s ease, border-color 0.15s ease",
      "position: relative",
      "border-radius: 2px",
    ].join("; ");

    const className = isResolved
      ? "doc-comment-mark doc-comment-resolved"
      : "doc-comment-mark";

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
      setDocumentComment:
        (attributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      toggleDocumentComment:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, attributes);
        },
      unsetDocumentComment:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
      updateDocumentComment:
        (commentId, attributes) =>
        ({ tr, state, dispatch }) => {
          // Find and update all marks with matching commentId
          let updated = false;
          state.doc.descendants((node, pos) => {
            node.marks.forEach((mark) => {
              if (
                mark.type.name === this.name &&
                mark.attrs.commentId === commentId
              ) {
                if (dispatch) {
                  const newMark = mark.type.create({
                    ...mark.attrs,
                    ...attributes,
                  });
                  tr.removeMark(pos, pos + node.nodeSize, mark);
                  tr.addMark(pos, pos + node.nodeSize, newMark);
                  updated = true;
                }
              }
            });
          });
          return updated;
        },
    };
  },
});

/**
 * CSS styles for the document comment marks
 * Include these in your global styles or component
 */
export const documentCommentMarkStyles = `
  .doc-comment-mark {
    position: relative;
  }

  .doc-comment-mark:hover {
    filter: brightness(0.92);
  }

  /* Unresolved comment pulse animation on hover */
  .doc-comment-mark:not(.doc-comment-resolved):hover {
    background-color: rgba(251, 191, 36, 0.35) !important;
  }

  /* Resolved comment subtle styling */
  .doc-comment-resolved {
    opacity: 0.8;
  }

  .doc-comment-resolved:hover {
    opacity: 1;
  }

  /* Dark mode adjustments */
  .dark .doc-comment-mark:not(.doc-comment-resolved) {
    background-color: rgba(251, 191, 36, 0.3);
  }

  .dark .doc-comment-mark.doc-comment-resolved {
    background-color: rgba(34, 197, 94, 0.2);
  }

  /* Focus ring for accessibility */
  .doc-comment-mark:focus-visible {
    outline: 2px solid rgb(59, 130, 246);
    outline-offset: 1px;
  }
`;

export default DocumentCommentMark;
