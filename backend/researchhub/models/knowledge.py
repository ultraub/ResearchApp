"""Knowledge management models - papers, collections, and references."""

from datetime import datetime, date
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from researchhub.db.base import BaseModel

if TYPE_CHECKING:
    from researchhub.models.organization import Organization
    from researchhub.models.user import User


class Paper(BaseModel):
    """Research paper in the knowledge library."""

    __tablename__ = "papers"

    # External identifiers
    doi: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    pmid: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    arxiv_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)

    # Basic metadata
    title: Mapped[str] = mapped_column(String(1000), nullable=False)
    authors: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )
    journal: Mapped[str | None] = mapped_column(String(500), nullable=True)
    publication_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    publication_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Content
    abstract: Mapped[str | None] = mapped_column(Text, nullable=True)
    keywords: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )

    # Files
    pdf_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    pdf_file_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )  # Reference to attachment

    # AI-generated content
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_key_findings: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )
    ai_methodology: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # User notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Organization and ownership
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    added_by_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Reading status
    read_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="unread"
    )  # unread, reading, read
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # User rating (1-5 stars)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Tags for organization
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )

    # Citation information
    citation_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bibtex: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Full-text search vector
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)

    # Metadata from external sources
    external_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization")
    added_by: Mapped["User | None"] = relationship("User")
    collection_memberships: Mapped[list["CollectionPaper"]] = relationship(
        "CollectionPaper", back_populates="paper", lazy="selectin"
    )

    def __repr__(self) -> str:
        try:
            return f"<Paper {self.title[:50]}>"
        except Exception:
            return f"<Paper id={self.id}>"


class Collection(BaseModel):
    """Collection of papers for organization."""

    __tablename__ = "collections"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Collection type
    is_smart: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # For smart collections - filter criteria
    filter_criteria: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Visual customization
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Ownership
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Visibility
    visibility: Mapped[str] = mapped_column(
        String(50), nullable=False, default="private"
    )  # private, team, organization

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization")
    created_by: Mapped["User | None"] = relationship("User")
    paper_memberships: Mapped[list["CollectionPaper"]] = relationship(
        "CollectionPaper", back_populates="collection", lazy="selectin"
    )

    def __repr__(self) -> str:
        try:
            return f"<Collection {self.name}>"
        except Exception:
            return f"<Collection id={self.id}>"


class CollectionPaper(BaseModel):
    """Many-to-many relationship between collections and papers."""

    __tablename__ = "collection_papers"
    __table_args__ = (
        UniqueConstraint("collection_id", "paper_id", name="uq_collection_paper"),
    )

    collection_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("collections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    paper_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("papers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Position in collection (for manual ordering)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Who added it
    added_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    collection: Mapped["Collection"] = relationship(
        "Collection", back_populates="paper_memberships"
    )
    paper: Mapped["Paper"] = relationship("Paper", back_populates="collection_memberships")
    added_by: Mapped["User | None"] = relationship("User")

    def __repr__(self) -> str:
        return f"<CollectionPaper coll={self.collection_id} paper={self.paper_id}>"


class PaperHighlight(BaseModel):
    """Highlight or annotation on a paper."""

    __tablename__ = "paper_highlights"

    paper_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("papers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Highlight content
    highlighted_text: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Position in PDF (page, coordinates)
    position_data: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Color for visual distinction
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#FFEB3B")

    # Tags
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, server_default="{}"
    )

    # Relationships
    paper: Mapped["Paper"] = relationship("Paper")
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<PaperHighlight paper={self.paper_id}>"


class PaperLink(BaseModel):
    """Links between papers and other entities (projects, tasks, documents)."""

    __tablename__ = "paper_links"

    paper_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("papers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Link target (polymorphic)
    linked_entity_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # project, task, document
    linked_entity_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )

    # Link metadata
    link_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="reference"
    )  # reference, citation, related
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Who created the link
    created_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    paper: Mapped["Paper"] = relationship("Paper")
    created_by: Mapped["User | None"] = relationship("User")

    def __repr__(self) -> str:
        return f"<PaperLink paper={self.paper_id} -> {self.linked_entity_type}={self.linked_entity_id}>"
