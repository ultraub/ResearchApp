"""Three-tier project access control with multi-team sharing.

Adds:
- project_teams table for multi-team project sharing
- project_exclusions table for blocklist model
- Renames visibility to scope with PERSONAL/TEAM/ORGANIZATION values
- is_org_public and org_public_role for organization-public projects
- Personal team support in teams and users tables
- Cross-organization sharing capability

Revision ID: 021
Revises: 020
Create Date: 2024-12-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '021'
down_revision: Union[str, None] = '020'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create project_teams table (multi-team support)
    op.create_table(
        'project_teams',
        sa.Column('project_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'),
                  nullable=False, primary_key=True),
        sa.Column('team_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('teams.id', ondelete='CASCADE'),
                  nullable=False, primary_key=True),
        sa.Column('role', sa.String(50), nullable=False, server_default='member'),
        sa.Column('added_by_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_project_teams_project_id', 'project_teams', ['project_id'])
    op.create_index('ix_project_teams_team_id', 'project_teams', ['team_id'])

    # 2. Create project_exclusions table (blocklist)
    op.create_table(
        'project_exclusions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('excluded_by_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('reason', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint('project_id', 'user_id', name='uq_project_exclusion'),
    )

    # 3. Rename visibility to scope and update values
    op.alter_column('projects', 'visibility', new_column_name='scope')

    # Update existing scope values to uppercase
    op.execute("UPDATE projects SET scope = 'TEAM' WHERE scope = 'team'")
    op.execute("UPDATE projects SET scope = 'ORGANIZATION' WHERE scope = 'organization'")
    op.execute("UPDATE projects SET scope = 'PERSONAL' WHERE scope = 'private'")

    # 4. Add new project columns
    op.add_column('projects', sa.Column('is_org_public', sa.Boolean,
                  nullable=False, server_default='false'))
    op.add_column('projects', sa.Column('org_public_role', sa.String(50),
                  nullable=False, server_default='viewer'))
    op.add_column('projects', sa.Column('allow_all_team_members', sa.Boolean,
                  nullable=False, server_default='true'))

    # 5. Modify teams table for personal teams
    # Make organization_id nullable for personal teams
    op.alter_column('teams', 'organization_id', nullable=True)

    op.add_column('teams', sa.Column('is_personal', sa.Boolean,
                  nullable=False, server_default='false'))
    op.add_column('teams', sa.Column('owner_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'),
                  nullable=True))

    # Partial unique index: one personal team per user
    op.create_index(
        'ix_teams_owner_personal',
        'teams',
        ['owner_id'],
        unique=True,
        postgresql_where=sa.text('is_personal = true')
    )

    # 6. Add user personal_team_id reference
    op.add_column('users', sa.Column('personal_team_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('teams.id', ondelete='SET NULL'),
                  nullable=True))

    # 7. Backfill project_teams from existing team_id
    # Every existing project gets its team_id added to project_teams
    op.execute("""
        INSERT INTO project_teams (project_id, team_id, role, created_at)
        SELECT id, team_id, 'member', NOW()
        FROM projects
        WHERE team_id IS NOT NULL
    """)


def downgrade() -> None:
    # Remove user column
    op.drop_column('users', 'personal_team_id')

    # Remove team columns and index
    op.drop_index('ix_teams_owner_personal', table_name='teams')
    op.drop_column('teams', 'owner_id')
    op.drop_column('teams', 'is_personal')

    # Restore organization_id as not nullable (will fail if any NULL values exist)
    op.alter_column('teams', 'organization_id', nullable=False)

    # Remove project columns
    op.drop_column('projects', 'allow_all_team_members')
    op.drop_column('projects', 'org_public_role')
    op.drop_column('projects', 'is_org_public')

    # Revert scope values and rename back to visibility
    op.execute("UPDATE projects SET scope = 'team' WHERE scope = 'TEAM'")
    op.execute("UPDATE projects SET scope = 'organization' WHERE scope = 'ORGANIZATION'")
    op.execute("UPDATE projects SET scope = 'private' WHERE scope = 'PERSONAL'")
    op.alter_column('projects', 'scope', new_column_name='visibility')

    # Drop new tables
    op.drop_table('project_exclusions')
    op.drop_index('ix_project_teams_team_id', table_name='project_teams')
    op.drop_index('ix_project_teams_project_id', table_name='project_teams')
    op.drop_table('project_teams')
