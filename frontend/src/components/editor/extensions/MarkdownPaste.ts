import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { marked } from 'marked';

// Configure marked for safe HTML output
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert \n to <br>
});

/**
 * Detects if text appears to be markdown based on common patterns
 */
function looksLikeMarkdown(text: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s+.+/m,           // Headings: # Header
    /\*\*[^*]+\*\*/,           // Bold: **text**
    /\*[^*]+\*/,               // Italic: *text*
    /__[^_]+__/,               // Bold: __text__
    /_[^_]+_/,                 // Italic: _text_
    /`[^`]+`/,                 // Inline code: `code`
    /```[\s\S]*?```/,          // Code blocks: ```code```
    /^\s*[-*+]\s+.+/m,         // Unordered list: - item
    /^\s*\d+\.\s+.+/m,         // Ordered list: 1. item
    /^\s*>\s+.+/m,             // Blockquote: > quote
    /\[.+\]\(.+\)/,            // Links: [text](url)
    /!\[.*\]\(.+\)/,           // Images: ![alt](url)
    /^\s*\|.+\|/m,             // Tables: | col |
    /^\s*[-*_]{3,}\s*$/m,      // Horizontal rule: ---
    /~~[^~]+~~/,               // Strikethrough: ~~text~~
    /^\s*-\s+\[[ x]\]\s+/m,    // Task list: - [ ] item
  ];

  // Count how many patterns match
  const matchCount = markdownPatterns.filter(pattern => pattern.test(text)).length;

  // Consider it markdown if 2+ patterns match, or if it has multiple headings/lists
  return matchCount >= 2;
}

/**
 * TipTap extension that handles pasting markdown content
 * Converts markdown to HTML and inserts it as rich text
 */
export const MarkdownPaste = Extension.create({
  name: 'markdownPaste',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('markdownPaste'),
        props: {
          handlePaste(_view, event) {
            const clipboardData = event.clipboardData;
            if (!clipboardData) return false;

            // Get plain text from clipboard
            const text = clipboardData.getData('text/plain');
            if (!text) return false;

            // Check if clipboard has HTML - if so, let default handling work
            const html = clipboardData.getData('text/html');
            if (html && html.trim()) {
              // Has HTML content, use default paste behavior
              return false;
            }

            // Check if the plain text looks like markdown
            if (!looksLikeMarkdown(text)) {
              // Not markdown, use default paste behavior
              return false;
            }

            // Convert markdown to HTML
            const convertedHtml = marked.parse(text) as string;

            // Insert the HTML content into the editor
            editor.chain()
              .focus()
              .insertContent(convertedHtml, {
                parseOptions: {
                  preserveWhitespace: false,
                },
              })
              .run();

            // Prevent default paste behavior
            event.preventDefault();
            return true;
          },
        },
      }),
    ];
  },
});

export default MarkdownPaste;
