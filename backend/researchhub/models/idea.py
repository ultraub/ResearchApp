"""Quick Ideas model for capturing thoughts on the go."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from researchhub.db.base import BaseModel

if TYPE_CHECKING:
    from researchhub.models.project import Project, Task
    from researchhub.models.user import User


class Idea(BaseModel):
    """Quick idea capture - the fastest path to value."""

    __tablename__ = "ideas"

    # Core content
    content: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Organization
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )

    # Status and processing
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="captured"
    )  # captured, reviewed, converted, archived

    # Conversion tracking
    converted_to_project_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )
    converted_to_task_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
    )
    converted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Source tracking (mobile, web, voice, etc.)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="web")

    # AI processing
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_suggested_tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )
    ai_suggested_project_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Ownership
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Pinned for quick access
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    converted_to_project: Mapped["Project | None"] = relationship(
        "Project", foreign_keys=[converted_to_project_id]
    )
    converted_to_task: Mapped["Task | None"] = relationship(
        "Task", foreign_keys=[converted_to_task_id]
    )
    ai_suggested_project: Mapped["Project | None"] = relationship(
        "Project", foreign_keys=[ai_suggested_project_id]
    )

    def __repr__(self) -> str:
        return f"<Idea {self.id} by user={self.user_id}>"
