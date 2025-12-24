/**
 * AI Chat Bubble Button - Floating action button.
 */

import { Sparkles } from 'lucide-react';

interface AIChatBubbleButtonProps {
  onClick: () => void;
  isOpen: boolean;
  hasUnreadActions?: boolean;
}

export function AIChatBubbleButton({
  onClick,
  isOpen,
  hasUnreadActions = false,
}: AIChatBubbleButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        fixed z-50
        w-14 h-14 rounded-full
        bg-gradient-to-br from-accent-500 to-accent-600
        shadow-lg hover:shadow-xl
        flex items-center justify-center
        transition-all duration-200
        hover:scale-105 active:scale-95
        focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2
        ${isOpen ? 'opacity-50 hover:opacity-100 md:opacity-50 md:hover:opacity-100' : ''}
        ${isOpen ? 'hidden md:flex' : 'flex'}
        bottom-6 right-6
        safe-bottom
      `}
      style={{
        // Account for iOS safe area
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      title="AI Assistant (Cmd+Shift+A)"
      aria-label="Toggle AI Assistant"
    >
      <Sparkles className="h-6 w-6 text-white" />

      {/* Unread indicator */}
      {hasUnreadActions && !isOpen && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative text-[10px] font-bold text-white">!</span>
        </span>
      )}
    </button>
  );
}
