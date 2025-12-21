"""Add collaboration and activity tables.

Revision ID: 004
Revises: 003
Create Date: 2024-01-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '004'
down_revision: Union[str, None] = '003_documents_knowledge'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Activities table
    op.create_table(
        'activities',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('activity_type', sa.String(100), nullable=False, index=True),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('target_type', sa.String(50), nullable=False, index=True),
        sa.Column('target_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('target_title', sa.String(500), nullable=True),
        sa.Column('parent_type', sa.String(50), nullable=True),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('actor_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=False, index=True),
        sa.Column('metadata', postgresql.JSONB, nullable=True),
        sa.Column('is_public', sa.Boolean, nullable=False, default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # Notifications table
    op.create_table(
        'notifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('notification_type', sa.String(100), nullable=False, index=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('message', sa.Text, nullable=True),
        sa.Column('activity_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('activities.id', ondelete='SET NULL'), nullable=True),
        sa.Column('target_type', sa.String(50), nullable=True),
        sa.Column('target_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('target_url', sa.String(1000), nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('sender_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('is_read', sa.Boolean, nullable=False, default=False, index=True),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_archived', sa.Boolean, nullable=False, default=False),
        sa.Column('metadata', postgresql.JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # Notification preferences table
    op.create_table(
        'notification_preferences',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('email_enabled', sa.Boolean, nullable=False, default=True),
        sa.Column('email_frequency', sa.String(50), nullable=False, default='instant'),
        sa.Column('in_app_enabled', sa.Boolean, nullable=False, default=True),
        sa.Column('notify_mentions', sa.Boolean, nullable=False, default=True),
        sa.Column('notify_assignments', sa.Boolean, nullable=False, default=True),
        sa.Column('notify_comments', sa.Boolean, nullable=False, default=True),
        sa.Column('notify_task_updates', sa.Boolean, nullable=False, default=True),
        sa.Column('notify_document_updates', sa.Boolean, nullable=False, default=True),
        sa.Column('notify_project_updates', sa.Boolean, nullable=False, default=True),
        sa.Column('notify_team_changes', sa.Boolean, nullable=False, default=True),
        sa.Column('quiet_hours_enabled', sa.Boolean, nullable=False, default=False),
        sa.Column('quiet_hours_start', sa.String(5), nullable=True),
        sa.Column('quiet_hours_end', sa.String(5), nullable=True),
        sa.Column('quiet_hours_timezone', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # Project shares table
    op.create_table(
        'project_shares',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('role', sa.String(50), nullable=False, default='viewer'),
        sa.Column('granted_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=False),
        sa.Column('last_accessed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('access_count', sa.Integer, nullable=False, default=0),
        sa.Column('notify_on_updates', sa.Boolean, nullable=False, default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('project_id', 'user_id', name='uq_project_user_share'),
    )

    # Document shares table
    op.create_table(
        'document_shares',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('document_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('documents.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('role', sa.String(50), nullable=False, default='viewer'),
        sa.Column('granted_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('document_id', 'user_id', name='uq_document_user_share'),
    )

    # Share links table
    op.create_table(
        'share_links',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('token', sa.String(64), nullable=False, unique=True, index=True),
        sa.Column('resource_type', sa.String(50), nullable=False),
        sa.Column('resource_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('access_level', sa.String(50), nullable=False, default='view'),
        sa.Column('requires_auth', sa.Boolean, nullable=False, default=False),
        sa.Column('password_hash', sa.String(255), nullable=True),
        sa.Column('allowed_domains', postgresql.ARRAY(sa.String), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('max_uses', sa.Integer, nullable=True),
        sa.Column('use_count', sa.Integer, nullable=False, default=0),
        sa.Column('is_active', sa.Boolean, nullable=False, default=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # Invitations table
    op.create_table(
        'invitations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('invitation_type', sa.String(50), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('email', sa.String(255), nullable=False, index=True),
        sa.Column('invited_user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('role', sa.String(50), nullable=False, default='member'),
        sa.Column('token', sa.String(64), nullable=False, unique=True, index=True),
        sa.Column('status', sa.String(50), nullable=False, default='pending'),
        sa.Column('personal_message', sa.Text, nullable=True),
        sa.Column('invited_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('email_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('email_opened_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reminder_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # Comments table
    op.create_table(
        'comments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('content_html', sa.Text, nullable=True),
        sa.Column('resource_type', sa.String(50), nullable=False, index=True),
        sa.Column('resource_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('comments.id', ondelete='CASCADE'), nullable=True),
        sa.Column('thread_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('author_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('mentioned_user_ids', postgresql.ARRAY(sa.String), nullable=True),
        sa.Column('is_edited', sa.Boolean, nullable=False, default=False),
        sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_deleted', sa.Boolean, nullable=False, default=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_resolved', sa.Boolean, nullable=False, default=False),
        sa.Column('resolved_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # Reactions table
    op.create_table(
        'reactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('resource_type', sa.String(50), nullable=False, index=True),
        sa.Column('resource_id', postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column('emoji', sa.String(50), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('resource_type', 'resource_id', 'user_id', 'emoji', name='uq_reaction_user_resource_emoji'),
    )

    # Create indexes for common queries
    op.create_index('ix_activities_created_at', 'activities', ['created_at'])
    op.create_index('ix_notifications_created_at', 'notifications', ['created_at'])
    op.create_index('ix_comments_created_at', 'comments', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_comments_created_at')
    op.drop_index('ix_notifications_created_at')
    op.drop_index('ix_activities_created_at')
    op.drop_table('reactions')
    op.drop_table('comments')
    op.drop_table('invitations')
    op.drop_table('share_links')
    op.drop_table('document_shares')
    op.drop_table('project_shares')
    op.drop_table('notification_preferences')
    op.drop_table('notifications')
    op.drop_table('activities')
