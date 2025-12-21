"""Add idea_votes table for voting on ideas

Ideas are tasks with status='idea'. This table tracks user votes/endorsements
on ideas to help prioritize which ideas should be converted to tasks or projects.

Revision ID: 027
Revises: 026
Create Date: 2025-12-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PGUUID


# revision identifiers, used by Alembic.
revision: str = '027'
down_revision: Union[str, None] = '026'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create idea_votes table for tracking user votes on ideas
    op.create_table(
        'idea_votes',
        sa.Column('id', PGUUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('task_id', PGUUID(as_uuid=True), nullable=False),
        sa.Column('user_id', PGUUID(as_uuid=True), nullable=False),
        sa.Column('vote_type', sa.String(20), nullable=False,
                  server_default='upvote'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('task_id', 'user_id', name='uq_idea_vote_task_user'),
    )

    # Create indexes for efficient lookups
    op.create_index('ix_idea_votes_task_id', 'idea_votes', ['task_id'])
    op.create_index('ix_idea_votes_user_id', 'idea_votes', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_idea_votes_user_id', table_name='idea_votes')
    op.drop_index('ix_idea_votes_task_id', table_name='idea_votes')
    op.drop_table('idea_votes')
