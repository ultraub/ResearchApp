"""Workflow service for managing task-review integration and state transitions."""

from datetime import datetime, timezone
from typing import Sequence
from uuid import UUID

import structlog
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.models.project import Task, TaskDocument, TaskAssignment
from researchhub.models.review import Review, ReviewAssignment, ReviewComment
from researchhub.services.review import ReviewService

logger = structlog.get_logger()


class WorkflowService:
    """Service for managing workflow transitions between tasks and reviews."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.review_service = ReviewService(db)

    # =========================================================================
    # Submit Task for Review
    # =========================================================================

    async def submit_task_for_review(
        self,
        task_id: UUID,
        submitted_by_id: UUID,
        reviewer_ids: list[UUID] | None = None,
        review_type: str = "approval",
        priority: str = "normal",
        due_date: datetime | None = None,
        auto_transition_task: bool = True,
    ) -> list[Review]:
        """
        Submit a task for review by creating reviews for all linked documents.

        This will:
        1. Find all documents linked to the task (with requires_review=True or link_type='deliverable')
        2. Create a review for each document
        3. Optionally transition the task to 'in_review' status

        Args:
            task_id: The task to submit for review
            submitted_by_id: User submitting the review
            reviewer_ids: Optional list of reviewer user IDs
            review_type: Type of review to create
            priority: Review priority
            due_date: Optional due date for reviews
            auto_transition_task: If True, automatically set task to 'in_review'

        Returns:
            List of created Review objects
        """
        # Get task with linked documents
        result = await self.db.execute(
            select(Task)
            .options(selectinload(Task.documents))
            .where(Task.id == task_id)
        )
        task = result.scalar_one_or_none()

        if not task:
            raise ValueError(f"Task {task_id} not found")

        # Get documents that need review
        reviewable_docs = [
            td for td in (task.documents or [])
            if td.requires_review or td.link_type == "deliverable"
        ]

        if not reviewable_docs:
            raise ValueError("No reviewable documents linked to this task")

        created_reviews = []

        for task_doc in reviewable_docs:
            review = await self.review_service.create_review(
                document_id=task_doc.document_id,
                project_id=task.project_id,
                title=f"Review for: {task.title}",
                description=f"Review requested as part of task: {task.title}",
                requested_by_id=submitted_by_id,
                review_type=review_type,
                priority=priority,
                due_date=due_date,
                reviewer_ids=reviewer_ids,
                task_id=task_id,
            )
            created_reviews.append(review)

        # Transition task to in_review if requested
        if auto_transition_task and task.status != "in_review":
            task.status = "in_review"
            await self.db.commit()

        logger.info(
            "task_submitted_for_review",
            task_id=str(task_id),
            reviews_created=len(created_reviews),
        )

        return created_reviews

    # =========================================================================
    # Review Status Aggregation
    # =========================================================================

    async def get_task_review_status(self, task_id: UUID) -> dict:
        """
        Get the aggregate review status for a task.

        Returns a dict with:
        - total_reviews: Number of reviews linked to task
        - pending_reviews: Reviews still in progress
        - approved_reviews: Reviews that were approved
        - rejected_reviews: Reviews that were rejected/need changes
        - all_approved: Boolean indicating if all reviews are approved
        - overall_status: 'pending' | 'approved' | 'rejected' | 'mixed'
        - ai_suggestion_count: Number of unresolved AI suggestions
        """
        # Get all reviews linked to this task
        reviews_result = await self.db.execute(
            select(Review)
            .options(selectinload(Review.assignments))
            .where(Review.task_id == task_id)
        )
        reviews = list(reviews_result.scalars().all())

        if not reviews:
            return {
                "total_reviews": 0,
                "pending_reviews": 0,
                "approved_reviews": 0,
                "rejected_reviews": 0,
                "all_approved": True,  # No reviews means nothing to block
                "overall_status": "none",
                "reviews": [],
                "ai_suggestion_count": 0,
            }

        pending = 0
        approved = 0
        rejected = 0

        review_ids = [r.id for r in reviews]

        review_summaries = []
        for review in reviews:
            review_summaries.append({
                "id": str(review.id),
                "document_id": str(review.document_id),
                "title": review.title,
                "status": review.status,
                "decision": review.decision,
            })

            if review.status in ("pending", "in_progress"):
                pending += 1
            elif review.status == "approved" or review.decision == "approve":
                approved += 1
            elif review.status == "rejected" or review.decision in ("reject", "request_changes"):
                rejected += 1
            else:
                pending += 1  # Unknown status treated as pending

        total = len(reviews)
        all_approved = approved == total and total > 0

        # Determine overall status
        if all_approved:
            overall_status = "approved"
        elif rejected > 0:
            overall_status = "rejected"
        elif pending > 0:
            overall_status = "pending"
        else:
            overall_status = "mixed"

        # Count unresolved AI suggestions across all reviews for this task
        ai_count_result = await self.db.execute(
            select(func.count(ReviewComment.id))
            .where(
                and_(
                    ReviewComment.review_id.in_(review_ids),
                    ReviewComment.source == "ai_suggestion",
                    ReviewComment.is_resolved == False,
                )
            )
        )
        ai_suggestion_count = ai_count_result.scalar() or 0

        return {
            "total_reviews": total,
            "pending_reviews": pending,
            "approved_reviews": approved,
            "rejected_reviews": rejected,
            "all_approved": all_approved,
            "overall_status": overall_status,
            "reviews": review_summaries,
            "ai_suggestion_count": ai_suggestion_count,
        }

    # =========================================================================
    # Auto-Transition on Review Completion
    # =========================================================================

    async def handle_review_completion(
        self,
        review_id: UUID,
        auto_transition: bool = True,
    ) -> Task | None:
        """
        Handle the completion of a review and potentially update task status.

        Called when a review is approved/rejected. If all reviews for a task
        are approved, can automatically transition the task to 'done'.

        Args:
            review_id: The completed review
            auto_transition: If True, auto-update task status

        Returns:
            The updated Task if auto-transition occurred, None otherwise
        """
        # Get the review with task info
        result = await self.db.execute(
            select(Review).where(Review.id == review_id)
        )
        review = result.scalar_one_or_none()

        if not review or not review.task_id:
            return None

        if not auto_transition:
            return None

        # Get task review status
        status = await self.get_task_review_status(review.task_id)

        # Get the task
        task_result = await self.db.execute(
            select(Task).where(Task.id == review.task_id)
        )
        task = task_result.scalar_one_or_none()

        if not task:
            return None

        # Auto-transition logic
        if status["all_approved"] and task.status == "in_review":
            task.status = "done"
            task.completed_at = datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(task)

            logger.info(
                "task_auto_completed",
                task_id=str(task.id),
                reason="all_reviews_approved",
            )
            return task

        elif status["overall_status"] == "rejected" and task.status == "in_review":
            # Move back to in_progress if any review was rejected
            task.status = "in_progress"
            await self.db.commit()
            await self.db.refresh(task)

            logger.info(
                "task_returned_to_progress",
                task_id=str(task.id),
                reason="review_rejected",
            )
            return task

        return None

    # =========================================================================
    # Unified Work Items
    # =========================================================================

    async def get_user_work_items(
        self,
        user_id: UUID,
        include_tasks: bool = True,
        include_reviews: bool = True,
        status_filter: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        """
        Get a unified view of a user's work items (tasks + review assignments).

        Returns tasks assigned to the user and reviews they need to complete,
        sorted by due date and priority.

        Args:
            user_id: The user to get work items for
            include_tasks: Include task assignments
            include_reviews: Include review assignments
            status_filter: Filter by status ('active', 'completed', 'all')
            limit: Max items to return
            offset: Pagination offset

        Returns:
            Dict with 'tasks', 'reviews', and 'combined' lists
        """
        work_items = {
            "tasks": [],
            "reviews": [],
            "combined": [],
            "total_tasks": 0,
            "total_reviews": 0,
        }

        # Get task assignments
        if include_tasks:
            task_query = (
                select(TaskAssignment)
                .options(selectinload(TaskAssignment.task))
                .where(TaskAssignment.user_id == user_id)
            )

            if status_filter == "active":
                task_query = task_query.where(
                    TaskAssignment.status.in_(["assigned", "accepted", "in_progress"])
                )
            elif status_filter == "completed":
                task_query = task_query.where(TaskAssignment.status == "completed")

            task_result = await self.db.execute(task_query)
            task_assignments = list(task_result.scalars().all())

            work_items["total_tasks"] = len(task_assignments)

            for ta in task_assignments:
                if ta.task:
                    work_items["tasks"].append({
                        "type": "task",
                        "id": str(ta.task.id),
                        "title": ta.task.title,
                        "status": ta.task.status,
                        "priority": ta.task.priority,
                        "due_date": ta.task.due_date.isoformat() if ta.task.due_date else None,
                        "assignment_status": ta.status,
                        "assignment_role": ta.role,
                        "project_id": str(ta.task.project_id),
                        "created_at": ta.task.created_at.isoformat(),
                    })

        # Get review assignments
        if include_reviews:
            review_query = (
                select(ReviewAssignment)
                .options(selectinload(ReviewAssignment.review))
                .where(ReviewAssignment.reviewer_id == user_id)
            )

            if status_filter == "active":
                review_query = review_query.where(
                    ReviewAssignment.status.in_(["pending", "accepted", "in_progress"])
                )
            elif status_filter == "completed":
                review_query = review_query.where(ReviewAssignment.status == "completed")

            review_result = await self.db.execute(review_query)
            review_assignments = list(review_result.scalars().all())

            work_items["total_reviews"] = len(review_assignments)

            for ra in review_assignments:
                if ra.review:
                    work_items["reviews"].append({
                        "type": "review",
                        "id": str(ra.review.id),
                        "title": ra.review.title,
                        "status": ra.review.status,
                        "priority": ra.review.priority,
                        "due_date": ra.review.due_date.isoformat() if ra.review.due_date else None,
                        "assignment_status": ra.status,
                        "assignment_role": ra.role,
                        "project_id": str(ra.review.project_id),
                        "document_id": str(ra.review.document_id),
                        "task_id": str(ra.review.task_id) if ra.review.task_id else None,
                        "created_at": ra.review.created_at.isoformat(),
                    })

        # Combine and sort by priority and due date
        combined = work_items["tasks"] + work_items["reviews"]

        # Priority order
        priority_order = {"urgent": 0, "high": 1, "normal": 2, "medium": 2, "low": 3}

        def sort_key(item):
            priority = priority_order.get(item.get("priority", "medium"), 2)
            due_date = item.get("due_date") or "9999-12-31"
            return (priority, due_date)

        combined.sort(key=sort_key)

        # Apply pagination to combined list
        work_items["combined"] = combined[offset : offset + limit]

        return work_items

    # =========================================================================
    # Workflow Utilities
    # =========================================================================

    async def can_submit_for_review(self, task_id: UUID) -> tuple[bool, str | None]:
        """
        Check if a task can be submitted for review.

        Returns:
            Tuple of (can_submit, reason_if_not)
        """
        # Get task with documents
        result = await self.db.execute(
            select(Task)
            .options(selectinload(Task.documents))
            .where(Task.id == task_id)
        )
        task = result.scalar_one_or_none()

        if not task:
            return False, "Task not found"

        if task.status == "done":
            return False, "Task is already completed"

        if task.status == "in_review":
            return False, "Task is already in review"

        # Check if there are reviewable documents
        reviewable_docs = [
            td for td in (task.documents or [])
            if td.requires_review or td.link_type == "deliverable"
        ]

        if not reviewable_docs:
            return False, "No reviewable documents linked to this task"

        # Check for existing pending reviews
        existing_reviews = await self.db.execute(
            select(func.count(Review.id)).where(
                and_(
                    Review.task_id == task_id,
                    Review.status.in_(["pending", "in_progress"]),
                )
            )
        )
        pending_count = existing_reviews.scalar() or 0

        if pending_count > 0:
            return False, f"Task already has {pending_count} pending review(s)"

        return True, None

    async def get_task_workflow_state(self, task_id: UUID) -> dict:
        """
        Get the complete workflow state for a task.

        Returns comprehensive information about the task's position in the workflow.
        """
        # Get task
        result = await self.db.execute(
            select(Task)
            .options(
                selectinload(Task.documents),
                selectinload(Task.assignments),
            )
            .where(Task.id == task_id)
        )
        task = result.scalar_one_or_none()

        if not task:
            return {"error": "Task not found"}

        # Get review status
        review_status = await self.get_task_review_status(task_id)

        # Check if can submit for review
        can_submit, submit_reason = await self.can_submit_for_review(task_id)

        return {
            "task_id": str(task.id),
            "task_status": task.status,
            "task_title": task.title,
            "linked_documents": len(task.documents) if task.documents else 0,
            "reviewable_documents": len([
                d for d in (task.documents or [])
                if d.requires_review or d.link_type == "deliverable"
            ]),
            "assignees": len(task.assignments) if task.assignments else 0,
            "review_status": review_status,
            "can_submit_for_review": can_submit,
            "submit_blocked_reason": submit_reason,
            "workflow_stage": self._determine_workflow_stage(task, review_status),
        }

    def _determine_workflow_stage(self, task: Task, review_status: dict) -> str:
        """Determine the current workflow stage for a task."""
        if task.status == "done":
            return "completed"
        if task.status == "in_review":
            if review_status["all_approved"]:
                return "review_approved"
            elif review_status["overall_status"] == "rejected":
                return "review_rejected"
            else:
                return "under_review"
        if task.status == "in_progress":
            return "in_progress"
        if task.status == "todo":
            return "not_started"
        return "unknown"

    # =========================================================================
    # Project Review Summary
    # =========================================================================

    async def get_project_review_summary(self, project_id: UUID) -> dict:
        """
        Get the aggregate review status for all tasks in a project.

        Returns a dict with:
        - total_reviews: Number of reviews linked to project tasks
        - pending_reviews: Reviews still in progress
        - approved_reviews: Reviews that were approved
        - rejected_reviews: Reviews that were rejected/need changes
        - all_approved: Boolean indicating if all reviews are approved
        - overall_status: 'none' | 'pending' | 'approved' | 'rejected' | 'mixed'
        - ai_suggestion_count: Number of unresolved AI suggestions
        - tasks_in_review: Number of tasks currently in_review status
        """
        # Get all reviews for tasks in this project
        reviews_result = await self.db.execute(
            select(Review)
            .options(selectinload(Review.assignments))
            .where(Review.project_id == project_id)
        )
        reviews = list(reviews_result.scalars().all())

        # Count tasks in review status
        tasks_in_review_result = await self.db.execute(
            select(func.count(Task.id)).where(
                and_(
                    Task.project_id == project_id,
                    Task.status == "in_review",
                )
            )
        )
        tasks_in_review = tasks_in_review_result.scalar() or 0

        if not reviews:
            return {
                "total_reviews": 0,
                "pending_reviews": 0,
                "approved_reviews": 0,
                "rejected_reviews": 0,
                "all_approved": True,  # No reviews means nothing to block
                "overall_status": "none",
                "ai_suggestion_count": 0,
                "tasks_in_review": tasks_in_review,
            }

        pending = 0
        approved = 0
        rejected = 0

        review_ids = [r.id for r in reviews]

        for review in reviews:
            if review.status in ("pending", "in_progress"):
                pending += 1
            elif review.status == "approved" or review.decision == "approve":
                approved += 1
            elif review.status == "rejected" or review.decision in ("reject", "request_changes"):
                rejected += 1
            else:
                pending += 1  # Unknown status treated as pending

        total = len(reviews)
        all_approved = approved == total and total > 0

        # Determine overall status
        if all_approved:
            overall_status = "approved"
        elif rejected > 0:
            overall_status = "rejected"
        elif pending > 0:
            overall_status = "pending"
        else:
            overall_status = "mixed"

        # Count unresolved AI suggestions across all reviews for this project
        ai_count_result = await self.db.execute(
            select(func.count(ReviewComment.id))
            .where(
                and_(
                    ReviewComment.review_id.in_(review_ids),
                    ReviewComment.source == "ai_suggestion",
                    ReviewComment.is_resolved == False,
                )
            )
        )
        ai_suggestion_count = ai_count_result.scalar() or 0

        return {
            "total_reviews": total,
            "pending_reviews": pending,
            "approved_reviews": approved,
            "rejected_reviews": rejected,
            "all_approved": all_approved,
            "overall_status": overall_status,
            "ai_suggestion_count": ai_suggestion_count,
            "tasks_in_review": tasks_in_review,
        }
