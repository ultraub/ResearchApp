"""Collaboration and team awareness query tools for the AI Assistant."""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List
from uuid import UUID

from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.tools import QueryTool
from researchhub.ai.assistant.queries.access import get_accessible_project_ids
from researchhub.models.activity import Activity
from researchhub.models.project import Project, Task, ProjectMember, TaskAssignment
from researchhub.models.user import User
from researchhub.models.organization import TeamMember


class GetTeamActivityTool(QueryTool):
    """Get recent activity from team members."""

    @property
    def name(self) -> str:
        return "get_team_activity"

    @property
    def description(self) -> str:
        return """Get recent activity from team members across accessible projects.

Shows what teammates are working on including:
- Tasks created, updated, or completed
- Documents created or edited
- Comments and mentions
- Project updates

Use this to understand team collaboration patterns and recent work."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "default": 7,
                    "minimum": 1,
                    "maximum": 30,
                    "description": "Number of days of activity to retrieve",
                },
                "user_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Filter to a specific user's activity",
                },
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Filter to a specific project",
                },
                "activity_types": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["task", "document", "comment", "project", "blocker"],
                    },
                    "description": "Filter by activity target types",
                },
                "limit": {
                    "type": "integer",
                    "default": 25,
                    "maximum": 100,
                    "description": "Maximum activities to return",
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
        """Get recent team activity."""
        days = input.get("days", 7)
        limit = min(input.get("limit", 25), 100)
        since = datetime.now(timezone.utc) - timedelta(days=days)

        # Get accessible project IDs for access control
        accessible_ids = await get_accessible_project_ids(db, user_id)

        # Build query
        query = (
            select(Activity)
            .where(
                Activity.organization_id == org_id,
                Activity.created_at >= since,
                or_(
                    Activity.project_id.in_(accessible_ids),
                    Activity.project_id.is_(None),
                ),
            )
            .options(selectinload(Activity.actor))
            .order_by(desc(Activity.created_at))
        )

        # Apply filters
        if input.get("user_id"):
            query = query.where(Activity.actor_id == UUID(input["user_id"]))

        if input.get("project_id"):
            project_id = UUID(input["project_id"])
            if project_id in accessible_ids:
                query = query.where(Activity.project_id == project_id)

        if input.get("activity_types"):
            query = query.where(Activity.target_type.in_(input["activity_types"]))

        query = query.limit(limit)

        result = await db.execute(query)
        activities = result.scalars().all()

        # Group by date for better readability
        activity_list = []
        for activity in activities:
            activity_list.append({
                "id": str(activity.id),
                "type": activity.activity_type,
                "action": activity.action,
                "description": activity.description,
                "target_type": activity.target_type,
                "target_title": activity.target_title,
                "actor": activity.actor.display_name if activity.actor else "Unknown",
                "actor_id": str(activity.actor_id),
                "project_id": str(activity.project_id) if activity.project_id else None,
                "created_at": activity.created_at.isoformat(),
            })

        # Get unique actors
        actors = list({a["actor"] for a in activity_list})

        return {
            "activities": activity_list,
            "count": len(activity_list),
            "period_days": days,
            "active_team_members": actors,
            "active_member_count": len(actors),
        }


class GetUserWorkloadTool(QueryTool):
    """Get a user's current workload and assignments."""

    @property
    def name(self) -> str:
        return "get_user_workload"

    @property
    def description(self) -> str:
        return """Get a user's current workload including their assigned tasks, projects, and recent work.

Use this to:
- See what someone is currently working on
- Check task load before assigning new work
- Understand capacity and availability
- Review someone's contributions

If no user_id is provided, returns the current user's workload."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "user_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "User to get workload for (defaults to current user)",
                },
                "include_completed": {
                    "type": "boolean",
                    "default": False,
                    "description": "Include recently completed tasks",
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
        """Get user workload."""
        target_user_id = UUID(input["user_id"]) if input.get("user_id") else user_id
        include_completed = input.get("include_completed", False)

        # Get accessible project IDs
        accessible_ids = await get_accessible_project_ids(db, user_id)

        # Get the target user
        user_result = await db.execute(
            select(User).where(User.id == target_user_id)
        )
        target_user = user_result.scalar_one_or_none()
        if not target_user:
            return {"error": "User not found"}

        # Get assigned tasks
        task_query = (
            select(Task)
            .where(
                Task.assignee_id == target_user_id,
                Task.project_id.in_(accessible_ids),
            )
            .options(selectinload(Task.project))
            .order_by(Task.due_date.asc().nulls_last(), desc(Task.updated_at))
        )

        if not include_completed:
            task_query = task_query.where(Task.status != "done")

        task_result = await db.execute(task_query)
        tasks = task_result.scalars().all()

        # Get project memberships
        member_query = (
            select(ProjectMember)
            .where(
                ProjectMember.user_id == target_user_id,
                ProjectMember.project_id.in_(accessible_ids),
            )
            .options(selectinload(ProjectMember.project))
        )
        member_result = await db.execute(member_query)
        memberships = member_result.scalars().all()

        # Organize tasks by status
        tasks_by_status = {
            "in_progress": [],
            "todo": [],
            "in_review": [],
            "idea": [],
        }
        if include_completed:
            tasks_by_status["done"] = []

        overdue_tasks = []
        today = datetime.now(timezone.utc).date()

        for task in tasks:
            task_data = {
                "id": str(task.id),
                "title": task.title,
                "status": task.status,
                "priority": task.priority,
                "project": task.project.name if task.project else None,
                "due_date": str(task.due_date) if task.due_date else None,
            }

            if task.status in tasks_by_status:
                tasks_by_status[task.status].append(task_data)

            if task.due_date and task.due_date < today and task.status != "done":
                overdue_tasks.append(task_data)

        # Active projects
        active_projects = []
        for membership in memberships:
            if membership.project and membership.project.status == "active":
                active_projects.append({
                    "id": str(membership.project_id),
                    "name": membership.project.name,
                    "role": membership.role,
                })

        return {
            "user": {
                "id": str(target_user.id),
                "name": target_user.display_name,
                "email": target_user.email,
                "title": target_user.title,
            },
            "task_summary": {
                "in_progress": len(tasks_by_status.get("in_progress", [])),
                "todo": len(tasks_by_status.get("todo", [])),
                "in_review": len(tasks_by_status.get("in_review", [])),
                "overdue": len(overdue_tasks),
                "total_open": len([t for t in tasks if t.status != "done"]),
            },
            "tasks_by_status": tasks_by_status,
            "overdue_tasks": overdue_tasks,
            "active_projects": active_projects,
            "project_count": len(active_projects),
        }


class GetCollaboratorsTool(QueryTool):
    """Find collaborators working on shared projects."""

    @property
    def name(self) -> str:
        return "get_collaborators"

    @property
    def description(self) -> str:
        return """Find people collaborating on shared projects.

Shows:
- Team members working on the same projects as you or a specified user
- Their roles and involvement level
- Recent collaboration activity

Use this to:
- Find who to talk to about a project
- Understand team composition
- Identify collaboration opportunities"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Get collaborators for a specific project",
                },
                "user_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Find collaborators of a specific user",
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
        """Get collaborators."""
        accessible_ids = await get_accessible_project_ids(db, user_id)

        if input.get("project_id"):
            # Get collaborators for a specific project
            project_id = UUID(input["project_id"])
            if project_id not in accessible_ids:
                return {"error": "Project not accessible"}

            # Get project
            project_result = await db.execute(
                select(Project).where(Project.id == project_id)
            )
            project = project_result.scalar_one_or_none()
            if not project:
                return {"error": "Project not found"}

            # Get all members
            members_query = (
                select(ProjectMember)
                .where(ProjectMember.project_id == project_id)
                .options(selectinload(ProjectMember.user))
            )
            members_result = await db.execute(members_query)
            members = members_result.scalars().all()

            # Get task assignments for this project
            assignments_query = (
                select(Task.assignee_id, func.count(Task.id).label("task_count"))
                .where(
                    Task.project_id == project_id,
                    Task.assignee_id.isnot(None),
                )
                .group_by(Task.assignee_id)
            )
            assignments_result = await db.execute(assignments_query)
            task_counts = {row[0]: row[1] for row in assignments_result}

            collaborators = []
            for member in members:
                if member.user:
                    collaborators.append({
                        "id": str(member.user_id),
                        "name": member.user.display_name,
                        "email": member.user.email,
                        "role": member.role,
                        "title": member.user.title,
                        "assigned_tasks": task_counts.get(member.user_id, 0),
                    })

            return {
                "project": {
                    "id": str(project.id),
                    "name": project.name,
                },
                "collaborators": collaborators,
                "collaborator_count": len(collaborators),
            }

        else:
            # Get all collaborators across user's projects
            target_user_id = UUID(input["user_id"]) if input.get("user_id") else user_id

            # Get user's projects
            user_projects_query = (
                select(ProjectMember.project_id)
                .where(
                    ProjectMember.user_id == target_user_id,
                    ProjectMember.project_id.in_(accessible_ids),
                )
            )
            user_projects_result = await db.execute(user_projects_query)
            user_project_ids = [row[0] for row in user_projects_result]

            if not user_project_ids:
                return {"collaborators": [], "projects_analyzed": 0}

            # Get all members of those projects
            all_members_query = (
                select(ProjectMember)
                .where(
                    ProjectMember.project_id.in_(user_project_ids),
                    ProjectMember.user_id != target_user_id,
                )
                .options(
                    selectinload(ProjectMember.user),
                    selectinload(ProjectMember.project),
                )
            )
            all_members_result = await db.execute(all_members_query)
            all_members = all_members_result.scalars().all()

            # Aggregate by user
            collaborator_map: Dict[UUID, Dict] = {}
            for member in all_members:
                if not member.user:
                    continue
                uid = member.user_id
                if uid not in collaborator_map:
                    collaborator_map[uid] = {
                        "id": str(uid),
                        "name": member.user.display_name,
                        "email": member.user.email,
                        "title": member.user.title,
                        "shared_projects": [],
                    }
                collaborator_map[uid]["shared_projects"].append({
                    "id": str(member.project_id),
                    "name": member.project.name if member.project else "Unknown",
                    "role": member.role,
                })

            # Sort by number of shared projects
            collaborators = sorted(
                collaborator_map.values(),
                key=lambda x: len(x["shared_projects"]),
                reverse=True,
            )

            # Add count
            for c in collaborators:
                c["shared_project_count"] = len(c["shared_projects"])

            return {
                "collaborators": collaborators,
                "collaborator_count": len(collaborators),
                "projects_analyzed": len(user_project_ids),
            }


class GetRecentActivityTool(QueryTool):
    """Get recent activity feed across accessible projects."""

    @property
    def name(self) -> str:
        return "get_recent_activity"

    @property
    def description(self) -> str:
        return """Get a feed of recent activity across all accessible projects.

Provides a timeline of what's happening across the team including:
- Task completions and updates
- New documents and edits
- Comments and discussions
- Project changes

Use for morning catch-up or staying aware of team progress."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "hours": {
                    "type": "integer",
                    "default": 24,
                    "minimum": 1,
                    "maximum": 168,
                    "description": "Hours of activity to look back",
                },
                "limit": {
                    "type": "integer",
                    "default": 30,
                    "maximum": 100,
                    "description": "Maximum activities to return",
                },
                "exclude_own": {
                    "type": "boolean",
                    "default": False,
                    "description": "Exclude your own activity",
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
        """Get recent activity feed."""
        hours = input.get("hours", 24)
        limit = min(input.get("limit", 30), 100)
        exclude_own = input.get("exclude_own", False)
        since = datetime.now(timezone.utc) - timedelta(hours=hours)

        accessible_ids = await get_accessible_project_ids(db, user_id)

        query = (
            select(Activity)
            .where(
                Activity.organization_id == org_id,
                Activity.created_at >= since,
                or_(
                    Activity.project_id.in_(accessible_ids),
                    Activity.project_id.is_(None),
                ),
            )
            .options(
                selectinload(Activity.actor),
                selectinload(Activity.project),
            )
            .order_by(desc(Activity.created_at))
            .limit(limit)
        )

        if exclude_own:
            query = query.where(Activity.actor_id != user_id)

        result = await db.execute(query)
        activities = result.scalars().all()

        # Format activities
        activity_feed = []
        for activity in activities:
            activity_feed.append({
                "id": str(activity.id),
                "type": activity.activity_type,
                "action": activity.action,
                "description": activity.description,
                "target_type": activity.target_type,
                "target_title": activity.target_title,
                "actor": activity.actor.display_name if activity.actor else "Unknown",
                "project": activity.project.name if activity.project else None,
                "time_ago": _format_time_ago(activity.created_at),
                "created_at": activity.created_at.isoformat(),
            })

        # Summary stats
        action_counts = {}
        for a in activity_feed:
            action = a["action"]
            action_counts[action] = action_counts.get(action, 0) + 1

        return {
            "activities": activity_feed,
            "count": len(activity_feed),
            "period_hours": hours,
            "action_summary": action_counts,
        }


def _format_time_ago(dt: datetime) -> str:
    """Format a datetime as a human-readable 'time ago' string."""
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = now - dt

    if diff.total_seconds() < 60:
        return "just now"
    elif diff.total_seconds() < 3600:
        minutes = int(diff.total_seconds() / 60)
        return f"{minutes}m ago"
    elif diff.total_seconds() < 86400:
        hours = int(diff.total_seconds() / 3600)
        return f"{hours}h ago"
    else:
        days = int(diff.total_seconds() / 86400)
        return f"{days}d ago"
