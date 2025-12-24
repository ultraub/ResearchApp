"""Increase avatar_url column size to 2048

Revision ID: 036
Revises: 035
Create Date: 2024-12-24

Google avatar URLs can be 800+ characters, exceeding the previous 500 limit.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Increase avatar_url column size from 500 to 2048
    op.alter_column(
        'users',
        'avatar_url',
        existing_type=sa.VARCHAR(length=500),
        type_=sa.VARCHAR(length=2048),
        existing_nullable=True,
    )


def downgrade() -> None:
    # Revert to original size (may truncate data)
    op.alter_column(
        'users',
        'avatar_url',
        existing_type=sa.VARCHAR(length=2048),
        type_=sa.VARCHAR(length=500),
        existing_nullable=True,
    )
