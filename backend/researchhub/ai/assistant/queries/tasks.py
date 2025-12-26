"""Task query tools for the AI Assistant."""

from datetime import date, datetime
from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.queries.access import get_accessible_project_ids
from researchhub.ai.assistant.tools import QueryTool
from researchhub.models.project import Blocker, BlockerLink, Project, Task, TaskAssignment, TaskComment
from researchhub.models.user import User
from researchhub.models.organization import OrganizationMember


class GetTasksTool(QueryTool):
    """Get tasks with optional filters."""

    @property
    def name(self) -> str:
        return "get_tasks"

    @property
    def description(self) -> str:
        return "Get tasks, optionally filtered by project, status, assignee, priority, or due date. Returns task titles, statuses, priorities, and due dates."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "Filter by project - can be a project ID (UUID) or project name",
                },
                "status": {
                    "type": "string",
                    "enum": ["idea", "todo", "in_progress", "in_review", "done"],
                    "description": "Filter by task status",
                },
                "assignee_id": {
                    "type": "string",
                    "description": "Filter by assignee - can be a user ID (UUID) or a person's name",
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "urgent"],
                    "description": "Filter by priority level",
                },
                "due_before": {
                    "type": "string",
                    "format": "date",
                    "description": "Filter tasks due before this date (YYYY-MM-DD)",
                },
                "due_after": {
                    "type": "string",
                    "format": "date",
                    "description": "Filter tasks due after this date (YYYY-MM-DD)",
                },
                "limit": {
                    "type": "integer",
                    "default": 20,
                    "maximum": 50,
                    "description": "Maximum number of tasks to return",
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
        """Execute the query and return tasks."""
        project_id = input.get("project_id")
        status = input.get("status")
        assignee_id = input.get("assignee_id")
        priority = input.get("priority")
        due_before = input.get("due_before")
        due_after = input.get("due_after")
        limit = min(input.get("limit", 20), 50)

        # Get accessible project IDs for the user
        accessible_project_ids = await get_accessible_project_ids(db, user_id)

        if not accessible_project_ids:
            return {"tasks": [], "count": 0}

        # Build query - filter by accessible projects
        query = (
            select(Task)
            .where(Task.project_id.in_(accessible_project_ids))
            .options(selectinload(Task.assignee))
        )

        filters = []

        if project_id:
            # Try to parse as UUID first, otherwise search by name
            resolved_project_id = None
            try:
                resolved_project_id = UUID(project_id)
            except ValueError:
                # Not a UUID, search by name
                project_result = await db.execute(
                    select(Project)
                    .where(Project.id.in_(accessible_project_ids))
                    .where(Project.name.ilike(f"%{project_id}%"))
                    .limit(1)
                )
                project = project_result.scalar_one_or_none()
                if project:
                    resolved_project_id = project.id
                else:
                    return {
                        "error": f"No project found matching '{project_id}'.",
                        "tasks": [],
                        "count": 0,
                    }

            filters.append(Task.project_id == resolved_project_id)

        if status:
            filters.append(Task.status == status)

        if assignee_id:
            # Try to parse as UUID first, otherwise search by name
            resolved_assignee_id = None
            try:
                resolved_assignee_id = UUID(assignee_id)
            except ValueError:
                # Not a UUID, search by name
                search_pattern = f"%{assignee_id}%"
                user_result = await db.execute(
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
                    .limit(1)
                )
                user = user_result.scalar_one_or_none()
                if user:
                    resolved_assignee_id = user.id
                else:
                    # No user found with that name
                    return {
                        "error": f"No user found matching '{assignee_id}'. Please check the name or use get_team_members to find the correct person.",
                        "tasks": [],
                        "count": 0,
                    }

            # Check both the direct assignee_id and task_assignments table
            assigned_via_assignments = select(TaskAssignment.task_id).where(
                TaskAssignment.user_id == resolved_assignee_id
            )
            filters.append(
                or_(
                    Task.assignee_id == resolved_assignee_id,
                    Task.id.in_(assigned_via_assignments),
                )
            )

        if priority:
            filters.append(Task.priority == priority)

        if due_before:
            due_date = date.fromisoformat(due_before)
            filters.append(Task.due_date <= due_date)

        if due_after:
            due_date = date.fromisoformat(due_after)
            filters.append(Task.due_date >= due_date)

        if filters:
            query = query.where(and_(*filters))

        query = query.order_by(Task.due_date.asc().nullslast(), Task.priority.desc()).limit(limit)

        result = await db.execute(query)
        tasks = result.scalars().all()

        return {
            "tasks": [
                {
                    "id": str(task.id),
                    "title": task.title,
                    "status": task.status,
                    "priority": task.priority,
                    "due_date": task.due_date.isoformat() if task.due_date else None,
                    "assignee": task.assignee.display_name if task.assignee else None,
                    "project_id": str(task.project_id) if task.project_id else None,
                }
                for task in tasks
            ],
            "count": len(tasks),
        }


class GetTaskDetailsTool(QueryTool):
    """Get detailed information about a specific task."""

    @property
    def name(self) -> str:
        return "get_task_details"

    @property
    def description(self) -> str:
        return "Get full details of a task including description, comments, assignments, blockers, and linked documents."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The ID of the task to get details for",
                },
            },
            "required": ["task_id"],
        }

    async def execute(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Execute the query and return task details."""
        task_id = UUID(input["task_id"])

        # Get accessible project IDs for the user
        accessible_project_ids = await get_accessible_project_ids(db, user_id)

        # Get task with relationships - verify user has access to the project
        query = (
            select(Task)
            .options(
                selectinload(Task.assignee),
                selectinload(Task.project),
            )
            .where(Task.id == task_id)
            .where(Task.project_id.in_(accessible_project_ids) if accessible_project_ids else False)
        )

        result = await db.execute(query)
        task = result.scalar_one_or_none()

        if not task:
            return {"error": "Task not found"}

        # Get comments
        comments_result = await db.execute(
            select(TaskComment)
            .options(selectinload(TaskComment.user))
            .where(TaskComment.task_id == task_id)
            .order_by(TaskComment.created_at.desc())
            .limit(10)
        )
        comments = comments_result.scalars().all()

        # Get blockers linked to this task
        blocker_links_result = await db.execute(
            select(BlockerLink)
            .options(selectinload(BlockerLink.blocker))
            .where(BlockerLink.blocked_entity_type == "task")
            .where(BlockerLink.blocked_entity_id == task_id)
        )
        blocker_links = blocker_links_result.scalars().all()

        blockers = []
        for link in blocker_links:
            if link.blocker:
                blockers.append({
                    "id": str(link.blocker.id),
                    "title": link.blocker.title,
                    "status": link.blocker.status,
                    "priority": link.blocker.priority,
                })

        return {
            "task": {
                "id": str(task.id),
                "title": task.title,
                "description": task.description if isinstance(task.description, str) else None,
                "status": task.status,
                "priority": task.priority,
                "task_type": task.task_type,
                "due_date": task.due_date.isoformat() if task.due_date else None,
                "completed_at": task.completed_at.isoformat() if task.completed_at else None,
                "created_at": task.created_at.isoformat(),
                "updated_at": task.updated_at.isoformat(),
            },
            "assignee": {
                "id": str(task.assignee.id),
                "name": task.assignee.display_name,
            } if task.assignee else None,
            "project": {
                "id": str(task.project.id),
                "name": task.project.name,
            } if task.project else None,
            "comments": [
                {
                    "id": str(comment.id),
                    "content": comment.content,
                    "author": comment.user.display_name if comment.user else "Unknown",
                    "created_at": comment.created_at.isoformat(),
                }
                for comment in comments
            ],
            "blockers": blockers,
            "comment_count": len(comments),
        }
