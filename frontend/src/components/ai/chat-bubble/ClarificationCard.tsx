/**
 * ClarificationCard - Displays a clarification request from the AI assistant.
 *
 * Shows a question with optional structured choices and a free-form input.
 * When answered, displays a compact summary of the question and response.
 */

import { useState } from 'react';
import { HelpCircle, Send, X, ChevronRight, CheckCircle } from 'lucide-react';
import type { ClarificationRequest, ClarificationOption } from '../../../types/assistant';

interface ClarificationCardProps {
  clarification: ClarificationRequest;
  onRespond: (response: string) => void;
  onDismiss?: () => void;
  isLoading?: boolean;
}

export function ClarificationCard({
  clarification,
  onRespond,
  onDismiss,
  isLoading = false,
}: ClarificationCardProps) {
  const [customInput, setCustomInput] = useState('');
  const hasOptions = clarification.options.length > 0;

  // Show compact answered state
  if (clarification.status === 'answered') {
    return (
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
          <span className="truncate">
            <span className="font-medium">Q:</span> {clarification.question}
          </span>
        </div>
        {clarification.userResponse && (
          <div className="mt-1 text-sm text-gray-700 dark:text-gray-300 pl-6">
            <span className="font-medium">A:</span> {clarification.userResponse}
          </div>
        )}
      </div>
    );
  }

  const handleOptionClick = (option: ClarificationOption) => {
    if (isLoading) return;
    // Send the option label as the user's response
    onRespond(option.label);
  };

  const handleCustomSubmit = () => {
    if (!customInput.trim() || isLoading) return;
    onRespond(customInput.trim());
    setCustomInput('');
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-100 dark:bg-amber-800/50 rounded-lg">
            <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Clarification Needed
          </span>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 rounded transition-colors"
            title="Skip this question"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Reason (if provided) */}
      {clarification.reason && (
        <p className="text-xs text-amber-600 dark:text-amber-400 italic">
          {clarification.reason}
        </p>
      )}

      {/* Question */}
      <p className="text-sm text-amber-900 dark:text-amber-100">
        {clarification.question}
      </p>

      {/* Options */}
      {hasOptions && (
        <div className="space-y-2">
          {clarification.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleOptionClick(option)}
              disabled={isLoading}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-white dark:bg-dark-elevated border border-amber-200 dark:border-amber-700 rounded-lg text-left hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 dark:text-white block">
                  {option.label}
                </span>
                {option.description && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 block truncate">
                    {option.description}
                  </span>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 flex-shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      )}

      {/* Custom input - always shown for "Other" option or if no options */}
      <div className="pt-2 border-t border-amber-200 dark:border-amber-700">
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
          {hasOptions ? 'Or type your own response:' : 'Your response:'}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
            placeholder="Type a response..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 bg-white dark:bg-dark-elevated border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleCustomSubmit}
            disabled={!customInput.trim() || isLoading}
            className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
