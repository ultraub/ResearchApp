/**
 * BlockersSection - Display all open blockers grouped by impact level.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDownIcon, ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import type { BlockerSummary } from '@/types/dashboard';
import { IMPACT_COLORS } from '@/types/dashboard';

interface BlockersSectionProps {
  blockers: BlockerSummary[];
  totalCount: number;
}

interface BlockerRowProps {
  blocker: BlockerSummary;
}

function BlockerRow({ blocker }: BlockerRowProps) {
  const navigate = useNavigate();
  const impactColors = IMPACT_COLORS[blocker.impact_level as keyof typeof IMPACT_COLORS] || IMPACT_COLORS.medium;

  const handleClick = () => {
    navigate(`/projects/${blocker.project_id}/blockers/${blocker.id}`);
  };

  return (
    <div
      onClick={handleClick}
      className={clsx(
        'flex items-start gap-3 p-3 rounded-lg cursor-pointer',
        'bg-white dark:bg-dark-card',
        'hover:shadow-sm transition-all'
      )}
    >
      {/* Impact indicator */}
      <div className={clsx('flex-shrink-0 mt-0.5 h-2.5 w-2.5 rounded-full', impactColors.dot)} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-white truncate">
            {blocker.title}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="truncate">{blocker.project_name}</span>
          {blocker.blocked_items_count > 0 && (
            <>
              <span>•</span>
              <span>{blocker.blocked_items_count} blocked</span>
            </>
          )}
          {blocker.days_open > 0 && (
            <>
              <span>•</span>
              <span>{blocker.days_open}d open</span>
            </>
          )}
        </div>
      </div>

      {/* Impact badge */}
      <span
        className={clsx(
          'flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium capitalize',
          impactColors.bg,
          impactColors.text
        )}
      >
        {blocker.impact_level}
      </span>

      {/* Assignee */}
      {blocker.assignee_name && (
        <div
          className={clsx(
            'flex-shrink-0 flex items-center justify-center',
            'h-6 w-6 rounded-full text-xs font-medium',
            'bg-primary-100 text-primary-700',
            'dark:bg-primary-900/30 dark:text-primary-400'
          )}
          title={blocker.assignee_name}
        >
          {blocker.assignee_name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

export function BlockersSection({ blockers, totalCount }: BlockersSectionProps) {
  const [showAll, setShowAll] = useState(false);

  // Group blockers by impact level
  const criticalBlockers = blockers.filter(b => b.impact_level === 'critical');
  const highBlockers = blockers.filter(b => b.impact_level === 'high');
  const otherBlockers = blockers.filter(b => !['critical', 'high'].includes(b.impact_level));

  const hasOtherBlockers = otherBlockers.length > 0;

  if (totalCount === 0) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <ExclamationTriangleIcon className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Blockers</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
            <span className="text-2xl">✓</span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">No active blockers</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">All clear!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Blockers</h2>
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs font-medium">
            {totalCount}
          </span>
        </div>
      </div>

      {/* Critical blockers */}
      {criticalBlockers.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 mb-2">
            Critical ({criticalBlockers.length})
          </h3>
          <div className="space-y-2">
            {criticalBlockers.map(blocker => (
              <BlockerRow key={blocker.id} blocker={blocker} />
            ))}
          </div>
        </div>
      )}

      {/* High impact blockers */}
      {highBlockers.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-2">
            High Impact ({highBlockers.length})
          </h3>
          <div className="space-y-2">
            {highBlockers.map(blocker => (
              <BlockerRow key={blocker.id} blocker={blocker} />
            ))}
          </div>
        </div>
      )}

      {/* Other blockers (collapsible) */}
      {hasOtherBlockers && (
        <div>
          <button
            onClick={() => setShowAll(!showAll)}
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {showAll ? (
              <ChevronDownIcon className="h-3 w-3" />
            ) : (
              <ChevronRightIcon className="h-3 w-3" />
            )}
            Other ({otherBlockers.length})
          </button>
          {showAll && (
            <div className="space-y-2">
              {otherBlockers.map(blocker => (
                <BlockerRow key={blocker.id} blocker={blocker} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BlockersSection;
