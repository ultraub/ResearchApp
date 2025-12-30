"""Journals API endpoints for personal journals and project lab notebooks."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.api.v1.auth import CurrentUser
from researchhub.api.v1.projects import check_project_access
from researchhub.db.session import get_db_session
from researchhub.models.journal import JournalEntry, JournalEntryLink
from researchhub.models.organization import OrganizationMember, TeamMember
from researchhub.models.project import Project, Task, ProjectMember, ProjectTeam
from researchhub.models.collaboration import ProjectShare
from researchhub.models.document import Document
from researchhub.models.knowledge import Paper
from researchhub.tasks import generate_embedding

router = APIRouter()
logger = structlog.get_logger()


# =============================================================================
# Helper Functions
# =============================================================================


async def get_user_organization_id(user_id: UUID, db: AsyncSession) -> UUID:
    """Get the user's primary organization ID."""
    result = await db.execute(
        select(OrganizationMember.organization_id)
        .where(OrganizationMember.user_id == user_id)
        .limit(1)
    )
    org_id = result.scalar_one_or_none()
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of any organization",
        )
    return org_id


async def get_user_accessible_project_ids(user_id: UUID, db: AsyncSession) -> list[UUID]:
    """Get all project IDs the user has access to.

    This includes projects accessible via:
    1. Direct ProjectMember membership
    2. ProjectShare (shared with user)
    3. Team membership (user's teams)
    4. ProjectTeam (multi-team access)
    """
    # Get user's team memberships
    team_result = await db.execute(
        select(TeamMember.team_id).where(TeamMember.user_id == user_id)
    )
    user_team_ids = [row[0] for row in team_result.all()]

    # Get projects via direct membership
    member_result = await db.execute(
        select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
    )
    member_project_ids = [row[0] for row in member_result.all()]

    # Get projects via ProjectShare
    share_result = await db.execute(
        select(ProjectShare.project_id).where(ProjectShare.user_id == user_id)
    )
    shared_project_ids = [row[0] for row in share_result.all()]

    # Get projects via team membership (primary team_id)
    team_project_result = await db.execute(
        select(Project.id).where(Project.team_id.in_(user_team_ids))
    )
    team_project_ids = [row[0] for row in team_project_result.all()]

    # Get projects via project_teams (multi-team access)
    project_teams_result = await db.execute(
        select(ProjectTeam.project_id).where(ProjectTeam.team_id.in_(user_team_ids))
    )
    multi_team_project_ids = [row[0] for row in project_teams_result.all()]

    # Combine all accessible project IDs
    all_project_ids = set(member_project_ids) | set(shared_project_ids) | set(team_project_ids) | set(multi_team_project_ids)

    # Filter out archived projects from the combined set
    if all_project_ids:
        active_result = await db.execute(
            select(Project.id).where(
                Project.id.in_(all_project_ids),
                Project.is_archived == False,
            )
        )
        return [row[0] for row in active_result.all()]
    return []


def count_words(content: dict) -> int:
    """Count words in TipTap content."""

    def extract_text(node: dict) -> str:
        text = ""
        if "text" in node:
            text += node["text"] + " "
        if "content" in node:
            for child in node["content"]:
                text += extract_text(child)
        return text

    text = extract_text(content)
    return len(text.split())


def extract_plain_text(content: dict) -> str:
    """Extract plain text from TipTap content for search indexing."""

    def extract_text(node: dict) -> str:
        text = ""
        if "text" in node:
            text += node["text"] + " "
        if "content" in node:
            for child in node["content"]:
                text += extract_text(child)
        return text

    return extract_text(content).strip()


async def get_linked_entity_title(
    entity_type: str, entity_id: UUID, db: AsyncSession
) -> str | None:
    """Get the title/name of a linked entity for display."""
    if entity_type == "project":
        result = await db.execute(select(Project.name).where(Project.id == entity_id))
        return result.scalar_one_or_none()
    elif entity_type == "task":
        result = await db.execute(select(Task.title).where(Task.id == entity_id))
        return result.scalar_one_or_none()
    elif entity_type == "document":
        result = await db.execute(select(Document.title).where(Document.id == entity_id))
        return result.scalar_one_or_none()
    elif entity_type == "paper":
        result = await db.execute(select(Paper.title).where(Paper.id == entity_id))
        return result.scalar_one_or_none()
    return None


# =============================================================================
# Request/Response Models
# =============================================================================


class JournalEntryCreate(BaseModel):
    """Create a new journal entry."""

    title: str | None = Field(None, max_length=500)
    content: dict = Field(default_factory=dict)
    entry_date: date
    scope: Literal["personal", "project"] = "personal"
    project_id: UUID | None = None  # Required if scope=project
    entry_type: str = Field(default="observation", pattern="^(observation|experiment|meeting|idea|reflection|protocol)$")
    tags: list[str] = Field(default_factory=list)
    mood: str | None = Field(None, max_length=50)


class JournalEntryUpdate(BaseModel):
    """Update a journal entry."""

    title: str | None = Field(None, max_length=500)
    content: dict | None = None
    entry_date: date | None = None
    entry_type: str | None = Field(None, pattern="^(observation|experiment|meeting|idea|reflection|protocol)$")
    tags: list[str] | None = None
    mood: str | None = Field(None, max_length=50)
    is_pinned: bool | None = None
    is_archived: bool | None = None


class JournalEntryLinkCreate(BaseModel):
    """Create a link to another entity."""

    linked_entity_type: Literal["project", "task", "document", "paper"]
    linked_entity_id: UUID
    link_type: str = Field(default="reference", pattern="^(reference|result|follow_up|related)$")
    notes: str | None = Field(None, max_length=1000)


class JournalEntryLinkResponse(BaseModel):
    """Journal entry link response."""

    id: UUID
    journal_entry_id: UUID
    linked_entity_type: str
    linked_entity_id: UUID
    link_type: str
    notes: str | None
    position: int
    created_by_id: UUID | None
    created_at: datetime
    linked_entity_title: str | None = None

    class Config:
        from_attributes = True


class JournalEntryResponse(BaseModel):
    """Journal entry response."""

    id: UUID
    title: str | None
    content: dict
    content_text: str | None
    entry_date: date
    scope: str
    user_id: UUID | None
    project_id: UUID | None
    project_name: str | None = None  # Project name for display
    organization_id: UUID
    created_by_id: UUID | None
    last_edited_by_id: UUID | None
    entry_type: str
    tags: list[str]
    word_count: int
    mood: str | None
    is_archived: bool
    is_pinned: bool
    created_at: datetime
    updated_at: datetime
    links: list[JournalEntryLinkResponse] = []

    class Config:
        from_attributes = True


class JournalEntryListResponse(BaseModel):
    """Paginated journal entry list response."""

    items: list[JournalEntryResponse]
    total: int
    page: int
    page_size: int
    pages: int


class CalendarEntriesResponse(BaseModel):
    """Calendar entries response - count of entries per date."""

    entries_by_date: dict[str, int]  # ISO date string -> count


# =============================================================================
# CRUD Endpoints
# =============================================================================


@router.post("/", response_model=JournalEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_journal_entry(
    entry_data: JournalEntryCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Create a new journal entry."""
    # Get organization ID
    org_id = await get_user_organization_id(current_user.id, db)

    # Validate scope-specific requirements
    project_name = None
    if entry_data.scope == "project":
        if not entry_data.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="project_id is required for project-scoped entries",
            )
        # Verify project access
        await check_project_access(db, entry_data.project_id, current_user.id, "member")
        user_id = None
        # Get project name for response
        result = await db.execute(
            select(Project.name).where(Project.id == entry_data.project_id)
        )
        project_name = result.scalar_one_or_none()
    else:
        # Personal scope
        user_id = current_user.id
        if entry_data.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="project_id should not be provided for personal entries",
            )

    # Create the entry
    entry = JournalEntry(
        title=entry_data.title,
        content=entry_data.content,
        content_text=extract_plain_text(entry_data.content),
        entry_date=entry_data.entry_date,
        scope=entry_data.scope,
        user_id=user_id,
        project_id=entry_data.project_id,
        organization_id=org_id,
        created_by_id=current_user.id,
        last_edited_by_id=current_user.id,
        entry_type=entry_data.entry_type,
        tags=entry_data.tags,
        mood=entry_data.mood,
        word_count=count_words(entry_data.content),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    logger.info(
        "Journal entry created",
        entry_id=str(entry.id),
        scope=entry_data.scope,
        user_id=str(current_user.id),
    )

    # Generate embedding for semantic search
    try:
        generate_embedding.delay(
            entity_type="journal_entry",
            entity_id=str(entry.id),
        )
    except Exception as e:
        logger.warning(
            "Embedding generation trigger failed",
            entry_id=str(entry.id),
            error=str(e),
        )

    # Return response with project_name
    return {
        "id": entry.id,
        "title": entry.title,
        "content": entry.content,
        "content_text": entry.content_text,
        "entry_date": entry.entry_date,
        "scope": entry.scope,
        "user_id": entry.user_id,
        "project_id": entry.project_id,
        "project_name": project_name,
        "organization_id": entry.organization_id,
        "created_by_id": entry.created_by_id,
        "last_edited_by_id": entry.last_edited_by_id,
        "entry_type": entry.entry_type,
        "tags": entry.tags,
        "word_count": entry.word_count,
        "mood": entry.mood,
        "is_archived": entry.is_archived,
        "is_pinned": entry.is_pinned,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "links": [],
    }


@router.get("/", response_model=JournalEntryListResponse)
async def list_journal_entries(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    scope: Literal["personal", "project", "all"] = Query("all"),
    project_id: UUID | None = None,
    entry_type: str | None = Query(None, pattern="^(observation|experiment|meeting|idea|reflection|protocol)$"),
    tags: list[str] | None = Query(None),
    search: str | None = Query(None, max_length=200),
    entry_date_from: date | None = None,
    entry_date_to: date | None = None,
    include_archived: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: Literal["entry_date", "created_at", "updated_at"] = Query("entry_date"),
    sort_order: Literal["asc", "desc"] = Query("desc"),
) -> dict:
    """List journal entries with filtering and pagination."""
    org_id = await get_user_organization_id(current_user.id, db)

    # Base query with organization filter
    query = select(JournalEntry).where(JournalEntry.organization_id == org_id)

    # Apply scope filter
    if scope == "personal":
        query = query.where(
            JournalEntry.scope == "personal",
            JournalEntry.user_id == current_user.id,
        )
    elif scope == "project":
        if project_id:
            # Verify access to specific project
            await check_project_access(db, project_id, current_user.id)
            query = query.where(
                JournalEntry.scope == "project",
                JournalEntry.project_id == project_id,
            )
        else:
            # Get all project entries user has access to
            accessible_project_ids = await get_user_accessible_project_ids(current_user.id, db)
            query = query.where(
                JournalEntry.scope == "project",
                JournalEntry.project_id.in_(accessible_project_ids),
            )
    else:
        # "all" - get personal + project entries user has access to
        accessible_project_ids = await get_user_accessible_project_ids(current_user.id, db)
        query = query.where(
            or_(
                and_(
                    JournalEntry.scope == "personal",
                    JournalEntry.user_id == current_user.id,
                ),
                and_(
                    JournalEntry.scope == "project",
                    JournalEntry.project_id.in_(accessible_project_ids),
                ),
            )
        )

    # Apply additional filters
    if project_id and scope != "personal":
        query = query.where(JournalEntry.project_id == project_id)

    if entry_type:
        query = query.where(JournalEntry.entry_type == entry_type)

    if tags:
        for tag in tags:
            query = query.where(JournalEntry.tags.contains([tag]))

    if not include_archived:
        query = query.where(JournalEntry.is_archived == False)

    if entry_date_from:
        query = query.where(JournalEntry.entry_date >= entry_date_from)

    if entry_date_to:
        query = query.where(JournalEntry.entry_date <= entry_date_to)

    if search:
        search_filter = or_(
            JournalEntry.title.ilike(f"%{search}%"),
            JournalEntry.content_text.ilike(f"%{search}%"),
        )
        query = query.where(search_filter)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply sorting
    sort_column = getattr(JournalEntry, sort_by)
    if sort_order == "desc":
        query = query.order_by(JournalEntry.is_pinned.desc(), sort_column.desc())
    else:
        query = query.order_by(JournalEntry.is_pinned.desc(), sort_column.asc())

    # Apply pagination
    query = query.offset((page - 1) * page_size).limit(page_size)

    # Load links and project eagerly
    query = query.options(
        selectinload(JournalEntry.links),
        selectinload(JournalEntry.project),
    )

    result = await db.execute(query)
    entries = list(result.scalars().all())

    # Build response items with enrichments
    response_items = []
    for entry in entries:
        # Enrich links with entity titles
        for link in entry.links:
            link.linked_entity_title = await get_linked_entity_title(
                link.linked_entity_type, link.linked_entity_id, db
            )

        # Convert to response with project_name
        entry_dict = {
            "id": entry.id,
            "title": entry.title,
            "content": entry.content,
            "content_text": entry.content_text,
            "entry_date": entry.entry_date,
            "scope": entry.scope,
            "user_id": entry.user_id,
            "project_id": entry.project_id,
            "project_name": entry.project.name if entry.project else None,
            "organization_id": entry.organization_id,
            "created_by_id": entry.created_by_id,
            "last_edited_by_id": entry.last_edited_by_id,
            "entry_type": entry.entry_type,
            "tags": entry.tags,
            "word_count": entry.word_count,
            "mood": entry.mood,
            "is_archived": entry.is_archived,
            "is_pinned": entry.is_pinned,
            "created_at": entry.created_at,
            "updated_at": entry.updated_at,
            "links": entry.links,
        }
        response_items.append(entry_dict)

    return {
        "items": response_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if total > 0 else 0,
    }


@router.get("/tags", response_model=list[str])
async def get_journal_tags(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    scope: Literal["personal", "project", "all"] = Query("all"),
    project_id: UUID | None = None,
) -> list[str]:
    """Get all unique tags used in journal entries."""
    org_id = await get_user_organization_id(current_user.id, db)

    # Build base query
    query = select(func.unnest(JournalEntry.tags).label("tag")).where(
        JournalEntry.organization_id == org_id,
        JournalEntry.is_archived == False,
    )

    # Apply scope filter
    if scope == "personal":
        query = query.where(
            JournalEntry.scope == "personal",
            JournalEntry.user_id == current_user.id,
        )
    elif scope == "project":
        if project_id:
            # Verify access to specific project
            await check_project_access(db, project_id, current_user.id)
            query = query.where(
                JournalEntry.scope == "project",
                JournalEntry.project_id == project_id,
            )
        else:
            # Get tags from all accessible project entries
            accessible_project_ids = await get_user_accessible_project_ids(current_user.id, db)
            query = query.where(
                JournalEntry.scope == "project",
                JournalEntry.project_id.in_(accessible_project_ids),
            )
    else:
        # "all" - include personal and accessible project entries
        accessible_project_ids = await get_user_accessible_project_ids(current_user.id, db)
        query = query.where(
            or_(
                and_(
                    JournalEntry.scope == "personal",
                    JournalEntry.user_id == current_user.id,
                ),
                and_(
                    JournalEntry.scope == "project",
                    JournalEntry.project_id.in_(accessible_project_ids),
                ),
            )
        )

    # Get distinct tags
    query = query.distinct()
    result = await db.execute(query)
    tags = [row[0] for row in result.fetchall()]

    return sorted(tags)


@router.get("/calendar", response_model=CalendarEntriesResponse)
async def get_calendar_entries(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    scope: Literal["personal", "project", "all"] = Query("all"),
    project_id: UUID | None = None,
) -> dict:
    """Get entry counts by date for calendar view."""
    org_id = await get_user_organization_id(current_user.id, db)

    # Calculate date range for the month
    from calendar import monthrange
    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])

    # Build query
    query = (
        select(
            JournalEntry.entry_date,
            func.count(JournalEntry.id).label("count"),
        )
        .where(
            JournalEntry.organization_id == org_id,
            JournalEntry.entry_date >= first_day,
            JournalEntry.entry_date <= last_day,
            JournalEntry.is_archived == False,
        )
        .group_by(JournalEntry.entry_date)
    )

    # Apply scope filter
    if scope == "personal":
        query = query.where(
            JournalEntry.scope == "personal",
            JournalEntry.user_id == current_user.id,
        )
    elif scope == "project":
        if project_id:
            # Verify access to specific project
            await check_project_access(db, project_id, current_user.id)
            query = query.where(
                JournalEntry.scope == "project",
                JournalEntry.project_id == project_id,
            )
        else:
            # Get calendar data from all accessible project entries
            accessible_project_ids = await get_user_accessible_project_ids(current_user.id, db)
            query = query.where(
                JournalEntry.scope == "project",
                JournalEntry.project_id.in_(accessible_project_ids),
            )
    else:
        # "all" - include personal and accessible project entries
        accessible_project_ids = await get_user_accessible_project_ids(current_user.id, db)
        query = query.where(
            or_(
                and_(
                    JournalEntry.scope == "personal",
                    JournalEntry.user_id == current_user.id,
                ),
                and_(
                    JournalEntry.scope == "project",
                    JournalEntry.project_id.in_(accessible_project_ids),
                ),
            )
        )

    result = await db.execute(query)
    entries_by_date = {row.entry_date.isoformat(): row.count for row in result.fetchall()}

    return {"entries_by_date": entries_by_date}


@router.get("/{entry_id}", response_model=JournalEntryResponse)
async def get_journal_entry(
    entry_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get a specific journal entry."""
    result = await db.execute(
        select(JournalEntry)
        .where(JournalEntry.id == entry_id)
        .options(
            selectinload(JournalEntry.links),
            selectinload(JournalEntry.project),
        )
    )
    entry = result.scalar_one_or_none()

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found",
        )

    # Check access
    if entry.scope == "personal":
        if entry.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this entry",
            )
    else:
        # Project scope - verify project access
        await check_project_access(db, entry.project_id, current_user.id)

    # Enrich links with entity titles
    for link in entry.links:
        link.linked_entity_title = await get_linked_entity_title(
            link.linked_entity_type, link.linked_entity_id, db
        )

    # Return response with project_name
    return {
        "id": entry.id,
        "title": entry.title,
        "content": entry.content,
        "content_text": entry.content_text,
        "entry_date": entry.entry_date,
        "scope": entry.scope,
        "user_id": entry.user_id,
        "project_id": entry.project_id,
        "project_name": entry.project.name if entry.project else None,
        "organization_id": entry.organization_id,
        "created_by_id": entry.created_by_id,
        "last_edited_by_id": entry.last_edited_by_id,
        "entry_type": entry.entry_type,
        "tags": entry.tags,
        "word_count": entry.word_count,
        "mood": entry.mood,
        "is_archived": entry.is_archived,
        "is_pinned": entry.is_pinned,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "links": entry.links,
    }


@router.patch("/{entry_id}", response_model=JournalEntryResponse)
async def update_journal_entry(
    entry_id: UUID,
    updates: JournalEntryUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Update a journal entry."""
    result = await db.execute(
        select(JournalEntry)
        .where(JournalEntry.id == entry_id)
        .options(
            selectinload(JournalEntry.links),
            selectinload(JournalEntry.project),
        )
    )
    entry = result.scalar_one_or_none()

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found",
        )

    # Check access
    if entry.scope == "personal":
        if entry.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this entry",
            )
    else:
        await check_project_access(db, entry.project_id, current_user.id, "member")

    # Apply updates
    update_data = updates.model_dump(exclude_unset=True)

    if "content" in update_data:
        update_data["content_text"] = extract_plain_text(update_data["content"])
        update_data["word_count"] = count_words(update_data["content"])

    for field, value in update_data.items():
        setattr(entry, field, value)

    entry.last_edited_by_id = current_user.id

    await db.commit()
    await db.refresh(entry)

    # Re-load the project relationship after refresh
    if entry.project_id:
        result = await db.execute(
            select(Project.name).where(Project.id == entry.project_id)
        )
        project_name = result.scalar_one_or_none()
    else:
        project_name = None

    # Enrich links with entity titles
    for link in entry.links:
        link.linked_entity_title = await get_linked_entity_title(
            link.linked_entity_type, link.linked_entity_id, db
        )

    logger.info("Journal entry updated", entry_id=str(entry_id))

    # Regenerate embedding if content-related fields changed
    if "title" in update_data or "content" in update_data or "tags" in update_data:
        try:
            generate_embedding.delay(
                entity_type="journal_entry",
                entity_id=str(entry_id),
            )
        except Exception as e:
            logger.warning(
                "Embedding generation trigger failed",
                entry_id=str(entry_id),
                error=str(e),
            )

    # Return response with project_name
    return {
        "id": entry.id,
        "title": entry.title,
        "content": entry.content,
        "content_text": entry.content_text,
        "entry_date": entry.entry_date,
        "scope": entry.scope,
        "user_id": entry.user_id,
        "project_id": entry.project_id,
        "project_name": project_name,
        "organization_id": entry.organization_id,
        "created_by_id": entry.created_by_id,
        "last_edited_by_id": entry.last_edited_by_id,
        "entry_type": entry.entry_type,
        "tags": entry.tags,
        "word_count": entry.word_count,
        "mood": entry.mood,
        "is_archived": entry.is_archived,
        "is_pinned": entry.is_pinned,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "links": entry.links,
    }


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_journal_entry(
    entry_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete (archive) a journal entry."""
    result = await db.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found",
        )

    # Check access
    if entry.scope == "personal":
        if entry.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this entry",
            )
    else:
        await check_project_access(db, entry.project_id, current_user.id, "member")

    # Soft delete
    entry.is_archived = True
    await db.commit()

    logger.info("Journal entry archived", entry_id=str(entry_id))


# =============================================================================
# Link Endpoints
# =============================================================================


@router.post(
    "/{entry_id}/links",
    response_model=JournalEntryLinkResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_journal_entry_link(
    entry_id: UUID,
    link_data: JournalEntryLinkCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> JournalEntryLink:
    """Add a link to a journal entry."""
    # Get the entry
    result = await db.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found",
        )

    # Check access
    if entry.scope == "personal":
        if entry.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this entry",
            )
    else:
        await check_project_access(db, entry.project_id, current_user.id, "member")

    # Verify the linked entity exists
    entity_title = await get_linked_entity_title(
        link_data.linked_entity_type, link_data.linked_entity_id, db
    )
    if entity_title is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{link_data.linked_entity_type} not found",
        )

    # Check for duplicate link
    existing = await db.execute(
        select(JournalEntryLink).where(
            JournalEntryLink.journal_entry_id == entry_id,
            JournalEntryLink.linked_entity_type == link_data.linked_entity_type,
            JournalEntryLink.linked_entity_id == link_data.linked_entity_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This link already exists",
        )

    # Get next position
    position_result = await db.execute(
        select(func.max(JournalEntryLink.position)).where(
            JournalEntryLink.journal_entry_id == entry_id
        )
    )
    max_position = position_result.scalar() or 0

    # Create the link
    link = JournalEntryLink(
        journal_entry_id=entry_id,
        linked_entity_type=link_data.linked_entity_type,
        linked_entity_id=link_data.linked_entity_id,
        link_type=link_data.link_type,
        notes=link_data.notes,
        position=max_position + 1,
        created_by_id=current_user.id,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)

    # Add entity title
    link.linked_entity_title = entity_title

    logger.info(
        "Journal entry link created",
        entry_id=str(entry_id),
        link_id=str(link.id),
        linked_type=link_data.linked_entity_type,
    )
    return link


@router.get("/{entry_id}/links", response_model=list[JournalEntryLinkResponse])
async def list_journal_entry_links(
    entry_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[JournalEntryLink]:
    """List all links for a journal entry."""
    # Get the entry
    result = await db.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found",
        )

    # Check access
    if entry.scope == "personal":
        if entry.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this entry",
            )
    else:
        await check_project_access(db, entry.project_id, current_user.id)

    # Get links
    links_result = await db.execute(
        select(JournalEntryLink)
        .where(JournalEntryLink.journal_entry_id == entry_id)
        .order_by(JournalEntryLink.position)
    )
    links = list(links_result.scalars().all())

    # Enrich with entity titles
    for link in links:
        link.linked_entity_title = await get_linked_entity_title(
            link.linked_entity_type, link.linked_entity_id, db
        )

    return links


@router.delete("/{entry_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_journal_entry_link(
    entry_id: UUID,
    link_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove a link from a journal entry."""
    # Get the entry
    result = await db.execute(
        select(JournalEntry).where(JournalEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found",
        )

    # Check access
    if entry.scope == "personal":
        if entry.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this entry",
            )
    else:
        await check_project_access(db, entry.project_id, current_user.id, "member")

    # Get and delete the link
    link_result = await db.execute(
        select(JournalEntryLink).where(
            JournalEntryLink.id == link_id,
            JournalEntryLink.journal_entry_id == entry_id,
        )
    )
    link = link_result.scalar_one_or_none()

    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found",
        )

    await db.delete(link)
    await db.commit()

    logger.info(
        "Journal entry link removed",
        entry_id=str(entry_id),
        link_id=str(link_id),
    )
