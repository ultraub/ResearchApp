"""Add AI pending actions table for assistant approval workflow.

Revision ID: 032
Revises: 031
Create Date: 2024-12-24

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_pending_actions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        # Link to conversation
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Action details
        sa.Column("tool_name", sa.String(100), nullable=False),
        sa.Column("tool_input", postgresql.JSONB, nullable=False),
        # Entity being modified
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        # State capture for diff
        sa.Column("old_state", postgresql.JSONB, nullable=True),
        sa.Column("new_state", postgresql.JSONB, nullable=False),
        # Human-readable description
        sa.Column("description", sa.Text, nullable=True),
        # Status tracking
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        # Approval tracking
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        # Result after execution
        sa.Column("result", postgresql.JSONB, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        # Expiry
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        # Primary key and foreign keys
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["ai_conversations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["message_id"],
            ["ai_conversation_messages.id"],
            ondelete="SET NULL",
        ),
    )

    # Create indexes for common queries
    op.create_index(
        "ix_ai_pending_actions_conversation_id",
        "ai_pending_actions",
        ["conversation_id"],
    )
    op.create_index(
        "ix_ai_pending_actions_status",
        "ai_pending_actions",
        ["status"],
    )
    op.create_index(
        "ix_ai_pending_actions_expires_at",
        "ai_pending_actions",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_pending_actions_expires_at", table_name="ai_pending_actions")
    op.drop_index("ix_ai_pending_actions_status", table_name="ai_pending_actions")
    op.drop_index("ix_ai_pending_actions_conversation_id", table_name="ai_pending_actions")
    op.drop_table("ai_pending_actions")
