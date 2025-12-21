/**
 * Activity feed component for displaying recent actions.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  FileText,
  Folder,
  CheckSquare,
  Lightbulb,
  MessageSquare,
  UserPlus,
  Settings,
  BookOpen,
  Edit,
  Trash2,
  Plus,
  Share2,
  Eye,
  ChevronDown,
  User,
  RefreshCw,
} from 'lucide-react';
import { activitiesApi, type Activity } from '../../services/activities';

interface ActivityFeedProps {
  organizationId: string;
  projectId?: string;
  targetType?: string;
  targetId?: string;
  actorId?: string;
  limit?: number;
  compact?: boolean;
}

const actionIcons: Record<string, typeof FileText> = {
  created: Plus,
  updated: Edit,
  deleted: Trash2,
  commented: MessageSquare,
  shared: Share2,
  viewed: Eye,
  assigned: UserPlus,
  completed: CheckSquare,
};

const targetTypeIcons: Record<string, typeof FileText> = {
  project: Folder,
  document: FileText,
  task: CheckSquare,
  idea: Lightbulb,
  paper: BookOpen,
  comment: MessageSquare,
  settings: Settings,
};

function getActivityIcon(activity: Activity) {
  const ActionIcon = actionIcons[activity.action] || Edit;
  const TargetIcon = targetTypeIcons[activity.target_type] || FileText;
  return { ActionIcon, TargetIcon };
}

function getActivityColor(action: string): string {
  switch (action) {
    case 'created':
      return 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400';
    case 'updated':
      return 'text-primary-600 bg-primary-50 dark:bg-primary-900/20 dark:text-primary-400';
    case 'deleted':
      return 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400';
    case 'commented':
      return 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400';
    case 'shared':
      return 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400';
    case 'completed':
      return 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400';
    default:
      return 'text-gray-600 bg-gray-50 dark:bg-dark-card dark:text-gray-400';
  }
}

function ActivityItem({ activity, compact }: { activity: Activity; compact?: boolean }) {
  const { ActionIcon, TargetIcon } = getActivityIcon(activity);
  const colorClass = getActivityColor(activity.action);

  if (compact) {
    return (
      <div className="flex items-start gap-3 py-2">
        <div className={`p-1.5 rounded-xl ${colorClass}`}>
          <ActionIcon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900 dark:text-white truncate">
            <span className="font-medium">{activity.actor_name || 'Unknown'}</span>
            {' '}
            {activity.action}
            {' '}
            <span className="text-gray-600 dark:text-gray-400">{activity.target_title || activity.target_type}</span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 py-4 border-b border-gray-200 dark:border-dark-border last:border-0 transition-all hover:bg-gray-50 dark:hover:bg-dark-elevated rounded-xl px-2">
      {/* Avatar */}
      <div className="flex-shrink-0">
        {activity.actor_avatar ? (
          <img
            src={activity.actor_avatar}
            alt={activity.actor_name || 'User'}
            className="h-10 w-10 rounded-full"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-dark-elevated flex items-center justify-center">
            <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-gray-900 dark:text-white">
              <span className="font-medium">{activity.actor_name || 'Unknown user'}</span>
              {' '}
              <span className="text-gray-600 dark:text-gray-400">{activity.action}</span>
              {' '}
              <span className="font-medium">{activity.target_title || activity.target_type}</span>
            </p>
            {activity.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{activity.description}</p>
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
          </span>
        </div>

        {/* Target type badge */}
        <div className="flex items-center gap-2 mt-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xl text-xs ${colorClass}`}>
            <TargetIcon className="h-3 w-3" />
            {activity.target_type}
          </span>
          {activity.project_id && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl text-xs bg-gray-100 dark:bg-dark-elevated text-gray-600 dark:text-gray-400">
              <Folder className="h-3 w-3" />
              Project
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ActivityFeed({
  organizationId,
  projectId,
  targetType,
  targetId,
  actorId,
  limit = 20,
  compact = false,
}: ActivityFeedProps) {
  const [showAll, setShowAll] = useState(false);
  const displayLimit = showAll ? 100 : limit;

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['activities', organizationId, projectId, targetType, targetId, actorId, displayLimit],
    queryFn: () =>
      activitiesApi.getFeed({
        organization_id: organizationId,
        project_id: projectId,
        target_type: targetType,
        target_id: targetId,
        actor_id: actorId,
        limit: displayLimit,
      }),
    enabled: !!organizationId, // Only fetch when organizationId is defined
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-dark-elevated" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-dark-elevated rounded-xl w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-dark-elevated rounded-xl w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 dark:text-red-400 mb-2">Failed to load activity feed</p>
        <button
          onClick={() => refetch()}
          className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const activities = data?.activities || [];

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <MessageSquare className="h-12 w-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
        <p>No activity yet</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Recent Activity</h3>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Activity list */}
      <div className={compact ? 'divide-y divide-gray-200 dark:divide-dark-border' : ''}>
        {activities.map((activity) => (
          <ActivityItem key={activity.id} activity={activity} compact={compact} />
        ))}
      </div>

      {/* Load more */}
      {data?.has_more && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full mt-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center justify-center gap-1 rounded-xl transition-colors hover:bg-gray-50 dark:hover:bg-dark-elevated"
        >
          <ChevronDown className="h-4 w-4" />
          Show more
        </button>
      )}
    </div>
  );
}
