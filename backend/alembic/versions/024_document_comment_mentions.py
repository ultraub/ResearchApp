"""add document_comment_mentions table for @mentions in document comments

Revision ID: 024
Revises: 023
Create Date: 2025-12-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID


# revision identifiers, used by Alembic.
revision: str = '024'
down_revision: Union[str, None] = '023'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create document_comment_mentions table
    op.create_table(
        'document_comment_mentions',
        sa.Column('id', PGUUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('comment_id', PGUUID(as_uuid=True), nullable=False),
        sa.Column('user_id', PGUUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['comment_id'], ['document_comments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        # Unique constraint to prevent duplicate mentions
        sa.UniqueConstraint('comment_id', 'user_id', name='uq_document_comment_mention'),
    )

    # Create indexes for efficient lookups
    op.create_index('ix_document_comment_mentions_comment_id', 'document_comment_mentions', ['comment_id'])
    op.create_index('ix_document_comment_mentions_user_id', 'document_comment_mentions', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_document_comment_mentions_user_id', table_name='document_comment_mentions')
    op.drop_index('ix_document_comment_mentions_comment_id', table_name='document_comment_mentions')
    op.drop_table('document_comment_mentions')
