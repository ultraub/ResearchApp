"""add missing collection columns

Revision ID: 011
Revises: 010
Create Date: 2025-12-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = '011'
down_revision: Union[str, None] = '010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add missing columns to collection_papers table
    op.add_column('collection_papers', sa.Column('position', sa.Integer(), nullable=True, server_default='0'))
    op.execute("UPDATE collection_papers SET position = 0 WHERE position IS NULL")
    op.alter_column('collection_papers', 'position', nullable=False)

    # Add missing columns to collections table
    op.add_column('collections', sa.Column('is_smart', sa.Boolean(), nullable=True, server_default='false'))
    op.execute("UPDATE collections SET is_smart = false WHERE is_smart IS NULL")
    op.alter_column('collections', 'is_smart', nullable=False)

    op.add_column('collections', sa.Column('filter_criteria', JSONB, nullable=True))
    op.add_column('collections', sa.Column('icon', sa.String(50), nullable=True))
    op.add_column('collections', sa.Column('visibility', sa.String(50), nullable=True, server_default="'private'"))


def downgrade() -> None:
    op.drop_column('collections', 'visibility')
    op.drop_column('collections', 'icon')
    op.drop_column('collections', 'filter_criteria')
    op.drop_column('collections', 'is_smart')
    op.drop_column('collection_papers', 'position')
