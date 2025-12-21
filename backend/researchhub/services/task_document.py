"""Task-Document linking service for managing document attachments to tasks."""

from typing import Sequence
from uuid import UUID

import structlog
from sqlalchemy import select, and_, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.models.project import Task, TaskDocument
from researchhub.models.document import Document

logger = structlog.get_logger()


class TaskDocumentService:
    """Service for managing task-document links."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # Link CRUD Operations
    # =========================================================================

    async def link_document(
        self,
        task_id: UUID,
        document_id: UUID,
        created_by_id: UUID | None = None,
        link_type: str = "reference",
        is_primary: bool = False,
        requires_review: bool = False,
        notes: str | None = None,
    ) -> TaskDocument:
        """Link a document to a task."""
        # Check if link already exists
        existing = await self.get_link(task_id, document_id)
        if existing:
            logger.warning(
                "task_document_link_exists",
                task_id=str(task_id),
                document_id=str(document_id),
            )
            return existing

        # If setting as primary, unset other primaries
        if is_primary:
            await self._unset_primary(task_id)

        # Get max position
        max_pos_result = await self.db.execute(
            select(func.max(TaskDocument.position)).where(
                TaskDocument.task_id == task_id
            )
        )
        max_position = max_pos_result.scalar() or 0

        link = TaskDocument(
            task_id=task_id,
            document_id=document_id,
            created_by_id=created_by_id,
            link_type=link_type,
            is_primary=is_primary,
            requires_review=requires_review,
            position=max_position + 1,
            notes=notes,
        )
        self.db.add(link)
        await self.db.commit()
        await self.db.refresh(link)

        logger.info(
            "document_linked_to_task",
            task_id=str(task_id),
            document_id=str(document_id),
            link_type=link_type,
        )

        return link

    async def link_multiple_documents(
        self,
        task_id: UUID,
        document_ids: list[UUID],
        created_by_id: UUID | None = None,
        link_type: str = "reference",
    ) -> list[TaskDocument]:
        """Link multiple documents to a task at once."""
        links = []

        for document_id in document_ids:
            link = await self.link_document(
                task_id=task_id,
                document_id=document_id,
                created_by_id=created_by_id,
                link_type=link_type,
            )
            links.append(link)

        return links

    async def get_link(
        self,
        task_id: UUID,
        document_id: UUID,
    ) -> TaskDocument | None:
        """Get a specific task-document link."""
        result = await self.db.execute(
            select(TaskDocument).where(
                and_(
                    TaskDocument.task_id == task_id,
                    TaskDocument.document_id == document_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_link_by_id(
        self,
        link_id: UUID,
    ) -> TaskDocument | None:
        """Get a link by its ID."""
        result = await self.db.execute(
            select(TaskDocument).where(TaskDocument.id == link_id)
        )
        return result.scalar_one_or_none()

    async def get_task_documents(
        self,
        task_id: UUID,
        link_type: str | None = None,
        include_document: bool = True,
    ) -> Sequence[TaskDocument]:
        """Get all documents linked to a task."""
        query = select(TaskDocument).where(TaskDocument.task_id == task_id)

        if link_type:
            query = query.where(TaskDocument.link_type == link_type)

        if include_document:
            query = query.options(selectinload(TaskDocument.document))

        query = query.order_by(TaskDocument.position.asc())

        result = await self.db.execute(query)
        return result.scalars().all()

    async def get_document_tasks(
        self,
        document_id: UUID,
        include_task: bool = True,
    ) -> Sequence[TaskDocument]:
        """Get all tasks a document is linked to."""
        query = select(TaskDocument).where(TaskDocument.document_id == document_id)

        if include_task:
            query = query.options(selectinload(TaskDocument.task))

        result = await self.db.execute(query)
        return result.scalars().all()

    async def update_link(
        self,
        link_id: UUID,
        link_type: str | None = None,
        is_primary: bool | None = None,
        requires_review: bool | None = None,
        notes: str | None = None,
    ) -> TaskDocument | None:
        """Update a task-document link."""
        link = await self.get_link_by_id(link_id)
        if not link:
            return None

        if link_type is not None:
            link.link_type = link_type
        if is_primary is not None:
            if is_primary and not link.is_primary:
                await self._unset_primary(link.task_id)
            link.is_primary = is_primary
        if requires_review is not None:
            link.requires_review = requires_review
        if notes is not None:
            link.notes = notes

        await self.db.commit()
        await self.db.refresh(link)

        return link

    async def unlink_document(
        self,
        task_id: UUID,
        document_id: UUID,
    ) -> bool:
        """Remove a document link from a task."""
        result = await self.db.execute(
            delete(TaskDocument).where(
                and_(
                    TaskDocument.task_id == task_id,
                    TaskDocument.document_id == document_id,
                )
            )
        )
        await self.db.commit()

        deleted = result.rowcount > 0
        if deleted:
            logger.info(
                "document_unlinked_from_task",
                task_id=str(task_id),
                document_id=str(document_id),
            )

        return deleted

    async def unlink_by_id(
        self,
        link_id: UUID,
    ) -> bool:
        """Remove a link by its ID."""
        result = await self.db.execute(
            delete(TaskDocument).where(TaskDocument.id == link_id)
        )
        await self.db.commit()

        return result.rowcount > 0

    # =========================================================================
    # Helper Methods
    # =========================================================================

    async def _unset_primary(self, task_id: UUID) -> None:
        """Unset is_primary for all documents on a task."""
        result = await self.db.execute(
            select(TaskDocument).where(
                and_(
                    TaskDocument.task_id == task_id,
                    TaskDocument.is_primary == True,
                )
            )
        )
        for link in result.scalars().all():
            link.is_primary = False

    async def get_primary_document(self, task_id: UUID) -> TaskDocument | None:
        """Get the primary document for a task, if any."""
        result = await self.db.execute(
            select(TaskDocument)
            .where(
                and_(
                    TaskDocument.task_id == task_id,
                    TaskDocument.is_primary == True,
                )
            )
            .options(selectinload(TaskDocument.document))
        )
        return result.scalar_one_or_none()

    async def get_documents_requiring_review(
        self, task_id: UUID
    ) -> Sequence[TaskDocument]:
        """Get all documents that require review for task completion."""
        result = await self.db.execute(
            select(TaskDocument)
            .where(
                and_(
                    TaskDocument.task_id == task_id,
                    TaskDocument.requires_review == True,
                )
            )
            .options(selectinload(TaskDocument.document))
        )
        return result.scalars().all()

    async def get_document_count(self, task_id: UUID) -> int:
        """Get the number of documents linked to a task."""
        result = await self.db.execute(
            select(func.count(TaskDocument.id)).where(
                TaskDocument.task_id == task_id
            )
        )
        return result.scalar() or 0

    async def reorder_documents(
        self,
        task_id: UUID,
        link_ids: list[UUID],
    ) -> None:
        """Reorder documents for a task."""
        for position, link_id in enumerate(link_ids):
            link = await self.get_link_by_id(link_id)
            if link and link.task_id == task_id:
                link.position = position

        await self.db.commit()
