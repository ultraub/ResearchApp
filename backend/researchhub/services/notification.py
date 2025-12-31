"""Notification service for creating in-app notifications."""

from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.models.activity import Notification, NotificationPreference

logger = structlog.get_logger()


class NotificationService:
    """Service for creating and managing user notifications."""

    # Map notification types to preference fields
    TYPE_TO_PREFERENCE = {
        # Assignment notifications
        "task_assigned": "notify_assignments",
        "task_unassigned": "notify_assignments",
        "assignment_updated": "notify_assignments",
        "reviewer_assigned": "notify_assignments",
        # Mention notifications
        "user_mentioned": "notify_mentions",
        # Comment notifications
        "comment_created": "notify_comments",
        "review_comment_added": "notify_comments",
        # Task update notifications
        "task_status_changed": "notify_task_updates",
        "blocker_created": "notify_task_updates",
        "blocker_resolved": "notify_task_updates",
        # Document notifications
        "document_shared": "notify_document_updates",
        # Project/team notifications
        "review_requested": "notify_project_updates",
        "invitation_sent": "notify_team_changes",
        "invitation_accepted": "notify_team_changes",
    }

    def __init__(self, db: AsyncSession):
        self.db = db

    async def notify(
        self,
        user_id: UUID,
        notification_type: str,
        title: str,
        message: str,
        organization_id: UUID,
        target_type: str | None = None,
        target_id: UUID | None = None,
        target_url: str | None = None,
        sender_id: UUID | None = None,
        extra_data: dict | None = None,
    ) -> Notification | None:
        """
        Create a notification for a user if their preferences allow.

        Args:
            user_id: The recipient user's ID
            notification_type: Type of notification (e.g., 'task_assigned')
            title: Notification title
            message: Notification body
            organization_id: Organization context
            target_type: Optional entity type for navigation (e.g., 'task')
            target_id: Optional entity ID for navigation
            target_url: Optional direct URL to navigate to
            sender_id: Optional sender/actor user ID
            extra_data: Optional additional context data

        Returns:
            Created Notification or None if preferences prevent it
        """
        # Don't notify users about their own actions
        if sender_id and sender_id == user_id:
            logger.debug(
                "skipping_self_notification",
                user_id=str(user_id),
                notification_type=notification_type,
            )
            return None

        # Check user preferences
        prefs = await self._get_preferences(user_id)

        # Check if in-app notifications are enabled
        if prefs and not prefs.in_app_enabled:
            logger.debug(
                "in_app_notifications_disabled",
                user_id=str(user_id),
            )
            return None

        # Check type-specific preferences
        if not self._should_notify(prefs, notification_type):
            logger.debug(
                "notification_type_disabled",
                user_id=str(user_id),
                notification_type=notification_type,
            )
            return None

        # Create the notification
        notification = Notification(
            user_id=user_id,
            notification_type=notification_type,
            title=title,
            message=message,
            organization_id=organization_id,
            target_type=target_type,
            target_id=target_id,
            target_url=target_url,
            sender_id=sender_id,
            extra_data=extra_data,
            is_read=False,
            is_archived=False,
        )
        self.db.add(notification)
        await self.db.commit()

        logger.info(
            "notification_created",
            notification_id=str(notification.id),
            user_id=str(user_id),
            notification_type=notification_type,
        )

        return notification

    async def notify_many(
        self,
        user_ids: list[UUID],
        notification_type: str,
        title: str,
        message: str,
        organization_id: UUID,
        target_type: str | None = None,
        target_id: UUID | None = None,
        target_url: str | None = None,
        sender_id: UUID | None = None,
        extra_data: dict | None = None,
    ) -> list[Notification]:
        """
        Create notifications for multiple users.

        Each user's preferences are checked individually.

        Returns:
            List of created Notifications (may be fewer than user_ids if some are filtered)
        """
        notifications = []
        for user_id in user_ids:
            notification = await self.notify(
                user_id=user_id,
                notification_type=notification_type,
                title=title,
                message=message,
                organization_id=organization_id,
                target_type=target_type,
                target_id=target_id,
                target_url=target_url,
                sender_id=sender_id,
                extra_data=extra_data,
            )
            if notification:
                notifications.append(notification)
        return notifications

    async def _get_preferences(self, user_id: UUID) -> NotificationPreference | None:
        """Get notification preferences for a user."""
        result = await self.db.execute(
            select(NotificationPreference).where(
                NotificationPreference.user_id == user_id
            )
        )
        return result.scalar_one_or_none()

    def _should_notify(
        self, prefs: NotificationPreference | None, notification_type: str
    ) -> bool:
        """
        Check if a notification type is enabled in user preferences.

        If no preferences exist, defaults to True (notify).
        Unknown notification types default to True.
        """
        if prefs is None:
            # No preferences set, use defaults (all enabled)
            return True

        # Get the preference field name for this notification type
        pref_field = self.TYPE_TO_PREFERENCE.get(notification_type)
        if pref_field is None:
            # Unknown notification type, default to notify
            return True

        # Check the preference value
        return getattr(prefs, pref_field, True)
