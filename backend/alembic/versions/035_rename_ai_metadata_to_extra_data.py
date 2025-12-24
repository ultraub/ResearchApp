"""Rename metadata to extra_data for AI tables.

Migration 006 created AI tables with 'metadata' column, but migration 005
(which renamed metadata → extra_data) ran before 006, so the AI tables
never got the rename. The SQLAlchemy models expect 'extra_data'.

This migration fixes that by renaming the column if it exists as 'metadata',
or is a no-op if 'extra_data' already exists (e.g., from manual fix).

Revision ID: 035
Revises: 034
Create Date: 2024-12-24

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text("""
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = :table_name
                AND column_name = :column_name
            )
        """),
        {"table_name": table_name, "column_name": column_name}
    )
    return result.scalar()


def upgrade() -> None:
    # Tables that need the metadata → extra_data rename
    tables = ["ai_conversations", "ai_conversation_messages", "ai_usage_logs"]

    for table in tables:
        has_metadata = column_exists(table, "metadata")
        has_extra_data = column_exists(table, "extra_data")

        if has_metadata and not has_extra_data:
            # Normal case: rename metadata to extra_data
            op.alter_column(
                table,
                "metadata",
                new_column_name="extra_data",
            )
        elif not has_metadata and not has_extra_data:
            # Column missing entirely - add it
            op.add_column(
                table,
                sa.Column(
                    "extra_data",
                    postgresql.JSONB,
                    nullable=False,
                    server_default="{}",
                ),
            )
        # If has_extra_data already, nothing to do


def downgrade() -> None:
    # Tables that had the rename
    tables = ["ai_conversations", "ai_conversation_messages", "ai_usage_logs"]

    for table in tables:
        has_extra_data = column_exists(table, "extra_data")
        has_metadata = column_exists(table, "metadata")

        if has_extra_data and not has_metadata:
            op.alter_column(
                table,
                "extra_data",
                new_column_name="metadata",
            )
