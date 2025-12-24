"""Add is_demo flag to projects table for demo projects.

Revision ID: 030
Revises: 029
Create Date: 2024-12-23

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "030"
down_revision: Union[str, None] = "029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add is_demo column to projects table
    op.add_column(
        "projects",
        sa.Column(
            "is_demo",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )

    # Create index for efficient filtering
    op.create_index(
        "ix_projects_is_demo",
        "projects",
        ["is_demo"],
    )


def downgrade() -> None:
    op.drop_index("ix_projects_is_demo", table_name="projects")
    op.drop_column("projects", "is_demo")
