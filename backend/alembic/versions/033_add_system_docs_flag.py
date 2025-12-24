"""Add is_system flag to documents for AI-accessible system documentation.

Revision ID: 033
Revises: 032
Create Date: 2024-12-24
"""

from alembic import op
import sqlalchemy as sa

revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_system flag to documents
    op.add_column(
        "documents",
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default="false"),
    )

    # Add index for filtering system docs
    op.create_index(
        "ix_documents_is_system",
        "documents",
        ["is_system"],
        unique=False,
    )

    # Make project_id nullable for system docs (they don't belong to a project)
    op.alter_column(
        "documents",
        "project_id",
        existing_type=sa.UUID(),
        nullable=True,
    )


def downgrade() -> None:
    # Make project_id required again
    op.alter_column(
        "documents",
        "project_id",
        existing_type=sa.UUID(),
        nullable=False,
    )

    op.drop_index("ix_documents_is_system", table_name="documents")
    op.drop_column("documents", "is_system")
