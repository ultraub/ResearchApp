"""Add multi-user collaboration features.

- TaskAssignment: Multiple assignees per task
- TaskDocument: Links tasks to documents
- RecurringTaskRule: Templates for recurring tasks
- ProjectCustomField: Custom field definitions
- TaskCustomFieldValue: Custom field values
- Add task_id to reviews for task-review integration

Revision ID: 009
Revises: 008
Create Date: 2024-12-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '009'
down_revision: Union[str, None] = '008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create multi-user collaboration tables and columns."""

    # ===========================================
    # 1. Task Assignments table (multiple assignees)
    # ===========================================
    op.create_table(
        'task_assignments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('task_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('tasks.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('assigned_by_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('role', sa.String(50), nullable=False, server_default='assignee'),
        sa.Column('status', sa.String(50), nullable=False, server_default='assigned'),
        sa.Column('due_date', sa.Date, nullable=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('task_id', 'user_id', name='uq_task_assignment'),
    )
    op.create_index('ix_task_assignments_user_status', 'task_assignments',
                    ['user_id', 'status'])

    # ===========================================
    # 2. Task Documents table (task-document links)
    # ===========================================
    op.create_table(
        'task_documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('task_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('tasks.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('document_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('documents.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('link_type', sa.String(50), nullable=False, server_default='reference'),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('requires_review', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('position', sa.Integer, nullable=False, server_default='0'),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('task_id', 'document_id', name='uq_task_document'),
    )

    # ===========================================
    # 3. Recurring Task Rules table
    # ===========================================
    op.create_table(
        'recurring_task_rules',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('task_type', sa.String(50), nullable=False, server_default='general'),
        sa.Column('priority', sa.String(20), nullable=False, server_default='medium'),
        sa.Column('tags', postgresql.ARRAY(sa.String), nullable=False, server_default='{}'),
        sa.Column('estimated_hours', sa.Float, nullable=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('default_assignee_ids', postgresql.JSONB, nullable=False,
                  server_default='[]'),
        sa.Column('recurrence_type', sa.String(50), nullable=False),
        sa.Column('recurrence_config', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('start_date', sa.Date, nullable=False),
        sa.Column('end_date', sa.Date, nullable=True),
        sa.Column('due_date_offset_days', sa.Integer, nullable=True),
        sa.Column('next_occurrence', sa.Date, nullable=True, index=True),
        sa.Column('last_created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('extra_data', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index('ix_recurring_rules_active_next', 'recurring_task_rules',
                    ['is_active', 'next_occurrence'])

    # ===========================================
    # 4. Project Custom Fields table
    # ===========================================
    op.create_table(
        'project_custom_fields',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('display_name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('field_type', sa.String(50), nullable=False),
        sa.Column('field_config', postgresql.JSONB, nullable=False, server_default='{}'),
        sa.Column('applies_to', sa.String(50), nullable=False, server_default='task'),
        sa.Column('position', sa.Integer, nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('is_required', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_by_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('project_id', 'name', name='uq_project_custom_field_name'),
    )

    # ===========================================
    # 5. Task Custom Field Values table
    # ===========================================
    op.create_table(
        'task_custom_field_values',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('task_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('tasks.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('field_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('project_custom_fields.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('value', postgresql.JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('task_id', 'field_id', name='uq_task_custom_field_value'),
    )

    # ===========================================
    # 6. Add recurring_rule_id to tasks table
    # ===========================================
    op.add_column('tasks', sa.Column('recurring_rule_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('recurring_task_rules.id', ondelete='SET NULL'),
                  nullable=True))
    op.create_index('ix_tasks_recurring_rule_id', 'tasks', ['recurring_rule_id'])

    # ===========================================
    # 7. Add task_id and auto_transition_task to reviews table
    # ===========================================
    op.add_column('reviews', sa.Column('task_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('tasks.id', ondelete='SET NULL'),
                  nullable=True))
    op.add_column('reviews', sa.Column('auto_transition_task', sa.Boolean(),
                  nullable=False, server_default='true'))
    op.create_index('ix_reviews_task_id', 'reviews', ['task_id'])


def downgrade() -> None:
    """Remove multi-user collaboration tables and columns."""
    # Remove columns from reviews
    op.drop_index('ix_reviews_task_id', table_name='reviews')
    op.drop_column('reviews', 'auto_transition_task')
    op.drop_column('reviews', 'task_id')

    # Remove recurring_rule_id from tasks
    op.drop_index('ix_tasks_recurring_rule_id', table_name='tasks')
    op.drop_column('tasks', 'recurring_rule_id')

    # Drop tables in reverse order of creation (due to foreign keys)
    op.drop_table('task_custom_field_values')
    op.drop_table('project_custom_fields')
    op.drop_index('ix_recurring_rules_active_next', table_name='recurring_task_rules')
    op.drop_table('recurring_task_rules')
    op.drop_table('task_documents')
    op.drop_index('ix_task_assignments_user_status', table_name='task_assignments')
    op.drop_table('task_assignments')
