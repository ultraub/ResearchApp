"""Add journal tables for personal journals and project lab notebooks.

Revision ID: 018
Revises: 017
Create Date: 2024-12-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '018'
down_revision: Union[str, None] = '017'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Journal Entries table
    op.create_table(
        'journal_entries',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(500), nullable=True),
        sa.Column('content', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('content_text', sa.Text, nullable=True),
        sa.Column('entry_date', sa.Date, nullable=False, index=True),
        sa.Column('scope', sa.String(20), nullable=False, server_default='personal'),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('last_edited_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('tags', postgresql.ARRAY(sa.String), nullable=False, server_default='{}'),
        sa.Column('entry_type', sa.String(50), nullable=False, server_default='observation'),
        sa.Column('word_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('is_archived', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('is_pinned', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('mood', sa.String(50), nullable=True),
        sa.Column('extra_data', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('search_vector', postgresql.TSVECTOR, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        # Check constraint: personal entries need user_id, project entries need project_id
        sa.CheckConstraint(
            "(scope = 'personal' AND user_id IS NOT NULL AND project_id IS NULL) OR "
            "(scope = 'project' AND project_id IS NOT NULL)",
            name='check_journal_scope'
        ),
    )

    # Journal Entry Links table (polymorphic links to other entities)
    op.create_table(
        'journal_entry_links',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('journal_entry_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('journal_entries.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('linked_entity_type', sa.String(50), nullable=False),
        sa.Column('linked_entity_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('link_type', sa.String(50), nullable=False, server_default='reference'),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('position', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        # Unique constraint: only one link per entity per entry
        sa.UniqueConstraint('journal_entry_id', 'linked_entity_type', 'linked_entity_id', name='uq_journal_entry_link'),
    )

    # Create indexes for common queries
    op.create_index(
        'ix_journal_entries_user_date',
        'journal_entries',
        ['user_id', 'entry_date'],
    )
    op.create_index(
        'ix_journal_entries_project_date',
        'journal_entries',
        ['project_id', 'entry_date'],
    )
    op.create_index(
        'ix_journal_entries_org_scope',
        'journal_entries',
        ['organization_id', 'scope'],
    )
    op.create_index(
        'ix_journal_entries_entry_type',
        'journal_entries',
        ['entry_type'],
    )
    op.create_index(
        'ix_journal_entries_tags',
        'journal_entries',
        ['tags'],
        postgresql_using='gin',
    )
    op.create_index(
        'ix_journal_entries_search_vector',
        'journal_entries',
        ['search_vector'],
        postgresql_using='gin',
    )
    op.create_index(
        'ix_journal_entry_links_entity',
        'journal_entry_links',
        ['linked_entity_type', 'linked_entity_id'],
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_journal_entry_links_entity', table_name='journal_entry_links')
    op.drop_index('ix_journal_entries_search_vector', table_name='journal_entries')
    op.drop_index('ix_journal_entries_tags', table_name='journal_entries')
    op.drop_index('ix_journal_entries_entry_type', table_name='journal_entries')
    op.drop_index('ix_journal_entries_org_scope', table_name='journal_entries')
    op.drop_index('ix_journal_entries_project_date', table_name='journal_entries')
    op.drop_index('ix_journal_entries_user_date', table_name='journal_entries')

    # Drop tables in reverse order (respecting foreign keys)
    op.drop_table('journal_entry_links')
    op.drop_table('journal_entries')
