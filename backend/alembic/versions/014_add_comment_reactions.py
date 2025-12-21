"""add comment_reactions table for emoji reactions

Revision ID: 014
Revises: 013
Create Date: 2025-12-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID


# revision identifiers, used by Alembic.
revision: str = '014'
down_revision: Union[str, None] = '013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'comment_reactions',
        sa.Column('id', PGUUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('comment_id', PGUUID(as_uuid=True), nullable=False),
        sa.Column('user_id', PGUUID(as_uuid=True), nullable=False),
        sa.Column('emoji', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['comment_id'], ['task_comments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('comment_id', 'user_id', 'emoji', name='uq_comment_reaction'),
    )
    op.create_index('ix_comment_reactions_comment_id', 'comment_reactions', ['comment_id'])


def downgrade() -> None:
    op.drop_index('ix_comment_reactions_comment_id', table_name='comment_reactions')
    op.drop_table('comment_reactions')
