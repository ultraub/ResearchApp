"""Add AI review comment fields to review_comments table

Revision ID: 017
Revises: 016
Create Date: 2025-12-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '017'
down_revision: Union[str, None] = '016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add source field to track human vs AI comments
    # Values: human, ai_suggestion, ai_accepted, ai_dismissed
    op.add_column(
        'review_comments',
        sa.Column('source', sa.String(50), nullable=False, server_default='human')
    )

    # Add AI confidence score (0.0 to 1.0)
    op.add_column(
        'review_comments',
        sa.Column('ai_confidence', sa.Float(), nullable=True)
    )

    # Add question_for_author - AI's question prompting human thought
    op.add_column(
        'review_comments',
        sa.Column('question_for_author', sa.Text(), nullable=True)
    )

    # Add why_this_matters - AI's explanation of importance
    op.add_column(
        'review_comments',
        sa.Column('why_this_matters', sa.Text(), nullable=True)
    )

    # Create index on source for filtering AI vs human comments
    op.create_index('ix_review_comments_source', 'review_comments', ['source'])


def downgrade() -> None:
    op.drop_index('ix_review_comments_source', table_name='review_comments')
    op.drop_column('review_comments', 'why_this_matters')
    op.drop_column('review_comments', 'question_for_author')
    op.drop_column('review_comments', 'ai_confidence')
    op.drop_column('review_comments', 'source')
