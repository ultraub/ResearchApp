/**
 * AI Chat Bubble - Main container component.
 * Floating chat interface for the AI assistant.
 */

import { useEffect } from 'react';
import { useChatBubble } from '../../../hooks/useChatBubble';
import { AIChatBubbleButton } from './AIChatBubbleButton';
import { AIChatPanel } from './AIChatPanel';

export function AIChatBubble() {
  const chatBubble = useChatBubble();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape' && chatBubble.isOpen) {
        chatBubble.close();
      }
      // Cmd/Ctrl + Shift + A to toggle
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'a') {
        e.preventDefault();
        chatBubble.toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chatBubble.isOpen, chatBubble.close, chatBubble.toggle]);

  return (
    <>
      {/* Floating button - always visible */}
      <AIChatBubbleButton
        onClick={chatBubble.toggle}
        isOpen={chatBubble.isOpen}
        hasUnreadActions={chatBubble.pendingActions.filter((a) => a.status === 'pending').length > 0}
      />

      {/* Chat panel - shown when open */}
      {chatBubble.isOpen && (
        <AIChatPanel
          isMinimized={chatBubble.isMinimized}
          onClose={chatBubble.close}
          onMinimize={chatBubble.minimize}
          onMaximize={chatBubble.maximize}
          messages={chatBubble.messages}
          isLoading={chatBubble.isLoading}
          error={chatBubble.error}
          onSendMessage={chatBubble.sendMessage}
          onApproveAction={chatBubble.approveAction}
          onRejectAction={chatBubble.rejectAction}
          onClearMessages={chatBubble.clearMessages}
          contextLabel={chatBubble.contextLabel}
          pageContext={chatBubble.pageContext}
        />
      )}
    </>
  );
}
