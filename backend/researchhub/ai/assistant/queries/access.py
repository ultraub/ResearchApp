"""Access control helpers for AI Assistant queries.

Provides consistent project access control matching the main API's behavior.
"""

from typing import List
from uuid import UUID

from sqlalchemy import and_, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from researchhub.models.organization import OrganizationMember, Team, TeamMember
from researchhub.models.project import Project, ProjectExclusion, ProjectMember, ProjectTeam


async def get_accessible_project_ids(
    db: AsyncSession,
    user_id: UUID,
) -> List[UUID]:
    """Get list of project IDs the user has access to.

    Access is granted via:
    1. Direct ProjectMember
    2. Primary team_id (user is member of the team)
    3. project_teams (multi-team access)
    4. Org-public projects in user's organizations

    Excludes projects where user is in blocklist.
    """
    # Get user's team memberships
    team_result = await db.execute(
        select(TeamMember.team_id).where(TeamMember.user_id == user_id)
    )
    user_team_ids = [row[0] for row in team_result.all()]

    # Get user's organization memberships for org-public access
    org_result = await db.execute(
        select(OrganizationMember.organization_id).where(
            OrganizationMember.user_id == user_id
        )
    )
    user_org_ids = [row[0] for row in org_result.all()]

    # Subquery for excluded projects (blocklist)
    exclusion_exists = exists(
        select(ProjectExclusion.id).where(
            ProjectExclusion.project_id == Project.id,
            ProjectExclusion.user_id == user_id,
        )
    )

    # Build access conditions
    access_conditions = []

    # 1. Direct ProjectMember
    project_member_subquery = (
        select(ProjectMember.project_id)
        .where(ProjectMember.user_id == user_id)
        .subquery()
    )
    access_conditions.append(Project.id.in_(select(project_member_subquery)))

    if user_team_ids:
        # 2. Primary team_id
        access_conditions.append(Project.team_id.in_(user_team_ids))

        # 3. project_teams (multi-team access)
        project_teams_subquery = (
            select(ProjectTeam.project_id)
            .where(ProjectTeam.team_id.in_(user_team_ids))
            .subquery()
        )
        access_conditions.append(Project.id.in_(select(project_teams_subquery)))

    if user_org_ids:
        # 4. Org-public projects
        org_public_subquery = (
            select(Project.id)
            .join(Team, Project.team_id == Team.id)
            .where(
                and_(
                    Project.is_org_public == True,
                    Team.organization_id.in_(user_org_ids),
                )
            )
            .subquery()
        )
        access_conditions.append(Project.id.in_(select(org_public_subquery)))

    # Query accessible project IDs
    # Exclude demo projects - they are for onboarding/examples only
    query = (
        select(Project.id)
        .where(
            and_(
                or_(*access_conditions) if access_conditions else False,
                ~exclusion_exists,
                Project.is_demo == False,  # Exclude demo projects from AI queries
            )
        )
    )

    result = await db.execute(query)
    return [row[0] for row in result.all()]


def build_project_access_filter(
    user_team_ids: List[UUID],
    user_org_ids: List[UUID],
    user_id: UUID,
) -> tuple:
    """Build SQLAlchemy filter conditions for project access.

    Returns a tuple of (access_conditions, exclusion_exists) that can be used
    to filter queries.
    """
    # Subquery for excluded projects (blocklist)
    exclusion_exists = exists(
        select(ProjectExclusion.id).where(
            ProjectExclusion.project_id == Project.id,
            ProjectExclusion.user_id == user_id,
        )
    )

    # Build access conditions
    access_conditions = []

    # 1. Direct ProjectMember
    project_member_subquery = (
        select(ProjectMember.project_id)
        .where(ProjectMember.user_id == user_id)
        .subquery()
    )
    access_conditions.append(Project.id.in_(select(project_member_subquery)))

    if user_team_ids:
        # 2. Primary team_id
        access_conditions.append(Project.team_id.in_(user_team_ids))

        # 3. project_teams (multi-team access)
        project_teams_subquery = (
            select(ProjectTeam.project_id)
            .where(ProjectTeam.team_id.in_(user_team_ids))
            .subquery()
        )
        access_conditions.append(Project.id.in_(select(project_teams_subquery)))

    if user_org_ids:
        # 4. Org-public projects
        org_public_subquery = (
            select(Project.id)
            .join(Team, Project.team_id == Team.id)
            .where(
                and_(
                    Project.is_org_public == True,
                    Team.organization_id.in_(user_org_ids),
                )
            )
            .subquery()
        )
        access_conditions.append(Project.id.in_(select(org_public_subquery)))

    return access_conditions, exclusion_exists
