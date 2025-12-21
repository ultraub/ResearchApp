"""Add AI conversation, template, and usage tracking tables.

Revision ID: 006
Revises: 005
Create Date: 2024-01-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '006'
down_revision: Union[str, None] = '005_rename_metadata_to_extra_data'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # AI Conversations table
    op.create_table(
        'ai_conversations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('feature_name', sa.String(100), nullable=False, index=True),
        sa.Column('context_type', sa.String(50), nullable=True),
        sa.Column('context_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('summary', sa.Text, nullable=True),
        sa.Column('is_active', sa.Boolean, nullable=False, default=True),
        sa.Column('total_input_tokens', sa.Integer, nullable=False, default=0),
        sa.Column('total_output_tokens', sa.Integer, nullable=False, default=0),
        sa.Column('primary_model', sa.String(100), nullable=True),
        sa.Column('metadata', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # AI Conversation Messages table
    op.create_table(
        'ai_conversation_messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('conversation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('ai_conversations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('input_tokens', sa.Integer, nullable=False, default=0),
        sa.Column('output_tokens', sa.Integer, nullable=False, default=0),
        sa.Column('model', sa.String(100), nullable=True),
        sa.Column('latency_ms', sa.Integer, nullable=True),
        sa.Column('phi_detected', sa.Boolean, nullable=False, default=False),
        sa.Column('phi_types', postgresql.JSONB, nullable=True),
        sa.Column('metadata', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # AI Prompt Templates table
    op.create_table(
        'ai_prompt_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('template_key', sa.String(100), nullable=False, index=True),
        sa.Column('display_name', sa.String(255), nullable=False),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('system_prompt', sa.Text, nullable=True),
        sa.Column('user_prompt_template', sa.Text, nullable=False),
        sa.Column('temperature', sa.Float, nullable=False, default=0.7),
        sa.Column('max_tokens', sa.Integer, nullable=False, default=2000),
        sa.Column('required_variables', postgresql.JSONB, nullable=False, server_default='[]'),
        sa.Column('optional_variables', postgresql.JSONB, nullable=False, server_default='[]'),
        sa.Column('is_system', sa.Boolean, nullable=False, default=False),
        sa.Column('is_active', sa.Boolean, nullable=False, default=True),
        sa.Column('version', sa.Integer, nullable=False, default=1),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('usage_count', sa.Integer, nullable=False, default=0),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # AI Usage Logs table
    op.create_table(
        'ai_usage_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('feature_name', sa.String(100), nullable=False, index=True),
        sa.Column('template_key', sa.String(100), nullable=True),
        sa.Column('conversation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('ai_conversations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('provider', sa.String(50), nullable=False),
        sa.Column('model', sa.String(100), nullable=False),
        sa.Column('input_tokens', sa.Integer, nullable=False),
        sa.Column('output_tokens', sa.Integer, nullable=False),
        sa.Column('total_tokens', sa.Integer, nullable=False),
        sa.Column('estimated_cost_cents', sa.Integer, nullable=True),
        sa.Column('latency_ms', sa.Integer, nullable=True),
        sa.Column('request_type', sa.String(50), nullable=False, default='completion'),
        sa.Column('was_cached', sa.Boolean, nullable=False, default=False),
        sa.Column('phi_detected', sa.Boolean, nullable=False, default=False),
        sa.Column('phi_policy_applied', sa.String(20), nullable=True),
        sa.Column('was_successful', sa.Boolean, nullable=False, default=True),
        sa.Column('error_code', sa.String(100), nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('context_type', sa.String(50), nullable=True),
        sa.Column('context_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('metadata', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # AI Organization Settings table
    op.create_table(
        'ai_organization_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('features_enabled', postgresql.JSONB, nullable=False, server_default='{"document_assistant": true, "knowledge_summarization": true, "review_helper": true, "search_copilot": true, "task_generation": true}'),
        sa.Column('phi_policy', sa.String(20), nullable=False, default='warn'),
        sa.Column('preferred_provider', sa.String(50), nullable=True),
        sa.Column('monthly_token_limit', sa.Integer, nullable=True),
        sa.Column('current_month_usage', sa.Integer, nullable=False, default=0),
        sa.Column('usage_reset_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('requests_per_minute_limit', sa.Integer, nullable=False, default=60),
        sa.Column('requests_per_day_limit', sa.Integer, nullable=True),
        sa.Column('custom_settings', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    # Create indexes for common queries
    op.create_index(
        'ix_ai_conversations_user_feature',
        'ai_conversations',
        ['user_id', 'feature_name'],
    )
    op.create_index(
        'ix_ai_usage_logs_org_date',
        'ai_usage_logs',
        ['organization_id', 'created_at'],
    )
    op.create_index(
        'ix_ai_usage_logs_user_date',
        'ai_usage_logs',
        ['user_id', 'created_at'],
    )
    op.create_index(
        'ix_ai_prompt_templates_org_key',
        'ai_prompt_templates',
        ['organization_id', 'template_key'],
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_ai_prompt_templates_org_key', table_name='ai_prompt_templates')
    op.drop_index('ix_ai_usage_logs_user_date', table_name='ai_usage_logs')
    op.drop_index('ix_ai_usage_logs_org_date', table_name='ai_usage_logs')
    op.drop_index('ix_ai_conversations_user_feature', table_name='ai_conversations')

    # Drop tables in reverse order of creation (respecting foreign keys)
    op.drop_table('ai_organization_settings')
    op.drop_table('ai_usage_logs')
    op.drop_table('ai_prompt_templates')
    op.drop_table('ai_conversation_messages')
    op.drop_table('ai_conversations')
