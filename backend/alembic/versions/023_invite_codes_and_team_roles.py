"""Add invite_codes table and extend team member roles.

Adds:
- invite_codes table for shareable team/org join links
- Unique constraints for org_members and team_members
- XOR constraint on invite_codes (org OR team, not both)
- Support for 'owner' role in team_members

Revision ID: 023
Revises: 022
Create Date: 2024-12-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '023'
down_revision: Union[str, None] = '022'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create invite_codes table
    op.create_table(
        'invite_codes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('code', sa.String(20), nullable=False, unique=True, index=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('organizations.id', ondelete='CASCADE'),
                  nullable=True, index=True),
        sa.Column('team_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('teams.id', ondelete='CASCADE'),
                  nullable=True, index=True),
        sa.Column('role', sa.String(50), nullable=False, server_default='member'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('max_uses', sa.Integer, nullable=True),
        sa.Column('use_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        # Constraint: must have org_id XOR team_id (not both, not neither)
        sa.CheckConstraint(
            '(organization_id IS NOT NULL AND team_id IS NULL) OR '
            '(organization_id IS NULL AND team_id IS NOT NULL)',
            name='chk_invite_code_target'
        ),
    )

    # 2. Add unique constraint for organization members (prevent duplicate memberships)
    op.create_unique_constraint(
        'uq_organization_member',
        'organization_members',
        ['organization_id', 'user_id']
    )

    # 3. Add unique constraint for team members (prevent duplicate memberships)
    op.create_unique_constraint(
        'uq_team_member',
        'team_members',
        ['team_id', 'user_id']
    )


def downgrade() -> None:
    # Drop unique constraints
    op.drop_constraint('uq_team_member', 'team_members', type_='unique')
    op.drop_constraint('uq_organization_member', 'organization_members', type_='unique')

    # Drop invite_codes table
    op.drop_table('invite_codes')
