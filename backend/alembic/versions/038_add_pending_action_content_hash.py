"""Add content_hash to ai_pending_actions for deduplication

Revision ID: 038
Revises: 037
Create Date: 2024-12-25

Changes:
- Add content_hash column for deduplication of CREATE operations
- Hash of tool_input allows multiple creates of different entities
  while preventing true duplicates
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add content_hash column for CREATE operation deduplication
    op.add_column(
        'ai_pending_actions',
        sa.Column('content_hash', sa.String(32), nullable=True)
    )

    # Add index for efficient lookups during deduplication
    op.create_index(
        'ix_ai_pending_actions_content_hash',
        'ai_pending_actions',
        ['content_hash']
    )


def downgrade() -> None:
    op.drop_index('ix_ai_pending_actions_content_hash', 'ai_pending_actions')
    op.drop_column('ai_pending_actions', 'content_hash')
