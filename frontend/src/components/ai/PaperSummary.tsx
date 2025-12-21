/**
 * Paper AI Summary component.
 * Provides AI-powered paper summarization with different summary types.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileText,
  Beaker,
  Lightbulb,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import * as aiService from '../../services/ai';
import type { SummaryType } from '../../types/ai';

interface PaperSummaryProps {
  paperId: string;
  paperTitle: string;
  existingSummary?: string | null;
  onSummaryGenerated?: (summary: string) => void;
}

const SUMMARY_TYPES: { type: SummaryType; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  {
    type: 'general',
    label: 'General',
    description: 'Overall summary of the paper',
    icon: FileText,
  },
  {
    type: 'methods',
    label: 'Methods',
    description: 'Focus on methodology and approach',
    icon: Beaker,
  },
  {
    type: 'findings',
    label: 'Findings',
    description: 'Key results and conclusions',
    icon: Lightbulb,
  },
];

export function PaperSummary({
  paperId,
  paperTitle,
  existingSummary,
  onSummaryGenerated,
}: PaperSummaryProps) {
  const [selectedType, setSelectedType] = useState<SummaryType>('general');
  const [summary, setSummary] = useState(existingSummary || '');
  const [isExpanded, setIsExpanded] = useState(!!existingSummary);
  const queryClient = useQueryClient();

  const summarizeMutation = useMutation({
    mutationFn: async () => {
      const response = await aiService.summarizePaper({
        paper_id: paperId,
        summary_type: selectedType,
      });
      return response;
    },
    onSuccess: (response) => {
      setSummary(response.summary);
      setIsExpanded(true);
      onSummaryGenerated?.(response.summary);
      queryClient.invalidateQueries({ queryKey: ['papers'] });
      toast.success('Summary generated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to generate summary');
    },
  });

  return (
    <div className="border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden shadow-soft transition-all hover:shadow-md">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-accent-50 to-accent-100 dark:from-accent-900/20 dark:to-accent-800/20 hover:from-accent-100 hover:to-accent-200 dark:hover:from-accent-900/30 dark:hover:to-accent-800/30 transition-all"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-600 dark:text-accent-400" />
          <span className="text-sm font-medium text-accent-700 dark:text-accent-300">
            AI Summary
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-accent-600 dark:text-accent-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-accent-600 dark:text-accent-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Summary type selection */}
          <div className="flex flex-wrap gap-2">
            {SUMMARY_TYPES.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                  selectedType === type
                    ? 'bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-soft'
                    : 'bg-gray-100 dark:bg-dark-elevated text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-base'
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Generate button */}
          <button
            onClick={() => summarizeMutation.mutate()}
            disabled={summarizeMutation.isPending}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-gradient-to-br from-accent-500 to-accent-600 text-white rounded-xl hover:shadow-md disabled:opacity-50 transition-all"
          >
            {summarizeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : summary ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Regenerate {SUMMARY_TYPES.find((t) => t.type === selectedType)?.label} Summary
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate {SUMMARY_TYPES.find((t) => t.type === selectedType)?.label} Summary
              </>
            )}
          </button>

          {/* Summary display */}
          {summary && (
            <div className="p-3 bg-gray-50 dark:bg-dark-elevated rounded-xl">
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {summary}
              </p>
            </div>
          )}

          {/* Empty state */}
          {!summary && !summarizeMutation.isPending && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
              Click generate to create an AI summary of "{paperTitle.substring(0, 50)}
              {paperTitle.length > 50 ? '...' : ''}"
            </p>
          )}
        </div>
      )}
    </div>
  );
}
