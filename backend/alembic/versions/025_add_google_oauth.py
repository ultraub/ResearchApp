"""Add google_id column to users table for Google OAuth.

Adds:
- google_id column to users table with unique constraint and index

Revision ID: 025
Revises: 024
Create Date: 2024-12-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '025'
down_revision: Union[str, None] = '024'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add google_id column to users table
    op.add_column(
        'users',
        sa.Column('google_id', sa.String(255), nullable=True)
    )

    # Create unique constraint and index
    op.create_unique_constraint(
        'uq_users_google_id',
        'users',
        ['google_id']
    )
    op.create_index(
        'ix_users_google_id',
        'users',
        ['google_id']
    )


def downgrade() -> None:
    # Drop index and constraint
    op.drop_index('ix_users_google_id', table_name='users')
    op.drop_constraint('uq_users_google_id', 'users', type_='unique')

    # Drop column
    op.drop_column('users', 'google_id')
