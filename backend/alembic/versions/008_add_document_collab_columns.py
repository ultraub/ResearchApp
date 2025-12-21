"""Add allow_comments and allow_suggestions columns to documents

Revision ID: 008
Revises: 007
Create Date: 2024-12-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '008'
down_revision: Union[str, None] = '007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add collaboration columns to documents table."""
    op.add_column('documents', sa.Column('allow_comments', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('documents', sa.Column('allow_suggestions', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('documents', sa.Column('tags', sa.ARRAY(sa.String()), nullable=False, server_default='{}'))
    op.add_column('documents', sa.Column('settings', sa.dialects.postgresql.JSONB(), nullable=False, server_default='{}'))


def downgrade() -> None:
    """Remove collaboration columns from documents table."""
    op.drop_column('documents', 'settings')
    op.drop_column('documents', 'tags')
    op.drop_column('documents', 'allow_suggestions')
    op.drop_column('documents', 'allow_comments')
