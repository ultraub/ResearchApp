"""Review workflow API endpoints."""

from datetime import datetime
from typing import Sequence
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db_session
from researchhub.models.project import Project
from researchhub.services.notification import NotificationService
from researchhub.services.review import get_review_service

router = APIRouter()
logger = structlog.get_logger()


# =============================================================================
# Pydantic Schemas
# =============================================================================


class ReviewCreate(BaseModel):
    """Request to create a review."""

    document_id: UUID
    project_id: UUID
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    review_type: str = Field(default="feedback")  # feedback, approval, peer_review, editorial
    priority: str = Field(default="normal")  # low, normal, high, urgent
    due_date: datetime | None = None
    reviewer_ids: list[UUID] | None = None
    tags: list[str] | None = None


class ReviewUpdate(BaseModel):
    """Request to update a review."""

    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    status: str | None = None  # pending, in_progress, changes_requested, approved, completed, cancelled
    priority: str | None = None
    due_date: datetime | None = None
    decision: str | None = None  # approved, rejected, needs_revision
    decision_notes: str | None = None
    tags: list[str] | None = None


class ReviewAssignmentCreate(BaseModel):
    """Request to add a reviewer."""

    reviewer_id: UUID
    role: str = Field(default="reviewer")  # reviewer, primary_reviewer, approver
    due_date: datetime | None = None


class ReviewAssignmentUpdate(BaseModel):
    """Request to update an assignment."""

    status: str | None = None  # pending, accepted, declined, in_progress, completed
    recommendation: str | None = None  # approve, reject, revise, abstain
    notes: str | None = None


class ReviewCommentCreate(BaseModel):
    """Request to create a review comment."""

    content: str = Field(..., min_length=1)
    comment_type: str = Field(default="general")  # general, inline, suggestion, question, issue
    selected_text: str | None = None
    anchor_data: dict | None = None
    severity: str | None = None  # critical, major, minor, suggestion
    parent_comment_id: UUID | None = None


class ReviewCommentUpdate(BaseModel):
    """Request to update a comment."""

    content: str | None = None
    is_resolved: bool | None = None
    resolution_notes: str | None = None


# Response schemas
class ReviewAssignmentResponse(BaseModel):
    """Review assignment response."""

    id: UUID
    review_id: UUID
    reviewer_id: UUID
    assigned_by_id: UUID | None
    status: str
    role: str
    responded_at: datetime | None
    completed_at: datetime | None
    recommendation: str | None
    notes: str | None
    due_date: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReviewCommentResponse(BaseModel):
    """Review comment response."""

    id: UUID
    review_id: UUID
    user_id: UUID
    content: str
    comment_type: str
    selected_text: str | None
    anchor_data: dict | None
    severity: str | None
    is_resolved: bool
    resolved_by_id: UUID | None
    resolved_at: datetime | None
    resolution_notes: str | None
    parent_comment_id: UUID | None
    edited_at: datetime | None
    created_at: datetime
    updated_at: datetime
    replies: list["ReviewCommentResponse"] = []

    class Config:
        from_attributes = True


class ReviewResponse(BaseModel):
    """Review response."""

    id: UUID
    document_id: UUID
    project_id: UUID
    title: str
    description: str | None
    review_type: str
    status: str
    priority: str
    document_version: int
    requested_by_id: UUID | None
    due_date: datetime | None
    completed_at: datetime | None
    completed_by_id: UUID | None
    decision: str | None
    decision_notes: str | None
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    assignments: list[ReviewAssignmentResponse] = []

    class Config:
        from_attributes = True


class ReviewListResponse(BaseModel):
    """Paginated review list response."""

    items: list[ReviewResponse]
    total: int
    page: int
    page_size: int


class ReviewStatsResponse(BaseModel):
    """Review statistics response."""

    total_comments: int
    resolved_comments: int
    unresolved_comments: int
    total_reviewers: int
    completed_reviews: int
    pending_reviews: int
    completion_percentage: float


# =============================================================================
# Review Endpoints
# =============================================================================


@router.post("", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_review(
    request: ReviewCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ReviewResponse:
    """Create a new review request for a document."""
    service = get_review_service(db)

    review = await service.create_review(
        document_id=request.document_id,
        project_id=request.project_id,
        title=request.title,
        requested_by_id=current_user.id,
        description=request.description,
        review_type=request.review_type,
        priority=request.priority,
        due_date=request.due_date,
        reviewer_ids=request.reviewer_ids,
        tags=request.tags,
    )

    # Send notifications to assigned reviewers
    if request.reviewer_ids:
        project_result = await db.execute(
            select(Project).options(selectinload(Project.team)).where(Project.id == request.project_id)
        )
        project = project_result.scalar_one_or_none()

        if project and project.team and project.team.organization_id:
            notification_service = NotificationService(db)
            await notification_service.notify_many(
                user_ids=request.reviewer_ids,
                notification_type="review_requested",
                title=f"Review requested: {request.title}",
                message=f"You have been asked to review '{request.title}'",
                organization_id=project.team.organization_id,
                target_type="review",
                target_id=review.id,
                target_url=f"/projects/{request.project_id}/reviews/{review.id}",
                sender_id=current_user.id,
            )

    return ReviewResponse.model_validate(review)


@router.get("", response_model=ReviewListResponse)
async def list_reviews(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    project_id: UUID | None = Query(None),
    document_id: UUID | None = Query(None),
    status: str | None = Query(None),
    review_type: str | None = Query(None),
    assigned_to_me: bool = Query(False),
    requested_by_me: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> ReviewListResponse:
    """List reviews with optional filters."""
    service = get_review_service(db)

    reviewer_id = current_user.id if assigned_to_me else None
    requested_by_id = current_user.id if requested_by_me else None

    reviews, total = await service.list_reviews(
        project_id=project_id,
        document_id=document_id,
        requested_by_id=requested_by_id,
        reviewer_id=reviewer_id,
        status=status,
        review_type=review_type,
        limit=page_size,
        offset=(page - 1) * page_size,
    )

    return ReviewListResponse(
        items=[ReviewResponse.model_validate(r) for r in reviews],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{review_id}", response_model=ReviewResponse)
async def get_review(
    review_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ReviewResponse:
    """Get a review by ID."""
    service = get_review_service(db)
    review = await service.get_review(review_id, include_assignments=True)

    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found",
        )

    return ReviewResponse.model_validate(review)


@router.patch("/{review_id}", response_model=ReviewResponse)
async def update_review(
    review_id: UUID,
    request: ReviewUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ReviewResponse:
    """Update a review."""
    service = get_review_service(db)

    review = await service.update_review(
        review_id=review_id,
        title=request.title,
        description=request.description,
        status=request.status,
        priority=request.priority,
        due_date=request.due_date,
        decision=request.decision,
        decision_notes=request.decision_notes,
        completed_by_id=current_user.id if request.status in ("approved", "completed") else None,
        tags=request.tags,
    )

    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found",
        )

    return ReviewResponse.model_validate(review)


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a review."""
    service = get_review_service(db)

    if not await service.delete_review(review_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found",
        )


@router.get("/{review_id}/stats", response_model=ReviewStatsResponse)
async def get_review_stats(
    review_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ReviewStatsResponse:
    """Get statistics for a review."""
    service = get_review_service(db)
    stats = await service.get_review_stats(review_id)

    if not stats:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found",
        )

    return ReviewStatsResponse(**stats)


# =============================================================================
# Assignment Endpoints
# =============================================================================


@router.post("/{review_id}/assignments", response_model=ReviewAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def add_reviewer(
    review_id: UUID,
    request: ReviewAssignmentCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ReviewAssignmentResponse:
    """Add a reviewer to a review."""
    service = get_review_service(db)

    assignment = await service.add_reviewer(
        review_id=review_id,
        reviewer_id=request.reviewer_id,
        assigned_by_id=current_user.id,
        role=request.role,
        due_date=request.due_date,
    )

    # Send notification to the new reviewer
    review = await service.get_review(review_id)
    if review:
        project_result = await db.execute(
            select(Project).options(selectinload(Project.team)).where(Project.id == review.project_id)
        )
        project = project_result.scalar_one_or_none()

        if project and project.team and project.team.organization_id:
            notification_service = NotificationService(db)
            await notification_service.notify(
                user_id=request.reviewer_id,
                notification_type="reviewer_assigned",
                title=f"You were added as reviewer: {review.title}",
                message=f"You have been added as a reviewer for '{review.title}'",
                organization_id=project.team.organization_id,
                target_type="review",
                target_id=review_id,
                target_url=f"/projects/{review.project_id}/reviews/{review_id}",
                sender_id=current_user.id,
            )

    return ReviewAssignmentResponse.model_validate(assignment)


@router.patch("/{review_id}/assignments/{assignment_id}", response_model=ReviewAssignmentResponse)
async def update_assignment(
    review_id: UUID,
    assignment_id: UUID,
    request: ReviewAssignmentUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ReviewAssignmentResponse:
    """Update a review assignment."""
    service = get_review_service(db)

    assignment = await service.update_assignment(
        assignment_id=assignment_id,
        status=request.status,
        recommendation=request.recommendation,
        notes=request.notes,
    )

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )

    return ReviewAssignmentResponse.model_validate(assignment)


@router.delete("/{review_id}/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_reviewer(
    review_id: UUID,
    assignment_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove a reviewer from a review."""
    service = get_review_service(db)

    if not await service.remove_reviewer(assignment_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )


# =============================================================================
# Comment Endpoints
# =============================================================================


@router.get("/{review_id}/comments", response_model=list[ReviewCommentResponse])
async def list_comments(
    review_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    include_resolved: bool = Query(True),
    comment_type: str | None = Query(None),
) -> list[ReviewCommentResponse]:
    """List comments for a review."""
    service = get_review_service(db)

    comments = await service.list_comments(
        review_id=review_id,
        include_resolved=include_resolved,
        comment_type=comment_type,
    )

    return [ReviewCommentResponse.model_validate(c) for c in comments]


@router.post("/{review_id}/comments", response_model=ReviewCommentResponse, status_code=status.HTTP_201_CREATED)
async def add_comment(
    review_id: UUID,
    request: ReviewCommentCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ReviewCommentResponse:
    """Add a comment to a review."""
    service = get_review_service(db)

    comment = await service.add_comment(
        review_id=review_id,
        user_id=current_user.id,
        content=request.content,
        comment_type=request.comment_type,
        selected_text=request.selected_text,
        anchor_data=request.anchor_data,
        severity=request.severity,
        parent_comment_id=request.parent_comment_id,
    )

    # Send notification to the review requester
    review = await service.get_review(review_id)
    if review and review.requested_by_id:
        project_result = await db.execute(
            select(Project).options(selectinload(Project.team)).where(Project.id == review.project_id)
        )
        project = project_result.scalar_one_or_none()

        if project and project.team and project.team.organization_id:
            notification_service = NotificationService(db)
            await notification_service.notify(
                user_id=review.requested_by_id,
                notification_type="review_comment_added",
                title=f"New comment on review: {review.title}",
                message=f"A comment was added to your review '{review.title}'",
                organization_id=project.team.organization_id,
                target_type="review",
                target_id=review_id,
                target_url=f"/projects/{review.project_id}/reviews/{review_id}",
                sender_id=current_user.id,
            )

    return ReviewCommentResponse.model_validate(comment)


@router.patch("/{review_id}/comments/{comment_id}", response_model=ReviewCommentResponse)
async def update_comment(
    review_id: UUID,
    comment_id: UUID,
    request: ReviewCommentUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ReviewCommentResponse:
    """Update a review comment."""
    service = get_review_service(db)

    comment = await service.update_comment(
        comment_id=comment_id,
        content=request.content,
        is_resolved=request.is_resolved,
        resolved_by_id=current_user.id if request.is_resolved else None,
        resolution_notes=request.resolution_notes,
    )

    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    return ReviewCommentResponse.model_validate(comment)


@router.delete("/{review_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    review_id: UUID,
    comment_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a review comment."""
    service = get_review_service(db)

    if not await service.delete_comment(comment_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )


# =============================================================================
# User Assignment Endpoints
# =============================================================================


@router.get("/my/assignments", response_model=list[ReviewAssignmentResponse])
async def get_my_assignments(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> list[ReviewAssignmentResponse]:
    """Get current user's review assignments."""
    service = get_review_service(db)

    assignments, _ = await service.get_user_assignments(
        user_id=current_user.id,
        status=status,
        limit=page_size,
        offset=(page - 1) * page_size,
    )

    return [ReviewAssignmentResponse.model_validate(a) for a in assignments]
