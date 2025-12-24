"""Attention summary query tools for the AI Assistant."""

from datetime import date, datetime, timedelta
from typing import Any, Dict
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.tools import QueryTool
from researchhub.models.project import Blocker, Project, Task
from researchhub.models.organization import Team


class GetAttentionSummaryTool(QueryTool):
    """Get items requiring immediate attention."""

    @property
    def name(self) -> str:
        return "get_attention_summary"

    @property
    def description(self) -> str:
        return "Get a summary of items requiring attention: overdue tasks, upcoming deadlines, open blockers, and stalled work. Useful for answering 'what should I focus on today?'"

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Limit attention summary to a specific project",
                },
                "assignee_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Filter to tasks assigned to a specific user",
                },
                "days_ahead": {
                    "type": "integer",
                    "default": 7,
                    "maximum": 30,
                    "description": "Number of days ahead to look for upcoming deadlines",
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
        """Execute the query and return attention summary."""
        project_id = input.get("project_id")
        assignee_id = input.get("assignee_id")
        days_ahead = min(input.get("days_ahead", 7), 30)

        today = date.today()
        future_date = today + timedelta(days=days_ahead)

        result: Dict[str, Any] = {
            "overdue_tasks": [],
            "upcoming_deadlines": [],
            "open_blockers": [],
            "stalled_tasks": [],
            "summary": {},
        }

        # Base filters for tasks
        task_filters = []
        if project_id:
            task_filters.append(Task.project_id == UUID(project_id))
        if assignee_id:
            task_filters.append(Task.assignee_id == UUID(assignee_id))

        # 1. Overdue tasks (due date < today, not done) - join through Project and Team for org access
        overdue_query = (
            select(Task)
            .join(Project, Task.project_id == Project.id)
            .join(Team, Project.team_id == Team.id)
            .where(
                or_(
                    Team.organization_id == org_id,
                    and_(Team.is_personal == True, Team.owner_id == user_id),
                )
            )
            .options(selectinload(Task.assignee), selectinload(Task.project))
            .where(Task.due_date < today)
            .where(Task.status != "done")
        )
        if task_filters:
            overdue_query = overdue_query.where(and_(*task_filters))
        overdue_query = overdue_query.order_by(Task.due_date.asc()).limit(10)

        overdue_result = await db.execute(overdue_query)
        overdue_tasks = overdue_result.scalars().all()

        result["overdue_tasks"] = [
            {
                "id": str(task.id),
                "title": task.title,
                "due_date": task.due_date.isoformat(),
                "days_overdue": (today - task.due_date).days,
                "priority": task.priority,
                "status": task.status,
                "assignee": task.assignee.display_name if task.assignee else None,
                "project": task.project.name if task.project else None,
            }
            for task in overdue_tasks
        ]

        # 2. Upcoming deadlines (due date between today and future_date, not done) - join for org access
        upcoming_query = (
            select(Task)
            .join(Project, Task.project_id == Project.id)
            .join(Team, Project.team_id == Team.id)
            .where(
                or_(
                    Team.organization_id == org_id,
                    and_(Team.is_personal == True, Team.owner_id == user_id),
                )
            )
            .options(selectinload(Task.assignee), selectinload(Task.project))
            .where(Task.due_date >= today)
            .where(Task.due_date <= future_date)
            .where(Task.status != "done")
        )
        if task_filters:
            upcoming_query = upcoming_query.where(and_(*task_filters))
        upcoming_query = upcoming_query.order_by(Task.due_date.asc()).limit(10)

        upcoming_result = await db.execute(upcoming_query)
        upcoming_tasks = upcoming_result.scalars().all()

        result["upcoming_deadlines"] = [
            {
                "id": str(task.id),
                "title": task.title,
                "due_date": task.due_date.isoformat(),
                "days_until_due": (task.due_date - today).days,
                "priority": task.priority,
                "status": task.status,
                "assignee": task.assignee.display_name if task.assignee else None,
                "project": task.project.name if task.project else None,
            }
            for task in upcoming_tasks
        ]

        # 3. Open blockers - join through Project and Team for org access
        blocker_query = (
            select(Blocker)
            .join(Project, Blocker.project_id == Project.id)
            .join(Team, Project.team_id == Team.id)
            .where(
                or_(
                    Team.organization_id == org_id,
                    and_(Team.is_personal == True, Team.owner_id == user_id),
                )
            )
            .options(
                selectinload(Blocker.assignee),
                selectinload(Blocker.blocker_links),
            )
            .where(Blocker.status.in_(["open", "in_progress"]))
        )
        if project_id:
            blocker_query = blocker_query.where(Blocker.project_id == UUID(project_id))
        blocker_query = blocker_query.order_by(
            Blocker.priority.desc(), Blocker.created_at.asc()
        ).limit(10)

        blocker_result = await db.execute(blocker_query)
        blockers = blocker_result.scalars().all()

        result["open_blockers"] = [
            {
                "id": str(blocker.id),
                "title": blocker.title,
                "status": blocker.status,
                "priority": blocker.priority,
                "impact_level": blocker.impact_level,
                "blocker_type": blocker.blocker_type,
                "assignee": blocker.assignee.display_name if blocker.assignee else None,
                "blocked_items_count": len(blocker.blocker_links) if blocker.blocker_links else 0,
                "days_open": (datetime.now(blocker.created_at.tzinfo) - blocker.created_at).days if blocker.created_at else 0,
            }
            for blocker in blockers
        ]

        # 4. Stalled tasks (in_progress for >7 days without updates) - join for org access
        stale_date = datetime.now() - timedelta(days=7)
        stalled_query = (
            select(Task)
            .join(Project, Task.project_id == Project.id)
            .join(Team, Project.team_id == Team.id)
            .where(
                or_(
                    Team.organization_id == org_id,
                    and_(Team.is_personal == True, Team.owner_id == user_id),
                )
            )
            .options(selectinload(Task.assignee), selectinload(Task.project))
            .where(Task.status == "in_progress")
            .where(Task.updated_at < stale_date)
        )
        if task_filters:
            stalled_query = stalled_query.where(and_(*task_filters))
        stalled_query = stalled_query.order_by(Task.updated_at.asc()).limit(10)

        stalled_result = await db.execute(stalled_query)
        stalled_tasks = stalled_result.scalars().all()

        result["stalled_tasks"] = [
            {
                "id": str(task.id),
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
                "last_updated": task.updated_at.isoformat(),
                "days_since_update": (datetime.now(task.updated_at.tzinfo) - task.updated_at).days if task.updated_at else 0,
                "assignee": task.assignee.display_name if task.assignee else None,
                "project": task.project.name if task.project else None,
            }
            for task in stalled_tasks
        ]

        # Summary counts
        result["summary"] = {
            "overdue_count": len(result["overdue_tasks"]),
            "upcoming_count": len(result["upcoming_deadlines"]),
            "blocker_count": len(result["open_blockers"]),
            "stalled_count": len(result["stalled_tasks"]),
            "total_attention_items": (
                len(result["overdue_tasks"])
                + len(result["open_blockers"])
                + len(result["stalled_tasks"])
            ),
        }

        return result
