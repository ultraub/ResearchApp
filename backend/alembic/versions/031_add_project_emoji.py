"""Add emoji field to projects for custom icons.

Revision ID: 031
Revises: 030
Create Date: 2024-12-23

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "031"
down_revision: Union[str, None] = "030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add emoji column to projects table for custom project icons
    op.add_column(
        "projects",
        sa.Column(
            "emoji",
            sa.String(length=10),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("projects", "emoji")
