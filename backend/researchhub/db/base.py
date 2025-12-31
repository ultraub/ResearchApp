"""SQLAlchemy Base class and common model mixins."""

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import TSVECTOR, UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column

from researchhub.config import get_settings


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    # Automatically generate __tablename__ from class name
    @declared_attr.directive
    def __tablename__(cls) -> str:
        """Generate table name from class name (CamelCase to snake_case)."""
        name = cls.__name__
        return "".join(
            ["_" + c.lower() if c.isupper() else c for c in name]
        ).lstrip("_") + "s"

    def to_dict(self) -> dict[str, Any]:
        """Convert model to dictionary."""
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class TimestampMixin:
    """Mixin for created_at and updated_at timestamps."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    """Mixin for soft delete support."""

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )

    @property
    def is_deleted(self) -> bool:
        """Check if the record is soft deleted."""
        return self.deleted_at is not None


class UUIDMixin:
    """Mixin for UUID primary key."""

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )


class EmbeddableMixin:
    """Mixin for entities that support vector embeddings for semantic search.

    Adds embedding storage and metadata fields for vector search capabilities.
    Uses pgvector for efficient similarity search in PostgreSQL.
    Also includes full-text search vector for hybrid search.
    """

    # Vector embedding - dimensions match the configured embedding model
    # text-embedding-3-small uses 1536 dimensions by default
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(get_settings().embedding_dimensions),
        nullable=True,
        index=False,  # We'll create a specialized index in migration
    )

    # Track which model generated the embedding for version compatibility
    embedding_model: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    # When the embedding was last generated
    embedded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Full-text search vector for PostgreSQL FTS (hybrid search)
    # Populated by database trigger - no need to set in application code
    search_vector: Mapped[Any | None] = mapped_column(
        TSVECTOR,
        nullable=True,
        index=False,  # GIN index created in migration
    )

    @property
    def has_embedding(self) -> bool:
        """Check if this entity has a computed embedding."""
        return self.embedding is not None

    @property
    def needs_reembedding(self) -> bool:
        """Check if embedding needs to be regenerated.

        Returns True if:
        - No embedding exists
        - Embedding was generated with a different model than currently configured
        """
        if self.embedding is None:
            return True
        settings = get_settings()
        return self.embedding_model != settings.embedding_model


class BaseModel(Base, UUIDMixin, TimestampMixin):
    """Base model with UUID primary key and timestamps."""

    __abstract__ = True
