"""Add blocker tables for blocking issues that can block tasks or projects.

Revision ID: 020
Revises: 019
Create Date: 2024-12-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '020'
down_revision: Union[str, None] = '019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Blockers table
    op.create_table(
        'blockers',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', postgresql.JSONB, nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='open'),
        sa.Column('priority', sa.String(20), nullable=False, server_default='medium'),
        sa.Column('blocker_type', sa.String(50), nullable=False, server_default='general'),
        sa.Column('resolution_type', sa.String(50), nullable=True),
        sa.Column('impact_level', sa.String(20), nullable=False, server_default='medium'),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('assignee_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('due_date', sa.Date, nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('tags', postgresql.ARRAY(sa.String), nullable=False, server_default='{}'),
        sa.Column('extra_data', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # Blocker Links table (links blockers to tasks or projects)
    op.create_table(
        'blocker_links',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('blocker_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('blockers.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('blocked_entity_type', sa.String(50), nullable=False),
        sa.Column('blocked_entity_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        # Unique constraint: only one link per blocker per entity
        sa.UniqueConstraint('blocker_id', 'blocked_entity_type', 'blocked_entity_id', name='uq_blocker_link'),
    )

    # Create indexes for common queries
    op.create_index(
        'ix_blockers_project_status',
        'blockers',
        ['project_id', 'status'],
    )
    op.create_index(
        'ix_blockers_assignee',
        'blockers',
        ['assignee_id'],
    )
    op.create_index(
        'ix_blockers_status',
        'blockers',
        ['status'],
    )
    op.create_index(
        'ix_blockers_tags',
        'blockers',
        ['tags'],
        postgresql_using='gin',
    )
    op.create_index(
        'ix_blocker_links_entity',
        'blocker_links',
        ['blocked_entity_type', 'blocked_entity_id'],
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_blocker_links_entity', table_name='blocker_links')
    op.drop_index('ix_blockers_tags', table_name='blockers')
    op.drop_index('ix_blockers_status', table_name='blockers')
    op.drop_index('ix_blockers_assignee', table_name='blockers')
    op.drop_index('ix_blockers_project_status', table_name='blockers')

    # Drop tables in reverse order (respecting foreign keys)
    op.drop_table('blocker_links')
    op.drop_table('blockers')
