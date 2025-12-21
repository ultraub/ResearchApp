"""Collaboration models for sharing, invites, and team management."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Boolean, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from researchhub.db.base import BaseModel

if TYPE_CHECKING:
    from researchhub.models.user import User
    from researchhub.models.organization import Organization
    from researchhub.models.project import Project


class ProjectShare(BaseModel):
    """
    Sharing configuration for projects.

    Controls who has access to a project and with what permissions.
    """

    __tablename__ = "project_shares"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_user_share"),
    )

    # Project being shared
    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # User receiving access
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Permission level
    role: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="viewer",
        comment="viewer, editor, admin",
    )

    # Granted by
    granted_by_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )

    # Access tracking
    last_accessed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    access_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    # Notification preferences for this share
    notify_on_updates: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    # Relationships
    project: Mapped["Project"] = relationship(
        "Project",
        foreign_keys=[project_id],
        lazy="selectin",
    )
    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        lazy="joined",
    )
    granted_by: Mapped["User"] = relationship(
        "User",
        foreign_keys=[granted_by_id],
        lazy="joined",
    )


class DocumentShare(BaseModel):
    """
    Individual document sharing for sharing documents outside project context.

    Allows sharing specific documents with users who may not have project access.
    """

    __tablename__ = "document_shares"
    __table_args__ = (
        UniqueConstraint("document_id", "user_id", name="uq_document_user_share"),
    )

    # Document being shared
    document_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # User receiving access
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Permission level
    role: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="viewer",
        comment="viewer, commenter, editor",
    )

    # Granted by
    granted_by_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )

    # Expiration
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Optional expiration date for temporary access",
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        lazy="joined",
    )
    granted_by: Mapped["User"] = relationship(
        "User",
        foreign_keys=[granted_by_id],
        lazy="joined",
    )


class ShareLink(BaseModel):
    """
    Public or semi-public share links for resources.

    Allows sharing via link without requiring user accounts.
    """

    __tablename__ = "share_links"

    # Link token
    token: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    # Target resource
    resource_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="project, document, collection",
    )
    resource_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    # Access settings
    access_level: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="view",
        comment="view, comment, edit",
    )
    requires_auth: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="Whether link requires authentication",
    )
    password_hash: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Optional password protection",
    )
    allowed_domains: Mapped[list[str] | None] = mapped_column(
        ARRAY(String),
        nullable=True,
        comment="Restrict access to specific email domains",
    )

    # Expiration
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    max_uses: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Maximum number of uses",
    )
    use_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    # Status
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    # Creator
    created_by_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Relationships
    created_by: Mapped["User"] = relationship(
        "User",
        foreign_keys=[created_by_id],
        lazy="joined",
    )
    organization: Mapped["Organization"] = relationship(
        "Organization",
        foreign_keys=[organization_id],
        lazy="selectin",
    )


class Invitation(BaseModel):
    """
    Invitations to join organizations or projects.

    Tracks pending invitations and their status.
    """

    __tablename__ = "invitations"

    # Invitation type
    invitation_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="organization, project",
    )

    # Target resource
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Invitee
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    invited_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="If user already exists in system",
    )

    # Role being offered
    role: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="member",
    )

    # Invitation token
    token: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    # Status
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="pending",
        comment="pending, accepted, declined, expired, revoked",
    )

    # Personalization
    personal_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Inviter
    invited_by_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )

    # Timing
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Email tracking
    email_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    email_opened_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    reminder_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    organization: Mapped["Organization"] = relationship(
        "Organization",
        foreign_keys=[organization_id],
        lazy="selectin",
    )
    project: Mapped["Project | None"] = relationship(
        "Project",
        foreign_keys=[project_id],
        lazy="selectin",
    )
    invited_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[invited_user_id],
        lazy="joined",
    )
    invited_by: Mapped["User"] = relationship(
        "User",
        foreign_keys=[invited_by_id],
        lazy="joined",
    )


class Comment(BaseModel):
    """
    Generic comment model for discussions on any resource.

    Supports threaded discussions, mentions, and reactions.
    """

    __tablename__ = "comments"

    # Comment content
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    content_html: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Rendered HTML with mentions, links, etc.",
    )

    # Target resource (polymorphic)
    resource_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="project, task, document, idea, paper",
    )
    resource_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    # Threading
    parent_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("comments.id", ondelete="CASCADE"),
        nullable=True,
    )
    thread_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
        index=True,
        comment="Root comment ID for threading",
    )

    # Author
    author_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False,
    )
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Mentions
    mentioned_user_ids: Mapped[list[str] | None] = mapped_column(
        ARRAY(String),
        nullable=True,
    )

    # Status
    is_edited: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    edited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Resolution (for comments requesting changes)
    is_resolved: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    resolved_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    author: Mapped["User"] = relationship(
        "User",
        foreign_keys=[author_id],
        lazy="joined",
    )
    resolved_by: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[resolved_by_id],
        lazy="joined",
    )
    parent: Mapped["Comment | None"] = relationship(
        "Comment",
        remote_side="Comment.id",
        foreign_keys=[parent_id],
        lazy="selectin",
    )
    replies: Mapped[list["Comment"]] = relationship(
        "Comment",
        foreign_keys=[parent_id],
        lazy="selectin",
    )
    organization: Mapped["Organization"] = relationship(
        "Organization",
        foreign_keys=[organization_id],
        lazy="selectin",
    )


class Reaction(BaseModel):
    """
    Reactions/emoji responses to comments and resources.
    """

    __tablename__ = "reactions"
    __table_args__ = (
        UniqueConstraint(
            "resource_type", "resource_id", "user_id", "emoji",
            name="uq_reaction_user_resource_emoji"
        ),
    )

    # Target (comment or other resource)
    resource_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
    )
    resource_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    # Reaction
    emoji: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Emoji or reaction code",
    )

    # User
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        lazy="joined",
    )


class CommentRead(BaseModel):
    """
    Tracks which comments a user has read.

    Works across all comment types (task, document, review, generic)
    using a polymorphic comment_type + comment_id approach.
    """

    __tablename__ = "comment_reads"
    __table_args__ = (
        UniqueConstraint(
            "comment_type", "comment_id", "user_id",
            name="uq_comment_read"
        ),
    )

    # Comment reference (polymorphic)
    comment_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Type of comment: task, document, review, generic",
    )
    comment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=False,
        index=True,
        comment="ID of the comment in its respective table",
    )

    # User who read the comment
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # When the comment was read
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default="now()",
    )

    # Relationships
    reader: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        lazy="joined",
    )
