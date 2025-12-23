"""Journal entry models for personal journals and project lab notebooks."""

from datetime import date
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from researchhub.db.base import BaseModel

if TYPE_CHECKING:
    from researchhub.models.organization import Organization
    from researchhub.models.project import Project
    from researchhub.models.user import User


class JournalEntry(BaseModel):
    """Journal entry for personal journals and project lab notebooks.

    Supports two scopes:
    - personal: User-owned entries for personal reflection and notes
    - project: Project-owned entries for shared lab notebooks
    """

    __tablename__ = "journal_entries"

    # Entry title (optional but useful for navigation)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # TipTap JSON content
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Plain text for search indexing (extracted from TipTap)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Entry date - the date of observation/event (separate from created_at)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Scope: personal or project
    scope: Mapped[str] = mapped_column(
        String(20), nullable=False, default="personal"
    )  # personal, project

    # For personal journals - owner user
    user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # For project-level lab notebooks
    project_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Organization context (for access control and search)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Who created the entry
    created_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Who last edited the entry
    last_edited_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Tags for organization
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )

    # Entry type (for categorization)
    entry_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="observation"
    )  # observation, experiment, meeting, idea, reflection, protocol

    # Word count for display
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Archive/pin flags
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Mood/status indicator (optional, common in journals)
    mood: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Extra metadata
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Full-text search vector
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)

    # Relationships
    user: Mapped["User | None"] = relationship(
        "User", foreign_keys=[user_id], lazy="selectin"
    )
    project: Mapped["Project | None"] = relationship("Project", lazy="selectin")
    organization: Mapped["Organization"] = relationship("Organization")
    created_by: Mapped["User | None"] = relationship(
        "User", foreign_keys=[created_by_id], lazy="selectin"
    )
    last_edited_by: Mapped["User | None"] = relationship(
        "User", foreign_keys=[last_edited_by_id]
    )
    links: Mapped[list["JournalEntryLink"]] = relationship(
        "JournalEntryLink",
        back_populates="journal_entry",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    # Constraint: must have either user_id (personal) or project_id (project)
    __table_args__ = (
        CheckConstraint(
            "(scope = 'personal' AND user_id IS NOT NULL AND project_id IS NULL) OR "
            "(scope = 'project' AND project_id IS NOT NULL)",
            name="check_journal_scope",
        ),
    )

    def __repr__(self) -> str:
        try:
            title_preview = self.title[:30] if self.title else f"Entry {self.entry_date}"
            return f"<JournalEntry {title_preview}>"
        except Exception:
            try:
                return f"<JournalEntry id={self.id}>"
            except Exception:
                return "<JournalEntry detached>"


class JournalEntryLink(BaseModel):
    """Links between journal entries and other entities (projects, tasks, documents, papers).

    Enables explicit linking of journal entries to related work items,
    following the polymorphic pattern used by PaperLink.
    """

    __tablename__ = "journal_entry_links"

    journal_entry_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("journal_entries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Link target (polymorphic)
    linked_entity_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # project, task, document, paper

    linked_entity_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )

    # Link metadata
    link_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="reference"
    )  # reference, result, follow_up, related

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Position for ordering
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Who created the link
    created_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    journal_entry: Mapped["JournalEntry"] = relationship(
        "JournalEntry", back_populates="links"
    )
    created_by: Mapped["User | None"] = relationship("User")

    __table_args__ = (
        UniqueConstraint(
            "journal_entry_id",
            "linked_entity_type",
            "linked_entity_id",
            name="uq_journal_entry_link",
        ),
    )

    def __repr__(self) -> str:
        return f"<JournalEntryLink entry={self.journal_entry_id} -> {self.linked_entity_type}={self.linked_entity_id}>"
