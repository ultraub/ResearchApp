"""Tasks API endpoints."""

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select, func, or_, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.api.v1.auth import CurrentUser
from researchhub.api.v1.projects import check_project_access
from researchhub.db.session import get_db_session
from researchhub.models.project import Project, Task, TaskComment, TaskAssignment, TaskDocument, TaskCustomFieldValue, CommentReaction, CommentMention, Blocker, BlockerLink, IdeaVote
from researchhub.models.user import User
from researchhub.services.task_assignment import TaskAssignmentService
from researchhub.services.task_document import TaskDocumentService
from researchhub.services.custom_field import CustomFieldService
from researchhub.services.workflow import WorkflowService
from researchhub.services.notification import NotificationService
from researchhub.tasks import auto_review_for_review_task, generate_embedding

router = APIRouter()
logger = structlog.get_logger()


import re

def parse_description(value: str | dict | None) -> dict | None:
    """Parse description from string (JSON) or dict to dict for JSONB storage."""
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            # If it's plain text (not JSON), wrap it in TipTap format
            if value.strip():
                return {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": value}]
                        }
                    ]
                }
            return None
    return None


def parse_mentions_from_content(content: str) -> list[str]:
    """Extract @mentions from comment content. Returns list of usernames/emails."""
    # Match @username or @user.email@domain.com patterns
    # Pattern: @ followed by word chars, dots, @, hyphens (for emails)
    pattern = r'@([\w.@+-]+)'
    matches = re.findall(pattern, content)
    # Remove duplicates while preserving order
    seen = set()
    unique_mentions = []
    for m in matches:
        if m not in seen:
            seen.add(m)
            unique_mentions.append(m)
    return unique_mentions


# Request/Response Models
class TaskCreate(BaseModel):
    """Create a new task."""

    title: str = Field(..., min_length=1, max_length=500)
    description: str | dict | None = None  # Accepts JSON string or dict for JSONB
    project_id: UUID
    status: str = Field(default="todo", pattern="^(idea|todo|in_progress|in_review|done)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")
    task_type: str = Field(default="general")
    assignee_id: UUID | None = None
    due_date: date | None = None
    parent_task_id: UUID | None = None
    tags: list[str] = Field(default_factory=list)
    estimated_hours: float | None = None

    @field_validator("description", mode="before")
    @classmethod
    def parse_description_field(cls, v: Any) -> dict | None:
        return parse_description(v)


class TaskUpdate(BaseModel):
    """Update a task."""

    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | dict | None = None  # Accepts JSON string or dict for JSONB
    status: str | None = Field(None, pattern="^(idea|todo|in_progress|in_review|done)$")
    priority: str | None = Field(None, pattern="^(low|medium|high|urgent)$")
    task_type: str | None = None
    assignee_id: UUID | None = None
    due_date: date | None = None
    tags: list[str] | None = None
    estimated_hours: float | None = None
    actual_hours: float | None = None

    @field_validator("description", mode="before")
    @classmethod
    def parse_description_field(cls, v: Any) -> dict | None:
        return parse_description(v)


class TaskReorder(BaseModel):
    """Reorder tasks within a status column."""

    task_ids: list[UUID]


class TaskCommentCreate(BaseModel):
    """Create a task comment."""

    content: str = Field(..., min_length=1, max_length=10000)
    parent_comment_id: UUID | None = None


class TaskCommentUpdate(BaseModel):
    """Update a task comment."""

    content: str = Field(..., min_length=1, max_length=10000)


# Assignment Models
class TaskAssignmentCreate(BaseModel):
    """Assign user(s) to a task."""

    user_ids: list[UUID] = Field(..., min_length=1)
    role: str = Field(default="assignee", pattern="^(assignee|lead|reviewer|observer)$")
    due_date: date | None = None
    notes: str | None = None


class TaskAssignmentUpdate(BaseModel):
    """Update a task assignment."""

    role: str | None = Field(None, pattern="^(assignee|lead|reviewer|observer)$")
    status: str | None = Field(None, pattern="^(assigned|accepted|in_progress|completed)$")
    due_date: date | None = None
    notes: str | None = None


class TaskAssignmentResponse(BaseModel):
    """Task assignment response."""

    id: UUID
    task_id: UUID
    user_id: UUID
    assigned_by_id: UUID | None
    role: str
    status: str
    due_date: date | None
    notes: str | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    # Include user info when available
    user_name: str | None = None
    user_email: str | None = None

    class Config:
        from_attributes = True


# Task-Document Link Models
class TaskDocumentCreate(BaseModel):
    """Link document(s) to a task."""

    document_ids: list[UUID] = Field(..., min_length=1)
    link_type: str = Field(default="reference", pattern="^(reference|attachment|deliverable|input|output)$")
    is_primary: bool = False
    requires_review: bool = False
    notes: str | None = None


class TaskDocumentUpdate(BaseModel):
    """Update a task-document link."""

    link_type: str | None = Field(None, pattern="^(reference|attachment|deliverable|input|output)$")
    is_primary: bool | None = None
    requires_review: bool | None = None
    notes: str | None = None


class TaskDocumentResponse(BaseModel):
    """Task-document link response."""

    id: UUID
    task_id: UUID
    document_id: UUID
    link_type: str
    is_primary: bool
    requires_review: bool
    position: int
    notes: str | None
    created_by_id: UUID | None
    created_at: datetime
    updated_at: datetime

    # Document info when loaded
    document_title: str | None = None
    document_type: str | None = None

    class Config:
        from_attributes = True


class ReactionSummary(BaseModel):
    """Summary of reactions for a comment."""

    emoji: str
    count: int
    user_reacted: bool = False


class MentionInfo(BaseModel):
    """Info about a user mentioned in a comment."""

    user_id: UUID
    user_name: str | None = None
    user_email: str | None = None


class TaskCommentResponse(BaseModel):
    """Task comment response."""

    id: UUID
    task_id: UUID
    user_id: UUID
    content: str
    parent_comment_id: UUID | None
    edited_at: datetime | None
    created_at: datetime
    # User info
    user_name: str | None = None
    user_email: str | None = None
    # Reactions
    reactions: list[ReactionSummary] = []
    # Mentions
    mentions: list[MentionInfo] = []

    class Config:
        from_attributes = True


class CommentReactionCreate(BaseModel):
    """Create a reaction on a comment."""

    emoji: str = Field(..., min_length=1, max_length=50)


class CommentReactionResponse(BaseModel):
    """Response for a single reaction."""

    id: UUID
    comment_id: UUID
    user_id: UUID
    emoji: str
    created_at: datetime

    class Config:
        from_attributes = True


class TaskResponse(BaseModel):
    """Task response model."""

    id: UUID
    title: str
    description: dict | None  # JSONB TipTap rich text format
    status: str
    priority: str
    task_type: str
    project_id: UUID
    project_name: str | None = None  # Optional, populated when fetching aggregated tasks
    assignee_id: UUID | None
    created_by_id: UUID | None
    due_date: date | None
    completed_at: datetime | None
    position: int
    estimated_hours: float | None
    actual_hours: float | None
    parent_task_id: UUID | None
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    comment_count: int = 0
    subtask_count: int = 0
    # Creator info
    created_by_name: str | None = None
    created_by_email: str | None = None
    # Idea-specific fields
    vote_count: int = 0
    user_voted: bool = False
    impact_score: int | None = None
    effort_score: int | None = None
    # Assignments
    assignments: list[TaskAssignmentResponse] | None = None
    # Source idea (if task was created from personal idea capture)
    source_idea_id: UUID | None = None
    source_idea: "SourceIdeaResponse | None" = None

    class Config:
        from_attributes = True

    @model_validator(mode="before")
    @classmethod
    def extract_creator_info(cls, data: Any) -> Any:
        """Extract creator name/email from the created_by relationship."""
        if hasattr(data, "__dict__"):
            # SQLAlchemy model - extract from relationship
            d = dict(data.__dict__)
            if hasattr(data, "created_by") and data.created_by:
                d["created_by_name"] = data.created_by.display_name
                d["created_by_email"] = data.created_by.email
            return d
        return data


class SourceIdeaResponse(BaseModel):
    """Minimal idea info for task source context."""

    id: UUID
    content: str
    title: str | None
    tags: list[str]
    source: str
    created_at: datetime

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    """Paginated task list response."""

    items: list[TaskResponse]
    total: int
    page: int
    page_size: int
    pages: int


class TasksByStatusResponse(BaseModel):
    """Tasks grouped by status for kanban view."""

    idea: list[TaskResponse]
    todo: list[TaskResponse]
    in_progress: list[TaskResponse]
    in_review: list[TaskResponse]
    done: list[TaskResponse]


@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Task:
    """Create a new task."""
    # Verify project access
    await check_project_access(db, task_data.project_id, current_user.id, "member")

    # Get max position for the status column
    max_pos_result = await db.execute(
        select(func.max(Task.position)).where(
            Task.project_id == task_data.project_id,
            Task.status == task_data.status,
        )
    )
    max_position = max_pos_result.scalar() or 0

    task = Task(
        title=task_data.title,
        description=task_data.description,
        project_id=task_data.project_id,
        status=task_data.status,
        priority=task_data.priority,
        task_type=task_data.task_type,
        assignee_id=task_data.assignee_id,
        due_date=task_data.due_date,
        parent_task_id=task_data.parent_task_id,
        tags=task_data.tags,
        estimated_hours=task_data.estimated_hours,
        created_by_id=current_user.id,
        position=max_position + 1,
    )
    db.add(task)
    await db.commit()
    # Re-query with fresh data (including updated_at) and created_by relationship
    stmt = select(Task).options(selectinload(Task.created_by)).where(Task.id == task.id)
    result = await db.execute(stmt)
    task = result.scalar_one()

    logger.info(
        "Task created",
        task_id=str(task.id),
        project_id=str(task_data.project_id),
    )

    # Generate embedding for semantic search
    try:
        generate_embedding.delay(
            entity_type="task",
            entity_id=str(task.id),
        )
    except Exception as e:
        logger.warning(
            "Embedding generation trigger failed",
            task_id=str(task.id),
            error=str(e),
        )

    return task


@router.get("/", response_model=TaskListResponse)
async def list_tasks(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    project_id: UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    status: str | None = Query(None, pattern="^(idea|todo|in_progress|in_review|done)$"),
    priority: str | None = Query(None, pattern="^(low|medium|high|urgent)$"),
    assignee_id: UUID | None = None,
    search: str | None = Query(None, max_length=100),
    include_completed: bool = Query(True),
) -> dict:
    """List tasks with filtering."""
    if not project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="project_id is required",
        )

    # Verify project access
    await check_project_access(db, project_id, current_user.id)

    # Base query with assignments and creator loaded
    query = (
        select(Task)
        .options(
            selectinload(Task.assignments).selectinload(TaskAssignment.user),
            selectinload(Task.project),
            selectinload(Task.created_by),
        )
        .where(Task.project_id == project_id)
    )

    # Apply filters
    if status:
        query = query.where(Task.status == status)
    elif not include_completed:
        query = query.where(Task.status != "done")
    if priority:
        query = query.where(Task.priority == priority)
    if assignee_id:
        query = query.where(Task.assignee_id == assignee_id)
    if search:
        query = query.where(
            or_(
                Task.title.ilike(f"%{search}%"),
                Task.description.ilike(f"%{search}%"),
            )
        )

    # Get total count (without options for performance)
    count_base = select(Task).where(Task.project_id == project_id)
    if status:
        count_base = count_base.where(Task.status == status)
    elif not include_completed:
        count_base = count_base.where(Task.status != "done")
    if priority:
        count_base = count_base.where(Task.priority == priority)
    if assignee_id:
        count_base = count_base.where(Task.assignee_id == assignee_id)
    if search:
        count_base = count_base.where(
            or_(
                Task.title.ilike(f"%{search}%"),
                Task.description.ilike(f"%{search}%"),
            )
        )
    count_query = select(func.count()).select_from(count_base.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination and ordering
    query = query.order_by(Task.position.asc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    tasks = list(result.scalars().all())

    # Convert tasks to response dicts with assignments
    task_items = [_task_to_response(t) for t in tasks]

    return {
        "items": task_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


@router.get("/by-status", response_model=TasksByStatusResponse)
async def get_tasks_by_status(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get tasks grouped by status for kanban view."""
    # Verify project access
    await check_project_access(db, project_id, current_user.id)

    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.assignments).selectinload(TaskAssignment.user),
            selectinload(Task.project),
            selectinload(Task.comments),
            selectinload(Task.subtasks),
            selectinload(Task.created_by),
        )
        .where(Task.project_id == project_id, Task.parent_task_id.is_(None))
        .order_by(Task.position.asc())
    )
    tasks = list(result.scalars().all())

    # Convert tasks to response dicts
    task_responses = [_task_to_response(t) for t in tasks]

    return {
        "idea": [t for t in task_responses if t["status"] == "idea"],
        "todo": [t for t in task_responses if t["status"] == "todo"],
        "in_progress": [t for t in task_responses if t["status"] == "in_progress"],
        "in_review": [t for t in task_responses if t["status"] == "in_review"],
        "done": [t for t in task_responses if t["status"] == "done"],
    }


async def _get_descendant_project_ids(db: AsyncSession, project_id: UUID) -> list[UUID]:
    """Recursively get all descendant project IDs for a given project."""
    all_ids = [project_id]

    # Iterative approach to avoid deep recursion
    ids_to_check = [project_id]
    while ids_to_check:
        current_id = ids_to_check.pop()
        result = await db.execute(
            select(Project.id).where(Project.parent_id == current_id)
        )
        child_ids = list(result.scalars().all())
        all_ids.extend(child_ids)
        ids_to_check.extend(child_ids)

    return all_ids


@router.get("/by-status-aggregated", response_model=TasksByStatusResponse)
async def get_tasks_by_status_aggregated(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    include_children: bool = Query(False, description="Include tasks from child projects"),
) -> dict:
    """Get tasks grouped by status, optionally including tasks from child projects."""
    # Verify project access
    await check_project_access(db, project_id, current_user.id)

    # Common options for loading relationships
    task_options = [
        selectinload(Task.assignments).selectinload(TaskAssignment.user),
        selectinload(Task.project),
        selectinload(Task.comments),
        selectinload(Task.subtasks),
        selectinload(Task.created_by),
    ]

    if include_children:
        # Get all descendant project IDs
        project_ids = await _get_descendant_project_ids(db, project_id)

        # Fetch projects to get names
        projects_result = await db.execute(
            select(Project).where(Project.id.in_(project_ids))
        )
        projects = {p.id: p.name for p in projects_result.scalars().all()}

        result = await db.execute(
            select(Task)
            .options(*task_options)
            .where(Task.project_id.in_(project_ids), Task.parent_task_id.is_(None))
            .order_by(Task.project_id, Task.position.asc())
        )
        tasks = list(result.scalars().all())

        # Convert tasks to response dicts with project_name for child projects
        task_responses = []
        for t in tasks:
            response = _task_to_response(t)
            if t.project_id != project_id:
                response["project_name"] = projects.get(t.project_id)
            task_responses.append(response)
    else:
        result = await db.execute(
            select(Task)
            .options(*task_options)
            .where(Task.project_id == project_id, Task.parent_task_id.is_(None))
            .order_by(Task.position.asc())
        )
        tasks = list(result.scalars().all())
        task_responses = [_task_to_response(t) for t in tasks]

    return {
        "idea": [t for t in task_responses if t["status"] == "idea"],
        "todo": [t for t in task_responses if t["status"] == "todo"],
        "in_progress": [t for t in task_responses if t["status"] == "in_progress"],
        "in_review": [t for t in task_responses if t["status"] == "in_review"],
        "done": [t for t in task_responses if t["status"] == "done"],
    }


# =========================================================================
# Helper Functions
# =========================================================================


def _assignment_to_response(assignment: TaskAssignment) -> dict:
    """Convert assignment model to response dict with user info."""
    data = {
        "id": assignment.id,
        "task_id": assignment.task_id,
        "user_id": assignment.user_id,
        "assigned_by_id": assignment.assigned_by_id,
        "role": assignment.role,
        "status": assignment.status,
        "due_date": assignment.due_date,
        "notes": assignment.notes,
        "completed_at": assignment.completed_at,
        "created_at": assignment.created_at,
        "updated_at": assignment.updated_at,
        "user_name": None,
        "user_email": None,
    }
    if hasattr(assignment, "user") and assignment.user:
        data["user_name"] = assignment.user.display_name or assignment.user.email
        data["user_email"] = assignment.user.email
    return data


def _task_to_response(task: Task) -> dict:
    """Convert task model to response dict with assignments and user info."""
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "task_type": task.task_type,
        "project_id": task.project_id,
        "project_name": task.project.name if hasattr(task, "project") and task.project else None,
        "assignee_id": task.assignee_id,
        "created_by_id": task.created_by_id,
        "created_by_name": task.created_by.display_name if hasattr(task, "created_by") and task.created_by else None,
        "created_by_email": task.created_by.email if hasattr(task, "created_by") and task.created_by else None,
        "due_date": task.due_date,
        "completed_at": task.completed_at,
        "position": task.position,
        "estimated_hours": task.estimated_hours,
        "actual_hours": task.actual_hours,
        "parent_task_id": task.parent_task_id,
        "tags": task.tags or [],
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "comment_count": len(task.comments) if hasattr(task, "comments") and task.comments else 0,
        "subtask_count": len(task.subtasks) if hasattr(task, "subtasks") and task.subtasks else 0,
        "vote_count": task.vote_count if hasattr(task, "vote_count") else 0,
        "user_voted": False,
        "impact_score": task.impact_score if hasattr(task, "impact_score") else None,
        "effort_score": task.effort_score if hasattr(task, "effort_score") else None,
        "assignments": [
            _assignment_to_response(a)
            for a in (task.assignments if hasattr(task, "assignments") and task.assignments else [])
        ],
    }


# =========================================================================
# User Assignments
# =========================================================================


@router.get("/my/assignments", response_model=list[TaskAssignmentResponse])
async def get_my_assignments(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    status_filter: str | None = Query(None, alias="status", pattern="^(assigned|accepted|in_progress|completed)$"),
) -> list[dict]:
    """Get all task assignments for the current user."""
    service = TaskAssignmentService(db)
    assignments = await service.get_user_assignments(
        user_id=current_user.id,
        status=status_filter,
        include_task=True,
    )

    return [_assignment_to_response(a) for a in assignments]


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get a specific task."""
    result = await db.execute(
        select(Task)
        .options(
            selectinload(Task.subtasks),
            selectinload(Task.comments),
            selectinload(Task.assignments).selectinload(TaskAssignment.user),
            selectinload(Task.project),
            selectinload(Task.source_idea),
            selectinload(Task.created_by),
        )
        .where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id)

    # Build response with assignments
    response_data = {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "task_type": task.task_type,
        "project_id": task.project_id,
        "project_name": task.project.name if task.project else None,
        "assignee_id": task.assignee_id,
        "created_by_id": task.created_by_id,
        "created_by_name": task.created_by.display_name if task.created_by else None,
        "created_by_email": task.created_by.email if task.created_by else None,
        "due_date": task.due_date,
        "completed_at": task.completed_at,
        "position": task.position,
        "estimated_hours": task.estimated_hours,
        "actual_hours": task.actual_hours,
        "parent_task_id": task.parent_task_id,
        "tags": task.tags or [],
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "comment_count": len(task.comments) if task.comments else 0,
        "subtask_count": len(task.subtasks) if task.subtasks else 0,
        "vote_count": task.vote_count if hasattr(task, 'vote_count') else 0,
        "user_voted": False,
        "impact_score": task.impact_score if hasattr(task, 'impact_score') else None,
        "effort_score": task.effort_score if hasattr(task, 'effort_score') else None,
        "assignments": [_assignment_to_response(a) for a in (task.assignments or [])],
        "source_idea_id": task.source_idea_id,
        "source_idea": {
            "id": task.source_idea.id,
            "content": task.source_idea.content,
            "title": task.source_idea.title,
            "tags": task.source_idea.tags or [],
            "source": task.source_idea.source,
            "created_at": task.source_idea.created_at,
        } if task.source_idea else None,
    }

    return response_data


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID,
    updates: TaskUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Task:
    """Update a task."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    update_data = updates.model_dump(exclude_unset=True)

    # Store old status for notification check
    old_status = task.status

    # Handle status change to done
    if "status" in update_data:
        if update_data["status"] == "done" and task.status != "done":
            task.completed_at = datetime.now(timezone.utc)
        elif update_data["status"] != "done" and task.status == "done":
            task.completed_at = None

    for field, value in update_data.items():
        setattr(task, field, value)

    await db.commit()
    # Re-query with fresh data (including updated_at) and created_by relationship
    stmt = select(Task).options(selectinload(Task.created_by)).where(Task.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one()

    logger.info("Task updated", task_id=str(task_id))

    # Regenerate embedding if title or description changed
    if "title" in update_data or "description" in update_data:
        try:
            generate_embedding.delay(
                entity_type="task",
                entity_id=str(task_id),
            )
        except Exception as e:
            logger.warning(
                "Embedding generation trigger failed",
                task_id=str(task_id),
                error=str(e),
            )

    # Notify assignees if status changed
    new_status = update_data.get("status")
    if new_status and new_status != old_status:
        # Get project with team for organization_id
        project_result = await db.execute(
            select(Project).options(selectinload(Project.team)).where(Project.id == task.project_id)
        )
        project = project_result.scalar_one_or_none()

        if project and project.team and project.team.organization_id:
            # Get all task assignees
            assignment_service = TaskAssignmentService(db)
            assignments = await assignment_service.get_task_assignments(task_id)
            assignee_ids = [a.user_id for a in assignments]

            if assignee_ids:
                notification_service = NotificationService(db)
                await notification_service.notify_many(
                    user_ids=assignee_ids,
                    notification_type="task_status_changed",
                    title=f"Task status changed: {task.title}",
                    message=f"Task '{task.title}' moved from {old_status} to {new_status}",
                    organization_id=project.team.organization_id,
                    target_type="task",
                    target_id=task_id,
                    target_url=f"/projects/{task.project_id}/tasks/{task_id}",
                    sender_id=current_user.id,
                )

    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a task."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    await db.delete(task)
    await db.commit()

    logger.info("Task deleted", task_id=str(task_id))


@router.post("/{task_id}/move", response_model=TaskResponse)
async def move_task(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    new_status: str = Query(..., pattern="^(idea|todo|in_progress|in_review|done)$"),
    new_position: int = Query(..., ge=0),
) -> Task:
    """Move a task to a different status column and/or position."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    old_status = task.status
    old_position = task.position

    # Update positions in old column (shift down)
    if old_status != new_status:
        await db.execute(
            update(Task)
            .where(
                Task.project_id == task.project_id,
                Task.status == old_status,
                Task.position > old_position,
            )
            .values(position=Task.position - 1)
        )

    # Update positions in new column (shift up)
    await db.execute(
        update(Task)
        .where(
            Task.project_id == task.project_id,
            Task.status == new_status,
            Task.position >= new_position,
            Task.id != task_id,
        )
        .values(position=Task.position + 1)
    )

    # Update task
    task.status = new_status
    task.position = new_position

    # Handle completion status
    if new_status == "done" and old_status != "done":
        task.completed_at = datetime.now(timezone.utc)
    elif new_status != "done" and old_status == "done":
        task.completed_at = None

    await db.commit()
    # Re-query with fresh data (including updated_at) and created_by relationship
    stmt = select(Task).options(selectinload(Task.created_by)).where(Task.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one()

    logger.info(
        "Task moved",
        task_id=str(task_id),
        old_status=old_status,
        new_status=new_status,
    )
    return task


# Task Comments
@router.get("/{task_id}/comments", response_model=list[TaskCommentResponse])
async def list_task_comments(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[TaskCommentResponse]:
    """List comments on a task with reactions and mentions."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id)

    # Join with User to get user info
    result = await db.execute(
        select(TaskComment, User.display_name, User.email)
        .join(User, TaskComment.user_id == User.id, isouter=True)
        .where(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at.asc())
    )

    comment_rows = result.all()
    comment_ids = [row[0].id for row in comment_rows]

    # Fetch reactions for all comments
    reactions_map: dict[UUID, list[ReactionSummary]] = {}
    # Fetch mentions for all comments
    mentions_map: dict[UUID, list[MentionInfo]] = {}

    if comment_ids:
        # Get reaction counts grouped by comment_id and emoji
        reactions_result = await db.execute(
            select(
                CommentReaction.comment_id,
                CommentReaction.emoji,
                func.count(CommentReaction.id).label("count"),
                func.bool_or(CommentReaction.user_id == current_user.id).label("user_reacted"),
            )
            .where(CommentReaction.comment_id.in_(comment_ids))
            .group_by(CommentReaction.comment_id, CommentReaction.emoji)
        )

        for reaction_row in reactions_result.all():
            comment_id = reaction_row.comment_id
            if comment_id not in reactions_map:
                reactions_map[comment_id] = []
            reactions_map[comment_id].append(
                ReactionSummary(
                    emoji=reaction_row.emoji,
                    count=reaction_row.count,
                    user_reacted=reaction_row.user_reacted or False,
                )
            )

        # Get mentions with user info
        mentions_result = await db.execute(
            select(CommentMention, User.display_name, User.email)
            .join(User, CommentMention.user_id == User.id)
            .where(CommentMention.comment_id.in_(comment_ids))
        )

        for mention_row in mentions_result.all():
            mention = mention_row[0]
            mentioned_name = mention_row[1]
            mentioned_email = mention_row[2]
            if mention.comment_id not in mentions_map:
                mentions_map[mention.comment_id] = []
            mentions_map[mention.comment_id].append(
                MentionInfo(
                    user_id=mention.user_id,
                    user_name=mentioned_name,
                    user_email=mentioned_email,
                )
            )

    comments = []
    for row in comment_rows:
        comment = row[0]
        user_name = row[1]
        user_email = row[2]
        comments.append(
            TaskCommentResponse(
                id=comment.id,
                task_id=comment.task_id,
                user_id=comment.user_id,
                content=comment.content,
                parent_comment_id=comment.parent_comment_id,
                edited_at=comment.edited_at,
                created_at=comment.created_at,
                user_name=user_name,
                user_email=user_email,
                reactions=reactions_map.get(comment.id, []),
                mentions=mentions_map.get(comment.id, []),
            )
        )
    return comments


@router.post(
    "/{task_id}/comments",
    response_model=TaskCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_task_comment(
    task_id: UUID,
    comment_data: TaskCommentCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> TaskCommentResponse:
    """Add a comment to a task."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id)

    comment = TaskComment(
        task_id=task_id,
        user_id=current_user.id,
        content=comment_data.content,
        parent_comment_id=comment_data.parent_comment_id,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    # Parse and store @mentions
    mention_usernames = parse_mentions_from_content(comment_data.content)
    mentions_info: list[MentionInfo] = []

    if mention_usernames:
        # Look up users by email or display name
        for username in mention_usernames:
            user_result = await db.execute(
                select(User).where(
                    or_(
                        User.email == username,
                        User.email.ilike(f"{username}@%"),
                        User.display_name.ilike(f"%{username}%"),
                    )
                ).limit(1)
            )
            mentioned_user = user_result.scalar_one_or_none()

            if mentioned_user:
                # Create mention record
                mention = CommentMention(
                    comment_id=comment.id,
                    user_id=mentioned_user.id,
                )
                db.add(mention)
                mentions_info.append(
                    MentionInfo(
                        user_id=mentioned_user.id,
                        user_name=mentioned_user.display_name,
                        user_email=mentioned_user.email,
                    )
                )

        if mentions_info:
            await db.commit()

    logger.info("Task comment created", task_id=str(task_id), comment_id=str(comment.id), mentions=len(mentions_info))

    # Return with user info and mentions
    return TaskCommentResponse(
        id=comment.id,
        task_id=comment.task_id,
        user_id=comment.user_id,
        content=comment.content,
        parent_comment_id=comment.parent_comment_id,
        edited_at=comment.edited_at,
        created_at=comment.created_at,
        user_name=current_user.display_name,
        user_email=current_user.email,
        mentions=mentions_info,
    )


@router.patch("/{task_id}/comments/{comment_id}", response_model=TaskCommentResponse)
async def update_task_comment(
    task_id: UUID,
    comment_id: UUID,
    comment_data: TaskCommentUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> TaskCommentResponse:
    """Update a task comment."""
    result = await db.execute(
        select(TaskComment).where(
            TaskComment.id == comment_id,
            TaskComment.task_id == task_id,
        )
    )
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    if comment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can only edit your own comments",
        )

    comment.content = comment_data.content
    comment.edited_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(comment)

    # Return with user info
    return TaskCommentResponse(
        id=comment.id,
        task_id=comment.task_id,
        user_id=comment.user_id,
        content=comment.content,
        parent_comment_id=comment.parent_comment_id,
        edited_at=comment.edited_at,
        created_at=comment.created_at,
        user_name=current_user.display_name,
        user_email=current_user.email,
    )


@router.delete(
    "/{task_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_task_comment(
    task_id: UUID,
    comment_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a task comment."""
    result = await db.execute(
        select(TaskComment).where(
            TaskComment.id == comment_id,
            TaskComment.task_id == task_id,
        )
    )
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    if comment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can only delete your own comments",
        )

    await db.delete(comment)
    await db.commit()


# =========================================================================
# Comment Reactions
# =========================================================================


@router.get(
    "/{task_id}/comments/{comment_id}/reactions",
    response_model=list[ReactionSummary],
)
async def list_comment_reactions(
    task_id: UUID,
    comment_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[ReactionSummary]:
    """List reactions on a comment with counts."""
    # Verify comment exists and user has access
    result = await db.execute(
        select(TaskComment).where(
            TaskComment.id == comment_id,
            TaskComment.task_id == task_id,
        )
    )
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    # Get task to verify project access
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    await check_project_access(db, task.project_id, current_user.id)

    # Get reaction counts grouped by emoji
    result = await db.execute(
        select(
            CommentReaction.emoji,
            func.count(CommentReaction.id).label("count"),
            func.bool_or(CommentReaction.user_id == current_user.id).label("user_reacted"),
        )
        .where(CommentReaction.comment_id == comment_id)
        .group_by(CommentReaction.emoji)
    )

    reactions = []
    for row in result.all():
        reactions.append(
            ReactionSummary(
                emoji=row.emoji,
                count=row.count,
                user_reacted=row.user_reacted or False,
            )
        )
    return reactions


@router.post(
    "/{task_id}/comments/{comment_id}/reactions",
    response_model=CommentReactionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_comment_reaction(
    task_id: UUID,
    comment_id: UUID,
    reaction_data: CommentReactionCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> CommentReactionResponse:
    """Add a reaction to a comment."""
    # Verify comment exists
    result = await db.execute(
        select(TaskComment).where(
            TaskComment.id == comment_id,
            TaskComment.task_id == task_id,
        )
    )
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    # Get task to verify project access
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    await check_project_access(db, task.project_id, current_user.id)

    # Check if reaction already exists
    result = await db.execute(
        select(CommentReaction).where(
            CommentReaction.comment_id == comment_id,
            CommentReaction.user_id == current_user.id,
            CommentReaction.emoji == reaction_data.emoji,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Reaction already exists",
        )

    # Create reaction
    reaction = CommentReaction(
        comment_id=comment_id,
        user_id=current_user.id,
        emoji=reaction_data.emoji,
    )
    db.add(reaction)
    await db.commit()
    await db.refresh(reaction)

    logger.info(
        "Comment reaction added",
        comment_id=str(comment_id),
        reaction_id=str(reaction.id),
        emoji=reaction_data.emoji,
    )

    return CommentReactionResponse(
        id=reaction.id,
        comment_id=reaction.comment_id,
        user_id=reaction.user_id,
        emoji=reaction.emoji,
        created_at=reaction.created_at,
    )


@router.delete(
    "/{task_id}/comments/{comment_id}/reactions/{emoji}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_comment_reaction(
    task_id: UUID,
    comment_id: UUID,
    emoji: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove a reaction from a comment."""
    # Verify task exists and user has access
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    await check_project_access(db, task.project_id, current_user.id)

    # Find the reaction
    result = await db.execute(
        select(CommentReaction).where(
            CommentReaction.comment_id == comment_id,
            CommentReaction.user_id == current_user.id,
            CommentReaction.emoji == emoji,
        )
    )
    reaction = result.scalar_one_or_none()

    if not reaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reaction not found",
        )

    # Verify the comment belongs to the task
    result = await db.execute(
        select(TaskComment).where(
            TaskComment.id == comment_id,
            TaskComment.task_id == task_id,
        )
    )
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    await db.delete(reaction)
    await db.commit()

    logger.info(
        "Comment reaction removed",
        comment_id=str(comment_id),
        emoji=emoji,
    )


# =========================================================================
# Task Assignments
# =========================================================================


@router.post(
    "/{task_id}/assignments",
    response_model=list[TaskAssignmentResponse],
    status_code=status.HTTP_201_CREATED,
)
async def assign_users_to_task(
    task_id: UUID,
    assignment_data: TaskAssignmentCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    """Assign one or more users to a task."""
    # Get the task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    service = TaskAssignmentService(db)
    assignments = []

    for user_id in assignment_data.user_ids:
        assignment = await service.assign_user(
            task_id=task_id,
            user_id=user_id,
            assigned_by_id=current_user.id,
            role=assignment_data.role,
            due_date=assignment_data.due_date,
            notes=assignment_data.notes,
        )
        assignments.append(assignment)

    # Get project with team for organization_id
    project_result = await db.execute(
        select(Project).options(selectinload(Project.team)).where(Project.id == task.project_id)
    )
    project = project_result.scalar_one_or_none()

    # Send notifications to assigned users
    if project and project.team and project.team.organization_id:
        notification_service = NotificationService(db)
        for user_id in assignment_data.user_ids:
            await notification_service.notify(
                user_id=user_id,
                notification_type="task_assigned",
                title=f"You were assigned to: {task.title}",
                message=f"You have been assigned to the task '{task.title}'",
                organization_id=project.team.organization_id,
                target_type="task",
                target_id=task_id,
                target_url=f"/projects/{task.project_id}/tasks/{task_id}",
                sender_id=current_user.id,
            )

    # Reload with user info
    loaded = await service.get_task_assignments(task_id, include_user=True)
    return [_assignment_to_response(a) for a in loaded if a.id in [x.id for x in assignments]]


@router.get("/{task_id}/assignments", response_model=list[TaskAssignmentResponse])
async def list_task_assignments(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    """List all assignments for a task."""
    # Get the task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id)

    service = TaskAssignmentService(db)
    assignments = await service.get_task_assignments(task_id, include_user=True)

    return [_assignment_to_response(a) for a in assignments]


@router.patch(
    "/{task_id}/assignments/{assignment_id}",
    response_model=TaskAssignmentResponse,
)
async def update_task_assignment(
    task_id: UUID,
    assignment_id: UUID,
    update_data: TaskAssignmentUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Update a task assignment."""
    # Verify assignment belongs to this task
    service = TaskAssignmentService(db)
    assignment = await service.get_assignment_by_id(assignment_id)

    if not assignment or assignment.task_id != task_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )

    # Get task for project access check
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    updated = await service.update_assignment(
        assignment_id=assignment_id,
        role=update_data.role,
        status=update_data.status,
        due_date=update_data.due_date,
        notes=update_data.notes,
    )

    return _assignment_to_response(updated)


@router.delete(
    "/{task_id}/assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_task_assignment(
    task_id: UUID,
    assignment_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove a user's assignment from a task."""
    # Verify assignment belongs to this task
    service = TaskAssignmentService(db)
    assignment = await service.get_assignment_by_id(assignment_id)

    if not assignment or assignment.task_id != task_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )

    # Get task for project access check
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    # Store user_id before removal for notification
    removed_user_id = assignment.user_id

    await service.remove_assignment_by_id(assignment_id)
    logger.info(
        "Assignment removed",
        task_id=str(task_id),
        assignment_id=str(assignment_id),
    )

    # Send notification to unassigned user
    project_result = await db.execute(
        select(Project).options(selectinload(Project.team)).where(Project.id == task.project_id)
    )
    project = project_result.scalar_one_or_none()

    if project and project.team and project.team.organization_id:
        notification_service = NotificationService(db)
        await notification_service.notify(
            user_id=removed_user_id,
            notification_type="task_unassigned",
            title=f"You were removed from: {task.title}",
            message=f"You have been unassigned from the task '{task.title}'",
            organization_id=project.team.organization_id,
            target_type="task",
            target_id=task_id,
            target_url=f"/projects/{task.project_id}/tasks/{task_id}",
            sender_id=current_user.id,
        )


# =========================================================================
# Task-Document Links
# =========================================================================


def _document_link_to_response(link: TaskDocument) -> dict:
    """Convert task-document link to response dict."""
    data = {
        "id": link.id,
        "task_id": link.task_id,
        "document_id": link.document_id,
        "link_type": link.link_type,
        "is_primary": link.is_primary,
        "requires_review": link.requires_review,
        "position": link.position,
        "notes": link.notes,
        "created_by_id": link.created_by_id,
        "created_at": link.created_at,
        "updated_at": link.updated_at,
        "document_title": None,
        "document_type": None,
    }
    if hasattr(link, "document") and link.document:
        data["document_title"] = link.document.title
        data["document_type"] = link.document.document_type
    return data


@router.post(
    "/{task_id}/documents",
    response_model=list[TaskDocumentResponse],
    status_code=status.HTTP_201_CREATED,
)
async def link_documents_to_task(
    task_id: UUID,
    link_data: TaskDocumentCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    """Link one or more documents to a task."""
    # Get the task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    service = TaskDocumentService(db)
    links = []

    for doc_id in link_data.document_ids:
        link = await service.link_document(
            task_id=task_id,
            document_id=doc_id,
            created_by_id=current_user.id,
            link_type=link_data.link_type,
            is_primary=link_data.is_primary if len(link_data.document_ids) == 1 else False,
            requires_review=link_data.requires_review,
            notes=link_data.notes,
        )
        links.append(link)

    # Reload with document info
    loaded = await service.get_task_documents(task_id, include_document=True)
    return [_document_link_to_response(l) for l in loaded if l.id in [x.id for x in links]]


@router.get("/{task_id}/documents", response_model=list[TaskDocumentResponse])
async def list_task_documents(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    link_type: str | None = Query(None, pattern="^(reference|attachment|deliverable|input|output)$"),
) -> list[dict]:
    """List all documents linked to a task."""
    # Get the task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id)

    service = TaskDocumentService(db)
    links = await service.get_task_documents(task_id, link_type=link_type, include_document=True)

    return [_document_link_to_response(l) for l in links]


@router.patch(
    "/{task_id}/documents/{link_id}",
    response_model=TaskDocumentResponse,
)
async def update_document_link(
    task_id: UUID,
    link_id: UUID,
    update_data: TaskDocumentUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Update a task-document link."""
    service = TaskDocumentService(db)
    link = await service.get_link_by_id(link_id)

    if not link or link.task_id != task_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document link not found",
        )

    # Get task for project access check
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    updated = await service.update_link(
        link_id=link_id,
        link_type=update_data.link_type,
        is_primary=update_data.is_primary,
        requires_review=update_data.requires_review,
        notes=update_data.notes,
    )

    return _document_link_to_response(updated)


@router.delete(
    "/{task_id}/documents/{link_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unlink_document_from_task(
    task_id: UUID,
    link_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove a document link from a task."""
    service = TaskDocumentService(db)
    link = await service.get_link_by_id(link_id)

    if not link or link.task_id != task_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document link not found",
        )

    # Get task for project access check
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    await service.unlink_by_id(link_id)
    logger.info(
        "Document unlinked from task",
        task_id=str(task_id),
        link_id=str(link_id),
    )


# =============================================================================
# Custom Field Values
# =============================================================================

class CustomFieldValueSet(BaseModel):
    """Set a custom field value."""

    field_id: UUID
    value: dict | list | str | int | float | bool | None


class CustomFieldValueBulkSet(BaseModel):
    """Set multiple custom field values."""

    values: list[CustomFieldValueSet]


class CustomFieldValueResponse(BaseModel):
    """Custom field value response."""

    id: UUID
    task_id: UUID
    field_id: UUID
    value: dict | None
    # Field info when loaded
    field_name: str | None = None
    field_display_name: str | None = None
    field_type: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def _field_value_to_response(fv: TaskCustomFieldValue) -> dict:
    """Convert TaskCustomFieldValue to response dict."""
    return {
        "id": fv.id,
        "task_id": fv.task_id,
        "field_id": fv.field_id,
        "value": fv.value,
        "field_name": fv.field.name if fv.field else None,
        "field_display_name": fv.field.display_name if fv.field else None,
        "field_type": fv.field.field_type if fv.field else None,
        "created_at": fv.created_at,
        "updated_at": fv.updated_at,
    }


@router.get(
    "/{task_id}/custom-fields",
    response_model=list[CustomFieldValueResponse],
)
async def get_task_custom_field_values(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    """Get all custom field values for a task."""
    # Get task to verify access
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id)

    service = CustomFieldService(db)
    values = await service.get_task_field_values(task_id)

    return [_field_value_to_response(v) for v in values]


@router.put(
    "/{task_id}/custom-fields/{field_id}",
    response_model=CustomFieldValueResponse,
)
async def set_task_custom_field_value(
    task_id: UUID,
    field_id: UUID,
    value_data: CustomFieldValueSet,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Set a single custom field value for a task."""
    # Get task to verify access
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    service = CustomFieldService(db)

    # Verify field exists and belongs to the project
    field = await service.get_field(field_id)
    if not field or field.project_id != task.project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found",
        )

    # Validate value
    is_valid, error = service.validate_value(field, value_data.value)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error,
        )

    field_value = await service.set_task_field_value(
        task_id=task_id,
        field_id=field_id,
        value=value_data.value,
    )

    # Load field relationship for response
    await db.refresh(field_value, ["field"])

    return _field_value_to_response(field_value)


@router.put(
    "/{task_id}/custom-fields",
    response_model=list[CustomFieldValueResponse],
)
async def set_task_custom_field_values_bulk(
    task_id: UUID,
    bulk_data: CustomFieldValueBulkSet,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    """Set multiple custom field values for a task."""
    # Get task to verify access
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    service = CustomFieldService(db)
    results = []

    for item in bulk_data.values:
        # Verify field exists and belongs to the project
        field = await service.get_field(item.field_id)
        if not field or field.project_id != task.project_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Custom field {item.field_id} not found",
            )

        # Validate value
        is_valid, error = service.validate_value(field, item.value)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Field '{field.display_name}': {error}",
            )

        field_value = await service.set_task_field_value(
            task_id=task_id,
            field_id=item.field_id,
            value=item.value,
        )

        # Load field relationship for response
        await db.refresh(field_value, ["field"])
        results.append(field_value)

    return [_field_value_to_response(v) for v in results]


@router.delete(
    "/{task_id}/custom-fields/{field_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_task_custom_field_value(
    task_id: UUID,
    field_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a custom field value for a task."""
    # Get task to verify access
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    service = CustomFieldService(db)
    deleted = await service.delete_task_field_value(task_id, field_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field value not found",
        )


# =============================================================================
# Task-Review Integration (Workflow)
# =============================================================================

class SubmitForReviewRequest(BaseModel):
    """Request to submit a task for review."""

    reviewer_ids: list[UUID] | None = None
    review_type: str = Field(default="approval", pattern="^(feedback|approval|peer_review|editorial)$")
    priority: str = Field(default="normal", pattern="^(low|normal|high|urgent)$")
    due_date: datetime | None = None
    auto_transition_task: bool = True


class ReviewSummary(BaseModel):
    """Summary of a review."""

    id: UUID
    document_id: UUID
    title: str
    status: str
    decision: str | None

    class Config:
        from_attributes = True


class TaskReviewStatusResponse(BaseModel):
    """Task review status response."""

    total_reviews: int
    pending_reviews: int
    approved_reviews: int
    rejected_reviews: int
    all_approved: bool
    overall_status: str
    reviews: list[dict]
    ai_suggestion_count: int = 0


class WorkflowStateResponse(BaseModel):
    """Task workflow state response."""

    task_id: UUID
    task_status: str
    task_title: str
    linked_documents: int
    reviewable_documents: int
    assignees: int
    review_status: TaskReviewStatusResponse
    can_submit_for_review: bool
    submit_blocked_reason: str | None
    workflow_stage: str


class WorkItemResponse(BaseModel):
    """Work item response (task or review)."""

    type: str
    id: UUID
    title: str
    status: str
    priority: str
    due_date: str | None
    assignment_status: str
    assignment_role: str
    project_id: UUID
    document_id: UUID | None = None
    task_id: UUID | None = None
    created_at: str


class WorkItemsResponse(BaseModel):
    """Response containing user's work items."""

    tasks: list[dict]
    reviews: list[dict]
    combined: list[dict]
    total_tasks: int
    total_reviews: int


@router.post(
    "/{task_id}/submit-for-review",
    response_model=list[dict],
    status_code=status.HTTP_201_CREATED,
)
async def submit_task_for_review(
    task_id: UUID,
    request_data: SubmitForReviewRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    """
    Submit a task for review by creating reviews for linked documents.

    This will:
    1. Create reviews for all documents linked to the task that require review
    2. Optionally transition the task to 'in_review' status
    3. Trigger AI auto-review for each created review (if enabled)
    """
    # Get task to verify access
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access and get project for organization_id
    project = await check_project_access(db, task.project_id, current_user.id, "member")

    workflow_service = WorkflowService(db)

    # Check if can submit
    can_submit, reason = await workflow_service.can_submit_for_review(task_id)
    if not can_submit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=reason,
        )

    try:
        reviews = await workflow_service.submit_task_for_review(
            task_id=task_id,
            submitted_by_id=current_user.id,
            reviewer_ids=request_data.reviewer_ids,
            review_type=request_data.review_type,
            priority=request_data.priority,
            due_date=request_data.due_date,
            auto_transition_task=request_data.auto_transition_task,
        )

        # Trigger AI auto-review for each created review in background
        org_id = project.team.organization_id if project.team else None
        for review in reviews:
            try:
                auto_review_for_review_task.delay(
                    review_id=str(review.id),
                    user_id=str(current_user.id),
                    organization_id=str(org_id) if org_id else None,
                )
            except Exception as e:
                # Don't fail the submit if auto-review trigger fails
                logger.warning(
                    "Auto-review trigger failed for review",
                    review_id=str(review.id),
                    error=str(e),
                )

        return [
            {
                "id": str(r.id),
                "document_id": str(r.document_id),
                "title": r.title,
                "status": r.status,
            }
            for r in reviews
        ]
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get(
    "/{task_id}/review-status",
    response_model=TaskReviewStatusResponse,
)
async def get_task_review_status(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get the aggregate review status for a task."""
    # Get task to verify access
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id)

    workflow_service = WorkflowService(db)
    status_data = await workflow_service.get_task_review_status(task_id)

    return status_data


@router.get(
    "/{task_id}/workflow-state",
    response_model=WorkflowStateResponse,
)
async def get_task_workflow_state(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get the complete workflow state for a task."""
    # Get task to verify access
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id)

    workflow_service = WorkflowService(db)
    state = await workflow_service.get_task_workflow_state(task_id)

    if "error" in state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=state["error"],
        )

    return state


# Note: Work items endpoint placed before /{task_id} routes to avoid routing conflict
@router.get(
    "/my/work-items",
    response_model=WorkItemsResponse,
)
async def get_my_work_items(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    include_tasks: bool = Query(True, description="Include task assignments"),
    include_reviews: bool = Query(True, description="Include review assignments"),
    status_filter: str | None = Query(None, pattern="^(active|completed|all)$"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict:
    """
    Get a unified view of the current user's work items.

    Returns tasks assigned to the user and reviews they need to complete,
    sorted by priority and due date.
    """
    workflow_service = WorkflowService(db)
    work_items = await workflow_service.get_user_work_items(
        user_id=current_user.id,
        include_tasks=include_tasks,
        include_reviews=include_reviews,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )

    return work_items


# --- Task Blockers endpoint ---

class TaskBlockerResponse(BaseModel):
    """Blocker info for a task."""

    id: UUID
    title: str
    status: str
    priority: str
    blocker_type: str
    impact_level: str
    assignee_id: UUID | None
    due_date: date | None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/{task_id}/blockers", response_model=list[TaskBlockerResponse])
async def get_task_blockers(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    active_only: bool = Query(True, description="Only return active (non-resolved) blockers"),
) -> list[dict]:
    """Get all blockers that are blocking this task."""
    # Verify task exists and user has access
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await check_project_access(db, task.project_id, current_user.id, "viewer")

    # Find blockers linked to this task
    query = (
        select(Blocker)
        .join(BlockerLink, BlockerLink.blocker_id == Blocker.id)
        .where(
            BlockerLink.blocked_entity_type == "task",
            BlockerLink.blocked_entity_id == task_id,
        )
    )

    if active_only:
        query = query.where(Blocker.status.in_(["open", "in_progress"]))

    result = await db.execute(query)
    blockers = result.scalars().all()

    return [
        {
            "id": b.id,
            "title": b.title,
            "status": b.status,
            "priority": b.priority,
            "blocker_type": b.blocker_type,
            "impact_level": b.impact_level,
            "assignee_id": b.assignee_id,
            "due_date": b.due_date,
            "created_at": b.created_at,
        }
        for b in blockers
    ]


# =============================================================================
# Idea Voting, Scoring, and Conversion Endpoints
# =============================================================================


class IdeaVoteResponse(BaseModel):
    """Idea vote response."""

    id: UUID
    task_id: UUID
    user_id: UUID
    vote_type: str
    created_at: datetime
    user_name: str | None = None
    user_email: str | None = None

    class Config:
        from_attributes = True


class IdeaScoreUpdate(BaseModel):
    """Update impact/effort scores for an idea."""

    impact_score: int = Field(..., ge=1, le=5)
    effort_score: int = Field(..., ge=1, le=5)
    notes: str | None = None


class ConvertToProjectRequest(BaseModel):
    """Request to convert an idea to a subproject."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    team_id: UUID | None = None  # If not provided, uses project's team


class ConvertToTaskRequest(BaseModel):
    """Request to convert an idea to a regular task."""

    target_status: str = Field(default="todo", pattern="^(todo|in_progress|in_review)$")
    assignee_id: UUID | None = None
    due_date: date | None = None


@router.post("/{task_id}/vote", response_model=IdeaVoteResponse)
async def vote_for_idea(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> IdeaVoteResponse:
    """Vote for an idea (toggle - adds vote if not exists, removes if exists)."""
    # Get task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != "idea":
        raise HTTPException(
            status_code=400,
            detail="Only ideas can be voted on",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id)

    # Check if vote already exists
    result = await db.execute(
        select(IdeaVote).where(
            IdeaVote.task_id == task_id,
            IdeaVote.user_id == current_user.id,
        )
    )
    existing_vote = result.scalar_one_or_none()

    if existing_vote:
        # Remove existing vote (toggle behavior)
        await db.delete(existing_vote)
        await db.commit()
        raise HTTPException(
            status_code=200,
            detail="Vote removed",
        )

    # Create new vote
    vote = IdeaVote(
        task_id=task_id,
        user_id=current_user.id,
        vote_type="upvote",
    )
    db.add(vote)
    await db.commit()
    await db.refresh(vote)

    logger.info("Idea vote added", task_id=str(task_id), user_id=str(current_user.id))

    return IdeaVoteResponse(
        id=vote.id,
        task_id=vote.task_id,
        user_id=vote.user_id,
        vote_type=vote.vote_type,
        created_at=vote.created_at,
        user_name=current_user.display_name,
        user_email=current_user.email,
    )


@router.delete("/{task_id}/vote", status_code=status.HTTP_204_NO_CONTENT)
async def remove_idea_vote(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove vote from an idea."""
    # Find the vote
    result = await db.execute(
        select(IdeaVote).where(
            IdeaVote.task_id == task_id,
            IdeaVote.user_id == current_user.id,
        )
    )
    vote = result.scalar_one_or_none()

    if not vote:
        raise HTTPException(status_code=404, detail="Vote not found")

    await db.delete(vote)
    await db.commit()

    logger.info("Idea vote removed", task_id=str(task_id), user_id=str(current_user.id))


@router.get("/{task_id}/votes", response_model=list[IdeaVoteResponse])
async def get_idea_votes(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[IdeaVoteResponse]:
    """Get all votes for an idea."""
    # Get task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id)

    # Get votes with user info
    result = await db.execute(
        select(IdeaVote, User.display_name, User.email)
        .join(User, IdeaVote.user_id == User.id)
        .where(IdeaVote.task_id == task_id)
        .order_by(IdeaVote.created_at.desc())
    )

    votes = []
    for row in result.all():
        vote = row[0]
        votes.append(
            IdeaVoteResponse(
                id=vote.id,
                task_id=vote.task_id,
                user_id=vote.user_id,
                vote_type=vote.vote_type,
                created_at=vote.created_at,
                user_name=row[1],
                user_email=row[2],
            )
        )

    return votes


@router.patch("/{task_id}/score", response_model=TaskResponse)
async def update_idea_score(
    task_id: UUID,
    score_data: IdeaScoreUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Task:
    """Update impact/effort scores for an idea."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != "idea":
        raise HTTPException(
            status_code=400,
            detail="Only ideas can have impact/effort scores",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    # Update extra_data with scoring info
    extra_data = task.extra_data or {}
    extra_data["impact_score"] = score_data.impact_score
    extra_data["effort_score"] = score_data.effort_score
    extra_data["scoring_notes"] = score_data.notes
    extra_data["scored_by_id"] = str(current_user.id)
    extra_data["scored_at"] = datetime.now(timezone.utc).isoformat()

    task.extra_data = extra_data

    await db.commit()
    # Re-query with fresh data (including updated_at) and created_by relationship
    stmt = select(Task).options(selectinload(Task.created_by)).where(Task.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one()

    logger.info(
        "Idea score updated",
        task_id=str(task_id),
        impact=score_data.impact_score,
        effort=score_data.effort_score,
    )

    return task


@router.post("/{task_id}/convert-to-task", response_model=TaskResponse)
async def convert_idea_to_task(
    task_id: UUID,
    convert_data: ConvertToTaskRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Task:
    """Convert an idea to a regular task."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != "idea":
        raise HTTPException(
            status_code=400,
            detail="Only ideas can be converted",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    # Get max position for target status
    max_pos_result = await db.execute(
        select(func.max(Task.position)).where(
            Task.project_id == task.project_id,
            Task.status == convert_data.target_status,
        )
    )
    max_position = max_pos_result.scalar() or 0

    # Update task
    task.status = convert_data.target_status
    task.position = max_position + 1
    if convert_data.assignee_id:
        task.assignee_id = convert_data.assignee_id
    if convert_data.due_date:
        task.due_date = convert_data.due_date

    # Store conversion info in extra_data
    extra_data = task.extra_data or {}
    extra_data["converted_from_idea"] = True
    extra_data["converted_at"] = datetime.now(timezone.utc).isoformat()
    extra_data["converted_by_id"] = str(current_user.id)
    task.extra_data = extra_data

    await db.commit()
    # Re-query with fresh data (including updated_at) and created_by relationship
    stmt = select(Task).options(selectinload(Task.created_by)).where(Task.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one()

    logger.info("Idea converted to task", task_id=str(task_id), new_status=convert_data.target_status)

    return task


@router.post("/{task_id}/convert-to-project")
async def convert_idea_to_project(
    task_id: UUID,
    convert_data: ConvertToProjectRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Convert an idea to a subproject."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != "idea":
        raise HTTPException(
            status_code=400,
            detail="Only ideas can be converted to projects",
        )

    # Get the parent project
    result = await db.execute(select(Project).where(Project.id == task.project_id))
    parent_project = result.scalar_one_or_none()

    if not parent_project:
        raise HTTPException(status_code=404, detail="Parent project not found")

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    # Create the subproject
    team_id = convert_data.team_id or parent_project.team_id
    new_project = Project(
        name=convert_data.name,
        description=convert_data.description or (
            task.description.get("content", [{}])[0].get("content", [{}])[0].get("text", "")
            if task.description else None
        ),
        parent_id=parent_project.id,
        team_id=team_id,
        created_by_id=current_user.id,
        status="active",
        scope=parent_project.scope,
        extra_data={
            "converted_from_idea_id": str(task.id),
            "converted_at": datetime.now(timezone.utc).isoformat(),
            "original_idea_title": task.title,
        },
    )
    db.add(new_project)

    # Mark the original idea as done (converted)
    task.status = "done"
    task.completed_at = datetime.now(timezone.utc)
    extra_data = task.extra_data or {}
    extra_data["converted_to_project"] = True
    extra_data["converted_project_id"] = None  # Will update after commit
    task.extra_data = extra_data

    await db.commit()
    await db.refresh(new_project)

    # Update task with project ID
    task.extra_data["converted_project_id"] = str(new_project.id)
    await db.commit()

    logger.info(
        "Idea converted to project",
        task_id=str(task_id),
        project_id=str(new_project.id),
    )

    return {
        "message": "Idea converted to project",
        "project_id": str(new_project.id),
        "project_name": new_project.name,
        "original_task_id": str(task_id),
    }


# =============================================================================
# Task Attention Details (for hover cards)
# =============================================================================


class TaskBlockerSummary(BaseModel):
    """Simplified blocker data for task hover display."""

    id: UUID
    title: str
    impact_level: str
    status: str
    due_date: date | None = None


class TaskCommentSummary(BaseModel):
    """Simplified comment data for task hover display."""

    id: UUID
    author_name: str | None
    content: str
    created_at: datetime
    is_read: bool = False


class TaskAttentionDetails(BaseModel):
    """Detailed data for task hover card."""

    task_id: UUID
    task_title: str
    blockers: list[TaskBlockerSummary]
    recent_comments: list[TaskCommentSummary]
    total_comments: int
    unread_comments: int


@router.get("/{task_id}/attention-details", response_model=TaskAttentionDetails)
async def get_task_attention_details(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> TaskAttentionDetails:
    """
    Get attention-related details for a task (blockers and comments).

    Used for hover card display with summaries of blockers and recent comments.
    """
    from researchhub.models.collaboration import CommentRead

    # Get task
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "viewer")

    # Get active blockers for this task
    blocker_query = (
        select(Blocker)
        .join(BlockerLink, BlockerLink.blocker_id == Blocker.id)
        .where(
            BlockerLink.blocked_entity_type == "task",
            BlockerLink.blocked_entity_id == task_id,
            Blocker.status.in_(["open", "in_progress"]),
        )
        .order_by(
            # Sort by impact: critical > high > medium > low
            func.case(
                (Blocker.impact_level == "critical", 0),
                (Blocker.impact_level == "high", 1),
                (Blocker.impact_level == "medium", 2),
                else_=3,
            )
        )
        .limit(5)
    )
    blocker_result = await db.execute(blocker_query)
    blockers = blocker_result.scalars().all()

    # Get recent comments with user info
    comment_query = (
        select(TaskComment, User.display_name)
        .join(User, TaskComment.user_id == User.id, isouter=True)
        .where(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at.desc())
        .limit(5)
    )
    comment_result = await db.execute(comment_query)
    comment_rows = comment_result.all()

    # Get total comment count
    count_result = await db.execute(
        select(func.count(TaskComment.id)).where(TaskComment.task_id == task_id)
    )
    total_comments = count_result.scalar() or 0

    # Get read status for these comments
    comment_ids = [row[0].id for row in comment_rows]
    read_result = await db.execute(
        select(CommentRead.comment_id)
        .where(
            CommentRead.comment_type == "task",
            CommentRead.comment_id.in_(comment_ids) if comment_ids else False,
            CommentRead.user_id == current_user.id,
        )
    )
    read_comment_ids = {row[0] for row in read_result.all()}

    # Calculate unread count (excluding user's own comments)
    unread_count_result = await db.execute(
        select(func.count(TaskComment.id))
        .where(
            TaskComment.task_id == task_id,
            TaskComment.user_id != current_user.id,
            ~TaskComment.id.in_(
                select(CommentRead.comment_id)
                .where(
                    CommentRead.comment_type == "task",
                    CommentRead.user_id == current_user.id,
                )
            ),
        )
    )
    unread_comments = unread_count_result.scalar() or 0

    return TaskAttentionDetails(
        task_id=task.id,
        task_title=task.title,
        blockers=[
            TaskBlockerSummary(
                id=b.id,
                title=b.title,
                impact_level=b.impact_level,
                status=b.status,
                due_date=b.due_date,
            )
            for b in blockers
        ],
        recent_comments=[
            TaskCommentSummary(
                id=row[0].id,
                author_name=row[1],
                content=row[0].content[:200],  # Truncate for preview
                created_at=row[0].created_at,
                is_read=row[0].id in read_comment_ids or row[0].user_id == current_user.id,
            )
            for row in comment_rows
        ],
        total_comments=total_comments,
        unread_comments=unread_comments,
    )


# =============================================================================
# Dashboard Quick Actions
# =============================================================================


class SnoozeRequest(BaseModel):
    """Request to snooze a task's due date."""
    snooze_to: str = Field(
        ...,
        pattern="^(tomorrow|next_week)$",
        description="When to snooze the task to: 'tomorrow' or 'next_week'"
    )


@router.post("/{task_id}/quick-complete", response_model=TaskResponse)
async def quick_complete_task(
    task_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Task:
    """Quickly mark a task as complete from the dashboard.

    This is a convenience endpoint that sets status to 'done' and
    records the completion timestamp.
    """
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    # Mark as complete
    task.status = "done"
    task.completed_at = datetime.now(timezone.utc)

    await db.commit()

    # Re-query with fresh data and relationships
    stmt = select(Task).options(selectinload(Task.created_by)).where(Task.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one()

    logger.info("Task quick-completed", task_id=str(task_id), user_id=str(current_user.id))
    return task


@router.post("/{task_id}/snooze", response_model=TaskResponse)
async def snooze_task(
    task_id: UUID,
    snooze_data: SnoozeRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Task:
    """Snooze a task by moving its due date.

    - 'tomorrow': Sets due date to tomorrow
    - 'next_week': Sets due date to 7 days from today

    If the task has no due date, one will be assigned.
    """
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Verify project access
    await check_project_access(db, task.project_id, current_user.id, "member")

    # Calculate new due date
    today = date.today()
    if snooze_data.snooze_to == "tomorrow":
        new_due_date = today + timedelta(days=1)
    elif snooze_data.snooze_to == "next_week":
        new_due_date = today + timedelta(days=7)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid snooze_to value",
        )

    # Update due date
    old_due_date = task.due_date
    task.due_date = new_due_date

    await db.commit()

    # Re-query with fresh data and relationships
    stmt = select(Task).options(selectinload(Task.created_by)).where(Task.id == task_id)
    result = await db.execute(stmt)
    task = result.scalar_one()

    logger.info(
        "Task snoozed",
        task_id=str(task_id),
        user_id=str(current_user.id),
        old_due_date=str(old_due_date) if old_due_date else None,
        new_due_date=str(new_due_date),
        snooze_to=snooze_data.snooze_to,
    )
    return task
