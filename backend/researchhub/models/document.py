"""Document and version models for collaborative editing."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from researchhub.db.base import BaseModel, EmbeddableMixin

if TYPE_CHECKING:
    from researchhub.models.project import Project
    from researchhub.models.user import User


class Document(BaseModel, EmbeddableMixin):
    """Document with TipTap content and versioning support.

    Includes EmbeddableMixin for vector search capabilities.
    The embedding is generated from title + content_text.
    """

    __tablename__ = "documents"

    # Basic info
    title: Mapped[str] = mapped_column(String(500), nullable=False)

    # TipTap JSON content
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Plain text for search indexing
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Document type
    document_type: Mapped[str] = mapped_column(
        String(100), nullable=False, default="general"
    )  # general, protocol, report, manuscript, notes

    # Status
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft"
    )  # draft, in_review, approved, published

    # Version tracking
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Project association (nullable for system docs)
    project_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Ownership
    created_by_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    last_edited_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Template reference
    template_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("document_templates.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Collaboration settings
    allow_comments: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allow_suggestions: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Word count for progress tracking
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Tags
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )

    # Settings and metadata
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Archive flag
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # System documentation flag - hidden from users, accessible to AI assistant
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)

    # Relationships
    project: Mapped["Project | None"] = relationship("Project")
    created_by: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_id])
    last_edited_by: Mapped["User | None"] = relationship("User", foreign_keys=[last_edited_by_id])
    versions: Mapped[list["DocumentVersion"]] = relationship(
        "DocumentVersion", back_populates="document", lazy="dynamic"
    )
    comments: Mapped[list["DocumentComment"]] = relationship(
        "DocumentComment", back_populates="document", lazy="selectin"
    )

    def __repr__(self) -> str:
        try:
            return f"<Document {self.title[:30]}>"
        except Exception:
            try:
                return f"<Document id={self.id}>"
            except Exception:
                return "<Document detached>"


class DocumentVersion(BaseModel):
    """Immutable snapshot of document at a point in time."""

    __tablename__ = "document_versions"

    document_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Version number
    version: Mapped[int] = mapped_column(Integer, nullable=False)

    # Snapshot of content
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Change information
    change_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Who created this version
    created_by_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Word count at this version
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="versions")
    created_by: Mapped["User | None"] = relationship("User")

    def __repr__(self) -> str:
        return f"<DocumentVersion doc={self.document_id} v={self.version}>"


class DocumentComment(BaseModel):
    """Comment on a document (inline or general)."""

    __tablename__ = "document_comments"

    document_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Comment content
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # For inline comments - position in document
    selection_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    selection_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    selected_text: Mapped[str | None] = mapped_column(Text, nullable=True)

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

    # For threaded comments
    parent_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("document_comments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="comments")
    created_by: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_id])
    resolved_by: Mapped["User | None"] = relationship("User", foreign_keys=[resolved_by_id])
    parent_comment: Mapped["DocumentComment | None"] = relationship(
        "DocumentComment", remote_side="DocumentComment.id", back_populates="replies"
    )
    replies: Mapped[list["DocumentComment"]] = relationship(
        "DocumentComment", back_populates="parent_comment", lazy="selectin"
    )
    mentions: Mapped[list["DocumentCommentMention"]] = relationship(
        "DocumentCommentMention", back_populates="comment", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<DocumentComment {self.id} on doc={self.document_id}>"


class DocumentCommentMention(BaseModel):
    """@mention of a user in a document comment."""

    __tablename__ = "document_comment_mentions"
    __table_args__ = (
        UniqueConstraint("comment_id", "user_id", name="uq_document_comment_mention"),
    )

    comment_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("document_comments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Relationships
    comment: Mapped["DocumentComment"] = relationship("DocumentComment", back_populates="mentions")
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<DocumentCommentMention user={self.user_id} in comment={self.comment_id}>"


class DocumentTemplate(BaseModel):
    """Reusable document templates."""

    __tablename__ = "document_templates"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Template type
    template_type: Mapped[str] = mapped_column(String(100), nullable=False)

    # Template content (TipTap JSON)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Ownership - null means system template
    organization_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    created_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # System template flag
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Usage tracking
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    def __repr__(self) -> str:
        try:
            return f"<DocumentTemplate {self.name}>"
        except Exception:
            try:
                return f"<DocumentTemplate id={self.id}>"
            except Exception:
                return "<DocumentTemplate detached>"
