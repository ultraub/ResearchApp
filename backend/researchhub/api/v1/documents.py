"""Documents API endpoints with versioning and collaboration."""

import re
from datetime import datetime, timezone
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.api.v1.auth import CurrentUser
from researchhub.api.v1.projects import check_project_access
from researchhub.db.session import get_db_session
from researchhub.models.document import Document, DocumentVersion, DocumentComment, DocumentCommentMention, DocumentTemplate
from researchhub.models.user import User
from researchhub.tasks import auto_review_document_task

router = APIRouter()
logger = structlog.get_logger()


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
class DocumentCreate(BaseModel):
    """Create a new document."""

    title: str = Field(..., min_length=1, max_length=500)
    project_id: UUID
    document_type: str = Field(default="general")
    content: dict = Field(default_factory=dict)
    template_id: UUID | None = None
    tags: list[str] = Field(default_factory=list)


class DocumentUpdate(BaseModel):
    """Update a document."""

    title: str | None = Field(None, min_length=1, max_length=500)
    content: dict | None = None
    document_type: str | None = None
    status: str | None = Field(None, pattern="^(draft|in_review|approved|published)$")
    tags: list[str] | None = None
    settings: dict | None = None
    create_version: bool = False  # If true, create a version snapshot
    change_summary: str | None = None  # Summary for the version


class DocumentResponse(BaseModel):
    """Document response model."""

    id: UUID
    title: str
    content: dict
    content_text: str | None
    document_type: str
    status: str
    version: int
    project_id: UUID
    created_by_id: UUID | None
    # Creator info
    created_by_name: str | None = None
    created_by_email: str | None = None
    last_edited_by_id: UUID | None
    # Last editor info
    last_edited_by_name: str | None = None
    last_edited_by_email: str | None = None
    template_id: UUID | None
    allow_comments: bool
    allow_suggestions: bool
    word_count: int
    tags: list[str]
    is_archived: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    """Paginated document list response."""

    items: list[DocumentResponse]
    total: int
    page: int
    page_size: int
    pages: int


class DocumentVersionResponse(BaseModel):
    """Document version response."""

    id: UUID
    document_id: UUID
    version: int
    content: dict
    change_summary: str | None
    created_by_id: UUID | None
    word_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentCommentCreate(BaseModel):
    """Create a document comment."""

    content: str = Field(..., min_length=1, max_length=10000)
    selection_start: int | None = None
    selection_end: int | None = None
    selected_text: str | None = None
    parent_id: UUID | None = None


class MentionInfo(BaseModel):
    """Info about a user mentioned in a comment."""

    user_id: UUID
    user_name: str | None = None
    user_email: str | None = None


class DocumentCommentResponse(BaseModel):
    """Document comment response."""

    id: UUID
    document_id: UUID
    created_by_id: UUID | None
    content: str
    selection_start: int | None
    selection_end: int | None
    selected_text: str | None
    is_resolved: bool
    resolved_by_id: UUID | None
    resolved_at: datetime | None
    parent_id: UUID | None
    created_at: datetime
    updated_at: datetime
    # User info
    user_name: str | None = None
    user_email: str | None = None
    # Mentions
    mentions: list[MentionInfo] = []

    class Config:
        from_attributes = True


class DocumentTemplateResponse(BaseModel):
    """Document template response."""

    id: UUID
    name: str
    description: str | None
    template_type: str
    is_system: bool
    usage_count: int

    class Config:
        from_attributes = True


def document_to_response(document: Document) -> dict:
    """Convert document model to response dict with user info."""
    return {
        "id": document.id,
        "title": document.title,
        "content": document.content,
        "content_text": document.content_text,
        "document_type": document.document_type,
        "status": document.status,
        "version": document.version,
        "project_id": document.project_id,
        "created_by_id": document.created_by_id,
        "created_by_name": document.created_by.display_name if document.created_by else None,
        "created_by_email": document.created_by.email if document.created_by else None,
        "last_edited_by_id": document.last_edited_by_id,
        "last_edited_by_name": document.last_edited_by.display_name if document.last_edited_by else None,
        "last_edited_by_email": document.last_edited_by.email if document.last_edited_by else None,
        "template_id": document.template_id,
        "allow_comments": document.allow_comments,
        "allow_suggestions": document.allow_suggestions,
        "word_count": document.word_count,
        "tags": document.tags,
        "is_archived": document.is_archived,
        "created_at": document.created_at,
        "updated_at": document.updated_at,
    }


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


@router.post("/", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    doc_data: DocumentCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Document:
    """Create a new document."""
    # Verify project access and get project for organization_id
    project = await check_project_access(db, doc_data.project_id, current_user.id, "member")

    # Get template content if specified
    content = doc_data.content
    if doc_data.template_id:
        template_result = await db.execute(
            select(DocumentTemplate).where(DocumentTemplate.id == doc_data.template_id)
        )
        template = template_result.scalar_one_or_none()
        if template:
            content = template.content
            template.usage_count += 1

    document = Document(
        title=doc_data.title,
        project_id=doc_data.project_id,
        document_type=doc_data.document_type,
        content=content,
        content_text=extract_plain_text(content),
        word_count=count_words(content),
        template_id=doc_data.template_id,
        tags=doc_data.tags,
        created_by_id=current_user.id,
        last_edited_by_id=current_user.id,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document, ["created_by", "last_edited_by"])

    logger.info(
        "Document created",
        document_id=str(document.id),
        project_id=str(doc_data.project_id),
    )

    # Trigger auto-review in background if enabled for document creation
    try:
        auto_review_document_task.delay(
            document_id=str(document.id),
            user_id=str(current_user.id),
            organization_id=str(project.organization_id),
            trigger_source="document_create",
        )
    except Exception as e:
        # Don't fail document creation if auto-review trigger fails
        logger.warning(
            "Auto-review trigger failed",
            document_id=str(document.id),
            error=str(e),
        )

    return document_to_response(document)


@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    project_id: UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    doc_status: str | None = Query(None, pattern="^(draft|in_review|approved|published)$", alias="status"),
    document_type: str | None = None,
    search: str | None = Query(None, max_length=100),
    include_archived: bool = Query(False),
) -> dict:
    """List documents with filtering."""
    if not project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="project_id is required",
        )

    # Verify project access
    await check_project_access(db, project_id, current_user.id)

    # Base query
    query = select(Document).where(Document.project_id == project_id)

    # Apply filters
    if doc_status:
        query = query.where(Document.status == doc_status)
    if document_type:
        query = query.where(Document.document_type == document_type)
    if not include_archived:
        query = query.where(Document.is_archived == False)
    if search:
        query = query.where(
            or_(
                Document.title.ilike(f"%{search}%"),
                Document.content_text.ilike(f"%{search}%"),
            )
        )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination and ordering
    query = query.order_by(Document.updated_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    # Load user relationships
    query = query.options(
        selectinload(Document.created_by),
        selectinload(Document.last_edited_by),
    )

    result = await db.execute(query)
    documents = list(result.scalars().all())

    return {
        "items": [document_to_response(doc) for doc in documents],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


@router.get("/templates", response_model=list[DocumentTemplateResponse])
async def list_document_templates(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    template_type: str | None = None,
) -> list[DocumentTemplate]:
    """List available document templates."""
    query = select(DocumentTemplate).where(
        or_(
            DocumentTemplate.is_system == True,
            DocumentTemplate.created_by_id == current_user.id,
        ),
        DocumentTemplate.is_active == True,
    )

    if template_type:
        query = query.where(DocumentTemplate.template_type == template_type)

    query = query.order_by(
        DocumentTemplate.is_system.desc(), DocumentTemplate.usage_count.desc()
    )

    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get a specific document."""
    result = await db.execute(
        select(Document)
        .options(
            selectinload(Document.created_by),
            selectinload(Document.last_edited_by),
        )
        .where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Verify project access
    await check_project_access(db, document.project_id, current_user.id)

    return document_to_response(document)


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: UUID,
    updates: DocumentUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Document:
    """Update a document, optionally creating a version snapshot."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Verify project access and get project for organization_id
    project = await check_project_access(db, document.project_id, current_user.id, "member")

    # Track if content is changing for auto-review trigger
    content_changed = updates.content is not None

    # Create version snapshot if requested and content is changing
    if updates.create_version and updates.content:
        version = DocumentVersion(
            document_id=document.id,
            version=document.version,
            content=document.content,
            content_text=document.content_text,
            change_summary=updates.change_summary,
            created_by_id=current_user.id,
            word_count=document.word_count,
        )
        db.add(version)
        document.version += 1

    # Apply updates
    update_data = updates.model_dump(
        exclude_unset=True, exclude={"create_version", "change_summary"}
    )

    if "content" in update_data:
        update_data["content_text"] = extract_plain_text(update_data["content"])
        update_data["word_count"] = count_words(update_data["content"])

    for field, value in update_data.items():
        setattr(document, field, value)

    document.last_edited_by_id = current_user.id

    await db.commit()
    await db.refresh(document, ["created_by", "last_edited_by"])

    logger.info("Document updated", document_id=str(document_id))

    # Trigger auto-review in background if content changed and enabled
    if content_changed:
        try:
            auto_review_document_task.delay(
                document_id=str(document.id),
                user_id=str(current_user.id),
                organization_id=str(project.organization_id),
                trigger_source="document_update",
            )
        except Exception as e:
            # Don't fail document update if auto-review trigger fails
            logger.warning(
                "Auto-review trigger failed",
                document_id=str(document.id),
                error=str(e),
            )

    return document_to_response(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a document (soft delete by archiving)."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Verify project access
    await check_project_access(db, document.project_id, current_user.id, "member")

    document.is_archived = True
    await db.commit()

    logger.info("Document archived", document_id=str(document_id))


# Version endpoints
@router.get("/{document_id}/versions", response_model=list[DocumentVersionResponse])
async def list_document_versions(
    document_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[DocumentVersion]:
    """List version history for a document."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Verify project access
    await check_project_access(db, document.project_id, current_user.id)

    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version.desc())
    )
    return list(result.scalars().all())


@router.get("/{document_id}/versions/{version}", response_model=DocumentVersionResponse)
async def get_document_version(
    document_id: UUID,
    version: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> DocumentVersion:
    """Get a specific version of a document."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Verify project access
    await check_project_access(db, document.project_id, current_user.id)

    result = await db.execute(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document_id,
            DocumentVersion.version == version,
        )
    )
    doc_version = result.scalar_one_or_none()

    if not doc_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found",
        )

    return doc_version


@router.post("/{document_id}/versions/{version}/restore", response_model=DocumentResponse)
async def restore_document_version(
    document_id: UUID,
    version: int,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Document:
    """Restore a document to a previous version."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Verify project access
    await check_project_access(db, document.project_id, current_user.id, "member")

    result = await db.execute(
        select(DocumentVersion).where(
            DocumentVersion.document_id == document_id,
            DocumentVersion.version == version,
        )
    )
    doc_version = result.scalar_one_or_none()

    if not doc_version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found",
        )

    # Create a snapshot of current state before restoring
    current_version = DocumentVersion(
        document_id=document.id,
        version=document.version,
        content=document.content,
        content_text=document.content_text,
        change_summary=f"Before restore to v{version}",
        created_by_id=current_user.id,
        word_count=document.word_count,
    )
    db.add(current_version)

    # Restore content
    document.content = doc_version.content
    document.content_text = doc_version.content_text
    document.word_count = doc_version.word_count
    document.version += 1
    document.last_edited_by_id = current_user.id

    await db.commit()
    await db.refresh(document, ["created_by", "last_edited_by"])

    logger.info(
        "Document restored to version",
        document_id=str(document_id),
        restored_version=version,
    )
    return document_to_response(document)


# Comment endpoints
@router.get("/{document_id}/comments", response_model=list[DocumentCommentResponse])
async def list_document_comments(
    document_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    include_resolved: bool = Query(False),
) -> list[DocumentCommentResponse]:
    """List comments on a document."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Verify project access
    await check_project_access(db, document.project_id, current_user.id)

    # Query comments with user info
    query = (
        select(DocumentComment, User)
        .outerjoin(User, DocumentComment.created_by_id == User.id)
        .where(DocumentComment.document_id == document_id)
    )
    if not include_resolved:
        query = query.where(DocumentComment.is_resolved == False)

    query = query.order_by(DocumentComment.created_at.asc())

    result = await db.execute(query)
    rows = result.all()

    # Get all comment IDs to fetch mentions
    comment_ids = [row[0].id for row in rows]

    # Fetch mentions for all comments
    mentions_map: dict[UUID, list[MentionInfo]] = {}
    if comment_ids:
        mentions_result = await db.execute(
            select(DocumentCommentMention, User)
            .join(User, DocumentCommentMention.user_id == User.id)
            .where(DocumentCommentMention.comment_id.in_(comment_ids))
        )
        for mention, user in mentions_result.all():
            if mention.comment_id not in mentions_map:
                mentions_map[mention.comment_id] = []
            mentions_map[mention.comment_id].append(
                MentionInfo(
                    user_id=user.id,
                    user_name=user.display_name,
                    user_email=user.email,
                )
            )

    # Build response
    comments = []
    for comment, user in rows:
        comments.append(
            DocumentCommentResponse(
                id=comment.id,
                document_id=comment.document_id,
                created_by_id=comment.created_by_id,
                content=comment.content,
                selection_start=comment.selection_start,
                selection_end=comment.selection_end,
                selected_text=comment.selected_text,
                is_resolved=comment.is_resolved,
                resolved_by_id=comment.resolved_by_id,
                resolved_at=comment.resolved_at,
                parent_id=comment.parent_id,
                created_at=comment.created_at,
                updated_at=comment.updated_at,
                user_name=user.display_name if user else None,
                user_email=user.email if user else None,
                mentions=mentions_map.get(comment.id, []),
            )
        )

    return comments


@router.post(
    "/{document_id}/comments",
    response_model=DocumentCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_document_comment(
    document_id: UUID,
    comment_data: DocumentCommentCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> DocumentCommentResponse:
    """Add a comment to a document."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    if not document.allow_comments:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Comments are disabled for this document",
        )

    # Verify project access
    await check_project_access(db, document.project_id, current_user.id)

    # Create comment
    comment = DocumentComment(
        document_id=document_id,
        created_by_id=current_user.id,
        content=comment_data.content,
        selection_start=comment_data.selection_start,
        selection_end=comment_data.selection_end,
        selected_text=comment_data.selected_text,
        parent_id=comment_data.parent_id,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    # Parse and store mentions
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
                mention = DocumentCommentMention(
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

        await db.commit()

    logger.info(
        "Document comment created",
        document_id=str(document_id),
        comment_id=str(comment.id),
        mentions_count=len(mentions_info),
    )

    return DocumentCommentResponse(
        id=comment.id,
        document_id=comment.document_id,
        created_by_id=comment.created_by_id,
        content=comment.content,
        selection_start=comment.selection_start,
        selection_end=comment.selection_end,
        selected_text=comment.selected_text,
        is_resolved=comment.is_resolved,
        resolved_by_id=comment.resolved_by_id,
        resolved_at=comment.resolved_at,
        parent_id=comment.parent_id,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        user_name=current_user.display_name,
        user_email=current_user.email,
        mentions=mentions_info,
    )


@router.post("/{document_id}/comments/{comment_id}/resolve", response_model=DocumentCommentResponse)
async def resolve_document_comment(
    document_id: UUID,
    comment_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> DocumentCommentResponse:
    """Resolve a document comment."""
    # First, get the document and verify project access
    doc_result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = doc_result.scalar_one_or_none()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Verify user has member access to the project
    await check_project_access(db, document.project_id, current_user.id, "member")

    result = await db.execute(
        select(DocumentComment, User)
        .outerjoin(User, DocumentComment.created_by_id == User.id)
        .where(
            DocumentComment.id == comment_id,
            DocumentComment.document_id == document_id,
        )
    )
    row = result.one_or_none()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    comment, user = row
    comment.is_resolved = True
    comment.resolved_by_id = current_user.id
    comment.resolved_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(comment)

    # Fetch mentions
    mentions_result = await db.execute(
        select(DocumentCommentMention, User)
        .join(User, DocumentCommentMention.user_id == User.id)
        .where(DocumentCommentMention.comment_id == comment_id)
    )
    mentions = [
        MentionInfo(
            user_id=u.id,
            user_name=u.display_name,
            user_email=u.email,
        )
        for m, u in mentions_result.all()
    ]

    return DocumentCommentResponse(
        id=comment.id,
        document_id=comment.document_id,
        created_by_id=comment.created_by_id,
        content=comment.content,
        selection_start=comment.selection_start,
        selection_end=comment.selection_end,
        selected_text=comment.selected_text,
        is_resolved=comment.is_resolved,
        resolved_by_id=comment.resolved_by_id,
        resolved_at=comment.resolved_at,
        parent_id=comment.parent_id,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        user_name=user.display_name if user else None,
        user_email=user.email if user else None,
        mentions=mentions,
    )


class DocumentCommentUpdate(BaseModel):
    """Update a document comment."""

    content: str = Field(..., min_length=1, max_length=10000)


@router.patch("/{document_id}/comments/{comment_id}", response_model=DocumentCommentResponse)
async def update_document_comment(
    document_id: UUID,
    comment_id: UUID,
    update_data: DocumentCommentUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> DocumentCommentResponse:
    """Update a document comment. Only the author can update."""
    result = await db.execute(
        select(DocumentComment, User)
        .outerjoin(User, DocumentComment.created_by_id == User.id)
        .where(
            DocumentComment.id == comment_id,
            DocumentComment.document_id == document_id,
        )
    )
    row = result.one_or_none()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    comment, user = row

    # Only author can edit
    if comment.created_by_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the comment author can edit",
        )

    # Update content
    comment.content = update_data.content

    # Delete old mentions and add new ones
    await db.execute(
        DocumentCommentMention.__table__.delete().where(
            DocumentCommentMention.comment_id == comment_id
        )
    )

    # Parse and store new mentions
    mention_usernames = parse_mentions_from_content(update_data.content)
    mentions_info: list[MentionInfo] = []

    if mention_usernames:
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
                mention = DocumentCommentMention(
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

    await db.commit()
    await db.refresh(comment)

    return DocumentCommentResponse(
        id=comment.id,
        document_id=comment.document_id,
        created_by_id=comment.created_by_id,
        content=comment.content,
        selection_start=comment.selection_start,
        selection_end=comment.selection_end,
        selected_text=comment.selected_text,
        is_resolved=comment.is_resolved,
        resolved_by_id=comment.resolved_by_id,
        resolved_at=comment.resolved_at,
        parent_id=comment.parent_id,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        user_name=user.display_name if user else None,
        user_email=user.email if user else None,
        mentions=mentions_info,
    )


@router.delete("/{document_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document_comment(
    document_id: UUID,
    comment_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a document comment. Only the author can delete."""
    result = await db.execute(
        select(DocumentComment).where(
            DocumentComment.id == comment_id,
            DocumentComment.document_id == document_id,
        )
    )
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    # Only author can delete
    if comment.created_by_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the comment author can delete",
        )

    await db.delete(comment)
    await db.commit()

    logger.info(
        "Document comment deleted",
        document_id=str(document_id),
        comment_id=str(comment_id),
    )
