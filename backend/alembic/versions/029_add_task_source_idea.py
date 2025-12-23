"""Add source_idea_id to tasks table for linking tasks to source ideas.

Revision ID: 029
Revises: 028
Create Date: 2024-12-22

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "029"
down_revision: Union[str, None] = "028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add source_idea_id column to tasks table
    op.add_column(
        "tasks",
        sa.Column(
            "source_idea_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )

    # Add foreign key constraint
    op.create_foreign_key(
        "fk_tasks_source_idea_id",
        "tasks",
        "ideas",
        ["source_idea_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Create index for efficient lookups
    op.create_index(
        "ix_tasks_source_idea_id",
        "tasks",
        ["source_idea_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_tasks_source_idea_id", table_name="tasks")
    op.drop_constraint("fk_tasks_source_idea_id", "tasks", type_="foreignkey")
    op.drop_column("tasks", "source_idea_id")
