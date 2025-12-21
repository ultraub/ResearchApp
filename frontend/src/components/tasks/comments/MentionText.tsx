/**
 * MentionText - Renders comment content with highlighted @mentions
 */

import type { MentionInfo } from "@/types";

interface MentionTextProps {
  content: string;
  mentions?: MentionInfo[];
  className?: string;
}

export default function MentionText({
  content,
  mentions = [],
  className = "",
}: MentionTextProps) {
  // Create a map of mentioned usernames/emails to their info
  const mentionMap = new Map<string, MentionInfo>();
  mentions.forEach((mention) => {
    if (mention.user_email) {
      mentionMap.set(mention.user_email.toLowerCase(), mention);
      // Also add the part before @ for partial matching
      const username = mention.user_email.split("@")[0];
      mentionMap.set(username.toLowerCase(), mention);
    }
    if (mention.user_name) {
      mentionMap.set(mention.user_name.toLowerCase(), mention);
    }
  });

  // Parse content and replace @mentions with styled spans
  const parseContent = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    // Match @username patterns
    const mentionPattern = /@([\w.@+-]+)/g;
    let lastIndex = 0;
    let match;

    while ((match = mentionPattern.exec(text)) !== null) {
      // Add text before the mention
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      const mentionText = match[1];
      const mentionInfo = mentionMap.get(mentionText.toLowerCase());

      if (mentionInfo) {
        // Highlighted mention
        parts.push(
          <span
            key={`mention-${match.index}`}
            className="inline-flex items-center rounded bg-primary-100 px-1 py-0.5 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-400"
            title={mentionInfo.user_email || undefined}
          >
            @{mentionInfo.user_name || mentionText}
          </span>
        );
      } else {
        // Unrecognized @ pattern - still style it but differently
        parts.push(
          <span
            key={`mention-${match.index}`}
            className="text-gray-600 dark:text-gray-400"
          >
            @{mentionText}
          </span>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  // Handle newlines in content
  const lines = content.split("\n");

  return (
    <span className={className}>
      {lines.map((line, lineIndex) => (
        <span key={lineIndex}>
          {parseContent(line)}
          {lineIndex < lines.length - 1 && <br />}
        </span>
      ))}
    </span>
  );
}
