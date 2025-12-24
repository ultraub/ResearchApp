"""Add user_id and organization_id to ai_pending_actions.

Revision ID: 034
Revises: 033
Create Date: 2024-12-24

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add organization_id column
    op.add_column(
        "ai_pending_actions",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    # Add user_id column
    op.add_column(
        "ai_pending_actions",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    # Populate the new columns from the related conversation
    op.execute("""
        UPDATE ai_pending_actions ap
        SET organization_id = c.organization_id,
            user_id = c.user_id
        FROM ai_conversations c
        WHERE ap.conversation_id = c.id
    """)

    # Now make them non-nullable
    op.alter_column("ai_pending_actions", "organization_id", nullable=False)
    op.alter_column("ai_pending_actions", "user_id", nullable=False)

    # Add foreign key constraints
    op.create_foreign_key(
        "fk_ai_pending_actions_organization_id",
        "ai_pending_actions",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_ai_pending_actions_user_id",
        "ai_pending_actions",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Create indexes for efficient querying
    op.create_index(
        "ix_ai_pending_actions_organization_id",
        "ai_pending_actions",
        ["organization_id"],
    )
    op.create_index(
        "ix_ai_pending_actions_user_id",
        "ai_pending_actions",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_ai_pending_actions_user_id", table_name="ai_pending_actions")
    op.drop_index("ix_ai_pending_actions_organization_id", table_name="ai_pending_actions")
    op.drop_constraint("fk_ai_pending_actions_user_id", "ai_pending_actions", type_="foreignkey")
    op.drop_constraint("fk_ai_pending_actions_organization_id", "ai_pending_actions", type_="foreignkey")
    op.drop_column("ai_pending_actions", "user_id")
    op.drop_column("ai_pending_actions", "organization_id")
