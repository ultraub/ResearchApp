"""Dashboard command center API endpoints."""

from datetime import date, datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db_session
from researchhub.models import Blocker, Project, Task, User
from researchhub.models.organization import OrganizationMember, Team, TeamMember
from researchhub.models.project import ProjectMember, ProjectTeam


router = APIRouter(tags=["dashboard"])


# --- Schemas ---


class TaskSummary(BaseModel):
    """Task summary for dashboard display."""
    id: str
    title: str
    due_date: str | None
    priority: str
    status: str
    project_id: str
    project_name: str
    assignee_id: str | None
    assignee_name: str | None
    is_blocked: bool = False
    days_overdue: int | None = None
    days_stalled: int | None = None


class BlockerSummary(BaseModel):
    """Blocker summary for dashboard display."""
    id: str
    title: str
    status: str
    priority: str
    impact_level: str
    assignee_id: str | None
    assignee_name: str | None
    project_id: str
    project_name: str
    blocked_items_count: int
    days_open: int


class BlockersList(BaseModel):
    """Blockers list with total count."""
    items: list[BlockerSummary]
    total_count: int


class DashboardSummary(BaseModel):
    """Summary counts for dashboard badges."""
    total_blockers: int
    critical_blockers: int  # critical + high impact
    overdue_count: int
    stalled_count: int
    due_today: int
    due_this_week: int


class CommandCenterData(BaseModel):
    """Complete command center dashboard data."""
    blockers: BlockersList
    tasks_by_day: dict[str, list[TaskSummary]]  # ISO date string keys
    overdue_tasks: list[TaskSummary]
    stalled_tasks: list[TaskSummary]
    summary: DashboardSummary


# --- Helper Functions ---


async def get_accessible_project_ids(
    db: AsyncSession,
    user_id: UUID,
) -> list[UUID]:
    """Get list of project IDs the user has access to."""
    # Get user's team memberships
    team_result = await db.execute(
        select(TeamMember.team_id).where(TeamMember.user_id == user_id)
    )
    user_team_ids = [row[0] for row in team_result.all()]

    # Get user's organization memberships
    org_result = await db.execute(
        select(OrganizationMember.organization_id).where(
            OrganizationMember.user_id == user_id
        )
    )
    user_org_ids = [row[0] for row in org_result.all()]

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

    if not access_conditions:
        return []

    # Query accessible project IDs (exclude demo projects)
    query = select(Project.id).where(
        and_(
            or_(*access_conditions),
            Project.is_demo == False,
        )
    )

    result = await db.execute(query)
    return [row[0] for row in result.all()]


def task_to_summary(task: Task, days_overdue: int | None = None, days_stalled: int | None = None) -> TaskSummary:
    """Convert Task model to TaskSummary."""
    return TaskSummary(
        id=str(task.id),
        title=task.title,
        due_date=task.due_date.isoformat() if task.due_date else None,
        priority=task.priority or "medium",
        status=task.status or "todo",
        project_id=str(task.project_id),
        project_name=task.project.name if task.project else "Unknown",
        assignee_id=str(task.assignee_id) if task.assignee_id else None,
        assignee_name=task.assignee.display_name if task.assignee else None,
        is_blocked=False,  # TODO: Check if task has active blockers
        days_overdue=days_overdue,
        days_stalled=days_stalled,
    )


def blocker_to_summary(blocker: Blocker) -> BlockerSummary:
    """Convert Blocker model to BlockerSummary."""
    days_open = 0
    if blocker.created_at:
        now = datetime.now(blocker.created_at.tzinfo) if blocker.created_at.tzinfo else datetime.now()
        days_open = (now - blocker.created_at).days

    return BlockerSummary(
        id=str(blocker.id),
        title=blocker.title,
        status=blocker.status or "open",
        priority=blocker.priority or "medium",
        impact_level=blocker.impact_level or "medium",
        assignee_id=str(blocker.assignee_id) if blocker.assignee_id else None,
        assignee_name=blocker.assignee.display_name if blocker.assignee else None,
        project_id=str(blocker.project_id),
        project_name=blocker.project.name if blocker.project else "Unknown",
        blocked_items_count=len(blocker.blocked_items) if blocker.blocked_items else 0,
        days_open=days_open,
    )


# --- Endpoints ---


@router.get("/command-center", response_model=CommandCenterData)
async def get_command_center_data(
    days_ahead: int = Query(default=7, le=30, ge=1),
    scope: Literal["personal", "team"] = Query(default="personal"),
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> CommandCenterData:
    """Get command center dashboard data.

    Args:
        days_ahead: Number of days ahead to include (1-30, default 7)
        scope: "personal" for user's tasks only, "team" for all accessible tasks

    Returns:
        CommandCenterData with blockers, tasks by day, overdue/stalled tasks, and summary
    """
    user_id = current_user.id
    today = date.today()
    future_date = today + timedelta(days=days_ahead)

    # Get accessible project IDs
    accessible_project_ids = await get_accessible_project_ids(db, user_id)

    if not accessible_project_ids:
        return CommandCenterData(
            blockers=BlockersList(items=[], total_count=0),
            tasks_by_day={},
            overdue_tasks=[],
            stalled_tasks=[],
            summary=DashboardSummary(
                total_blockers=0,
                critical_blockers=0,
                overdue_count=0,
                stalled_count=0,
                due_today=0,
                due_this_week=0,
            ),
        )

    # Base task filters
    task_filters = [Task.project_id.in_(accessible_project_ids)]
    if scope == "personal":
        task_filters.append(Task.assignee_id == user_id)

    # --- 1. Get all open blockers ---
    blocker_query = (
        select(Blocker)
        .options(
            selectinload(Blocker.assignee),
            selectinload(Blocker.project),
            selectinload(Blocker.blocked_items),
        )
        .where(Blocker.project_id.in_(accessible_project_ids))
        .where(Blocker.status.in_(["open", "in_progress"]))
        .order_by(
            # Sort by impact: critical > high > medium > low
            case(
                (Blocker.impact_level == "critical", 1),
                (Blocker.impact_level == "high", 2),
                (Blocker.impact_level == "medium", 3),
                (Blocker.impact_level == "low", 4),
                else_=5,
            ),
            Blocker.created_at.asc(),
        )
    )
    blocker_result = await db.execute(blocker_query)
    blockers = blocker_result.scalars().all()

    blocker_summaries = [blocker_to_summary(b) for b in blockers]
    critical_count = sum(1 for b in blockers if b.impact_level in ["critical", "high"])

    # --- 2. Get overdue tasks ---
    overdue_query = (
        select(Task)
        .options(selectinload(Task.assignee), selectinload(Task.project))
        .where(and_(*task_filters))
        .where(Task.due_date < today)
        .where(Task.status != "done")
        .order_by(Task.due_date.asc())
        .limit(20)
    )
    overdue_result = await db.execute(overdue_query)
    overdue_tasks = overdue_result.scalars().all()

    overdue_summaries = [
        task_to_summary(t, days_overdue=(today - t.due_date).days)
        for t in overdue_tasks
    ]

    # --- 3. Get upcoming tasks (group by day) ---
    upcoming_query = (
        select(Task)
        .options(selectinload(Task.assignee), selectinload(Task.project))
        .where(and_(*task_filters))
        .where(Task.due_date >= today)
        .where(Task.due_date <= future_date)
        .where(Task.status != "done")
        .order_by(Task.due_date.asc(), Task.priority.desc())
    )
    upcoming_result = await db.execute(upcoming_query)
    upcoming_tasks = upcoming_result.scalars().all()

    # Group by date
    tasks_by_day: dict[str, list[TaskSummary]] = {}
    due_today_count = 0
    due_this_week_count = 0

    for task in upcoming_tasks:
        if task.due_date:
            date_key = task.due_date.isoformat()
            if date_key not in tasks_by_day:
                tasks_by_day[date_key] = []
            tasks_by_day[date_key].append(task_to_summary(task))

            if task.due_date == today:
                due_today_count += 1
            if task.due_date <= today + timedelta(days=7):
                due_this_week_count += 1

    # Sort tasks within each day by priority (urgent first)
    priority_order = {"urgent": 0, "high": 1, "medium": 2, "low": 3}
    for day_tasks in tasks_by_day.values():
        day_tasks.sort(key=lambda t: priority_order.get(t.priority, 4))

    # --- 4. Get stalled tasks (in_progress, no update in 7+ days) ---
    stale_date = datetime.now() - timedelta(days=7)
    stalled_query = (
        select(Task)
        .options(selectinload(Task.assignee), selectinload(Task.project))
        .where(and_(*task_filters))
        .where(Task.status == "in_progress")
        .where(Task.updated_at < stale_date)
        .order_by(Task.updated_at.asc())
        .limit(10)
    )
    stalled_result = await db.execute(stalled_query)
    stalled_tasks = stalled_result.scalars().all()

    stalled_summaries = []
    for task in stalled_tasks:
        days_stalled = 0
        if task.updated_at:
            now = datetime.now(task.updated_at.tzinfo) if task.updated_at.tzinfo else datetime.now()
            days_stalled = (now - task.updated_at).days
        stalled_summaries.append(task_to_summary(task, days_stalled=days_stalled))

    # --- Build response ---
    return CommandCenterData(
        blockers=BlockersList(
            items=blocker_summaries,
            total_count=len(blocker_summaries),
        ),
        tasks_by_day=tasks_by_day,
        overdue_tasks=overdue_summaries,
        stalled_tasks=stalled_summaries,
        summary=DashboardSummary(
            total_blockers=len(blocker_summaries),
            critical_blockers=critical_count,
            overdue_count=len(overdue_summaries),
            stalled_count=len(stalled_summaries),
            due_today=due_today_count,
            due_this_week=due_this_week_count,
        ),
    )
