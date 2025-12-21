"""add missing paper columns

Revision ID: 010
Revises: 009
Create Date: 2025-12-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '010'
down_revision: Union[str, None] = '009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add missing columns to papers table
    op.add_column('papers', sa.Column('publication_year', sa.Integer(), nullable=True))
    op.add_column('papers', sa.Column('pdf_file_id', sa.UUID(), nullable=True))
    op.add_column('papers', sa.Column('ai_processed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('papers', sa.Column('read_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('papers', sa.Column('tags', sa.ARRAY(sa.String()), nullable=True))
    op.add_column('papers', sa.Column('bibtex', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('papers', 'bibtex')
    op.drop_column('papers', 'tags')
    op.drop_column('papers', 'read_at')
    op.drop_column('papers', 'ai_processed_at')
    op.drop_column('papers', 'pdf_file_id')
    op.drop_column('papers', 'publication_year')
