/**
 * EmojiIcon - Styled emoji wrapper with consistent appearance across the app.
 * Provides warm, playful emoji containers with optional accent styling.
 */

import { clsx } from 'clsx';

type EmojiSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type EmojiVariant = 'default' | 'accent' | 'success' | 'warning' | 'error' | 'info';

interface EmojiIconProps {
  /** The emoji character to display */
  emoji: string;
  /** Size of the icon container */
  size?: EmojiSize;
  /** Color variant */
  variant?: EmojiVariant;
  /** Whether to show the background container */
  showBackground?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Accessible label for screen readers */
  label?: string;
}

const sizeClasses: Record<EmojiSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
};

const containerSizeClasses: Record<EmojiSize, string> = {
  xs: 'h-5 w-5',
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
  xl: 'h-12 w-12',
};

const variantClasses: Record<EmojiVariant, string> = {
  default: 'bg-gray-100 dark:bg-dark-elevated',
  accent: 'bg-gradient-to-br from-accent-100 to-accent-50 dark:from-accent-900/30 dark:to-accent-900/10',
  success: 'bg-gradient-to-br from-success-100 to-success-50 dark:from-success-900/30 dark:to-success-900/10',
  warning: 'bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-900/10',
  error: 'bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/30 dark:to-red-900/10',
  info: 'bg-gradient-to-br from-info-100 to-info-50 dark:from-info-900/30 dark:to-info-900/10',
};

export function EmojiIcon({
  emoji,
  size = 'md',
  variant = 'default',
  showBackground = true,
  className,
  label,
}: EmojiIconProps) {
  if (!showBackground) {
    return (
      <span
        className={clsx(sizeClasses[size], className)}
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={!label}
      >
        {emoji}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center rounded-lg transition-transform',
        containerSizeClasses[size],
        variantClasses[variant],
        className
      )}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={!label}
    >
      <span className={sizeClasses[size]}>{emoji}</span>
    </span>
  );
}

/** Pre-configured emoji icons for common use cases */
export const TaskTypeEmojis: Record<string, string> = {
  general: '📋',
  paper_review: '📄',
  data_analysis: '📊',
  writing: '✍️',
  meeting: '📅',
  idea: '💡',
  bug: '🐛',
  feature: '✨',
  refactor: '🔧',
  docs: '📝',
};

export const StatusEmojis: Record<string, string> = {
  todo: '📌',
  in_progress: '🔄',
  in_review: '👀',
  done: '✅',
  blocked: '🚫',
  idea: '💡',
};

export const PriorityEmojis: Record<string, string> = {
  low: '🔵',
  medium: '🟡',
  high: '🟠',
  urgent: '🔴',
};

export default EmojiIcon;
