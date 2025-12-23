"""Review workflow models for document collaboration."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from researchhub.db.base import BaseModel

if TYPE_CHECKING:
    from researchhub.models.document import Document
    from researchhub.models.project import Project, Task
    from researchhub.models.user import User


class Review(BaseModel):
    """Review request for a document."""

    __tablename__ = "reviews"

    # Document being reviewed
    document_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Project context
    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Optional link to originating task (for task-review integration)
    task_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Should review completion auto-update task status?
    auto_transition_task: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # Review title and description
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Review type
    review_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="feedback"
    )  # feedback, approval, peer_review, editorial

    # Review status
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"
    )  # pending, in_progress, changes_requested, approved, completed, cancelled

    # Priority
    priority: Mapped[str] = mapped_column(
        String(50), nullable=False, default="normal"
    )  # low, normal, high, urgent

    # Document version being reviewed (snapshot)
    document_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Requester
    requested_by_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Due date
    due_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Completion
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Final decision
    decision: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # approved, rejected, needs_revision

    # Decision notes
    decision_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Tags
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )

    # Settings
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    document: Mapped["Document"] = relationship("Document")
    project: Mapped["Project"] = relationship("Project")
    task: Mapped["Task | None"] = relationship("Task")
    requested_by: Mapped["User | None"] = relationship(
        "User", foreign_keys=[requested_by_id]
    )
    completed_by: Mapped["User | None"] = relationship(
        "User", foreign_keys=[completed_by_id]
    )
    assignments: Mapped[list["ReviewAssignment"]] = relationship(
        "ReviewAssignment", back_populates="review", lazy="selectin"
    )
    comments: Mapped[list["ReviewComment"]] = relationship(
        "ReviewComment", back_populates="review", lazy="selectin"
    )

    def __repr__(self) -> str:
        try:
            return f"<Review {self.title[:30]} on doc={self.document_id}>"
        except Exception:
            return f"<Review id={self.id}>"


class ReviewAssignment(BaseModel):
    """Assignment of a reviewer to a review."""

    __tablename__ = "review_assignments"

    review_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("reviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Assigned reviewer
    reviewer_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Who made the assignment
    assigned_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Assignment status
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"
    )  # pending, accepted, declined, in_progress, completed

    # Reviewer's role
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default="reviewer"
    )  # reviewer, primary_reviewer, approver

    # Response tracking
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Completion
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Reviewer's recommendation
    recommendation: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # approve, reject, revise, abstain

    # Reviewer's notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Optional deadline for this reviewer
    due_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    review: Mapped["Review"] = relationship("Review", back_populates="assignments")
    reviewer: Mapped["User"] = relationship("User", foreign_keys=[reviewer_id])
    assigned_by: Mapped["User | None"] = relationship("User", foreign_keys=[assigned_by_id])

    def __repr__(self) -> str:
        return f"<ReviewAssignment review={self.review_id} reviewer={self.reviewer_id}>"


class ReviewComment(BaseModel):
    """Comment on a review (can be anchored to document text)."""

    __tablename__ = "review_comments"

    review_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("reviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Comment author
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Comment content
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Comment type
    comment_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="general"
    )  # general, inline, suggestion, question, issue, gap_identified, clarity_needed, methodology_concern, consistency_issue

    # For inline comments - anchor to document text
    selected_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    anchor_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Source tracking for AI vs human comments
    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="human"
    )  # human, ai_suggestion, ai_accepted, ai_dismissed

    # AI-specific fields
    ai_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    question_for_author: Mapped[str | None] = mapped_column(Text, nullable=True)
    why_this_matters: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Severity/category for issues
    severity: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # critical, major, minor, suggestion

    # Resolution status
    is_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    resolved_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Threading
    parent_comment_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("review_comments.id", ondelete="CASCADE"),
        nullable=True,
    )

    # Edit tracking
    edited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    review: Mapped["Review"] = relationship("Review", back_populates="comments")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    resolved_by: Mapped["User | None"] = relationship("User", foreign_keys=[resolved_by_id])
    parent_comment: Mapped["ReviewComment | None"] = relationship(
        "ReviewComment", remote_side="ReviewComment.id", back_populates="replies"
    )
    replies: Mapped[list["ReviewComment"]] = relationship(
        "ReviewComment", back_populates="parent_comment", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<ReviewComment {self.id} on review={self.review_id}>"


class AutoReviewConfig(BaseModel):
    """Per-organization configuration for AI auto-reviews."""

    __tablename__ = "auto_review_configs"

    # Organization this config belongs to
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Trigger settings
    on_document_create: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    on_document_update: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    on_task_submit_review: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # Focus areas for AI review (e.g., ["methodology", "clarity", "completeness"])
    default_focus_areas: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )

    # Minimum document length (in characters) to trigger auto-review
    min_document_length: Mapped[int] = mapped_column(
        Integer, nullable=False, default=100
    )

    # Cooldown period in hours before re-reviewing same content
    review_cooldown_hours: Mapped[int] = mapped_column(
        Integer, nullable=False, default=24
    )

    # Maximum number of AI suggestions per review
    max_suggestions_per_review: Mapped[int] = mapped_column(
        Integer, nullable=False, default=10
    )

    # Whether AI should auto-create review when triggered
    auto_create_review: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # Who created/updated this config
    updated_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    updated_by: Mapped["User | None"] = relationship("User")

    def __repr__(self) -> str:
        return f"<AutoReviewConfig org={self.organization_id}>"


class AutoReviewLog(BaseModel):
    """Log of auto-reviews performed to prevent duplicate processing."""

    __tablename__ = "auto_review_logs"

    # What was reviewed
    task_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    document_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Content hash to detect duplicate content
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # Review that was created
    review_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("reviews.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Number of suggestions generated
    suggestions_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Trigger source
    trigger_source: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # document_create, document_update, task_submit_review, manual

    # Processing status
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"
    )  # pending, processing, completed, failed

    # Error message if failed
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Processing timestamps
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return f"<AutoReviewLog task={self.task_id} doc={self.document_id}>"
