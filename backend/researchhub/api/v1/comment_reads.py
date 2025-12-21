"""Comment read tracking endpoints.

Provides unified read tracking across all comment types:
- task comments
- document comments
- review comments
- generic comments (sharing)
"""

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db_session
from researchhub.models.collaboration import CommentRead
from researchhub.models.document import Document, DocumentComment
from researchhub.models.project import Task, TaskComment

router = APIRouter()
logger = structlog.get_logger()

# Valid comment types
CommentType = Literal["task", "document", "review", "generic"]


class MarkReadRequest(BaseModel):
    """Request to mark comments as read."""

    comment_type: CommentType
    comment_ids: list[UUID] = Field(..., min_length=1, max_length=100)


class MarkReadResponse(BaseModel):
    """Response after marking comments as read."""

    marked_count: int
    comment_type: str


class CommentReadStatus(BaseModel):
    """Read status for a single comment."""

    comment_id: UUID
    is_read: bool
    read_at: datetime | None = None


class UnreadCountResponse(BaseModel):
    """Unread comment count for a resource."""

    resource_type: str
    resource_id: UUID
    unread_count: int


class BatchReadStatusRequest(BaseModel):
    """Request to get read status for multiple comments."""

    comment_type: CommentType
    comment_ids: list[UUID] = Field(..., min_length=1, max_length=100)


@router.post("/mark-read", response_model=MarkReadResponse)
async def mark_comments_read(
    request: MarkReadRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> MarkReadResponse:
    """
    Mark one or more comments as read.

    Uses upsert to handle both new reads and re-reads efficiently.
    """
    now = datetime.now(timezone.utc)
    marked_count = 0

    for comment_id in request.comment_ids:
        # Use PostgreSQL upsert (INSERT ... ON CONFLICT DO UPDATE)
        stmt = insert(CommentRead).values(
            comment_type=request.comment_type,
            comment_id=comment_id,
            user_id=current_user.id,
            read_at=now,
        ).on_conflict_do_update(
            constraint="uq_comment_read",
            set_={"read_at": now, "updated_at": now},
        )
        await db.execute(stmt)
        marked_count += 1

    await db.commit()

    logger.info(
        "Comments marked as read",
        user_id=str(current_user.id),
        comment_type=request.comment_type,
        count=marked_count,
    )

    return MarkReadResponse(
        marked_count=marked_count,
        comment_type=request.comment_type,
    )


@router.post("/read-status", response_model=list[CommentReadStatus])
async def get_read_status(
    request: BatchReadStatusRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[CommentReadStatus]:
    """
    Get read status for a batch of comments.

    Returns read status for each comment ID in the request.
    """
    # Fetch all read records for the requested comments
    result = await db.execute(
        select(CommentRead.comment_id, CommentRead.read_at)
        .where(
            CommentRead.comment_type == request.comment_type,
            CommentRead.comment_id.in_(request.comment_ids),
            CommentRead.user_id == current_user.id,
        )
    )
    read_records = {row.comment_id: row.read_at for row in result.all()}

    # Build response for all requested comments
    statuses = []
    for comment_id in request.comment_ids:
        read_at = read_records.get(comment_id)
        statuses.append(
            CommentReadStatus(
                comment_id=comment_id,
                is_read=read_at is not None,
                read_at=read_at,
            )
        )

    return statuses


@router.get("/unread-count/{comment_type}/{resource_id}", response_model=UnreadCountResponse)
async def get_unread_count(
    comment_type: CommentType,
    resource_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> UnreadCountResponse:
    """
    Get count of unread comments for a resource.

    This requires knowing all comment IDs for the resource, which varies by type.
    For efficiency, this endpoint returns the count based on comments the user
    has NOT marked as read.

    Note: This is a simplified implementation. For production, you may want to
    join with the actual comment tables to get accurate counts.
    """
    # Get count of read comments for this resource
    # The actual unread count would require joining with the source comment table
    # This is a placeholder that returns 0 - actual implementation depends on use case

    # For now, return a response indicating we need the comment IDs to calculate
    # The frontend should track this based on the comments it has loaded
    return UnreadCountResponse(
        resource_type=comment_type,
        resource_id=resource_id,
        unread_count=0,  # Frontend calculates this from loaded comments + read status
    )


@router.delete("/{comment_type}/{comment_id}")
async def mark_comment_unread(
    comment_type: CommentType,
    comment_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """
    Mark a comment as unread (remove read record).

    Useful for "mark as unread" functionality.
    """
    result = await db.execute(
        select(CommentRead).where(
            CommentRead.comment_type == comment_type,
            CommentRead.comment_id == comment_id,
            CommentRead.user_id == current_user.id,
        )
    )
    read_record = result.scalar_one_or_none()

    if read_record:
        await db.delete(read_record)
        await db.commit()
        logger.info(
            "Comment marked as unread",
            user_id=str(current_user.id),
            comment_type=comment_type,
            comment_id=str(comment_id),
        )
        return {"status": "unmarked"}

    return {"status": "not_found"}


class TaskUnreadInfo(BaseModel):
    """Unread comment info for a single task."""

    task_id: UUID
    total_comments: int
    unread_count: int


@router.get("/tasks/project/{project_id}", response_model=dict[str, TaskUnreadInfo])
async def get_project_task_unread_counts(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, TaskUnreadInfo]:
    """
    Get unread comment counts for all tasks in a project.

    Returns a map of task_id -> unread info, similar to the blocker info endpoint.
    Only includes tasks that have comments.
    """
    # Get all tasks in the project
    tasks_result = await db.execute(
        select(Task.id).where(Task.project_id == project_id)
    )
    task_ids = [row[0] for row in tasks_result.all()]

    if not task_ids:
        return {}

    # Get comment counts per task
    comment_counts_result = await db.execute(
        select(
            TaskComment.task_id,
            func.count(TaskComment.id).label("total_comments"),
        )
        .where(TaskComment.task_id.in_(task_ids))
        .group_by(TaskComment.task_id)
    )
    comment_counts = {row.task_id: row.total_comments for row in comment_counts_result.all()}

    if not comment_counts:
        return {}

    # Get all task comment IDs
    all_comments_result = await db.execute(
        select(TaskComment.id, TaskComment.task_id, TaskComment.user_id)
        .where(TaskComment.task_id.in_(list(comment_counts.keys())))
    )
    all_comments = all_comments_result.all()

    # Get read status for all these comments for the current user
    comment_ids = [c.id for c in all_comments]
    read_result = await db.execute(
        select(CommentRead.comment_id)
        .where(
            CommentRead.comment_type == "task",
            CommentRead.comment_id.in_(comment_ids),
            CommentRead.user_id == current_user.id,
        )
    )
    read_comment_ids = {row[0] for row in read_result.all()}

    # Build per-task unread counts
    # Skip comments authored by the current user (they're implicitly read)
    task_unread_counts: dict[UUID, int] = {}
    for comment in all_comments:
        if comment.task_id not in task_unread_counts:
            task_unread_counts[comment.task_id] = 0
        # Count as unread if: not read AND not authored by current user
        if comment.id not in read_comment_ids and comment.user_id != current_user.id:
            task_unread_counts[comment.task_id] += 1

    # Build response
    result = {}
    for task_id, total in comment_counts.items():
        result[str(task_id)] = TaskUnreadInfo(
            task_id=task_id,
            total_comments=total,
            unread_count=task_unread_counts.get(task_id, 0),
        )

    return result


class DocumentUnreadInfo(BaseModel):
    """Unread comment info for a single document."""

    document_id: UUID
    total_comments: int
    unread_count: int


@router.get("/documents/project/{project_id}", response_model=dict[str, DocumentUnreadInfo])
async def get_project_document_unread_counts(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, DocumentUnreadInfo]:
    """
    Get unread comment counts for all documents in a project.

    Returns a map of document_id -> unread info, similar to the task unread info endpoint.
    Only includes documents that have comments.
    """
    # Get all documents in the project
    docs_result = await db.execute(
        select(Document.id).where(Document.project_id == project_id)
    )
    doc_ids = [row[0] for row in docs_result.all()]

    if not doc_ids:
        return {}

    # Get comment counts per document
    comment_counts_result = await db.execute(
        select(
            DocumentComment.document_id,
            func.count(DocumentComment.id).label("total_comments"),
        )
        .where(DocumentComment.document_id.in_(doc_ids))
        .group_by(DocumentComment.document_id)
    )
    comment_counts = {row.document_id: row.total_comments for row in comment_counts_result.all()}

    if not comment_counts:
        return {}

    # Get all document comment IDs with their metadata
    all_comments_result = await db.execute(
        select(DocumentComment.id, DocumentComment.document_id, DocumentComment.created_by_id)
        .where(DocumentComment.document_id.in_(list(comment_counts.keys())))
    )
    all_comments = all_comments_result.all()

    # Get read status for all these comments for the current user
    comment_ids = [c.id for c in all_comments]
    read_result = await db.execute(
        select(CommentRead.comment_id)
        .where(
            CommentRead.comment_type == "document",
            CommentRead.comment_id.in_(comment_ids),
            CommentRead.user_id == current_user.id,
        )
    )
    read_comment_ids = {row[0] for row in read_result.all()}

    # Build per-document unread counts
    # Skip comments authored by the current user (they're implicitly read)
    doc_unread_counts: dict[UUID, int] = {}
    for comment in all_comments:
        if comment.document_id not in doc_unread_counts:
            doc_unread_counts[comment.document_id] = 0
        # Count as unread if: not read AND not authored by current user
        if comment.id not in read_comment_ids and comment.created_by_id != current_user.id:
            doc_unread_counts[comment.document_id] += 1

    # Build response
    result = {}
    for doc_id, total in comment_counts.items():
        result[str(doc_id)] = DocumentUnreadInfo(
            document_id=doc_id,
            total_comments=total,
            unread_count=doc_unread_counts.get(doc_id, 0),
        )

    return result
