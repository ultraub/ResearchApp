"""Task assignment service for managing multiple assignees per task."""

from datetime import datetime, timezone, date
from typing import Sequence
from uuid import UUID

import structlog
from sqlalchemy import select, and_, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.models.project import Task, TaskAssignment
from researchhub.models.user import User

logger = structlog.get_logger()


class TaskAssignmentService:
    """Service for managing task assignments (multiple assignees per task)."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # Assignment CRUD Operations
    # =========================================================================

    async def assign_user(
        self,
        task_id: UUID,
        user_id: UUID,
        assigned_by_id: UUID | None = None,
        role: str = "assignee",
        due_date: date | None = None,
        notes: str | None = None,
    ) -> TaskAssignment:
        """Assign a user to a task."""
        # Check if assignment already exists
        existing = await self.get_assignment(task_id, user_id)
        if existing:
            logger.warning(
                "assignment_already_exists",
                task_id=str(task_id),
                user_id=str(user_id),
            )
            return existing

        assignment = TaskAssignment(
            task_id=task_id,
            user_id=user_id,
            assigned_by_id=assigned_by_id,
            role=role,
            status="assigned",
            due_date=due_date,
            notes=notes,
        )
        self.db.add(assignment)
        await self.db.commit()
        await self.db.refresh(assignment)

        logger.info(
            "user_assigned_to_task",
            task_id=str(task_id),
            user_id=str(user_id),
            role=role,
            assigned_by=str(assigned_by_id) if assigned_by_id else None,
        )

        return assignment

    async def assign_multiple_users(
        self,
        task_id: UUID,
        user_ids: list[UUID],
        assigned_by_id: UUID | None = None,
        role: str = "assignee",
    ) -> list[TaskAssignment]:
        """Assign multiple users to a task at once."""
        assignments = []

        for user_id in user_ids:
            # Check if already assigned
            existing = await self.get_assignment(task_id, user_id)
            if existing:
                assignments.append(existing)
                continue

            assignment = TaskAssignment(
                task_id=task_id,
                user_id=user_id,
                assigned_by_id=assigned_by_id,
                role=role,
                status="assigned",
            )
            self.db.add(assignment)
            assignments.append(assignment)

        await self.db.commit()

        # Refresh all new assignments
        for assignment in assignments:
            await self.db.refresh(assignment)

        logger.info(
            "multiple_users_assigned",
            task_id=str(task_id),
            user_count=len(user_ids),
        )

        return assignments

    async def get_assignment(
        self,
        task_id: UUID,
        user_id: UUID,
    ) -> TaskAssignment | None:
        """Get a specific assignment by task and user."""
        result = await self.db.execute(
            select(TaskAssignment).where(
                and_(
                    TaskAssignment.task_id == task_id,
                    TaskAssignment.user_id == user_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_assignment_by_id(
        self,
        assignment_id: UUID,
    ) -> TaskAssignment | None:
        """Get an assignment by its ID."""
        result = await self.db.execute(
            select(TaskAssignment)
            .where(TaskAssignment.id == assignment_id)
            .options(selectinload(TaskAssignment.user))
        )
        return result.scalar_one_or_none()

    async def get_task_assignments(
        self,
        task_id: UUID,
        include_user: bool = True,
    ) -> Sequence[TaskAssignment]:
        """Get all assignments for a task."""
        query = select(TaskAssignment).where(TaskAssignment.task_id == task_id)

        if include_user:
            query = query.options(selectinload(TaskAssignment.user))

        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_user_assignments(
        self,
        user_id: UUID,
        status: str | None = None,
        include_task: bool = True,
    ) -> Sequence[TaskAssignment]:
        """Get all task assignments for a user."""
        query = select(TaskAssignment).where(TaskAssignment.user_id == user_id)

        if status:
            query = query.where(TaskAssignment.status == status)

        if include_task:
            query = query.options(selectinload(TaskAssignment.task))

        result = await self.db.execute(query)
        return result.scalars().all()

    async def update_assignment(
        self,
        assignment_id: UUID,
        role: str | None = None,
        status: str | None = None,
        due_date: date | None = None,
        notes: str | None = None,
    ) -> TaskAssignment | None:
        """Update an assignment."""
        assignment = await self.get_assignment_by_id(assignment_id)
        if not assignment:
            return None

        if role is not None:
            assignment.role = role
        if status is not None:
            assignment.status = status
            # Track completion time
            if status == "completed" and not assignment.completed_at:
                assignment.completed_at = datetime.now(timezone.utc)
            elif status != "completed":
                assignment.completed_at = None
        if due_date is not None:
            assignment.due_date = due_date
        if notes is not None:
            assignment.notes = notes

        await self.db.commit()
        await self.db.refresh(assignment)

        logger.info(
            "assignment_updated",
            assignment_id=str(assignment_id),
            status=status,
        )

        return assignment

    async def remove_assignment(
        self,
        task_id: UUID,
        user_id: UUID,
    ) -> bool:
        """Remove a user's assignment from a task."""
        result = await self.db.execute(
            delete(TaskAssignment).where(
                and_(
                    TaskAssignment.task_id == task_id,
                    TaskAssignment.user_id == user_id,
                )
            )
        )
        await self.db.commit()

        deleted = result.rowcount > 0
        if deleted:
            logger.info(
                "assignment_removed",
                task_id=str(task_id),
                user_id=str(user_id),
            )

        return deleted

    async def remove_assignment_by_id(
        self,
        assignment_id: UUID,
    ) -> bool:
        """Remove an assignment by its ID."""
        result = await self.db.execute(
            delete(TaskAssignment).where(TaskAssignment.id == assignment_id)
        )
        await self.db.commit()

        return result.rowcount > 0

    # =========================================================================
    # Assignment Queries
    # =========================================================================

    async def get_assignee_count(self, task_id: UUID) -> int:
        """Get the number of assignees for a task."""
        result = await self.db.execute(
            select(func.count(TaskAssignment.id)).where(
                TaskAssignment.task_id == task_id
            )
        )
        return result.scalar() or 0

    async def is_user_assigned(self, task_id: UUID, user_id: UUID) -> bool:
        """Check if a user is assigned to a task."""
        assignment = await self.get_assignment(task_id, user_id)
        return assignment is not None

    async def get_tasks_assigned_to_user(
        self,
        user_id: UUID,
        project_id: UUID | None = None,
        status: str | None = None,
    ) -> Sequence[Task]:
        """Get all tasks assigned to a user, optionally filtered by project/status."""
        query = (
            select(Task)
            .join(TaskAssignment, Task.id == TaskAssignment.task_id)
            .where(TaskAssignment.user_id == user_id)
        )

        if project_id:
            query = query.where(Task.project_id == project_id)
        if status:
            query = query.where(Task.status == status)

        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_assignment_stats(self, task_id: UUID) -> dict:
        """Get assignment statistics for a task."""
        assignments = await self.get_task_assignments(task_id, include_user=False)

        stats = {
            "total": len(assignments),
            "by_role": {},
            "by_status": {},
        }

        for assignment in assignments:
            # Count by role
            if assignment.role not in stats["by_role"]:
                stats["by_role"][assignment.role] = 0
            stats["by_role"][assignment.role] += 1

            # Count by status
            if assignment.status not in stats["by_status"]:
                stats["by_status"][assignment.status] = 0
            stats["by_status"][assignment.status] += 1

        return stats

    # =========================================================================
    # Bulk Operations
    # =========================================================================

    async def sync_assignments(
        self,
        task_id: UUID,
        user_ids: list[UUID],
        assigned_by_id: UUID | None = None,
        role: str = "assignee",
    ) -> list[TaskAssignment]:
        """
        Sync task assignments to match the provided user list.
        Adds missing users, removes users not in the list.
        """
        current = await self.get_task_assignments(task_id, include_user=False)
        current_user_ids = {a.user_id for a in current}
        target_user_ids = set(user_ids)

        # Remove users not in target list
        to_remove = current_user_ids - target_user_ids
        for user_id in to_remove:
            await self.remove_assignment(task_id, user_id)

        # Add missing users
        to_add = target_user_ids - current_user_ids
        for user_id in to_add:
            await self.assign_user(
                task_id=task_id,
                user_id=user_id,
                assigned_by_id=assigned_by_id,
                role=role,
            )

        # Return updated assignments
        return list(await self.get_task_assignments(task_id))

    async def copy_assignments(
        self,
        source_task_id: UUID,
        target_task_id: UUID,
        assigned_by_id: UUID | None = None,
    ) -> list[TaskAssignment]:
        """Copy all assignments from one task to another."""
        source_assignments = await self.get_task_assignments(
            source_task_id, include_user=False
        )

        new_assignments = []
        for source in source_assignments:
            assignment = await self.assign_user(
                task_id=target_task_id,
                user_id=source.user_id,
                assigned_by_id=assigned_by_id,
                role=source.role,
                due_date=source.due_date,
                notes=source.notes,
            )
            new_assignments.append(assignment)

        return new_assignments
