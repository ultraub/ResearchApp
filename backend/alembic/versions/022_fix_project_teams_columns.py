"""Fix project_teams table to include id and updated_at columns.

The ProjectTeam model inherits from BaseModel which includes
UUIDMixin (id) and TimestampMixin (created_at, updated_at).
Migration 021 created the table without these columns.

Revision ID: 022
Revises: 021
Create Date: 2024-12-20

"""
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '022'
down_revision: Union[str, None] = '021'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add id column (UUID) to project_teams
    op.add_column('project_teams', sa.Column(
        'id', postgresql.UUID(as_uuid=True), nullable=True
    ))

    # 2. Generate UUIDs for existing rows
    op.execute("""
        UPDATE project_teams
        SET id = gen_random_uuid()
        WHERE id IS NULL
    """)

    # 3. Make id not nullable
    op.alter_column('project_teams', 'id', nullable=False)

    # 4. Add updated_at column
    op.add_column('project_teams', sa.Column(
        'updated_at', sa.DateTime(timezone=True),
        server_default=sa.func.now(), nullable=False
    ))


def downgrade() -> None:
    op.drop_column('project_teams', 'updated_at')
    op.drop_column('project_teams', 'id')
