"""Activity and notification models for tracking user actions and alerts."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from researchhub.db.base import BaseModel

if TYPE_CHECKING:
    from researchhub.models.user import User
    from researchhub.models.organization import Organization
    from researchhub.models.project import Project


class Activity(BaseModel):
    """
    Activity log for tracking all user actions in the system.

    Provides an audit trail and powers activity feeds for projects,
    organizations, and individual users.
    """

    __tablename__ = "activities"

    # Activity type and details
    activity_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        comment="Type of activity (e.g., 'project.created', 'document.updated')",
    )
    action: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Action verb (created, updated, deleted, commented, etc.)",
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Human-readable description of the activity",
    )

    # Target entity (polymorphic reference)
    target_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Type of entity affected (project, document, task, paper, etc.)",
    )
    target_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=False,
        index=True,
        comment="ID of the affected entity",
    )
    target_title: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        comment="Cached title/name of the target for display",
    )

    # Parent entity (for nested items like comments, tasks)
    parent_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="Type of parent entity if applicable",
    )
    parent_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
        comment="ID of parent entity if applicable",
    )

    # Context
    project_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Actor
    actor_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
        index=True,
    )

    # Additional context data
    extra_data: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="Additional context data (old values, changes, etc.)",
    )

    # Visibility
    is_public: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        comment="Whether activity is visible to all org members",
    )

    # Relationships
    actor: Mapped["User"] = relationship(
        "User",
        foreign_keys=[actor_id],
        lazy="joined",
    )
    project: Mapped["Project | None"] = relationship(
        "Project",
        foreign_keys=[project_id],
        lazy="selectin",
    )
    organization: Mapped["Organization"] = relationship(
        "Organization",
        foreign_keys=[organization_id],
        lazy="selectin",
    )


class Notification(BaseModel):
    """
    User notifications for important events and mentions.

    Notifications are created from activities but filtered to only
    include relevant events for each user.
    """

    __tablename__ = "notifications"

    # Notification content
    notification_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
        comment="Type of notification (mention, assignment, comment, etc.)",
    )
    title: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
        comment="Notification title/headline",
    )
    message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Notification body/details",
    )

    # Link to activity
    activity_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("activities.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Target entity (for navigation)
    target_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="Type of entity to navigate to",
    )
    target_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
        comment="ID of entity to navigate to",
    )
    target_url: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
        comment="Direct URL to navigate to",
    )

    # Recipient
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Sender (if applicable)
    sender_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Organization context
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Status
    is_read: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        index=True,
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    is_archived: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    # Additional data
    extra_data: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        lazy="joined",
    )
    sender: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[sender_id],
        lazy="joined",
    )
    activity: Mapped["Activity | None"] = relationship(
        "Activity",
        foreign_keys=[activity_id],
        lazy="selectin",
    )
    organization: Mapped["Organization"] = relationship(
        "Organization",
        foreign_keys=[organization_id],
        lazy="selectin",
    )


class NotificationPreference(BaseModel):
    """
    User preferences for notification delivery.

    Controls which notifications a user receives and how they're delivered.
    """

    __tablename__ = "notification_preferences"

    # User
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # Email notifications
    email_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )
    email_frequency: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="instant",
        comment="instant, daily, weekly, or never",
    )

    # In-app notifications
    in_app_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    # Notification type preferences
    notify_mentions: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_assignments: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_comments: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_task_updates: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_document_updates: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_project_updates: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notify_team_changes: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Quiet hours
    quiet_hours_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    quiet_hours_start: Mapped[str | None] = mapped_column(
        String(5),
        nullable=True,
        comment="Start time in HH:MM format",
    )
    quiet_hours_end: Mapped[str | None] = mapped_column(
        String(5),
        nullable=True,
        comment="End time in HH:MM format",
    )
    quiet_hours_timezone: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="Timezone for quiet hours",
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        lazy="joined",
    )
