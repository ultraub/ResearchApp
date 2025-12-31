"""Blockers API endpoints."""

import json
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.api.v1.auth import CurrentUser
from researchhub.api.v1.projects import check_project_access
from researchhub.db.session import get_db_session
from researchhub.models.project import Project, Task, Blocker, BlockerLink, TaskAssignment
from researchhub.models.user import User
from researchhub.services.notification import NotificationService
from researchhub.utils.tiptap import extract_plain_text

router = APIRouter()
logger = structlog.get_logger()


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


# Request/Response Models
class BlockerCreate(BaseModel):
    """Create a new blocker."""

    title: str = Field(..., min_length=1, max_length=500)
    description: str | dict | None = None
    project_id: UUID
    status: str = Field(default="open", pattern="^(open|in_progress|resolved|wont_fix)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")
    blocker_type: str = Field(default="general", pattern="^(general|external_dependency|resource|technical|approval)$")
    impact_level: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    assignee_id: UUID | None = None
    due_date: date | None = None
    tags: list[str] = Field(default_factory=list)

    @field_validator("description", mode="before")
    @classmethod
    def parse_description_field(cls, v: Any) -> dict | None:
        return parse_description(v)


class BlockerUpdate(BaseModel):
    """Update a blocker."""

    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | dict | None = None
    status: str | None = Field(None, pattern="^(open|in_progress|resolved|wont_fix)$")
    priority: str | None = Field(None, pattern="^(low|medium|high|urgent)$")
    blocker_type: str | None = Field(None, pattern="^(general|external_dependency|resource|technical|approval)$")
    resolution_type: str | None = Field(None, pattern="^(resolved|wont_fix|deferred|duplicate)$")
    impact_level: str | None = Field(None, pattern="^(low|medium|high|critical)$")
    assignee_id: UUID | None = None
    due_date: date | None = None
    tags: list[str] | None = None

    @field_validator("description", mode="before")
    @classmethod
    def parse_description_field(cls, v: Any) -> dict | None:
        return parse_description(v)


class BlockerLinkCreate(BaseModel):
    """Link a blocker to a task or project."""

    blocked_entity_type: str = Field(..., pattern="^(task|project)$")
    blocked_entity_id: UUID
    notes: str | None = None


class BlockerLinkResponse(BaseModel):
    """Blocker link response."""

    id: UUID
    blocker_id: UUID
    blocked_entity_type: str
    blocked_entity_id: UUID
    notes: str | None
    created_by_id: UUID | None
    created_at: datetime
    updated_at: datetime
    # Entity info when loaded
    blocked_entity_title: str | None = None

    class Config:
        from_attributes = True


class BlockerResponse(BaseModel):
    """Blocker response model."""

    id: UUID
    title: str
    description: dict | None
    status: str
    priority: str
    blocker_type: str
    resolution_type: str | None
    impact_level: str
    project_id: UUID
    assignee_id: UUID | None
    created_by_id: UUID | None
    due_date: date | None
    resolved_at: datetime | None
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    blocked_items_count: int = 0
    # Optional populated fields
    assignee_name: str | None = None
    assignee_email: str | None = None

    class Config:
        from_attributes = True


class BlockerListResponse(BaseModel):
    """Paginated blocker list response."""

    items: list[BlockerResponse]
    total: int
    page: int
    page_size: int
    pages: int


@router.post("/", response_model=BlockerResponse, status_code=status.HTTP_201_CREATED)
async def create_blocker(
    blocker_data: BlockerCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Blocker:
    """Create a new blocker."""
    # Verify project access
    await check_project_access(db, blocker_data.project_id, current_user.id, "member")

    blocker = Blocker(
        title=blocker_data.title,
        description=blocker_data.description,
        description_text=extract_plain_text(blocker_data.description),
        project_id=blocker_data.project_id,
        status=blocker_data.status,
        priority=blocker_data.priority,
        blocker_type=blocker_data.blocker_type,
        impact_level=blocker_data.impact_level,
        assignee_id=blocker_data.assignee_id,
        due_date=blocker_data.due_date,
        tags=blocker_data.tags,
        created_by_id=current_user.id,
    )

    db.add(blocker)
    await db.commit()
    await db.refresh(blocker)

    logger.info("blocker_created", blocker_id=str(blocker.id), project_id=str(blocker.project_id))

    # Notify blocker assignee if set
    project_result = await db.execute(
        select(Project).options(selectinload(Project.team)).where(Project.id == blocker_data.project_id)
    )
    project = project_result.scalar_one_or_none()

    if project and project.team and project.team.organization_id and blocker_data.assignee_id:
        notification_service = NotificationService(db)
        await notification_service.notify(
            user_id=blocker_data.assignee_id,
            notification_type="blocker_created",
            title=f"Blocker assigned: {blocker_data.title}",
            message=f"You have been assigned to resolve the blocker '{blocker_data.title}'",
            organization_id=project.team.organization_id,
            target_type="blocker",
            target_id=blocker.id,
            target_url=f"/projects/{blocker_data.project_id}/blockers/{blocker.id}",
            sender_id=current_user.id,
        )

    return blocker


@router.get("/", response_model=BlockerListResponse)
async def list_blockers(
    project_id: UUID = Query(..., description="Project ID is required for access control"),
    status: str | None = Query(None),
    priority: str | None = Query(None),
    blocker_type: str | None = Query(None),
    assignee_id: UUID | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """List blockers with filtering and pagination."""
    # Verify project access - project_id is now required
    await check_project_access(db, project_id, current_user.id, "viewer")

    query = select(Blocker).options(selectinload(Blocker.blocked_items))

    # Apply project filter
    query = query.where(Blocker.project_id == project_id)

    if status:
        query = query.where(Blocker.status == status)

    if priority:
        query = query.where(Blocker.priority == priority)

    if blocker_type:
        query = query.where(Blocker.blocker_type == blocker_type)

    if assignee_id:
        query = query.where(Blocker.assignee_id == assignee_id)

    if search:
        search_pattern = f"%{search}%"
        query = query.where(Blocker.title.ilike(search_pattern))

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination
    query = query.order_by(Blocker.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    blockers = result.scalars().all()

    # Convert to response with blocked_items_count
    items = []
    for blocker in blockers:
        blocker_dict = {
            "id": blocker.id,
            "title": blocker.title,
            "description": blocker.description,
            "status": blocker.status,
            "priority": blocker.priority,
            "blocker_type": blocker.blocker_type,
            "resolution_type": blocker.resolution_type,
            "impact_level": blocker.impact_level,
            "project_id": blocker.project_id,
            "assignee_id": blocker.assignee_id,
            "created_by_id": blocker.created_by_id,
            "due_date": blocker.due_date,
            "resolved_at": blocker.resolved_at,
            "tags": blocker.tags,
            "created_at": blocker.created_at,
            "updated_at": blocker.updated_at,
            "blocked_items_count": len(blocker.blocked_items) if blocker.blocked_items else 0,
        }
        items.append(blocker_dict)

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


@router.get("/{blocker_id}", response_model=BlockerResponse)
async def get_blocker(
    blocker_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get a blocker by ID."""
    result = await db.execute(
        select(Blocker)
        .options(selectinload(Blocker.blocked_items), selectinload(Blocker.assignee))
        .where(Blocker.id == blocker_id)
    )
    blocker = result.scalar_one_or_none()

    if not blocker:
        raise HTTPException(status_code=404, detail="Blocker not found")

    # Verify project access
    await check_project_access(db, blocker.project_id, current_user.id, "viewer")

    return {
        "id": blocker.id,
        "title": blocker.title,
        "description": blocker.description,
        "status": blocker.status,
        "priority": blocker.priority,
        "blocker_type": blocker.blocker_type,
        "resolution_type": blocker.resolution_type,
        "impact_level": blocker.impact_level,
        "project_id": blocker.project_id,
        "assignee_id": blocker.assignee_id,
        "created_by_id": blocker.created_by_id,
        "due_date": blocker.due_date,
        "resolved_at": blocker.resolved_at,
        "tags": blocker.tags,
        "created_at": blocker.created_at,
        "updated_at": blocker.updated_at,
        "blocked_items_count": len(blocker.blocked_items) if blocker.blocked_items else 0,
        "assignee_name": blocker.assignee.name if blocker.assignee else None,
        "assignee_email": blocker.assignee.email if blocker.assignee else None,
    }


@router.patch("/{blocker_id}", response_model=BlockerResponse)
async def update_blocker(
    blocker_id: UUID,
    blocker_data: BlockerUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Update a blocker."""
    result = await db.execute(
        select(Blocker)
        .options(selectinload(Blocker.blocked_items))
        .where(Blocker.id == blocker_id)
    )
    blocker = result.scalar_one_or_none()

    if not blocker:
        raise HTTPException(status_code=404, detail="Blocker not found")

    # Verify project access
    await check_project_access(db, blocker.project_id, current_user.id, "member")

    # Update fields
    update_data = blocker_data.model_dump(exclude_unset=True)

    # Track if being resolved for notification
    old_status = blocker.status
    is_resolving = False

    # Handle status change to resolved
    if "status" in update_data:
        if update_data["status"] in ("resolved", "wont_fix") and blocker.resolved_at is None:
            blocker.resolved_at = datetime.now(timezone.utc)
            is_resolving = old_status not in ("resolved", "wont_fix")
        elif update_data["status"] in ("open", "in_progress"):
            blocker.resolved_at = None

    # If description is being updated, also update description_text for search
    if "description" in update_data:
        update_data["description_text"] = extract_plain_text(update_data["description"])

    for field, value in update_data.items():
        setattr(blocker, field, value)

    await db.commit()
    await db.refresh(blocker)

    logger.info("blocker_updated", blocker_id=str(blocker.id))

    # Notify blocked task assignees when blocker is resolved
    if is_resolving:
        project_result = await db.execute(
            select(Project).options(selectinload(Project.team)).where(Project.id == blocker.project_id)
        )
        project = project_result.scalar_one_or_none()

        if project and project.team and project.team.organization_id and blocker.blocked_items:
            # Get all task IDs from blocked items
            blocked_task_ids = [
                item.blocked_task_id for item in blocker.blocked_items if item.blocked_task_id
            ]

            if blocked_task_ids:
                # Get all assignees of blocked tasks
                assignees_result = await db.execute(
                    select(TaskAssignment.user_id)
                    .where(TaskAssignment.task_id.in_(blocked_task_ids))
                    .distinct()
                )
                assignee_ids = [row[0] for row in assignees_result.all()]

                if assignee_ids:
                    notification_service = NotificationService(db)
                    await notification_service.notify_many(
                        user_ids=assignee_ids,
                        notification_type="blocker_resolved",
                        title=f"Blocker resolved: {blocker.title}",
                        message=f"The blocker '{blocker.title}' has been resolved",
                        organization_id=project.team.organization_id,
                        target_type="blocker",
                        target_id=blocker.id,
                        target_url=f"/projects/{blocker.project_id}/blockers/{blocker.id}",
                        sender_id=current_user.id,
                    )

    return {
        "id": blocker.id,
        "title": blocker.title,
        "description": blocker.description,
        "status": blocker.status,
        "priority": blocker.priority,
        "blocker_type": blocker.blocker_type,
        "resolution_type": blocker.resolution_type,
        "impact_level": blocker.impact_level,
        "project_id": blocker.project_id,
        "assignee_id": blocker.assignee_id,
        "created_by_id": blocker.created_by_id,
        "due_date": blocker.due_date,
        "resolved_at": blocker.resolved_at,
        "tags": blocker.tags,
        "created_at": blocker.created_at,
        "updated_at": blocker.updated_at,
        "blocked_items_count": len(blocker.blocked_items) if blocker.blocked_items else 0,
    }


@router.delete("/{blocker_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_blocker(
    blocker_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a blocker."""
    result = await db.execute(select(Blocker).where(Blocker.id == blocker_id))
    blocker = result.scalar_one_or_none()

    if not blocker:
        raise HTTPException(status_code=404, detail="Blocker not found")

    # Verify project access
    await check_project_access(db, blocker.project_id, current_user.id, "member")

    await db.delete(blocker)
    await db.commit()

    logger.info("blocker_deleted", blocker_id=str(blocker_id))


# --- Blocker Links endpoints ---

@router.post("/{blocker_id}/links", response_model=BlockerLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_blocker_link(
    blocker_id: UUID,
    link_data: BlockerLinkCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> BlockerLink:
    """Link a blocker to a task or project."""
    # Verify blocker exists
    result = await db.execute(select(Blocker).where(Blocker.id == blocker_id))
    blocker = result.scalar_one_or_none()

    if not blocker:
        raise HTTPException(status_code=404, detail="Blocker not found")

    # Verify project access
    await check_project_access(db, blocker.project_id, current_user.id, "member")

    # Verify the target entity exists
    if link_data.blocked_entity_type == "task":
        task_result = await db.execute(select(Task).where(Task.id == link_data.blocked_entity_id))
        if not task_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Task not found")
    elif link_data.blocked_entity_type == "project":
        project_result = await db.execute(select(Project).where(Project.id == link_data.blocked_entity_id))
        if not project_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Project not found")

    # Check for duplicate link
    existing = await db.execute(
        select(BlockerLink).where(
            BlockerLink.blocker_id == blocker_id,
            BlockerLink.blocked_entity_type == link_data.blocked_entity_type,
            BlockerLink.blocked_entity_id == link_data.blocked_entity_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Link already exists")

    link = BlockerLink(
        blocker_id=blocker_id,
        blocked_entity_type=link_data.blocked_entity_type,
        blocked_entity_id=link_data.blocked_entity_id,
        notes=link_data.notes,
        created_by_id=current_user.id,
    )

    db.add(link)
    await db.commit()
    await db.refresh(link)

    logger.info(
        "blocker_link_created",
        blocker_id=str(blocker_id),
        entity_type=link_data.blocked_entity_type,
        entity_id=str(link_data.blocked_entity_id),
    )

    return link


@router.get("/{blocker_id}/links", response_model=list[BlockerLinkResponse])
async def list_blocker_links(
    blocker_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    """Get all links for a blocker."""
    # Verify blocker exists
    result = await db.execute(select(Blocker).where(Blocker.id == blocker_id))
    blocker = result.scalar_one_or_none()

    if not blocker:
        raise HTTPException(status_code=404, detail="Blocker not found")

    # Verify project access
    await check_project_access(db, blocker.project_id, current_user.id, "viewer")

    # Get links
    links_result = await db.execute(
        select(BlockerLink).where(BlockerLink.blocker_id == blocker_id)
    )
    links = links_result.scalars().all()

    # Enrich with entity titles
    result_links = []
    for link in links:
        title = None
        if link.blocked_entity_type == "task":
            task_result = await db.execute(select(Task.title).where(Task.id == link.blocked_entity_id))
            title = task_result.scalar_one_or_none()
        elif link.blocked_entity_type == "project":
            project_result = await db.execute(select(Project.name).where(Project.id == link.blocked_entity_id))
            title = project_result.scalar_one_or_none()

        result_links.append({
            "id": link.id,
            "blocker_id": link.blocker_id,
            "blocked_entity_type": link.blocked_entity_type,
            "blocked_entity_id": link.blocked_entity_id,
            "notes": link.notes,
            "created_by_id": link.created_by_id,
            "created_at": link.created_at,
            "updated_at": link.updated_at,
            "blocked_entity_title": title,
        })

    return result_links


@router.delete("/{blocker_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_blocker_link(
    blocker_id: UUID,
    link_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove a blocker link."""
    # Verify blocker exists
    result = await db.execute(select(Blocker).where(Blocker.id == blocker_id))
    blocker = result.scalar_one_or_none()

    if not blocker:
        raise HTTPException(status_code=404, detail="Blocker not found")

    # Verify project access
    await check_project_access(db, blocker.project_id, current_user.id, "member")

    # Find and delete the link
    link_result = await db.execute(
        select(BlockerLink).where(
            BlockerLink.id == link_id,
            BlockerLink.blocker_id == blocker_id,
        )
    )
    link = link_result.scalar_one_or_none()

    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    await db.delete(link)
    await db.commit()

    logger.info("blocker_link_deleted", blocker_id=str(blocker_id), link_id=str(link_id))
