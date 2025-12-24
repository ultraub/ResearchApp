"""Project query tools for the AI Assistant."""

from typing import Any, Dict
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.tools import QueryTool
from researchhub.models.project import Project, Task


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

        # Build query for projects user has access to
        query = (
            select(Project)
            .where(Project.organization_id == org_id)
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
                    "format": "uuid",
                    "description": "The ID of the project to get details for",
                },
            },
            "required": ["project_id"],
        }

    async def execute(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Execute the query and return project details."""
        project_id = UUID(input["project_id"])

        # Get project with relationships
        query = (
            select(Project)
            .options(selectinload(Project.members))
            .where(Project.id == project_id)
            .where(Project.organization_id == org_id)
        )

        result = await db.execute(query)
        project = result.scalar_one_or_none()

        if not project:
            return {"error": "Project not found"}

        # Get task breakdown by status
        status_counts = {}
        for status in ["idea", "todo", "in_progress", "in_review", "done"]:
            count_result = await db.execute(
                select(func.count(Task.id))
                .where(Task.project_id == project_id)
                .where(Task.status == status)
            )
            status_counts[status] = count_result.scalar() or 0

        # Get recent tasks
        recent_tasks_result = await db.execute(
            select(Task)
            .where(Task.project_id == project_id)
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
