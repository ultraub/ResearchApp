"""Team member query tools for the AI Assistant."""

from typing import Any, Dict, List
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.tools import QueryTool
from researchhub.models.user import User
from researchhub.models.project import Project, ProjectMember
from researchhub.models.organization import OrganizationMember, Team, TeamMember


class GetTeamMembersTool(QueryTool):
    """Get team or project members for assignment purposes."""

    @property
    def name(self) -> str:
        return "get_team_members"

    @property
    def description(self) -> str:
        return "Get team or project members, or search for a person by name. Use this to find a user's ID when you need to query their tasks, assignments, or blockers."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Search for members by name (partial match, case-insensitive). Use this to find a person's ID.",
                },
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Get members of a specific project",
                },
                "team_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Get members of a specific team",
                },
                "include_roles": {
                    "type": "boolean",
                    "default": True,
                    "description": "Include role information for each member",
                },
            },
        }

    async def execute(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Execute the query and return team members."""
        name_search = input.get("name")
        project_id = input.get("project_id")
        team_id = input.get("team_id")
        include_roles = input.get("include_roles", True)

        members: List[Dict[str, Any]] = []

        # Name-based search takes priority - find users by name
        if name_search:
            search_pattern = f"%{name_search}%"
            user_query = (
                select(User)
                .join(OrganizationMember, User.id == OrganizationMember.user_id)
                .where(OrganizationMember.organization_id == org_id)
                .where(User.is_active == True)
                .where(
                    or_(
                        User.display_name.ilike(search_pattern),
                        User.email.ilike(search_pattern),
                    )
                )
                .order_by(User.display_name)
                .limit(10)
            )
            user_result = await db.execute(user_query)
            users = user_result.scalars().all()

            members = [
                {
                    "id": str(user.id),
                    "name": user.display_name,
                    "email": user.email,
                    "title": user.title,
                }
                for user in users
            ]

            return {
                "context": "search",
                "search_query": name_search,
                "members": members,
                "count": len(members),
            }

        if project_id:
            # Get project members (join with Team to verify org or personal team access)
            project_query = (
                select(Project)
                .join(Team, Project.team_id == Team.id)
                .options(selectinload(Project.members))
                .where(Project.id == UUID(project_id))
                .where(
                    or_(
                        Team.organization_id == org_id,
                        and_(Team.is_personal == True, Team.owner_id == user_id),
                    )
                )
            )
            project_result = await db.execute(project_query)
            project = project_result.scalar_one_or_none()

            if not project:
                return {"error": "Project not found", "members": []}

            # Get detailed member info
            member_query = (
                select(ProjectMember)
                .options(selectinload(ProjectMember.user))
                .where(ProjectMember.project_id == UUID(project_id))
            )
            member_result = await db.execute(member_query)
            project_members = member_result.scalars().all()

            for pm in project_members:
                if pm.user:
                    member_data = {
                        "id": str(pm.user.id),
                        "name": pm.user.display_name,
                        "email": pm.user.email,
                    }
                    if include_roles:
                        member_data["role"] = pm.role
                    members.append(member_data)

            return {
                "context": "project",
                "project_name": project.name,
                "members": members,
                "count": len(members),
            }

        elif team_id:
            # Get team members - verify org or personal team access
            team_query = (
                select(Team)
                .where(Team.id == UUID(team_id))
                .where(
                    or_(
                        Team.organization_id == org_id,
                        and_(Team.is_personal == True, Team.owner_id == user_id),
                    )
                )
            )
            team_result = await db.execute(team_query)
            team = team_result.scalar_one_or_none()

            if not team:
                return {"error": "Team not found", "members": []}

            # Get detailed member info
            member_query = (
                select(TeamMember)
                .options(selectinload(TeamMember.user))
                .where(TeamMember.team_id == UUID(team_id))
            )
            member_result = await db.execute(member_query)
            team_members = member_result.scalars().all()

            for tm in team_members:
                if tm.user:
                    member_data = {
                        "id": str(tm.user.id),
                        "name": tm.user.display_name,
                        "email": tm.user.email,
                    }
                    if include_roles:
                        member_data["role"] = tm.role
                    members.append(member_data)

            return {
                "context": "team",
                "team_name": team.name,
                "members": members,
                "count": len(members),
            }

        else:
            # Get all organization users the current user can see
            # Users are linked to organizations via OrganizationMember
            user_query = (
                select(User)
                .join(OrganizationMember, User.id == OrganizationMember.user_id)
                .where(OrganizationMember.organization_id == org_id)
                .where(User.is_active == True)
                .order_by(User.display_name)
                .limit(50)
            )
            user_result = await db.execute(user_query)
            users = user_result.scalars().all()

            members = [
                {
                    "id": str(user.id),
                    "name": user.display_name,
                    "email": user.email,
                }
                for user in users
            ]

            return {
                "context": "organization",
                "members": members,
                "count": len(members),
            }
