"""Review workflow service for managing document reviews."""

from datetime import datetime, timezone
from typing import Sequence
from uuid import UUID

import structlog
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.models.review import Review, ReviewAssignment, ReviewComment
from researchhub.models.document import Document
from researchhub.models.user import User

logger = structlog.get_logger()


class ReviewService:
    """Service for managing document reviews and assignments."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # Review CRUD Operations
    # =========================================================================

    async def create_review(
        self,
        document_id: UUID,
        project_id: UUID,
        title: str,
        requested_by_id: UUID,
        description: str | None = None,
        review_type: str = "feedback",
        priority: str = "normal",
        due_date: datetime | None = None,
        reviewer_ids: list[UUID] | None = None,
        tags: list[str] | None = None,
        task_id: UUID | None = None,
    ) -> Review:
        """Create a new review request for a document.

        Args:
            document_id: The document to review
            project_id: The project this review belongs to
            title: Review title
            requested_by_id: User requesting the review
            description: Optional review description
            review_type: Type of review (feedback, approval, etc.)
            priority: Review priority
            due_date: Optional due date
            reviewer_ids: Optional list of reviewer user IDs
            tags: Optional tags
            task_id: Optional task ID to link this review to
        """
        # Get current document version
        doc_result = await self.db.execute(
            select(Document.version).where(Document.id == document_id)
        )
        doc_version = doc_result.scalar_one_or_none() or 1

        review = Review(
            document_id=document_id,
            project_id=project_id,
            title=title,
            description=description,
            review_type=review_type,
            status="pending",
            priority=priority,
            document_version=doc_version,
            requested_by_id=requested_by_id,
            due_date=due_date,
            tags=tags or [],
            task_id=task_id,
        )
        self.db.add(review)
        await self.db.flush()

        # Create assignments if reviewers specified
        if reviewer_ids:
            for reviewer_id in reviewer_ids:
                assignment = ReviewAssignment(
                    review_id=review.id,
                    reviewer_id=reviewer_id,
                    assigned_by_id=requested_by_id,
                    status="pending",
                    role="reviewer",
                )
                self.db.add(assignment)

        await self.db.commit()
        await self.db.refresh(review)

        logger.info(
            "review_created",
            review_id=str(review.id),
            document_id=str(document_id),
            reviewer_count=len(reviewer_ids) if reviewer_ids else 0,
        )

        return review

    async def get_review(
        self,
        review_id: UUID,
        include_assignments: bool = True,
        include_comments: bool = False,
    ) -> Review | None:
        """Get a review by ID with optional relationships."""
        query = select(Review).where(Review.id == review_id)

        if include_assignments:
            query = query.options(selectinload(Review.assignments))
        if include_comments:
            query = query.options(selectinload(Review.comments))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_reviews(
        self,
        project_id: UUID | None = None,
        document_id: UUID | None = None,
        requested_by_id: UUID | None = None,
        reviewer_id: UUID | None = None,
        status: str | None = None,
        review_type: str | None = None,
        task_id: UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[Sequence[Review], int]:
        """List reviews with optional filters."""
        query = select(Review).options(selectinload(Review.assignments))

        conditions = []
        if project_id:
            conditions.append(Review.project_id == project_id)
        if document_id:
            conditions.append(Review.document_id == document_id)
        if requested_by_id:
            conditions.append(Review.requested_by_id == requested_by_id)
        if status:
            conditions.append(Review.status == status)
        if review_type:
            conditions.append(Review.review_type == review_type)
        if task_id:
            conditions.append(Review.task_id == task_id)

        # If filtering by reviewer, need to join assignments
        if reviewer_id:
            query = query.join(ReviewAssignment).where(
                ReviewAssignment.reviewer_id == reviewer_id
            )

        if conditions:
            query = query.where(and_(*conditions))

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Get paginated results
        query = query.order_by(Review.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(query)
        reviews = result.scalars().all()

        return reviews, total

    async def update_review(
        self,
        review_id: UUID,
        title: str | None = None,
        description: str | None = None,
        status: str | None = None,
        priority: str | None = None,
        due_date: datetime | None = None,
        decision: str | None = None,
        decision_notes: str | None = None,
        completed_by_id: UUID | None = None,
        tags: list[str] | None = None,
    ) -> Review | None:
        """Update a review."""
        review = await self.get_review(review_id, include_assignments=False)
        if not review:
            return None

        if title is not None:
            review.title = title
        if description is not None:
            review.description = description
        if status is not None:
            review.status = status
            # Set completed timestamp if completing
            if status in ("approved", "completed", "cancelled"):
                review.completed_at = datetime.now(timezone.utc)
                if completed_by_id:
                    review.completed_by_id = completed_by_id
        if priority is not None:
            review.priority = priority
        if due_date is not None:
            review.due_date = due_date
        if decision is not None:
            review.decision = decision
        if decision_notes is not None:
            review.decision_notes = decision_notes
        if tags is not None:
            review.tags = tags

        await self.db.commit()
        await self.db.refresh(review)

        logger.info("review_updated", review_id=str(review_id), status=review.status)

        return review

    async def delete_review(self, review_id: UUID) -> bool:
        """Delete a review."""
        review = await self.get_review(review_id, include_assignments=False)
        if not review:
            return False

        await self.db.delete(review)
        await self.db.commit()

        logger.info("review_deleted", review_id=str(review_id))
        return True

    # =========================================================================
    # Assignment Operations
    # =========================================================================

    async def add_reviewer(
        self,
        review_id: UUID,
        reviewer_id: UUID,
        assigned_by_id: UUID,
        role: str = "reviewer",
        due_date: datetime | None = None,
    ) -> ReviewAssignment:
        """Add a reviewer to a review."""
        assignment = ReviewAssignment(
            review_id=review_id,
            reviewer_id=reviewer_id,
            assigned_by_id=assigned_by_id,
            status="pending",
            role=role,
            due_date=due_date,
        )
        self.db.add(assignment)
        await self.db.commit()
        await self.db.refresh(assignment)

        logger.info(
            "reviewer_added",
            review_id=str(review_id),
            reviewer_id=str(reviewer_id),
        )

        return assignment

    async def update_assignment(
        self,
        assignment_id: UUID,
        status: str | None = None,
        recommendation: str | None = None,
        notes: str | None = None,
    ) -> ReviewAssignment | None:
        """Update a review assignment."""
        result = await self.db.execute(
            select(ReviewAssignment).where(ReviewAssignment.id == assignment_id)
        )
        assignment = result.scalar_one_or_none()
        if not assignment:
            return None

        if status is not None:
            assignment.status = status
            if status == "accepted":
                assignment.responded_at = datetime.now(timezone.utc)
            elif status == "completed":
                assignment.completed_at = datetime.now(timezone.utc)

        if recommendation is not None:
            assignment.recommendation = recommendation
        if notes is not None:
            assignment.notes = notes

        await self.db.commit()
        await self.db.refresh(assignment)

        return assignment

    async def remove_reviewer(self, assignment_id: UUID) -> bool:
        """Remove a reviewer from a review."""
        result = await self.db.execute(
            select(ReviewAssignment).where(ReviewAssignment.id == assignment_id)
        )
        assignment = result.scalar_one_or_none()
        if not assignment:
            return False

        await self.db.delete(assignment)
        await self.db.commit()
        return True

    async def get_user_assignments(
        self,
        user_id: UUID,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[Sequence[ReviewAssignment], int]:
        """Get all review assignments for a user."""
        query = (
            select(ReviewAssignment)
            .options(selectinload(ReviewAssignment.review))
            .where(ReviewAssignment.reviewer_id == user_id)
        )

        if status:
            query = query.where(ReviewAssignment.status == status)

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Get paginated results
        query = query.order_by(ReviewAssignment.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(query)
        assignments = result.scalars().all()

        return assignments, total

    # =========================================================================
    # Comment Operations
    # =========================================================================

    async def add_comment(
        self,
        review_id: UUID,
        user_id: UUID,
        content: str,
        comment_type: str = "general",
        selected_text: str | None = None,
        anchor_data: dict | None = None,
        severity: str | None = None,
        parent_comment_id: UUID | None = None,
        source: str = "human",
        ai_confidence: float | None = None,
        question_for_author: str | None = None,
        why_this_matters: str | None = None,
    ) -> ReviewComment:
        """Add a comment to a review.

        Args:
            review_id: The review to add the comment to
            user_id: The user adding the comment (for AI, use system user)
            content: The comment content
            comment_type: Type of comment (general, inline, suggestion, question,
                issue, gap_identified, clarity_needed, methodology_concern, consistency_issue)
            selected_text: Text that was selected when making an inline comment
            anchor_data: Positioning data for inline comments
            severity: Severity level (critical, major, minor, suggestion)
            parent_comment_id: Parent comment for threaded replies
            source: Comment source (human, ai_suggestion, ai_accepted, ai_dismissed)
            ai_confidence: AI confidence score (0.0-1.0) for AI suggestions
            question_for_author: AI's question prompting human thought
            why_this_matters: AI's explanation of why this issue is important
        """
        comment = ReviewComment(
            review_id=review_id,
            user_id=user_id,
            content=content,
            comment_type=comment_type,
            selected_text=selected_text,
            anchor_data=anchor_data,
            severity=severity,
            parent_comment_id=parent_comment_id,
            source=source,
            ai_confidence=ai_confidence,
            question_for_author=question_for_author,
            why_this_matters=why_this_matters,
        )
        self.db.add(comment)
        await self.db.commit()
        await self.db.refresh(comment)

        logger.info(
            "review_comment_added",
            review_id=str(review_id),
            comment_id=str(comment.id),
            source=source,
        )

        return comment

    async def add_ai_suggestions(
        self,
        review_id: UUID,
        user_id: UUID,
        suggestions: list[dict],
    ) -> list[ReviewComment]:
        """Add multiple AI suggestions to a review in bulk.

        Args:
            review_id: The review to add suggestions to
            user_id: System user ID for AI comments
            suggestions: List of suggestion dicts with keys:
                - type: Comment type (gap_identified, clarity_needed, etc.)
                - severity: Severity level
                - content: The main issue description
                - question_for_author: Question prompting human thought
                - why_this_matters: Explanation of importance
                - location: Optional anchor data dict
                - ai_confidence: Confidence score (0.0-1.0)

        Returns:
            List of created ReviewComment objects
        """
        comments = []
        for suggestion in suggestions:
            comment = ReviewComment(
                review_id=review_id,
                user_id=user_id,
                content=suggestion.get("content", ""),
                comment_type=suggestion.get("type", "gap_identified"),
                severity=suggestion.get("severity", "minor"),
                anchor_data=suggestion.get("location"),
                selected_text=suggestion.get("location", {}).get("text_snippet"),
                source="ai_suggestion",
                ai_confidence=suggestion.get("ai_confidence"),
                question_for_author=suggestion.get("question_for_author"),
                why_this_matters=suggestion.get("why_this_matters"),
            )
            self.db.add(comment)
            comments.append(comment)

        await self.db.commit()

        # Refresh all comments to get their IDs
        for comment in comments:
            await self.db.refresh(comment)

        logger.info(
            "ai_suggestions_added",
            review_id=str(review_id),
            count=len(comments),
        )

        return comments

    async def update_ai_suggestion_status(
        self,
        comment_id: UUID,
        action: str,
        user_id: UUID,
        resolution_notes: str | None = None,
    ) -> ReviewComment | None:
        """Update an AI suggestion's status (accept/dismiss).

        Args:
            comment_id: The AI suggestion comment ID
            action: Either 'accept' or 'dismiss'
            user_id: User performing the action
            resolution_notes: Optional notes explaining the resolution

        Returns:
            Updated ReviewComment or None if not found
        """
        result = await self.db.execute(
            select(ReviewComment).where(ReviewComment.id == comment_id)
        )
        comment = result.scalar_one_or_none()
        if not comment:
            return None

        if comment.source != "ai_suggestion":
            logger.warning(
                "attempted_to_update_non_ai_comment",
                comment_id=str(comment_id),
            )
            return None

        if action == "accept":
            comment.source = "ai_accepted"
            comment.is_resolved = True
            comment.resolved_by_id = user_id
            comment.resolved_at = datetime.now(timezone.utc)
        elif action == "dismiss":
            comment.source = "ai_dismissed"
            comment.is_resolved = True
            comment.resolved_by_id = user_id
            comment.resolved_at = datetime.now(timezone.utc)

        if resolution_notes:
            comment.resolution_notes = resolution_notes

        await self.db.commit()
        await self.db.refresh(comment)

        logger.info(
            "ai_suggestion_updated",
            comment_id=str(comment_id),
            action=action,
        )

        return comment

    async def bulk_update_ai_suggestions(
        self,
        comment_ids: list[UUID],
        action: str,
        user_id: UUID,
    ) -> int:
        """Bulk update multiple AI suggestions.

        Args:
            comment_ids: List of comment IDs to update
            action: Either 'accept' or 'dismiss'
            user_id: User performing the action

        Returns:
            Number of comments updated
        """
        updated_count = 0
        for comment_id in comment_ids:
            result = await self.update_ai_suggestion_status(
                comment_id, action, user_id
            )
            if result:
                updated_count += 1

        return updated_count

    async def update_comment(
        self,
        comment_id: UUID,
        content: str | None = None,
        is_resolved: bool | None = None,
        resolved_by_id: UUID | None = None,
        resolution_notes: str | None = None,
    ) -> ReviewComment | None:
        """Update a review comment."""
        result = await self.db.execute(
            select(ReviewComment).where(ReviewComment.id == comment_id)
        )
        comment = result.scalar_one_or_none()
        if not comment:
            return None

        if content is not None:
            comment.content = content
            comment.edited_at = datetime.now(timezone.utc)

        if is_resolved is not None:
            comment.is_resolved = is_resolved
            if is_resolved and resolved_by_id:
                comment.resolved_by_id = resolved_by_id
                comment.resolved_at = datetime.now(timezone.utc)
                comment.resolution_notes = resolution_notes

        await self.db.commit()
        await self.db.refresh(comment)

        return comment

    async def delete_comment(self, comment_id: UUID) -> bool:
        """Delete a review comment."""
        result = await self.db.execute(
            select(ReviewComment).where(ReviewComment.id == comment_id)
        )
        comment = result.scalar_one_or_none()
        if not comment:
            return False

        await self.db.delete(comment)
        await self.db.commit()
        return True

    async def list_comments(
        self,
        review_id: UUID,
        include_resolved: bool = True,
        comment_type: str | None = None,
    ) -> Sequence[ReviewComment]:
        """List comments for a review."""
        query = (
            select(ReviewComment)
            .where(ReviewComment.review_id == review_id)
            .where(ReviewComment.parent_comment_id.is_(None))  # Only top-level
            .options(selectinload(ReviewComment.replies))
        )

        if not include_resolved:
            query = query.where(ReviewComment.is_resolved == False)

        if comment_type:
            query = query.where(ReviewComment.comment_type == comment_type)

        query = query.order_by(ReviewComment.created_at.asc())
        result = await self.db.execute(query)
        return result.scalars().all()

    # =========================================================================
    # Analytics / Statistics
    # =========================================================================

    async def get_review_stats(
        self,
        review_id: UUID,
    ) -> dict:
        """Get statistics for a review."""
        review = await self.get_review(review_id, include_assignments=True, include_comments=True)
        if not review:
            return {}

        total_comments = len(review.comments) if review.comments else 0
        resolved_comments = sum(1 for c in (review.comments or []) if c.is_resolved)

        total_reviewers = len(review.assignments) if review.assignments else 0
        completed_reviews = sum(
            1 for a in (review.assignments or []) if a.status == "completed"
        )

        return {
            "total_comments": total_comments,
            "resolved_comments": resolved_comments,
            "unresolved_comments": total_comments - resolved_comments,
            "total_reviewers": total_reviewers,
            "completed_reviews": completed_reviews,
            "pending_reviews": total_reviewers - completed_reviews,
            "completion_percentage": (
                (completed_reviews / total_reviewers * 100)
                if total_reviewers > 0
                else 0
            ),
        }


def get_review_service(db: AsyncSession) -> ReviewService:
    """Factory function to create a ReviewService instance."""
    return ReviewService(db)
