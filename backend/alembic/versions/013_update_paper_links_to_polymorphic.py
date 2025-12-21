"""update paper_links to polymorphic model

Revision ID: 013
Revises: 012
Create Date: 2025-12-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '013'
down_revision: Union[str, None] = '012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old constraints and indexes
    op.drop_constraint('uq_paper_link', 'paper_links', type_='unique')
    op.drop_constraint('paper_links_source_paper_id_fkey', 'paper_links', type_='foreignkey')
    op.drop_constraint('paper_links_target_paper_id_fkey', 'paper_links', type_='foreignkey')
    op.drop_index('ix_paper_links_source_paper_id', table_name='paper_links')
    op.drop_index('ix_paper_links_target_paper_id', table_name='paper_links')

    # Rename source_paper_id to paper_id
    op.alter_column('paper_links', 'source_paper_id', new_column_name='paper_id')

    # Drop target_paper_id and add new columns
    op.drop_column('paper_links', 'target_paper_id')

    # Add new columns for polymorphic links
    op.add_column('paper_links', sa.Column('linked_entity_type', sa.String(50), nullable=False, server_default='paper'))
    op.add_column('paper_links', sa.Column('linked_entity_id', sa.UUID(), nullable=False, server_default='00000000-0000-0000-0000-000000000000'))
    op.add_column('paper_links', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))

    # Remove server defaults (they were just for the migration)
    op.alter_column('paper_links', 'linked_entity_type', server_default=None)
    op.alter_column('paper_links', 'linked_entity_id', server_default=None)

    # Update link_type default
    op.alter_column('paper_links', 'link_type', server_default='reference')

    # Add new indexes
    op.create_index('ix_paper_links_paper_id', 'paper_links', ['paper_id'])
    op.create_index('ix_paper_links_linked_entity_id', 'paper_links', ['linked_entity_id'])

    # Add new foreign key
    op.create_foreign_key(
        'paper_links_paper_id_fkey',
        'paper_links',
        'papers',
        ['paper_id'],
        ['id'],
        ondelete='CASCADE'
    )


def downgrade() -> None:
    # This is a destructive migration - downgrade will lose data
    op.drop_constraint('paper_links_paper_id_fkey', 'paper_links', type_='foreignkey')
    op.drop_index('ix_paper_links_paper_id', table_name='paper_links')
    op.drop_index('ix_paper_links_linked_entity_id', table_name='paper_links')

    op.drop_column('paper_links', 'updated_at')
    op.drop_column('paper_links', 'linked_entity_id')
    op.drop_column('paper_links', 'linked_entity_type')

    # Rename paper_id back to source_paper_id
    op.alter_column('paper_links', 'paper_id', new_column_name='source_paper_id')

    # Add back target_paper_id (will be NULL)
    op.add_column('paper_links', sa.Column('target_paper_id', sa.UUID(), nullable=True))

    op.create_index('ix_paper_links_source_paper_id', 'paper_links', ['source_paper_id'])
    op.create_index('ix_paper_links_target_paper_id', 'paper_links', ['target_paper_id'])
