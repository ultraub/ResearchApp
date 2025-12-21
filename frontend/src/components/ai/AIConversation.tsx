/**
 * AI Conversation component for chat-based document assistance.
 */

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Send,
  Loader2,
  Bot,
  User,
  Copy,
  Check,
  Plus,
  Trash2,
  MessageSquare,
} from 'lucide-react';
import * as aiService from '../../services/ai';
import type { AIConversationMessage } from '../../types/ai';

interface AIConversationProps {
  documentId: string;
  documentContent: string;
  selectedText?: string;
  onInsertContent?: (content: string) => void;
}

function AIMessage({
  message,
  onCopy,
  onInsert,
}: {
  message: AIConversationMessage;
  onCopy?: (content: string) => void;
  onInsert?: (content: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isAssistant = message.role === 'assistant';

  const handleCopy = () => {
    onCopy?.(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex gap-3 ${isAssistant ? '' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
          isAssistant ? 'bg-gradient-to-br from-accent-500 to-accent-600' : 'bg-gray-200 dark:bg-dark-elevated'
        }`}
      >
        {isAssistant ? (
          <Bot className="h-4 w-4 text-white" />
        ) : (
          <User className="h-4 w-4 text-gray-600 dark:text-gray-400" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isAssistant ? '' : 'text-right'}`}>
        <div
          className={`inline-block max-w-full rounded-xl px-3 py-2 ${
            isAssistant ? 'bg-gray-100 dark:bg-dark-elevated text-gray-900 dark:text-white' : 'bg-gradient-to-br from-accent-500 to-accent-600 text-white'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        </div>

        {/* Actions for assistant messages */}
        {isAssistant && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
            </span>
            <button
              onClick={handleCopy}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
              title="Copy"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
            {onInsert && (
              <button
                onClick={() => onInsert(message.content)}
                className="p-1 text-gray-400 hover:text-accent-600 dark:hover:text-accent-400 rounded transition-colors"
                title="Insert into document"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Timestamp for user messages */}
        {!isAssistant && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
          </p>
        )}
      </div>
    </div>
  );
}

function StreamingMessage({ content }: { content: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="inline-block max-w-full rounded-xl px-3 py-2 bg-gray-100 dark:bg-dark-elevated text-gray-900 dark:text-white">
          <p className="text-sm whitespace-pre-wrap break-words">
            {content}
            <span className="inline-block w-2 h-4 bg-accent-500 animate-pulse ml-0.5" />
          </p>
        </div>
      </div>
    </div>
  );
}

export function AIConversation({
  documentId,
  documentContent,
  selectedText,
  onInsertContent,
}: AIConversationProps) {
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch conversation if we have an ID
  const { data: conversation } = useQuery({
    queryKey: ['ai-conversation', conversationId],
    queryFn: () => aiService.getConversation(conversationId!),
    enabled: !!conversationId,
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages, streamingContent]);

  const createConversationMutation = useMutation({
    mutationFn: async (message: string) => {
      const conv = await aiService.createConversation({
        feature_name: 'document_assistant',
        context_type: 'document',
        context_id: documentId,
        initial_message: message,
      });
      return conv;
    },
    onSuccess: (conv) => {
      setConversationId(conv.id);
      queryClient.setQueryData(['ai-conversation', conv.id], conv);
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!conversationId) {
        throw new Error('No active conversation');
      }
      return aiService.addMessage(conversationId, { content: message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversation', conversationId] });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async () => {
      if (!conversationId) return;
      await aiService.deleteConversation(conversationId);
    },
    onSuccess: () => {
      setConversationId(null);
      queryClient.removeQueries({ queryKey: ['ai-conversation', conversationId] });
    },
  });

  const handleCopy = async (content: string) => {
    await navigator.clipboard.writeText(content);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const message = input.trim();
    setInput('');

    try {
      if (!conversationId) {
        // Create new conversation
        setIsStreaming(true);
        setStreamingContent('');

        // Stream the response
        const generator = aiService.generateStream({
          template_key: 'document_chat',
          variables: {
            document_content: documentContent.substring(0, 4000),
            selected_text: selectedText,
            user_message: message,
          },
          context_type: 'document',
          context_id: documentId,
          stream: true,
        });

        let content = '';
        for await (const chunk of generator) {
          content += chunk;
          setStreamingContent(content);
        }

        // Create conversation with the message
        await createConversationMutation.mutateAsync(message);
        setStreamingContent('');
      } else {
        // Add message to existing conversation
        setIsStreaming(true);
        setStreamingContent('');

        const generator = aiService.generateStream({
          template_key: 'document_chat',
          variables: {
            document_content: documentContent.substring(0, 4000),
            selected_text: selectedText,
            user_message: message,
            conversation_history: conversation?.messages
              .slice(-10)
              .map((m) => `${m.role}: ${m.content}`)
              .join('\n'),
          },
          context_type: 'document',
          context_id: documentId,
          stream: true,
        });

        let content = '';
        for await (const chunk of generator) {
          content += chunk;
          setStreamingContent(content);
        }

        await sendMessageMutation.mutateAsync(message);
        setStreamingContent('');
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsStreaming(false);
    }
  };

  const messages = conversation?.messages || [];

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streamingContent && (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400">
            <MessageSquare className="h-12 w-12 mb-3 text-gray-300 dark:text-gray-600" />
            <p className="font-medium">Start a conversation</p>
            <p className="text-sm mt-1">
              Ask questions about your document or get AI assistance
            </p>
            {selectedText && (
              <p className="text-xs text-accent-600 dark:text-accent-400 mt-3">
                Selected text will be included in context
              </p>
            )}
          </div>
        )}

        {messages.map((message) => (
          <AIMessage
            key={message.id}
            message={message}
            onCopy={handleCopy}
            onInsert={onInsertContent}
          />
        ))}

        {streamingContent && <StreamingMessage content={streamingContent} />}

        <div ref={messagesEndRef} />
      </div>

      {/* Clear conversation */}
      {conversationId && messages.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-200 dark:border-dark-border">
          <button
            onClick={() => deleteConversationMutation.mutate()}
            disabled={deleteConversationMutation.isPending}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            Clear conversation
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-gray-200 dark:border-dark-border">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your document..."
            disabled={isStreaming}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent disabled:bg-gray-50 dark:disabled:bg-dark-elevated bg-white dark:bg-dark-card dark:text-white transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="px-3 py-2 bg-gradient-to-br from-accent-500 to-accent-600 text-white rounded-xl hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
