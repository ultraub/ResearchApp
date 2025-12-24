/**
 * AI Chat Panel - Main chat interface.
 */

import { useState, useRef, useEffect, FormEvent, useCallback } from 'react';
import {
  X,
  Minus,
  Maximize2,
  Sparkles,
  Send,
  RotateCcw,
  MapPin,
  Loader2,
  Brain,
  Wrench,
  ChevronDown,
  ChevronRight,
  GripVertical,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, ToolActivity } from '../../../types/assistant';
import { ActionProposalCard } from './ActionProposalCard';

/**
 * Collapsible thinking section for AI reasoning (Gemini 3+).
 */
function ThinkingSection({ thinking }: { thinking: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      >
        <Brain className="h-3.5 w-3.5 text-purple-500" />
        <span>Thinking...</span>
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {isExpanded && (
        <div className="mt-2 ml-5 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <p className="text-xs text-purple-700 dark:text-purple-300 whitespace-pre-wrap font-mono">
            {thinking}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Format tool name for display (e.g., get_projects -> Get Projects)
 */
function formatToolName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Tool activity indicator showing what tools the AI is using.
 * Displays as compact inline chips that expand on click.
 */
function ToolActivitySection({ tools }: { tools: ToolActivity[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {tools.map((tool) => (
        <div key={tool.id} className="relative">
          <button
            onClick={() => setExpandedId(expandedId === tool.id ? null : tool.id)}
            className="inline-flex items-center gap-1.5 px-2 py-1 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border border-blue-200 dark:border-blue-700 rounded-full text-xs font-medium text-blue-700 dark:text-blue-300 hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/50 dark:hover:to-indigo-900/50 transition-all shadow-sm"
          >
            <Wrench className="h-3 w-3" />
            <span>{formatToolName(tool.tool)}</span>
            {Object.keys(tool.input).length > 0 && (
              <ChevronDown
                className={`h-3 w-3 transition-transform ${
                  expandedId === tool.id ? 'rotate-180' : ''
                }`}
              />
            )}
          </button>
          {expandedId === tool.id && Object.keys(tool.input).length > 0 && (
            <div className="absolute left-0 top-full mt-1 z-10 min-w-[200px] max-w-[300px] p-2 bg-white dark:bg-dark-card border border-blue-200 dark:border-blue-700 rounded-lg shadow-lg">
              <pre className="text-xs text-blue-600 dark:text-blue-400 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface AIChatPanelProps {
  isMinimized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  onSendMessage: (content: string) => Promise<void>;
  onApproveAction: (actionId: string) => Promise<void>;
  onRejectAction: (actionId: string, reason?: string) => Promise<void>;
  onClearMessages: () => void;
  contextLabel: string;
}

// Default and min/max dimensions
const DEFAULT_WIDTH = 500;
const DEFAULT_HEIGHT = 500;
const MIN_WIDTH = 350;
const MIN_HEIGHT = 300;
const MAX_WIDTH = 900;
const MAX_HEIGHT = 800;

// Storage key for persisting dimensions
const STORAGE_KEY = 'ai-chat-panel-dimensions';

function loadDimensions(): { width: number; height: number } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        width: Math.min(Math.max(parsed.width || DEFAULT_WIDTH, MIN_WIDTH), MAX_WIDTH),
        height: Math.min(Math.max(parsed.height || DEFAULT_HEIGHT, MIN_HEIGHT), MAX_HEIGHT),
      };
    }
  } catch {
    // Ignore errors
  }
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

function saveDimensions(width: number, height: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width, height }));
  } catch {
    // Ignore errors
  }
}

export function AIChatPanel({
  isMinimized,
  onClose,
  onMinimize,
  onMaximize,
  messages,
  isLoading,
  error,
  onSendMessage,
  onApproveAction,
  onRejectAction,
  onClearMessages,
  contextLabel,
}: AIChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Resize state
  const [dimensions, setDimensions] = useState(loadDimensions);
  const [isResizing, setIsResizing] = useState<'left' | 'top' | 'corner' | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  // Handle resize drag
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !resizeStartRef.current) return;

    const { x: startX, y: startY, width: startWidth, height: startHeight } = resizeStartRef.current;
    const deltaX = startX - e.clientX; // Inverted because we're resizing from left
    const deltaY = startY - e.clientY; // Inverted because we're resizing from top

    let newWidth = startWidth;
    let newHeight = startHeight;

    if (isResizing === 'left' || isResizing === 'corner') {
      newWidth = Math.min(Math.max(startWidth + deltaX, MIN_WIDTH), MAX_WIDTH);
    }
    if (isResizing === 'top' || isResizing === 'corner') {
      newHeight = Math.min(Math.max(startHeight + deltaY, MIN_HEIGHT), MAX_HEIGHT);
    }

    setDimensions({ width: newWidth, height: newHeight });
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      saveDimensions(dimensions.width, dimensions.height);
    }
    setIsResizing(null);
    resizeStartRef.current = null;
  }, [isResizing, dimensions]);

  // Add/remove global mouse event listeners for resize
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isResizing === 'corner' ? 'nwse-resize' : isResizing === 'left' ? 'ew-resize' : 'ns-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const startResize = (edge: 'left' | 'top' | 'corner') => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(edge);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: dimensions.width,
      height: dimensions.height,
    };
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (!isMinimized) {
      inputRef.current?.focus();
    }
  }, [isMinimized]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input;
    setInput('');
    await onSendMessage(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (isMinimized) {
    return (
      <div
        className="fixed bottom-24 right-6 z-50 bg-white dark:bg-dark-card rounded-lg shadow-xl border border-gray-200 dark:border-dark-border cursor-pointer hover:shadow-2xl transition-shadow"
        onClick={onMaximize}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="p-1.5 bg-gradient-to-br from-accent-500 to-accent-600 rounded-lg">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="font-medium text-gray-900 dark:text-white">AI Assistant</span>
          {messages.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {messages.length} messages
            </span>
          )}
          <Maximize2 className="h-4 w-4 text-gray-400 ml-2" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-24 right-6 z-50 bg-white dark:bg-dark-card rounded-xl shadow-2xl border border-gray-200 dark:border-dark-border flex flex-col overflow-hidden"
      style={{
        width: `min(${dimensions.width}px, calc(100vw - 3rem))`,
        height: `min(${dimensions.height}px, calc(100vh - 8rem))`,
      }}
    >
      {/* Resize handles - only visible on desktop */}
      {/* Left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-accent-500/20 transition-colors z-10 hidden md:block"
        onMouseDown={startResize('left')}
      />
      {/* Top edge */}
      <div
        className="absolute left-0 right-0 top-0 h-2 cursor-ns-resize hover:bg-accent-500/20 transition-colors z-10 hidden md:block"
        onMouseDown={startResize('top')}
      />
      {/* Top-left corner */}
      <div
        className="absolute left-0 top-0 w-4 h-4 cursor-nwse-resize z-20 hidden md:block group"
        onMouseDown={startResize('corner')}
      >
        <GripVertical className="h-3 w-3 text-gray-300 dark:text-gray-600 group-hover:text-accent-500 transition-colors rotate-45 absolute top-0.5 left-0.5" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-accent-50 to-accent-100 dark:from-accent-900/20 dark:to-accent-800/20">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-gradient-to-br from-accent-500 to-accent-600 rounded-lg shadow-soft">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white text-sm">
              AI Assistant
            </h3>
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <MapPin className="h-3 w-3" />
              <span>{contextLabel}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onClearMessages}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/50 dark:hover:bg-dark-elevated rounded-lg transition-all"
            title="Clear conversation"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={onMinimize}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/50 dark:hover:bg-dark-elevated rounded-lg transition-all"
            title="Minimize"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/50 dark:hover:bg-dark-elevated rounded-lg transition-all"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400">
            <Sparkles className="h-12 w-12 text-accent-400 mb-4" />
            <p className="font-medium text-gray-700 dark:text-gray-300">
              How can I help you?
            </p>
            <p className="text-sm mt-1">
              Ask me about your tasks, projects, or documents.
            </p>
            <div className="mt-4 space-y-2 text-sm">
              <button
                onClick={() => onSendMessage("What should I focus on today?")}
                className="block w-full px-4 py-2 text-left bg-gray-100 dark:bg-dark-elevated rounded-lg hover:bg-gray-200 dark:hover:bg-dark-border transition-colors"
              >
                What should I focus on today?
              </button>
              <button
                onClick={() => onSendMessage("Show me overdue tasks")}
                className="block w-full px-4 py-2 text-left bg-gray-100 dark:bg-dark-elevated rounded-lg hover:bg-gray-200 dark:hover:bg-dark-border transition-colors"
              >
                Show me overdue tasks
              </button>
              <button
                onClick={() => onSendMessage("What blockers need attention?")}
                className="block w-full px-4 py-2 text-left bg-gray-100 dark:bg-dark-elevated rounded-lg hover:bg-gray-200 dark:hover:bg-dark-border transition-colors"
              >
                What blockers need attention?
              </button>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id}>
              {/* Thinking indicator (Gemini 3+) */}
              {message.thinking && message.role === 'assistant' && (
                <ThinkingSection thinking={message.thinking} />
              )}

              {/* Tool activity indicator */}
              {message.toolActivity && message.toolActivity.length > 0 && message.role === 'assistant' && (
                <ToolActivitySection tools={message.toolActivity} />
              )}

              {/* Message bubble */}
              <div
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-accent-500 text-white'
                      : 'bg-gray-100 dark:bg-dark-elevated text-gray-900 dark:text-white'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content || (message.isStreaming ? '...' : '')}
                      </ReactMarkdown>
                      {message.isStreaming && (
                        <span className="inline-block w-2 h-4 ml-1 bg-gray-400 dark:bg-gray-500 animate-pulse" />
                      )}
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </div>

              {/* Action proposals */}
              {message.actions && message.actions.length > 0 && (
                <div className="mt-3 space-y-2">
                  {message.actions.map((action) => (
                    <ActionProposalCard
                      key={action.id}
                      action={action}
                      onApprove={() => onApproveAction(action.id)}
                      onReject={(reason) => onRejectAction(action.id, reason)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {/* Error message */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-dark-border p-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={1}
              className="w-full px-4 py-2 pr-10 bg-gray-100 dark:bg-dark-elevated border-0 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-accent-500 resize-none"
              style={{ minHeight: '40px', maxHeight: '120px' }}
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </form>
    </div>
  );
}
