"""Project query tools for the AI Assistant."""

from typing import Any, Dict
from uuid import UUID

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.tools import QueryTool
from researchhub.models.project import Project, ProjectExclusion, ProjectMember, ProjectTeam, Task
from researchhub.models.organization import OrganizationMember, Team, TeamMember


class GetProjectsTool(QueryTool):
    """Get list of projects the user has access to."""

    @property
    def name(self) -> str:
        return "get_projects"

    @property
    def description(self) -> str:
        return "Get a list of projects the user has access to, optionally filtered by status or team. Returns project names, statuses, and task counts."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["active", "completed", "archived", "on_hold"],
                    "description": "Filter by project status",
                },
                "team_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Filter by team ID",
                },
                "limit": {
                    "type": "integer",
                    "default": 20,
                    "maximum": 50,
                    "description": "Maximum number of projects to return",
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
        """Execute the query and return projects."""
        status = input.get("status")
        team_id = input.get("team_id")
        limit = min(input.get("limit", 20), 50)

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

        # Subquery for projects where user is direct member
        project_member_subquery = (
            select(ProjectMember.project_id)
            .where(ProjectMember.user_id == user_id)
            .subquery()
        )

        # Subquery for projects accessible via project_teams (multi-team access)
        project_teams_subquery = (
            select(ProjectTeam.project_id)
            .where(ProjectTeam.team_id.in_(user_team_ids))
            .subquery()
        ) if user_team_ids else None

        # Subquery for org-public projects in user's organizations
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
        ) if user_org_ids else None

        # Subquery for excluded projects (blocklist)
        exclusion_exists = exists(
            select(ProjectExclusion.id).where(
                ProjectExclusion.project_id == Project.id,
                ProjectExclusion.user_id == user_id,
            )
        )

        # Build access conditions - projects accessible via:
        # 1. Primary team_id (user is member of the team)
        # 2. project_teams (multi-team access)
        # 3. Direct ProjectMember
        # 4. Org-public projects in user's organizations
        access_conditions = [Project.id.in_(select(project_member_subquery))]

        if user_team_ids:
            access_conditions.append(Project.team_id.in_(user_team_ids))
            if project_teams_subquery is not None:
                access_conditions.append(Project.id.in_(select(project_teams_subquery)))

        if org_public_subquery is not None:
            access_conditions.append(Project.id.in_(select(org_public_subquery)))

        # Base query with access control and exclusion check
        query = (
            select(Project)
            .where(
                and_(
                    or_(*access_conditions),
                    ~exclusion_exists,  # Exclude projects where user is in blocklist
                )
            )
            .where(Project.is_archived == False)
        )

        if status:
            query = query.where(Project.status == status)

        if team_id:
            query = query.where(Project.team_id == UUID(team_id))

        query = query.order_by(Project.updated_at.desc()).limit(limit)

        result = await db.execute(query)
        projects = result.scalars().all()

        # Get task counts for each project
        project_data = []
        for project in projects:
            # Count tasks
            task_count_result = await db.execute(
                select(func.count(Task.id)).where(Task.project_id == project.id)
            )
            task_count = task_count_result.scalar() or 0

            # Count completed tasks
            completed_count_result = await db.execute(
                select(func.count(Task.id))
                .where(Task.project_id == project.id)
                .where(Task.status == "done")
            )
            completed_count = completed_count_result.scalar() or 0

            project_data.append({
                "id": str(project.id),
                "name": project.name,
                "status": project.status,
                "emoji": project.emoji,
                "task_count": task_count,
                "completed_tasks": completed_count,
                "start_date": project.start_date.isoformat() if project.start_date else None,
                "target_end_date": project.target_end_date.isoformat() if project.target_end_date else None,
            })

        return {
            "projects": project_data,
            "count": len(project_data),
        }


class GetProjectDetailsTool(QueryTool):
    """Get detailed information about a specific project."""

    @property
    def name(self) -> str:
        return "get_project_details"

    @property
    def description(self) -> str:
        return "Get detailed information about a specific project including description, task breakdown by status, recent activity, and team members."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "The ID (UUID) of the project to get details for. Use get_projects first to find the project ID.",
                },
                "project_name": {
                    "type": "string",
                    "description": "The name of the project to search for (if you don't have the ID). Case-insensitive partial match.",
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
        """Execute the query and return project details."""
        project_id_str = input.get("project_id")
        project_name = input.get("project_name")

        if not project_id_str and not project_name:
            return {"error": "Either project_id or project_name is required"}

        project = None

        # Try to find by UUID first
        if project_id_str:
            try:
                project_id = UUID(project_id_str)
                project_result = await db.execute(
                    select(Project)
                    .options(selectinload(Project.members))
                    .where(Project.id == project_id)
                )
                project = project_result.scalar_one_or_none()
            except ValueError:
                # Not a valid UUID, treat as a name search
                project_name = project_id_str

        # If not found by ID, try to find by name
        if not project and project_name:
            project_result = await db.execute(
                select(Project)
                .options(selectinload(Project.members))
                .where(Project.name.ilike(f"%{project_name}%"))
                .limit(1)
            )
            project = project_result.scalar_one_or_none()

        if not project:
            return {"error": "Project not found"}

        # Check access using the same logic as the API
        # Get user's team memberships
        team_result = await db.execute(
            select(TeamMember.team_id).where(TeamMember.user_id == user_id)
        )
        user_team_ids = [row[0] for row in team_result.all()]

        # Check if user is excluded
        exclusion_result = await db.execute(
            select(ProjectExclusion).where(
                ProjectExclusion.project_id == project.id,
                ProjectExclusion.user_id == user_id,
            )
        )
        if exclusion_result.scalar_one_or_none():
            return {"error": "Access denied"}

        # Check access via:
        # 1. Direct ProjectMember
        member_result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == user_id,
            )
        )
        has_access = member_result.scalar_one_or_none() is not None

        # 2. Primary team_id
        if not has_access and project.team_id in user_team_ids:
            has_access = True

        # 3. project_teams (multi-team access)
        if not has_access and user_team_ids:
            project_team_result = await db.execute(
                select(ProjectTeam).where(
                    ProjectTeam.project_id == project.id,
                    ProjectTeam.team_id.in_(user_team_ids),
                )
            )
            if project_team_result.scalar_one_or_none():
                has_access = True

        # 4. Org-public access
        if not has_access and project.is_org_public:
            team_result = await db.execute(
                select(Team).where(Team.id == project.team_id)
            )
            team = team_result.scalar_one_or_none()
            if team and team.organization_id:
                org_member_result = await db.execute(
                    select(OrganizationMember).where(
                        OrganizationMember.organization_id == team.organization_id,
                        OrganizationMember.user_id == user_id,
                    )
                )
                if org_member_result.scalar_one_or_none():
                    has_access = True

        if not has_access:
            return {"error": "Project not found"}

        # Get task breakdown by status
        status_counts = {}
        for status in ["idea", "todo", "in_progress", "in_review", "done"]:
            count_result = await db.execute(
                select(func.count(Task.id))
                .where(Task.project_id == project.id)
                .where(Task.status == status)
            )
            status_counts[status] = count_result.scalar() or 0

        # Get recent tasks
        recent_tasks_result = await db.execute(
            select(Task)
            .where(Task.project_id == project.id)
            .order_by(Task.updated_at.desc())
            .limit(5)
        )
        recent_tasks = recent_tasks_result.scalars().all()

        return {
            "project": {
                "id": str(project.id),
                "name": project.name,
                "description": project.description,
                "status": project.status,
                "emoji": project.emoji,
                "start_date": project.start_date.isoformat() if project.start_date else None,
                "target_end_date": project.target_end_date.isoformat() if project.target_end_date else None,
                "created_at": project.created_at.isoformat(),
            },
            "task_breakdown": status_counts,
            "total_tasks": sum(status_counts.values()),
            "recent_tasks": [
                {
                    "id": str(task.id),
                    "title": task.title,
                    "status": task.status,
                    "priority": task.priority,
                }
                for task in recent_tasks
            ],
            "member_count": len(project.members) if project.members else 0,
        }
