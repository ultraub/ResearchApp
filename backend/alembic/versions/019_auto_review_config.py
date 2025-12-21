"""Add auto review configuration and logging tables.

Revision ID: 019
Revises: 018
Create Date: 2024-12-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '019'
down_revision: Union[str, None] = '018'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # AutoReviewConfig table - per-organization settings
    op.create_table(
        'auto_review_configs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'),
                  nullable=False, unique=True, index=True),

        # Trigger settings
        sa.Column('on_document_create', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('on_document_update', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('on_task_submit_review', sa.Boolean, nullable=False, server_default='true'),

        # Configuration
        sa.Column('default_focus_areas', postgresql.ARRAY(sa.String),
                  nullable=False, server_default='{}'),
        sa.Column('min_document_length', sa.Integer, nullable=False, server_default='100'),
        sa.Column('review_cooldown_hours', sa.Integer, nullable=False, server_default='24'),
        sa.Column('max_suggestions_per_review', sa.Integer, nullable=False, server_default='10'),
        sa.Column('auto_create_review', sa.Boolean, nullable=False, server_default='true'),

        # Tracking
        sa.Column('updated_by_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),

        # Standard timestamps
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
    )

    # AutoReviewLog table - tracking processed reviews
    op.create_table(
        'auto_review_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),

        # What was reviewed
        sa.Column('task_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('tasks.id', ondelete='CASCADE'),
                  nullable=True, index=True),
        sa.Column('document_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('documents.id', ondelete='CASCADE'),
                  nullable=True, index=True),

        # Content tracking for deduplication
        sa.Column('content_hash', sa.String(64), nullable=False, index=True),

        # Review reference
        sa.Column('review_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('reviews.id', ondelete='SET NULL'), nullable=True),

        # Results
        sa.Column('suggestions_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('trigger_source', sa.String(50), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default="'pending'"),
        sa.Column('error_message', sa.Text, nullable=True),

        # Processing timestamps
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),

        # Standard timestamps
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
    )

    # Index for finding recent reviews of same content
    op.create_index(
        'ix_auto_review_logs_content_lookup',
        'auto_review_logs',
        ['content_hash', 'created_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_auto_review_logs_content_lookup', table_name='auto_review_logs')
    op.drop_table('auto_review_logs')
    op.drop_table('auto_review_configs')
