"""Settings cleanup: add theme_customization, remove language/timezone, fix view modes

Revision ID: 037
Revises: 036
Create Date: 2024-12-25

Changes:
- Add theme_customization JSONB column for cross-device theme persistence
- Remove unused language and timezone columns
- Update default_project_view values: kanban->grid, timeline->grouped
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add theme_customization JSONB column
    op.add_column(
        'user_preferences',
        sa.Column('theme_customization', JSONB, server_default='{}', nullable=False)
    )

    # Remove unused columns
    op.drop_column('user_preferences', 'language')
    op.drop_column('user_preferences', 'timezone')

    # Fix view mode enum mismatch
    # Backend had: list|kanban|timeline
    # Frontend uses: grid|list|grouped
    # Map old values to new values
    op.execute(
        "UPDATE user_preferences SET default_project_view = 'grid' "
        "WHERE default_project_view = 'kanban'"
    )
    op.execute(
        "UPDATE user_preferences SET default_project_view = 'grouped' "
        "WHERE default_project_view = 'timeline'"
    )


def downgrade() -> None:
    # Restore language column
    op.add_column(
        'user_preferences',
        sa.Column('language', sa.String(10), server_default='en', nullable=False)
    )

    # Restore timezone column
    op.add_column(
        'user_preferences',
        sa.Column('timezone', sa.String(50), server_default='UTC', nullable=False)
    )

    # Revert view mode values
    op.execute(
        "UPDATE user_preferences SET default_project_view = 'kanban' "
        "WHERE default_project_view = 'grid'"
    )
    op.execute(
        "UPDATE user_preferences SET default_project_view = 'timeline' "
        "WHERE default_project_view = 'grouped'"
    )

    # Remove theme_customization column
    op.drop_column('user_preferences', 'theme_customization')
