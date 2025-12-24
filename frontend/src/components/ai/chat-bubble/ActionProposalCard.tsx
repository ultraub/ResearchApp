/**
 * Action Proposal Card - Shows proposed action with diff and approval buttons.
 */

import { useState } from 'react';
import {
  Check,
  X,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ProposedAction } from '../../../types/assistant';
import { ActionDiffView } from './ActionDiffView';

interface ActionProposalCardProps {
  action: ProposedAction;
  onApprove: () => void;
  onReject: (reason?: string) => void;
}

export function ActionProposalCard({
  action,
  onApprove,
  onReject,
}: ActionProposalCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await onApprove();
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await onReject();
    } finally {
      setIsRejecting(false);
    }
  };

  const isPending = action.status === 'pending';
  const isApproved = action.status === 'approved';
  const isRejected = action.status === 'rejected';

  // Status badge styles
  const statusStyles = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    executed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    expired: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  };

  const StatusIcon = {
    pending: Clock,
    approved: CheckCircle2,
    rejected: XCircle,
    executed: CheckCircle2,
    expired: AlertCircle,
  }[action.status] || Clock;

  return (
    <div
      className={`border rounded-lg overflow-hidden ${
        isPending
          ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10'
          : isApproved
          ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'
          : isRejected
          ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
          : 'border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-elevated'
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AlertCircle
            className={`h-4 w-4 flex-shrink-0 ${
              isPending ? 'text-amber-500' : 'text-gray-400'
            }`}
          />
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {action.description}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
              statusStyles[action.status]
            }`}
          >
            <StatusIcon className="h-3 w-3" />
            {action.status.charAt(0).toUpperCase() + action.status.slice(1)}
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-inherit px-3 py-3 space-y-3">
          {/* Entity info */}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium">{action.entityType}</span>
            {action.entityId && (
              <span className="ml-1">({action.entityId.slice(0, 8)}...)</span>
            )}
          </div>

          {/* Diff view */}
          <ActionDiffView
            diff={action.diff}
            oldState={action.oldState}
            newState={action.newState}
          />

          {/* Action buttons - only show for pending actions */}
          {isPending && (
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleApprove}
                disabled={isApproving || isRejecting}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isApproving ? (
                  <span className="animate-spin">...</span>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Approve
                  </>
                )}
              </button>
              <button
                onClick={handleReject}
                disabled={isApproving || isRejecting}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-gray-200 dark:bg-dark-border hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
              >
                {isRejecting ? (
                  <span className="animate-spin">...</span>
                ) : (
                  <>
                    <X className="h-4 w-4" />
                    Reject
                  </>
                )}
              </button>
            </div>
          )}

          {/* Status message for non-pending */}
          {isApproved && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Action approved and executed
            </div>
          )}
          {isRejected && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <XCircle className="h-4 w-4" />
              Action rejected
            </div>
          )}
        </div>
      )}
    </div>
  );
}
