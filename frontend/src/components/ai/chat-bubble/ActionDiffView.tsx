/**
 * Action Diff View - Shows old vs new state comparison.
 */

import { Plus, Minus, RefreshCw } from 'lucide-react';
import type { DiffEntry } from '../../../types/assistant';

interface ActionDiffViewProps {
  diff: DiffEntry[];
  oldState?: Record<string, unknown>;
  newState: Record<string, unknown>;
}

export function ActionDiffView({ diff, oldState: _oldState, newState: _newState }: ActionDiffViewProps) {
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '(none)';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  const getChangeIcon = (changeType: DiffEntry['changeType']) => {
    switch (changeType) {
      case 'added':
        return <Plus className="h-3 w-3 text-green-500" />;
      case 'removed':
        return <Minus className="h-3 w-3 text-red-500" />;
      case 'modified':
        return <RefreshCw className="h-3 w-3 text-amber-500" />;
    }
  };

  const getChangeStyles = (changeType: DiffEntry['changeType']) => {
    switch (changeType) {
      case 'added':
        return {
          bg: 'bg-green-50 dark:bg-green-900/20',
          border: 'border-green-200 dark:border-green-800',
          label: 'text-green-600 dark:text-green-400',
        };
      case 'removed':
        return {
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          label: 'text-red-600 dark:text-red-400',
        };
      case 'modified':
        return {
          bg: 'bg-amber-50 dark:bg-amber-900/20',
          border: 'border-amber-200 dark:border-amber-800',
          label: 'text-amber-600 dark:text-amber-400',
        };
    }
  };

  if (diff.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 italic">
        No changes to preview
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {diff.map((entry, index) => {
        const styles = getChangeStyles(entry.changeType);
        return (
          <div
            key={`${entry.field}-${index}`}
            className={`rounded-lg border ${styles.border} ${styles.bg} p-2`}
          >
            {/* Field name with change icon */}
            <div className="flex items-center gap-1.5 mb-1">
              {getChangeIcon(entry.changeType)}
              <span className={`text-xs font-medium ${styles.label}`}>
                {formatFieldName(entry.field)}
              </span>
            </div>

            {/* Values */}
            <div className="space-y-1 text-sm">
              {entry.changeType === 'modified' && entry.oldValue !== undefined && (
                <div className="flex items-start gap-2">
                  <span className="text-red-400 dark:text-red-500 font-mono text-xs">-</span>
                  <span className="text-gray-500 dark:text-gray-400 line-through break-all">
                    {formatValue(entry.oldValue)}
                  </span>
                </div>
              )}
              {entry.changeType === 'removed' && entry.oldValue !== undefined && (
                <div className="flex items-start gap-2">
                  <span className="text-red-400 dark:text-red-500 font-mono text-xs">-</span>
                  <span className="text-gray-500 dark:text-gray-400 line-through break-all">
                    {formatValue(entry.oldValue)}
                  </span>
                </div>
              )}
              {(entry.changeType === 'added' || entry.changeType === 'modified') && (
                <div className="flex items-start gap-2">
                  <span className="text-green-400 dark:text-green-500 font-mono text-xs">+</span>
                  <span className="text-gray-900 dark:text-white break-all">
                    {formatValue(entry.newValue)}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Format field name for display.
 */
function formatFieldName(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
