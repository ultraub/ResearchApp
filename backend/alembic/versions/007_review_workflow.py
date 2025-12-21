"""Add review workflow tables.

Revision ID: 007
Revises: 006
Create Date: 2024-01-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '007'
down_revision: Union[str, None] = '006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Reviews table
    op.create_table(
        'reviews',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('review_type', sa.String(50), nullable=False, default='feedback'),
        sa.Column('status', sa.String(50), nullable=False, default='pending'),
        sa.Column('priority', sa.String(50), nullable=False, default='normal'),
        sa.Column('document_version', sa.Integer, nullable=False, default=1),
        sa.Column('requested_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('decision', sa.String(50), nullable=True),
        sa.Column('decision_notes', sa.Text, nullable=True),
        sa.Column('tags', postgresql.ARRAY(sa.String), nullable=False, server_default='{}'),
        sa.Column('settings', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # Review Assignments table
    op.create_table(
        'review_assignments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('review_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('reviews.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('reviewer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('assigned_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, default='pending'),
        sa.Column('role', sa.String(50), nullable=False, default='reviewer'),
        sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('recommendation', sa.String(50), nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # Review Comments table
    op.create_table(
        'review_comments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('review_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('reviews.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('comment_type', sa.String(50), nullable=False, default='general'),
        sa.Column('selected_text', sa.Text, nullable=True),
        sa.Column('anchor_data', postgresql.JSONB, nullable=True),
        sa.Column('severity', sa.String(50), nullable=True),
        sa.Column('is_resolved', sa.Boolean, nullable=False, default=False),
        sa.Column('resolved_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolution_notes', sa.Text, nullable=True),
        sa.Column('parent_comment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('review_comments.id', ondelete='CASCADE'), nullable=True),
        sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # Create indexes for common queries
    op.create_index(
        'ix_reviews_doc_status',
        'reviews',
        ['document_id', 'status'],
    )
    op.create_index(
        'ix_reviews_project_status',
        'reviews',
        ['project_id', 'status'],
    )
    op.create_index(
        'ix_reviews_requester',
        'reviews',
        ['requested_by_id', 'status'],
    )
    op.create_index(
        'ix_review_assignments_reviewer',
        'review_assignments',
        ['reviewer_id', 'status'],
    )
    op.create_index(
        'ix_review_comments_resolved',
        'review_comments',
        ['review_id', 'is_resolved'],
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_review_comments_resolved', table_name='review_comments')
    op.drop_index('ix_review_assignments_reviewer', table_name='review_assignments')
    op.drop_index('ix_reviews_requester', table_name='reviews')
    op.drop_index('ix_reviews_project_status', table_name='reviews')
    op.drop_index('ix_reviews_doc_status', table_name='reviews')

    # Drop tables in reverse order of creation (respecting foreign keys)
    op.drop_table('review_comments')
    op.drop_table('review_assignments')
    op.drop_table('reviews')
