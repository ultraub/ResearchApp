"""add comment_mentions table for @mentions

Revision ID: 016
Revises: 015
Create Date: 2025-12-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID


# revision identifiers, used by Alembic.
revision: str = '016'
down_revision: Union[str, None] = '015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create comment_mentions table
    op.create_table(
        'comment_mentions',
        sa.Column('id', PGUUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('comment_id', PGUUID(as_uuid=True), nullable=False),
        sa.Column('user_id', PGUUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['comment_id'], ['task_comments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        # Unique constraint to prevent duplicate mentions
        sa.UniqueConstraint('comment_id', 'user_id', name='uq_comment_mention'),
    )

    # Create index for efficient lookups
    op.create_index('ix_comment_mentions_comment_id', 'comment_mentions', ['comment_id'])
    op.create_index('ix_comment_mentions_user_id', 'comment_mentions', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_comment_mentions_user_id', table_name='comment_mentions')
    op.drop_index('ix_comment_mentions_comment_id', table_name='comment_mentions')
    op.drop_table('comment_mentions')
