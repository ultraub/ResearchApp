/**
 * BlockersSection - Display all open blockers grouped by impact level.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  FolderIcon,
  ClockIcon,
  LinkIcon,
  CheckCircleIcon,
  ArrowUpIcon,
} from '@heroicons/react/24/outline';
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
    // Navigate to project with blocker query param to open blocker list modal
    navigate(`/projects/${blocker.project_id}?blocker=${blocker.id}`);
  };

  return (
    <div
      onClick={handleClick}
      className={clsx(
        'flex items-start gap-3 p-3 rounded-lg cursor-pointer border-l-4',
        impactColors.border,
        'bg-white dark:bg-dark-card',
        'hover:shadow-sm hover:bg-gray-50 dark:hover:bg-dark-elevated',
        'transition-all'
      )}
    >
      {/* Impact badge - prominent placement */}
      <span
        className={clsx(
          'flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold capitalize',
          impactColors.bg,
          impactColors.text
        )}
      >
        {blocker.impact_level}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-white line-clamp-1">
            {blocker.title}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
          {/* Project with folder icon */}
          <span className="flex items-center gap-1 truncate max-w-[140px]">
            <FolderIcon className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{blocker.project_name}</span>
          </span>

          {/* Days open with clock icon */}
          {blocker.days_open > 0 && (
            <span className="flex items-center gap-1 whitespace-nowrap">
              <ClockIcon className="h-3 w-3" />
              {blocker.days_open}d
            </span>
          )}

          {/* Blocked items count with link icon */}
          {blocker.blocked_items_count > 0 && (
            <span className="flex items-center gap-1 whitespace-nowrap text-amber-600 dark:text-amber-400">
              <LinkIcon className="h-3 w-3" />
              {blocker.blocked_items_count} blocked
            </span>
          )}
        </div>
      </div>

      {/* Assignee */}
      {blocker.assignee_name && (
        <div
          className={clsx(
            'flex-shrink-0 flex items-center justify-center',
            'h-7 w-7 rounded-full text-xs font-medium',
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

interface GroupHeaderProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  colors: (typeof IMPACT_COLORS)[keyof typeof IMPACT_COLORS];
  isCollapsible?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
}

function GroupHeader({ icon, label, count, colors, isCollapsible, isExpanded, onToggle }: GroupHeaderProps) {
  const content = (
    <div
      className={clsx(
        'flex items-center gap-2 px-3 py-2 rounded-lg mb-2',
        colors.headerBg,
        'border',
        colors.headerBorder
      )}
    >
      {isCollapsible && (
        <span className={colors.text}>
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          )}
        </span>
      )}
      <span className={colors.text}>{icon}</span>
      <span className={clsx('text-sm font-semibold', colors.text)}>
        {label}
      </span>
      <span
        className={clsx(
          'ml-auto px-2 py-0.5 rounded-full text-xs font-medium',
          colors.bg,
          colors.text
        )}
      >
        {count}
      </span>
    </div>
  );

  if (isCollapsible && onToggle) {
    return (
      <button
        onClick={onToggle}
        className="w-full text-left hover:opacity-80 transition-opacity"
      >
        {content}
      </button>
    );
  }

  return content;
}

export function BlockersSection({ blockers, totalCount }: BlockersSectionProps) {
  const [showOther, setShowOther] = useState(false);

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
        <div className="flex flex-col items-center justify-center py-10 text-center">
          {/* Success indicator with gradient */}
          <div className="relative">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 flex items-center justify-center mb-4 ring-4 ring-green-50 dark:ring-green-900/20">
              <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <span className="absolute -top-1 -right-1 text-lg">✨</span>
          </div>
          <p className="text-base font-medium text-gray-700 dark:text-gray-200">
            No active blockers
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-[200px]">
            Your projects are moving forward smoothly!
          </p>
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
          <GroupHeader
            icon={<ExclamationTriangleIcon className="h-4 w-4" />}
            label="Critical"
            count={criticalBlockers.length}
            colors={IMPACT_COLORS.critical}
          />
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
          <GroupHeader
            icon={<ArrowUpIcon className="h-4 w-4" />}
            label="High Impact"
            count={highBlockers.length}
            colors={IMPACT_COLORS.high}
          />
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
          <GroupHeader
            icon={<span className="h-4 w-4" />}
            label="Other"
            count={otherBlockers.length}
            colors={IMPACT_COLORS.low}
            isCollapsible
            isExpanded={showOther}
            onToggle={() => setShowOther(!showOther)}
          />
          {showOther && (
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
