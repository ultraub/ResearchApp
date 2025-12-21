/**
 * Notification panel component with dropdown.
 */

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  Check,
  CheckCheck,
  Archive,
  Settings,
  MessageSquare,
  AtSign,
  UserPlus,
  FileText,
  Folder,
  CheckSquare,
  X,
} from 'lucide-react';
import { notificationsApi, type Notification } from '../../services/activities';

interface NotificationPanelProps {
  userId: string;
  organizationId?: string;
}

const notificationTypeIcons: Record<string, typeof Bell> = {
  mention: AtSign,
  assignment: UserPlus,
  comment: MessageSquare,
  task_update: CheckSquare,
  document_update: FileText,
  project_update: Folder,
  team_change: UserPlus,
};

function NotificationItem({
  notification,
  onMarkRead,
  onArchive,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const Icon = notificationTypeIcons[notification.notification_type] || Bell;

  return (
    <div
      className={`p-3 hover:bg-gray-50 dark:hover:bg-dark-elevated transition-all ${
        !notification.is_read ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''
      }`}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div
          className={`flex-shrink-0 p-2 rounded-full ${
            !notification.is_read ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400' : 'bg-gray-100 dark:bg-dark-elevated text-gray-500 dark:text-gray-400'
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${!notification.is_read ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
            {notification.title}
          </p>
          {notification.message && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{notification.message}</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
            </span>
            {notification.sender_name && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                from {notification.sender_name}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-start gap-1">
          {!notification.is_read && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead(notification.id);
              }}
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 rounded-xl transition-colors"
              title="Mark as read"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArchive(notification.id);
            }}
            className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl transition-colors"
            title="Archive"
          >
            <Archive className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotificationPanel({ userId, organizationId }: NotificationPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', userId, organizationId, filter],
    queryFn: () =>
      notificationsApi.getList({
        organization_id: organizationId,
        is_read: filter === 'unread' ? false : undefined,
        limit: 20,
      }),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationIds?: string[]) =>
      notificationsApi.markRead({
        notification_ids: notificationIds,
        mark_all: !notificationIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (notificationId: string) => notificationsApi.archive(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = data?.unread_count || 0;
  const notifications = data?.notifications || [];

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-dark-elevated transition-all"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs font-medium text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-dark-card rounded-xl shadow-card border border-gray-200 dark:border-dark-border z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
            <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markReadMutation.mutate(undefined)}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex border-b border-gray-200 dark:border-dark-border">
            <button
              onClick={() => setFilter('all')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                filter === 'unread'
                  ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notifications list */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse flex gap-3">
                    <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-dark-elevated" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-200 dark:bg-dark-elevated rounded-xl w-3/4" />
                      <div className="h-2 bg-gray-200 dark:bg-dark-elevated rounded-xl w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                <p>No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-dark-border">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={(id) => markReadMutation.mutate([id])}
                    onArchive={(id) => archiveMutation.mutate(id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-gray-200 dark:border-dark-border flex justify-between">
            <button className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 transition-colors">
              <Settings className="h-4 w-4" />
              Settings
            </button>
            <button className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
              View all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
