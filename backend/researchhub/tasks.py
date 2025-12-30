"""Celery background tasks."""

import asyncio
import structlog
from uuid import UUID

from researchhub.worker import celery_app

logger = structlog.get_logger()


@celery_app.task(bind=True, name="researchhub.tasks.example_task")
def example_task(self, message: str) -> dict:
    """Example Celery task for testing."""
    return {"status": "success", "message": message}


@celery_app.task(bind=True, name="researchhub.tasks.process_document")
def process_document(self, document_id: str) -> dict:
    """Background task to process a document (e.g., extract text, generate summary)."""
    # Placeholder for actual document processing logic
    return {"status": "processed", "document_id": document_id}


@celery_app.task(bind=True, name="researchhub.tasks.send_notification")
def send_notification(self, user_id: str, notification_type: str, data: dict) -> dict:
    """
    Background task to send notifications.

    Respects user preferences:
    - notification_email: Whether to send email notifications
    - notification_email_digest: Email frequency (immediate, daily, weekly, none)
    - notification_in_app: Whether to show in-app notifications

    Args:
        user_id: The user to notify
        notification_type: Type of notification (e.g., task_assigned, comment_added)
        data: Notification payload data

    Returns:
        Dict with status and notification details
    """
    # TODO: When email/in-app notification system is implemented:
    # 1. Fetch user preferences from database
    # 2. Check notification_email and notification_in_app settings
    # 3. For email: check notification_email_digest frequency
    # 4. Skip sending if user has disabled the relevant notification type

    # Preference check stub - log that preferences would be checked
    logger.info(
        "notification_would_check_prefs",
        user_id=user_id,
        notification_type=notification_type,
        note="Preferences check will be implemented when notification system is built",
    )

    # Placeholder for actual notification sending logic
    return {
        "status": "sent",
        "user_id": user_id,
        "notification_type": notification_type,
    }


@celery_app.task(bind=True, name="researchhub.tasks.cleanup_expired_sessions")
def cleanup_expired_sessions(self) -> dict:
    """Periodic task to clean up expired sessions."""
    # Placeholder for session cleanup logic
    return {"status": "cleaned", "sessions_removed": 0}


@celery_app.task(bind=True, name="researchhub.tasks.process_recurring_tasks")
def process_recurring_tasks(self) -> dict:
    """
    Process all due recurring task rules and create tasks.

    This task should be scheduled to run daily (e.g., at midnight UTC)
    using Celery Beat or a cron-like scheduler.

    Example Celery Beat schedule:
        celery_app.conf.beat_schedule = {
            'process-recurring-tasks-daily': {
                'task': 'researchhub.tasks.process_recurring_tasks',
                'schedule': crontab(hour=0, minute=0),
            },
        }
    """
    async def _process():
        from researchhub.db.session import async_session_factory
        from researchhub.services.recurring_task import RecurringTaskService

        async with async_session_factory() as db:
            service = RecurringTaskService(db)
            created_tasks = await service.process_due_rules()
            return len(created_tasks)

    try:
        tasks_created = asyncio.run(_process())
        logger.info(
            "recurring_tasks_processed",
            tasks_created=tasks_created,
        )
        return {
            "status": "success",
            "tasks_created": tasks_created,
        }
    except Exception as e:
        logger.error(
            "recurring_tasks_processing_failed",
            error=str(e),
        )
        return {
            "status": "error",
            "error": str(e),
        }


@celery_app.task(bind=True, name="researchhub.tasks.auto_review_task")
def auto_review_task(
    self,
    task_id: str,
    user_id: str,
    organization_id: str,
    focus_areas: list[str] | None = None,
) -> dict:
    """
    Background task to trigger AI auto-review for a task and its linked documents.

    This task analyzes the task description along with all linked documents
    as a unified context and generates AI review suggestions.

    Args:
        task_id: The task to review
        user_id: User (or system user) triggering the review
        organization_id: Organization for AI feature access
        focus_areas: Optional focus areas for the review

    Returns:
        Dict with status and number of suggestions generated
    """
    async def _process():
        from researchhub.db.session import async_session_factory
        from researchhub.services.auto_review import get_auto_review_service

        async with async_session_factory() as db:
            service = get_auto_review_service(db)
            suggestions = await service.trigger_auto_review(
                task_id=UUID(task_id),
                user_id=UUID(user_id),
                organization_id=UUID(organization_id),
                focus_areas=focus_areas,
            )
            return suggestions

    try:
        suggestions = asyncio.run(_process())
        logger.info(
            "auto_review_completed",
            task_id=task_id,
            suggestion_count=len(suggestions),
        )
        return {
            "status": "success",
            "task_id": task_id,
            "suggestion_count": len(suggestions),
        }
    except Exception as e:
        logger.error(
            "auto_review_failed",
            task_id=task_id,
            error=str(e),
        )
        return {
            "status": "error",
            "task_id": task_id,
            "error": str(e),
        }


@celery_app.task(bind=True, name="researchhub.tasks.auto_review_document_task")
def auto_review_document_task(
    self,
    document_id: str,
    user_id: str,
    organization_id: str,
    trigger_source: str,
    focus_areas: list[str] | None = None,
) -> dict:
    """
    Background task to trigger AI auto-review for a single document.

    This creates a review for the document and adds AI suggestions.
    Used when documents are created or updated with auto-review enabled.

    Args:
        document_id: The document to review
        user_id: User triggering the review
        organization_id: Organization for AI feature access
        trigger_source: What triggered this (document_create, document_update)
        focus_areas: Optional focus areas for the review

    Returns:
        Dict with status and results
    """
    async def _process():
        from researchhub.db.session import async_session_factory
        from researchhub.services.auto_review import get_auto_review_service

        async with async_session_factory() as db:
            service = get_auto_review_service(db)
            result = await service.trigger_document_auto_review(
                document_id=UUID(document_id),
                user_id=UUID(user_id),
                organization_id=UUID(organization_id),
                trigger_source=trigger_source,
                focus_areas=focus_areas,
            )
            return result

    try:
        result = asyncio.run(_process())
        logger.info(
            "auto_review_document_completed",
            document_id=document_id,
            trigger_source=trigger_source,
            suggestion_count=result.get("suggestion_count", 0),
        )
        return {
            "status": "success",
            "document_id": document_id,
            **result,
        }
    except Exception as e:
        logger.error(
            "auto_review_document_failed",
            document_id=document_id,
            error=str(e),
        )
        return {
            "status": "error",
            "document_id": document_id,
            "error": str(e),
        }


@celery_app.task(bind=True, name="researchhub.tasks.generate_embedding")
def generate_embedding(
    self,
    entity_type: str,
    entity_id: str,
) -> dict:
    """
    Generate embedding for a single entity.

    This task is triggered when an entity is created or updated.
    It generates a vector embedding for semantic search capabilities.

    Args:
        entity_type: Type of entity ("document", "task", "journal_entry", "paper")
        entity_id: UUID of the entity

    Returns:
        Dict with status and entity info
    """
    async def _process():
        from researchhub.db.session import async_session_factory
        from researchhub.services.embedding import get_embedding_service

        async with async_session_factory() as db:
            service = get_embedding_service(db)
            success = await service.embed_entity(
                entity_type=entity_type,
                entity_id=UUID(entity_id),
            )
            return success

    try:
        success = asyncio.run(_process())
        if success:
            logger.info(
                "embedding_generated",
                entity_type=entity_type,
                entity_id=entity_id,
            )
            return {
                "status": "success",
                "entity_type": entity_type,
                "entity_id": entity_id,
            }
        else:
            logger.info(
                "embedding_skipped",
                entity_type=entity_type,
                entity_id=entity_id,
            )
            return {
                "status": "skipped",
                "entity_type": entity_type,
                "entity_id": entity_id,
            }
    except Exception as e:
        logger.error(
            "embedding_generation_failed",
            entity_type=entity_type,
            entity_id=entity_id,
            error=str(e),
        )
        return {
            "status": "error",
            "entity_type": entity_type,
            "entity_id": entity_id,
            "error": str(e),
        }


@celery_app.task(bind=True, name="researchhub.tasks.generate_embeddings_batch")
def generate_embeddings_batch(
    self,
    entity_type: str,
    entity_ids: list[str],
) -> dict:
    """
    Generate embeddings for multiple entities of the same type.

    More efficient than generating embeddings one at a time.
    Used for backfilling embeddings on existing data.

    Args:
        entity_type: Type of entities ("document", "task", "journal_entry", "paper")
        entity_ids: List of entity UUIDs

    Returns:
        Dict with success/skipped/failed counts
    """
    async def _process():
        from researchhub.db.session import async_session_factory
        from researchhub.services.embedding import get_embedding_service

        async with async_session_factory() as db:
            service = get_embedding_service(db)
            result = await service.embed_entities_batch(
                entity_type=entity_type,
                entity_ids=[UUID(eid) for eid in entity_ids],
            )
            return result

    try:
        result = asyncio.run(_process())
        logger.info(
            "batch_embeddings_completed",
            entity_type=entity_type,
            batch_size=len(entity_ids),
            **result,
        )
        return {
            "status": "success",
            "entity_type": entity_type,
            **result,
        }
    except Exception as e:
        logger.error(
            "batch_embeddings_failed",
            entity_type=entity_type,
            batch_size=len(entity_ids),
            error=str(e),
        )
        return {
            "status": "error",
            "entity_type": entity_type,
            "batch_size": len(entity_ids),
            "error": str(e),
        }


@celery_app.task(bind=True, name="researchhub.tasks.backfill_embeddings")
def backfill_embeddings(
    self,
    entity_type: str,
    batch_size: int = 50,
    reembed_existing: bool = False,
) -> dict:
    """
    Backfill embeddings for all entities of a given type.

    Used to generate embeddings for existing data that was created
    before the embedding system was enabled.

    Args:
        entity_type: Type of entities to backfill ("document", "task", "journal_entry", "paper")
        batch_size: Number of entities to process per batch
        reembed_existing: If True, regenerate embeddings even if they exist

    Returns:
        Dict with total processed counts
    """
    async def _process():
        from sqlalchemy import select

        from researchhub.db.session import async_session_factory
        from researchhub.services.embedding import (
            EMBEDDABLE_ENTITIES,
            get_embedding_service,
        )

        model_class = EMBEDDABLE_ENTITIES.get(entity_type)
        if not model_class:
            return {"error": f"Unknown entity type: {entity_type}"}

        total_success = 0
        total_skipped = 0
        total_failed = 0

        async with async_session_factory() as db:
            service = get_embedding_service(db)

            # Query for entities needing embeddings
            query = select(model_class.id)
            if not reembed_existing:
                query = query.where(model_class.embedding.is_(None))

            # Get all IDs first
            result = await db.execute(query)
            all_ids = [row[0] for row in result.all()]

            # Process in batches
            for i in range(0, len(all_ids), batch_size):
                batch_ids = all_ids[i : i + batch_size]
                batch_result = await service.embed_entities_batch(
                    entity_type=entity_type,
                    entity_ids=batch_ids,
                )
                total_success += batch_result.get("success", 0)
                total_skipped += batch_result.get("skipped", 0)
                total_failed += batch_result.get("failed", 0)

        return {
            "total_processed": len(all_ids),
            "success": total_success,
            "skipped": total_skipped,
            "failed": total_failed,
        }

    try:
        result = asyncio.run(_process())
        if "error" in result:
            return {"status": "error", **result}

        logger.info(
            "backfill_embeddings_completed",
            entity_type=entity_type,
            **result,
        )
        return {
            "status": "success",
            "entity_type": entity_type,
            **result,
        }
    except Exception as e:
        logger.error(
            "backfill_embeddings_failed",
            entity_type=entity_type,
            error=str(e),
        )
        return {
            "status": "error",
            "entity_type": entity_type,
            "error": str(e),
        }


@celery_app.task(bind=True, name="researchhub.tasks.auto_review_for_review_task")
def auto_review_for_review_task(
    self,
    review_id: str,
    user_id: str,
    organization_id: str,
    focus_areas: list[str] | None = None,
) -> dict:
    """
    Background task to trigger AI auto-review and add comments to an existing review.

    This higher-level task both generates AI suggestions and creates the
    ReviewComment records on the specified review.

    Args:
        review_id: The review to add AI suggestions to
        user_id: User (or system user) triggering the review
        organization_id: Organization for AI feature access
        focus_areas: Optional focus areas for the review

    Returns:
        Dict with status and number of comments created
    """
    async def _process():
        from researchhub.db.session import async_session_factory
        from researchhub.services.auto_review import get_auto_review_service

        async with async_session_factory() as db:
            service = get_auto_review_service(db)
            comment_count = await service.trigger_auto_review_for_review(
                review_id=UUID(review_id),
                user_id=UUID(user_id),
                organization_id=UUID(organization_id),
                focus_areas=focus_areas,
            )
            return comment_count

    try:
        comment_count = asyncio.run(_process())
        logger.info(
            "auto_review_for_review_completed",
            review_id=review_id,
            comment_count=comment_count,
        )
        return {
            "status": "success",
            "review_id": review_id,
            "comment_count": comment_count,
        }
    except Exception as e:
        logger.error(
            "auto_review_for_review_failed",
            review_id=review_id,
            error=str(e),
        )
        return {
            "status": "error",
            "review_id": review_id,
            "error": str(e),
        }
