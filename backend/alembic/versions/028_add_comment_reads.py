"""Add comment reads tracking table.

Revision ID: 028
Revises: 027
Create Date: 2024-12-21

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "028"
down_revision: Union[str, None] = "027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create comment_reads table for tracking read status across all comment types
    op.create_table(
        "comment_reads",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "comment_type",
            sa.String(50),
            nullable=False,
            comment="Type of comment: task, document, review, generic",
        ),
        sa.Column(
            "comment_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            comment="ID of the comment in its respective table",
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "read_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        # Unique constraint: one read record per user per comment
        sa.UniqueConstraint(
            "comment_type", "comment_id", "user_id", name="uq_comment_read"
        ),
    )

    # Create indexes for efficient querying
    op.create_index(
        "ix_comment_reads_user_id",
        "comment_reads",
        ["user_id"],
    )
    op.create_index(
        "ix_comment_reads_comment_lookup",
        "comment_reads",
        ["comment_type", "comment_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_comment_reads_comment_lookup", table_name="comment_reads")
    op.drop_index("ix_comment_reads_user_id", table_name="comment_reads")
    op.drop_table("comment_reads")
