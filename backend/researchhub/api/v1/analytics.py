"""Analytics and metrics API endpoints."""

from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_, case, or_
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db, get_db_session
from researchhub.models import (
    Project,
    Task,
    Document,
    Idea,
    Paper,
    Activity,
    User,
    OrganizationMember,
    Team,
    Blocker,
    BlockerLink,
    TaskComment,
    CommentRead,
)

router = APIRouter(tags=["analytics"])


# --- Analytics Schemas ---

class OverviewMetrics(BaseModel):
    """High-level overview metrics."""
    total_projects: int
    active_projects: int
    total_tasks: int
    completed_tasks: int
    task_completion_rate: float
    total_documents: int
    total_ideas: int
    total_papers: int
    total_members: int
    active_members_last_week: int


class TimeSeriesPoint(BaseModel):
    """Single point in time series."""
    date: str
    value: int


class TimeSeriesData(BaseModel):
    """Time series analytics data."""
    label: str
    data: list[TimeSeriesPoint]


class TaskStatusBreakdown(BaseModel):
    """Task status distribution."""
    todo: int
    in_progress: int
    in_review: int
    completed: int
    blocked: int


class ProjectProgress(BaseModel):
    """Project progress metrics."""
    project_id: UUID
    project_name: str
    total_tasks: int
    completed_tasks: int
    progress_percentage: float
    status: str
    # Blocker metrics
    active_blocker_count: int = 0
    critical_blocker_count: int = 0  # high + critical impact
    max_blocker_impact: str | None = None  # highest impact level
    # Comment metrics
    total_comment_count: int = 0
    unread_comment_count: int = 0


class ActivityMetrics(BaseModel):
    """Activity metrics by type."""
    activity_type: str
    count: int
    percentage: float


class TeamProductivity(BaseModel):
    """Team member productivity metrics."""
    user_id: UUID
    user_name: str | None
    tasks_completed: int
    documents_created: int
    comments_made: int
    activity_score: float


class DashboardAnalytics(BaseModel):
    """Complete dashboard analytics."""
    overview: OverviewMetrics
    task_status: TaskStatusBreakdown
    activity_over_time: list[TimeSeriesData]
    project_progress: list[ProjectProgress]
    recent_activity_types: list[ActivityMetrics]
    top_contributors: list[TeamProductivity]


# --- Analytics Endpoints ---

@router.get("/overview", response_model=OverviewMetrics)
async def get_overview_metrics(
    organization_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get high-level overview metrics for the organization."""
    # Projects (join through Team to get organization_id)
    project_query = (
        select(func.count(Project.id))
        .join(Team, Project.team_id == Team.id)
        .where(Team.organization_id == organization_id)
    )
    total_projects = await db.scalar(project_query) or 0

    active_projects_query = (
        select(func.count(Project.id))
        .join(Team, Project.team_id == Team.id)
        .where(
            and_(
                Team.organization_id == organization_id,
                Project.status == "active",
            )
        )
    )
    active_projects = await db.scalar(active_projects_query) or 0

    # Tasks (through projects and teams)
    task_query = (
        select(func.count(Task.id))
        .join(Project, Task.project_id == Project.id)
        .join(Team, Project.team_id == Team.id)
        .where(Team.organization_id == organization_id)
    )
    total_tasks = await db.scalar(task_query) or 0

    completed_tasks_query = (
        select(func.count(Task.id))
        .join(Project, Task.project_id == Project.id)
        .join(Team, Project.team_id == Team.id)
        .where(
            and_(
                Team.organization_id == organization_id,
                Task.status == "completed",
            )
        )
    )
    completed_tasks = await db.scalar(completed_tasks_query) or 0

    task_completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0

    # Documents (through Project → Team)
    doc_query = (
        select(func.count(Document.id))
        .select_from(Document)
        .join(Project, Document.project_id == Project.id)
        .join(Team, Project.team_id == Team.id)
        .where(Team.organization_id == organization_id)
    )
    total_documents = await db.scalar(doc_query) or 0

    # Ideas
    idea_query = select(func.count(Idea.id)).where(
        Idea.organization_id == organization_id
    )
    total_ideas = await db.scalar(idea_query) or 0

    # Papers
    paper_query = select(func.count(Paper.id)).where(
        Paper.organization_id == organization_id
    )
    total_papers = await db.scalar(paper_query) or 0

    # Members
    member_query = select(func.count(OrganizationMember.id)).where(
        OrganizationMember.organization_id == organization_id
    )
    total_members = await db.scalar(member_query) or 0

    # Active members (had activity in last week)
    week_ago = datetime.utcnow() - timedelta(days=7)
    active_members_query = (
        select(func.count(func.distinct(Activity.actor_id)))
        .where(
            and_(
                Activity.organization_id == organization_id,
                Activity.created_at >= week_ago,
            )
        )
    )
    active_members = await db.scalar(active_members_query) or 0

    return OverviewMetrics(
        total_projects=total_projects,
        active_projects=active_projects,
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        task_completion_rate=round(task_completion_rate, 1),
        total_documents=total_documents,
        total_ideas=total_ideas,
        total_papers=total_papers,
        total_members=total_members,
        active_members_last_week=active_members,
    )


@router.get("/task-status", response_model=TaskStatusBreakdown)
async def get_task_status_breakdown(
    organization_id: UUID = Query(...),
    project_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Get task status distribution."""
    base_query = (
        select(Task.status, func.count(Task.id))
        .join(Project, Task.project_id == Project.id)
        .join(Team, Project.team_id == Team.id)
        .where(Team.organization_id == organization_id)
    )

    if project_id:
        base_query = base_query.where(Task.project_id == project_id)

    base_query = base_query.group_by(Task.status)

    result = await db.execute(base_query)
    status_counts = {row[0]: row[1] for row in result.all()}

    return TaskStatusBreakdown(
        todo=status_counts.get("todo", 0),
        in_progress=status_counts.get("in_progress", 0),
        in_review=status_counts.get("in_review", 0),
        completed=status_counts.get("completed", 0),
        blocked=status_counts.get("blocked", 0),
    )


@router.get("/activity-timeline", response_model=list[TimeSeriesData])
async def get_activity_timeline(
    organization_id: UUID = Query(...),
    days: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Get activity timeline for the specified period."""
    start_date = datetime.utcnow() - timedelta(days=days)

    # Get daily activity counts by type
    query = (
        select(
            func.date(Activity.created_at).label("date"),
            Activity.target_type,
            func.count(Activity.id).label("count"),
        )
        .where(
            and_(
                Activity.organization_id == organization_id,
                Activity.created_at >= start_date,
            )
        )
        .group_by(func.date(Activity.created_at), Activity.target_type)
        .order_by(func.date(Activity.created_at))
    )

    result = await db.execute(query)
    rows = result.all()

    # Organize by target type
    timeline_data: dict[str, list[TimeSeriesPoint]] = {}
    for row in rows:
        target_type = row.target_type
        if target_type not in timeline_data:
            timeline_data[target_type] = []
        timeline_data[target_type].append(TimeSeriesPoint(
            date=row.date.isoformat(),
            value=row.count,
        ))

    return [
        TimeSeriesData(label=label, data=data)
        for label, data in timeline_data.items()
    ]


@router.get("/project-progress", response_model=list[ProjectProgress])
async def get_project_progress(
    organization_id: UUID = Query(...),
    current_user: CurrentUser = None,  # Optional for backward compatibility
    limit: int = Query(None, ge=1, le=200),  # None means no limit
    db: AsyncSession = Depends(get_db_session),
):
    """Get progress metrics for active projects with blocker and comment counts."""
    # Get active projects with task counts (join through Team for organization)
    base_query = (
        select(
            Project.id,
            Project.name,
            Project.status,
            func.count(Task.id).label("total_tasks"),
            func.count(case((Task.status == "completed", 1))).label("completed_tasks"),
        )
        .join(Team, Project.team_id == Team.id)
        .outerjoin(Task, Task.project_id == Project.id)
        .where(
            and_(
                Team.organization_id == organization_id,
                Project.status.in_(["active", "planning"]),
            )
        )
        .group_by(Project.id, Project.name, Project.status)
        .order_by(func.count(Task.id).desc())
    )

    if limit is not None:
        base_query = base_query.limit(limit)

    result = await db.execute(base_query)
    project_rows = result.all()

    if not project_rows:
        return []

    project_ids = [row.id for row in project_rows]

    # Fetch blocker counts per project (only active blockers: open or in_progress)
    blocker_query = (
        select(
            Blocker.project_id,
            func.count(Blocker.id).label("active_count"),
            func.count(case((Blocker.impact_level.in_(["high", "critical"]), 1))).label("critical_count"),
            # Get max impact level
            func.max(
                case(
                    (Blocker.impact_level == "critical", 4),
                    (Blocker.impact_level == "high", 3),
                    (Blocker.impact_level == "medium", 2),
                    (Blocker.impact_level == "low", 1),
                    else_=0,
                )
            ).label("max_impact_num"),
        )
        .where(
            and_(
                Blocker.project_id.in_(project_ids),
                Blocker.status.in_(["open", "in_progress"]),
            )
        )
        .group_by(Blocker.project_id)
    )
    blocker_result = await db.execute(blocker_query)
    blocker_data = {
        row.project_id: {
            "active_count": row.active_count,
            "critical_count": row.critical_count,
            "max_impact_num": row.max_impact_num,
        }
        for row in blocker_result.all()
    }

    # Map impact number back to string
    impact_map = {4: "critical", 3: "high", 2: "medium", 1: "low", 0: None}

    # Fetch comment counts per project (through tasks)
    comment_query = (
        select(
            Task.project_id,
            func.count(TaskComment.id).label("total_comments"),
        )
        .join(TaskComment, TaskComment.task_id == Task.id)
        .where(Task.project_id.in_(project_ids))
        .group_by(Task.project_id)
    )
    comment_result = await db.execute(comment_query)
    comment_data = {row.project_id: row.total_comments for row in comment_result.all()}

    # If user is authenticated, calculate unread counts
    unread_data: dict[UUID, int] = {}
    if current_user:
        # Get all task IDs for these projects
        task_ids_query = select(Task.id, Task.project_id).where(Task.project_id.in_(project_ids))
        task_result = await db.execute(task_ids_query)
        task_rows = task_result.all()

        if task_rows:
            task_ids = [row.id for row in task_rows]
            task_to_project = {row.id: row.project_id for row in task_rows}

            # Get all comments for these tasks
            comments_query = (
                select(TaskComment.id, TaskComment.task_id, TaskComment.user_id)
                .where(TaskComment.task_id.in_(task_ids))
            )
            comments_result = await db.execute(comments_query)
            all_comments = comments_result.all()

            # Get read status for these comments
            comment_ids = [c.id for c in all_comments]
            if comment_ids:
                read_query = (
                    select(CommentRead.comment_id)
                    .where(
                        and_(
                            CommentRead.comment_type == "task",
                            CommentRead.comment_id.in_(comment_ids),
                            CommentRead.user_id == current_user.id,
                        )
                    )
                )
                read_result = await db.execute(read_query)
                read_ids = {row[0] for row in read_result.all()}

                # Calculate unread per project
                for comment in all_comments:
                    project_id = task_to_project.get(comment.task_id)
                    if project_id:
                        # Unread if: not read AND not authored by current user
                        if comment.id not in read_ids and comment.user_id != current_user.id:
                            unread_data[project_id] = unread_data.get(project_id, 0) + 1

    # Build response
    projects = []
    for row in project_rows:
        total = row.total_tasks or 0
        completed = row.completed_tasks or 0
        progress = (completed / total * 100) if total > 0 else 0

        blocker_info = blocker_data.get(row.id, {})
        max_impact_num = blocker_info.get("max_impact_num", 0)

        projects.append(ProjectProgress(
            project_id=row.id,
            project_name=row.name,
            total_tasks=total,
            completed_tasks=completed,
            progress_percentage=round(progress, 1),
            status=row.status,
            active_blocker_count=blocker_info.get("active_count", 0),
            critical_blocker_count=blocker_info.get("critical_count", 0),
            max_blocker_impact=impact_map.get(max_impact_num),
            total_comment_count=comment_data.get(row.id, 0),
            unread_comment_count=unread_data.get(row.id, 0),
        ))

    return projects


@router.get("/activity-types", response_model=list[ActivityMetrics])
async def get_activity_type_breakdown(
    organization_id: UUID = Query(...),
    days: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Get activity breakdown by type."""
    start_date = datetime.utcnow() - timedelta(days=days)

    query = (
        select(
            Activity.activity_type,
            func.count(Activity.id).label("count"),
        )
        .where(
            and_(
                Activity.organization_id == organization_id,
                Activity.created_at >= start_date,
            )
        )
        .group_by(Activity.activity_type)
        .order_by(func.count(Activity.id).desc())
    )

    result = await db.execute(query)
    rows = result.all()

    total = sum(row.count for row in rows)

    return [
        ActivityMetrics(
            activity_type=row.activity_type,
            count=row.count,
            percentage=round(row.count / total * 100, 1) if total > 0 else 0,
        )
        for row in rows
    ]


@router.get("/team-productivity", response_model=list[TeamProductivity])
async def get_team_productivity(
    organization_id: UUID = Query(...),
    days: int = Query(30, ge=7, le=90),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Get team member productivity metrics."""
    start_date = datetime.utcnow() - timedelta(days=days)

    # Get activity counts per user
    query = (
        select(
            Activity.actor_id,
            User.display_name,
            func.count(Activity.id).label("total_activities"),
            func.count(case((Activity.activity_type == "task.completed", 1))).label("tasks_completed"),
            func.count(case((Activity.activity_type == "document.created", 1))).label("documents_created"),
            func.count(case((Activity.activity_type == "comment.created", 1))).label("comments_made"),
        )
        .join(User, Activity.actor_id == User.id)
        .where(
            and_(
                Activity.organization_id == organization_id,
                Activity.created_at >= start_date,
            )
        )
        .group_by(Activity.actor_id, User.display_name)
        .order_by(func.count(Activity.id).desc())
        .limit(limit)
    )

    result = await db.execute(query)
    team_data = []

    for row in result.all():
        # Calculate activity score (weighted)
        score = (
            row.tasks_completed * 3 +
            row.documents_created * 2 +
            row.comments_made * 1 +
            row.total_activities * 0.1
        )

        team_data.append(TeamProductivity(
            user_id=row.actor_id,
            user_name=row.display_name,
            tasks_completed=row.tasks_completed,
            documents_created=row.documents_created,
            comments_made=row.comments_made,
            activity_score=round(score, 1),
        ))

    return team_data


@router.get("/dashboard", response_model=DashboardAnalytics)
async def get_dashboard_analytics(
    organization_id: UUID = Query(...),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db_session),
):
    """Get complete dashboard analytics in a single request."""
    # Fetch all metrics in parallel would be more efficient,
    # but for simplicity we'll call them sequentially
    overview = await get_overview_metrics(organization_id, db)
    task_status = await get_task_status_breakdown(organization_id, None, db)
    activity_timeline = await get_activity_timeline(organization_id, 30, db)
    project_progress = await get_project_progress(organization_id, current_user, None, db)
    activity_types = await get_activity_type_breakdown(organization_id, 30, db)
    top_contributors = await get_team_productivity(organization_id, 30, 5, db)

    return DashboardAnalytics(
        overview=overview,
        task_status=task_status,
        activity_over_time=activity_timeline,
        project_progress=project_progress,
        recent_activity_types=activity_types,
        top_contributors=top_contributors,
    )


# --- Project Attention Details (for hover cards) ---

class BlockerSummaryItem(BaseModel):
    """Simplified blocker data for hover display."""
    id: UUID
    title: str
    impact_level: str
    status: str
    due_date: datetime | None = None


class CommentSummaryItem(BaseModel):
    """Simplified comment data for hover display."""
    id: UUID
    author_name: str | None
    content: str
    created_at: datetime
    task_title: str | None = None


class ProjectAttentionDetails(BaseModel):
    """Detailed data for project attention hover card."""
    project_id: UUID
    project_name: str
    blockers: list[BlockerSummaryItem]
    recent_comments: list[CommentSummaryItem]


@router.get("/project-attention/{project_id}", response_model=ProjectAttentionDetails)
async def get_project_attention_details(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
):
    """
    Get detailed blocker and comment data for a project hover card.

    Returns top 5 blockers (sorted by impact) and last 5 comments.
    """
    # Get project info
    project_result = await db.execute(
        select(Project.id, Project.name).where(Project.id == project_id)
    )
    project = project_result.first()
    if not project:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")

    # Get active blockers, sorted by impact level (critical first)
    blocker_query = (
        select(Blocker.id, Blocker.title, Blocker.impact_level, Blocker.status, Blocker.due_date)
        .where(
            and_(
                Blocker.project_id == project_id,
                Blocker.status.in_(["open", "in_progress"]),
            )
        )
        .order_by(
            case(
                (Blocker.impact_level == "critical", 1),
                (Blocker.impact_level == "high", 2),
                (Blocker.impact_level == "medium", 3),
                (Blocker.impact_level == "low", 4),
                else_=5,
            ),
            Blocker.created_at.desc(),
        )
        .limit(5)
    )
    blocker_result = await db.execute(blocker_query)
    blockers = [
        BlockerSummaryItem(
            id=row.id,
            title=row.title,
            impact_level=row.impact_level,
            status=row.status,
            due_date=row.due_date,
        )
        for row in blocker_result.all()
    ]

    # Get recent comments from tasks in this project
    comment_query = (
        select(
            TaskComment.id,
            TaskComment.content,
            TaskComment.created_at,
            User.display_name.label("author_name"),
            Task.title.label("task_title"),
        )
        .join(Task, TaskComment.task_id == Task.id)
        .outerjoin(User, TaskComment.user_id == User.id)
        .where(Task.project_id == project_id)
        .order_by(TaskComment.created_at.desc())
        .limit(5)
    )
    comment_result = await db.execute(comment_query)
    recent_comments = [
        CommentSummaryItem(
            id=row.id,
            author_name=row.author_name,
            content=row.content[:200] if row.content else "",  # Truncate for hover
            created_at=row.created_at,
            task_title=row.task_title,
        )
        for row in comment_result.all()
    ]

    return ProjectAttentionDetails(
        project_id=project.id,
        project_name=project.name,
        blockers=blockers,
        recent_comments=recent_comments,
    )
