"""Ideas API endpoints - Quick capture for thoughts on the go."""

from datetime import datetime, timezone
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db_session
from researchhub.models.idea import Idea
from researchhub.models.organization import TeamMember
from sqlalchemy.orm import selectinload

router = APIRouter()
logger = structlog.get_logger()


# Request/Response Models
class IdeaCreate(BaseModel):
    """Create a new idea - minimal friction."""

    content: str = Field(..., min_length=1, max_length=10000)
    title: str | None = Field(None, max_length=255)
    tags: list[str] = Field(default_factory=list)
    source: str = Field(default="web", pattern="^(web|mobile|voice|api)$")


class IdeaUpdate(BaseModel):
    """Update an existing idea."""

    content: str | None = Field(None, min_length=1, max_length=10000)
    title: str | None = Field(None, max_length=255)
    tags: list[str] | None = None
    status: str | None = Field(None, pattern="^(captured|reviewed|converted|archived)$")
    is_pinned: bool | None = None


class IdeaResponse(BaseModel):
    """Idea response model."""

    id: UUID
    content: str
    title: str | None
    tags: list[str]
    status: str
    source: str
    is_pinned: bool
    ai_summary: str | None
    ai_suggested_tags: list[str]
    converted_to_project_id: UUID | None
    converted_to_task_id: UUID | None
    converted_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # Owner info
    user_id: UUID
    user_name: str | None = None
    user_email: str | None = None

    class Config:
        from_attributes = True


class IdeaListResponse(BaseModel):
    """Paginated idea list response."""

    items: list[IdeaResponse]
    total: int
    page: int
    page_size: int
    pages: int


class ConvertToProjectRequest(BaseModel):
    """Convert idea to project."""

    project_name: str = Field(..., min_length=1, max_length=255)
    team_id: UUID
    project_type: str = Field(default="general")


class ConvertToTaskRequest(BaseModel):
    """Convert idea to task."""

    project_id: UUID
    task_title: str | None = None  # Uses idea content if not provided
    initial_status: str = Field(
        default="idea",
        pattern="^(idea|todo)$",
        description="Task status: 'idea' for team review, 'todo' for direct action"
    )


def idea_to_response(idea: Idea) -> dict:
    """Convert idea model to response dict with user info."""
    return {
        "id": idea.id,
        "content": idea.content,
        "title": idea.title,
        "tags": idea.tags,
        "status": idea.status,
        "source": idea.source,
        "is_pinned": idea.is_pinned,
        "ai_summary": idea.ai_summary,
        "ai_suggested_tags": idea.ai_suggested_tags,
        "converted_to_project_id": idea.converted_to_project_id,
        "converted_to_task_id": idea.converted_to_task_id,
        "converted_at": idea.converted_at,
        "created_at": idea.created_at,
        "updated_at": idea.updated_at,
        "user_id": idea.user_id,
        "user_name": idea.user.display_name if idea.user else None,
        "user_email": idea.user.email if idea.user else None,
    }


@router.post("/", response_model=IdeaResponse, status_code=status.HTTP_201_CREATED)
async def create_idea(
    idea_data: IdeaCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Create a new idea - fastest path to capture."""
    idea = Idea(
        content=idea_data.content,
        title=idea_data.title,
        tags=idea_data.tags,
        source=idea_data.source,
        user_id=current_user.id,
    )
    db.add(idea)
    await db.commit()
    await db.refresh(idea, ["user"])

    logger.info("Idea created", idea_id=str(idea.id), user_id=str(current_user.id))
    return idea_to_response(idea)


@router.get("/", response_model=IdeaListResponse)
async def list_ideas(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None, pattern="^(captured|reviewed|converted|archived)$"),
    search: str | None = Query(None, max_length=100),
    pinned_only: bool = Query(False),
    tag: str | None = Query(None),
) -> dict:
    """List user's ideas with filtering and pagination."""
    # Base query with user relationship loaded
    query = select(Idea).options(selectinload(Idea.user)).where(Idea.user_id == current_user.id)

    # Apply filters
    if status:
        query = query.where(Idea.status == status)
    if pinned_only:
        query = query.where(Idea.is_pinned == True)
    if tag:
        query = query.where(Idea.tags.contains([tag]))
    if search:
        search_filter = or_(
            Idea.content.ilike(f"%{search}%"),
            Idea.title.ilike(f"%{search}%"),
        )
        query = query.where(search_filter)

    # Get total count (without the options for performance)
    count_base = select(Idea).where(Idea.user_id == current_user.id)
    if status:
        count_base = count_base.where(Idea.status == status)
    if pinned_only:
        count_base = count_base.where(Idea.is_pinned == True)
    if tag:
        count_base = count_base.where(Idea.tags.contains([tag]))
    if search:
        count_base = count_base.where(search_filter)
    count_query = select(func.count()).select_from(count_base.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination and ordering
    query = query.order_by(Idea.is_pinned.desc(), Idea.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    ideas = list(result.scalars().all())

    return {
        "items": [idea_to_response(idea) for idea in ideas],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


@router.get("/{idea_id}", response_model=IdeaResponse)
async def get_idea(
    idea_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get a specific idea."""
    result = await db.execute(
        select(Idea)
        .options(selectinload(Idea.user))
        .where(Idea.id == idea_id, Idea.user_id == current_user.id)
    )
    idea = result.scalar_one_or_none()

    if not idea:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Idea not found",
        )

    return idea_to_response(idea)


@router.patch("/{idea_id}", response_model=IdeaResponse)
async def update_idea(
    idea_id: UUID,
    updates: IdeaUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Update an idea."""
    result = await db.execute(
        select(Idea)
        .options(selectinload(Idea.user))
        .where(Idea.id == idea_id, Idea.user_id == current_user.id)
    )
    idea = result.scalar_one_or_none()

    if not idea:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Idea not found",
        )

    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(idea, field, value)

    await db.commit()
    await db.refresh(idea, ["user"])

    logger.info("Idea updated", idea_id=str(idea_id))
    return idea_to_response(idea)


@router.delete("/{idea_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_idea(
    idea_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete an idea."""
    result = await db.execute(
        select(Idea).where(Idea.id == idea_id, Idea.user_id == current_user.id)
    )
    idea = result.scalar_one_or_none()

    if not idea:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Idea not found",
        )

    await db.delete(idea)
    await db.commit()

    logger.info("Idea deleted", idea_id=str(idea_id))


@router.post("/{idea_id}/pin", response_model=IdeaResponse)
async def toggle_pin_idea(
    idea_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Toggle pin status of an idea."""
    result = await db.execute(
        select(Idea)
        .options(selectinload(Idea.user))
        .where(Idea.id == idea_id, Idea.user_id == current_user.id)
    )
    idea = result.scalar_one_or_none()

    if not idea:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Idea not found",
        )

    idea.is_pinned = not idea.is_pinned
    await db.commit()
    await db.refresh(idea, ["user"])

    return idea_to_response(idea)


@router.post("/{idea_id}/convert-to-project", response_model=IdeaResponse)
async def convert_idea_to_project(
    idea_id: UUID,
    request: ConvertToProjectRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Convert an idea to a new project."""
    from researchhub.models.project import Project

    result = await db.execute(
        select(Idea)
        .options(selectinload(Idea.user))
        .where(Idea.id == idea_id, Idea.user_id == current_user.id)
    )
    idea = result.scalar_one_or_none()

    if not idea:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Idea not found",
        )

    if idea.converted_to_project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idea already converted to a project",
        )

    # Validate user has access to the target team
    team_membership = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == request.team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    if not team_membership.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this team",
        )

    # Create project from idea
    project = Project(
        name=request.project_name,
        description=idea.content,
        team_id=request.team_id,
        project_type=request.project_type,
        created_by_id=current_user.id,
        tags=idea.tags,
    )
    db.add(project)
    await db.flush()

    # Update idea
    idea.converted_to_project_id = project.id
    idea.converted_at = datetime.now(timezone.utc)
    idea.status = "converted"

    await db.commit()
    await db.refresh(idea, ["user"])

    logger.info(
        "Idea converted to project",
        idea_id=str(idea_id),
        project_id=str(project.id),
    )
    return idea_to_response(idea)


@router.post("/{idea_id}/convert-to-task", response_model=IdeaResponse)
async def convert_idea_to_task(
    idea_id: UUID,
    request: ConvertToTaskRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Convert an idea to a task in an existing project."""
    from researchhub.models.project import Task

    result = await db.execute(
        select(Idea)
        .options(selectinload(Idea.user))
        .where(Idea.id == idea_id, Idea.user_id == current_user.id)
    )
    idea = result.scalar_one_or_none()

    if not idea:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Idea not found",
        )

    if idea.converted_to_task_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idea already converted to a task",
        )

    # Validate user has access to the target project via team membership
    from researchhub.models.project import Project

    project_result = await db.execute(
        select(Project).where(Project.id == request.project_id)
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    team_membership = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == project.team_id,
            TeamMember.user_id == current_user.id,
        )
    )
    if not team_membership.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project",
        )

    # Create task from idea
    # Convert plain text content to TipTap JSON format for description
    description_json = None
    if idea.content:
        description_json = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": idea.content}]
                }
            ]
        }

    task = Task(
        title=request.task_title or idea.title or idea.content[:100],
        description=description_json,
        project_id=request.project_id,
        created_by_id=current_user.id,
        tags=idea.tags or [],
        status=request.initial_status,  # "idea" for team review, "todo" for direct action
        source_idea_id=idea.id,  # Link back to originating idea
    )
    db.add(task)
    await db.flush()

    # Update idea
    idea.converted_to_task_id = task.id
    idea.converted_at = datetime.now(timezone.utc)
    idea.status = "converted"

    await db.commit()
    await db.refresh(idea, ["user"])

    logger.info(
        "Idea converted to task",
        idea_id=str(idea_id),
        task_id=str(task.id),
    )
    return idea_to_response(idea)
