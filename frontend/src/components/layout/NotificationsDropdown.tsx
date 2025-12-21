/**
 * Notifications Dropdown - Shows recent notifications with mark as read.
 */

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, Archive, ExternalLink } from "lucide-react";
import { notificationsApi, type Notification } from "@/services/activities";
import { formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";

interface NotificationsDropdownProps {
  className?: string;
}

export function NotificationsDropdown({ className }: NotificationsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch notifications (backend now uses authenticated user automatically)
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsApi.getList({ limit: 20 }),
    enabled: isOpen,
    refetchInterval: 60000, // Refresh every minute when open
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unread_count || 0;

  // Mark single notification as read
  const markReadMutation = useMutation({
    mutationFn: (notificationIds: string[]) =>
      notificationsApi.markRead({ notification_ids: notificationIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to mark as read");
    },
  });

  // Mark all as read
  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markRead({ mark_all: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All notifications marked as read");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to mark all as read");
    },
  });

  // Archive notification
  const archiveMutation = useMutation({
    mutationFn: (notificationId: string) => notificationsApi.archive(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to archive notification");
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read if unread
    if (!notification.is_read) {
      markReadMutation.mutate([notification.id]);
    }
    // Navigate to target if URL provided
    if (notification.target_url) {
      window.location.href = notification.target_url;
      setIsOpen(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "mention":
        return "💬";
      case "assignment":
        return "📋";
      case "comment":
        return "💭";
      case "task_update":
        return "✅";
      case "document_update":
        return "📄";
      case "project_update":
        return "📁";
      case "review_request":
        return "👀";
      case "share":
        return "🔗";
      case "ai_suggestion":
        return "✨";
      default:
        return "🔔";
    }
  };

  return (
    <div ref={dropdownRef} className={`relative ${className || ""}`}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-dark-elevated dark:hover:text-gray-200"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary-500 text-[10px] font-medium text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-dark-card rounded-xl shadow-card border border-gray-200 dark:border-dark-border overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-border">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                <Bell className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-dark-border">
                {notifications.map((notification) => (
                  <li key={notification.id} className="relative">
                    <button
                      onClick={() => handleNotificationClick(notification)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-elevated/50 transition-colors ${
                        !notification.is_read ? "bg-primary-50/50 dark:bg-primary-900/10" : ""
                      }`}
                    >
                      <div className="flex gap-3">
                        {/* Icon */}
                        <span className="text-lg flex-shrink-0">
                          {getNotificationIcon(notification.notification_type)}
                        </span>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${
                            notification.is_read
                              ? "text-gray-600 dark:text-gray-400"
                              : "text-gray-900 dark:text-white font-medium"
                          }`}>
                            {notification.title}
                          </p>
                          {notification.message && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                              {notification.message}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {formatDistanceToNow(new Date(notification.created_at), {
                              addSuffix: true,
                            })}
                            {notification.sender_name && (
                              <> · {notification.sender_name}</>
                            )}
                          </p>
                        </div>

                        {/* Unread indicator */}
                        {!notification.is_read && (
                          <span className="h-2 w-2 rounded-full bg-primary-500 flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                    </button>

                    {/* Actions (show on hover) */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-1">
                      {!notification.is_read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markReadMutation.mutate([notification.id]);
                          }}
                          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-dark-elevated"
                          title="Mark as read"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveMutation.mutate(notification.id);
                        }}
                        className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-dark-elevated"
                        title="Archive"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-elevated/50">
              <a
                href="/settings/notifications"
                className="flex items-center justify-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
              >
                <ExternalLink className="h-3 w-3" />
                View all notifications
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
