"""rename metadata columns to match model names

Revision ID: 005
Revises: 004
Create Date: 2024-12-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005_rename_metadata_to_extra_data'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Rename metadata columns to match SQLAlchemy model column names."""
    # Models use 'extra_data' for these tables
    op.alter_column('projects', 'metadata', new_column_name='extra_data')
    op.alter_column('tasks', 'metadata', new_column_name='extra_data')
    op.alter_column('documents', 'metadata', new_column_name='extra_data')
    op.alter_column('activities', 'metadata', new_column_name='extra_data')
    op.alter_column('notifications', 'metadata', new_column_name='extra_data')

    # Paper model uses 'external_metadata'
    op.alter_column('papers', 'metadata', new_column_name='external_metadata')


def downgrade() -> None:
    """Rename columns back to metadata."""
    op.alter_column('projects', 'extra_data', new_column_name='metadata')
    op.alter_column('tasks', 'extra_data', new_column_name='metadata')
    op.alter_column('documents', 'extra_data', new_column_name='metadata')
    op.alter_column('activities', 'extra_data', new_column_name='metadata')
    op.alter_column('notifications', 'extra_data', new_column_name='metadata')
    op.alter_column('papers', 'external_metadata', new_column_name='metadata')
