"""Auto-Review Service - AI-driven review suggestion generation.

This service handles automatic generation of AI review suggestions for tasks
and their linked documents. It assembles content from tasks and documents
into a unified context and triggers AI analysis.
"""

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.service import get_ai_service
from researchhub.ai.schemas import AIFeatureName
from researchhub.models.document import Document
from researchhub.models.project import Task
from researchhub.models.review import Review, AutoReviewConfig, AutoReviewLog
from researchhub.models.activity import Notification
from researchhub.services.review import ReviewService

logger = logging.getLogger(__name__)


class AutoReviewService:
    """Service for generating AI-driven review suggestions.

    Analyzes tasks and their linked documents together to identify:
    - Gaps in information
    - Clarity issues
    - Methodology concerns
    - Consistency problems across documents

    The AI focuses on substantive issues that require human thought,
    not minor style fixes.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.ai_service = get_ai_service()
        self.review_service = ReviewService(db)

    async def trigger_auto_review(
        self,
        task_id: UUID,
        user_id: UUID,
        organization_id: UUID,
        focus_areas: list[str] | None = None,
    ) -> list[dict]:
        """Trigger AI review for a task and its linked documents.

        Assembles content from the task description and all linked documents,
        then sends to AI for substantive analysis.

        Args:
            task_id: The task to review
            user_id: User (or system user) triggering the review
            organization_id: Organization for AI feature access
            focus_areas: Optional focus areas for the review

        Returns:
            List of AI suggestion dicts ready for ReviewComment creation
        """
        # 1. Assemble context bundle
        context = await self._assemble_context_bundle(task_id)

        if not context["has_content"]:
            logger.info(
                "auto_review_skipped_no_content",
                task_id=str(task_id),
            )
            return []

        # 2. Generate AI review suggestions
        suggestions = await self._generate_suggestions(
            user_id=user_id,
            organization_id=organization_id,
            context=context,
            focus_areas=focus_areas,
        )

        logger.info(
            "auto_review_generated",
            task_id=str(task_id),
            suggestion_count=len(suggestions),
        )

        return suggestions

    async def trigger_auto_review_for_review(
        self,
        review_id: UUID,
        user_id: UUID,
        organization_id: UUID,
        focus_areas: list[str] | None = None,
    ) -> int:
        """Trigger AI review and create comments on an existing review.

        This is the higher-level method that both generates suggestions
        and creates the ReviewComment records.

        Args:
            review_id: The review to add AI suggestions to
            user_id: User (or system user) triggering the review
            organization_id: Organization for AI feature access
            focus_areas: Optional focus areas

        Returns:
            Number of AI suggestions created
        """
        # Get the review with its task
        result = await self.db.execute(
            select(Review)
            .options(selectinload(Review.document))
            .where(Review.id == review_id)
        )
        review = result.scalar_one_or_none()

        if not review:
            logger.warning("auto_review_review_not_found", review_id=str(review_id))
            return 0

        # If review has a task, use task-based review
        if review.task_id:
            suggestions = await self.trigger_auto_review(
                task_id=review.task_id,
                user_id=user_id,
                organization_id=organization_id,
                focus_areas=focus_areas,
            )
        else:
            # Document-only review
            suggestions = await self._generate_document_suggestions(
                document_id=review.document_id,
                user_id=user_id,
                organization_id=organization_id,
                focus_areas=focus_areas,
            )

        if not suggestions:
            return 0

        # Create the ReviewComment records
        comments = await self.review_service.add_ai_suggestions(
            review_id=review_id,
            user_id=user_id,
            suggestions=suggestions,
        )

        return len(comments)

    async def _assemble_context_bundle(self, task_id: UUID) -> dict[str, Any]:
        """Assemble content from task and all linked documents.

        Args:
            task_id: Task to assemble context for

        Returns:
            Context bundle dict with task and document content
        """
        # Get task with linked documents
        result = await self.db.execute(
            select(Task)
            .options(selectinload(Task.linked_documents))
            .where(Task.id == task_id)
        )
        task = result.scalar_one_or_none()

        if not task:
            return {"has_content": False, "error": "Task not found"}

        # Build context bundle
        context = {
            "has_content": True,
            "task_id": str(task.id),
            "task_title": task.title,
            "task_description": self._extract_text_from_description(task.description),
            "task_status": task.status,
            "documents": [],
        }

        # Add linked documents
        for doc in task.linked_documents or []:
            doc_content = {
                "document_id": str(doc.id),
                "document_title": doc.title,
                "document_type": doc.document_type,
                "content": self._extract_text_from_content(doc.content),
            }
            context["documents"].append(doc_content)

        # Check if there's enough content to review
        task_text = context["task_description"] or ""
        doc_text = " ".join(d["content"] or "" for d in context["documents"])
        total_text = task_text + doc_text

        if len(total_text.strip()) < 50:
            context["has_content"] = False

        return context

    async def _generate_suggestions(
        self,
        user_id: UUID,
        organization_id: UUID,
        context: dict[str, Any],
        focus_areas: list[str] | None = None,
    ) -> list[dict]:
        """Generate AI review suggestions from context bundle.

        Args:
            user_id: User triggering the review
            organization_id: Organization for AI access
            context: Assembled context bundle
            focus_areas: Optional focus areas

        Returns:
            List of suggestion dicts
        """
        # Format context for AI
        formatted_content = self._format_context_for_ai(context)

        # Call AI service with enhanced review template
        try:
            response = await self.ai_service.generate(
                user_id=user_id,
                organization_id=organization_id,
                feature_name=AIFeatureName.REVIEW_HELPER,
                template_key="review_suggest_structured",
                variables={
                    "context_bundle": formatted_content,
                    "task_title": context["task_title"],
                    "document_count": len(context["documents"]),
                    "focus_areas": focus_areas or [],
                },
            )
        except Exception as e:
            logger.error(
                "auto_review_ai_error",
                error=str(e),
                task_id=context.get("task_id"),
            )
            return []

        # Parse structured response
        suggestions = self._parse_ai_response(response.content, context)

        return suggestions

    async def _generate_document_suggestions(
        self,
        document_id: UUID,
        user_id: UUID,
        organization_id: UUID,
        focus_areas: list[str] | None = None,
    ) -> list[dict]:
        """Generate AI suggestions for a single document.

        Args:
            document_id: Document to review
            user_id: User triggering the review
            organization_id: Organization for AI access
            focus_areas: Optional focus areas

        Returns:
            List of suggestion dicts
        """
        result = await self.db.execute(
            select(Document).where(Document.id == document_id)
        )
        doc = result.scalar_one_or_none()

        if not doc:
            return []

        content = self._extract_text_from_content(doc.content)
        if not content or len(content.strip()) < 50:
            return []

        try:
            response = await self.ai_service.suggest_review_comments(
                user_id=user_id,
                organization_id=organization_id,
                document_id=document_id,
                document_content=content,
                document_type=doc.document_type,
                focus_areas=focus_areas,
            )
        except Exception as e:
            logger.error(
                "auto_review_document_ai_error",
                error=str(e),
                document_id=str(document_id),
            )
            return []

        # Parse and convert to structured format
        context = {
            "task_id": None,
            "documents": [{"document_id": str(document_id), "document_title": doc.title}],
        }
        suggestions = self._parse_ai_response(response.content, context)

        return suggestions

    def _format_context_for_ai(self, context: dict[str, Any]) -> str:
        """Format context bundle as text for AI analysis.

        Args:
            context: Context bundle

        Returns:
            Formatted text
        """
        parts = []

        # Task section
        parts.append("=== TASK ===")
        parts.append(f"Title: {context['task_title']}")
        parts.append(f"Status: {context['task_status']}")
        if context["task_description"]:
            parts.append(f"\nDescription:\n{context['task_description']}")
        parts.append("")

        # Documents section
        for i, doc in enumerate(context["documents"], 1):
            parts.append(f"=== DOCUMENT {i}: {doc['document_title']} ===")
            parts.append(f"Type: {doc.get('document_type', 'unknown')}")
            if doc["content"]:
                # Truncate very long documents
                content = doc["content"]
                if len(content) > 10000:
                    content = content[:10000] + "\n\n[Content truncated...]"
                parts.append(f"\nContent:\n{content}")
            parts.append("")

        return "\n".join(parts)

    def _parse_ai_response(
        self,
        response_text: str,
        context: dict[str, Any],
    ) -> list[dict]:
        """Parse AI response into structured suggestion dicts.

        The AI should return JSON, but we handle text fallback.

        Args:
            response_text: Raw AI response
            context: Original context for reference

        Returns:
            List of suggestion dicts
        """
        suggestions = []

        # Try to parse as JSON first
        try:
            # Find JSON in response
            json_start = response_text.find("{")
            json_end = response_text.rfind("}") + 1

            if json_start >= 0 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                data = json.loads(json_str)

                if "suggestions" in data:
                    for s in data["suggestions"]:
                        suggestion = self._normalize_suggestion(s, context)
                        if suggestion:
                            suggestions.append(suggestion)
        except json.JSONDecodeError:
            # Fall back to simple text extraction
            logger.warning("auto_review_json_parse_failed")
            suggestions = self._parse_text_response(response_text, context)

        return suggestions

    def _normalize_suggestion(
        self,
        raw: dict,
        context: dict[str, Any],
    ) -> dict | None:
        """Normalize a raw suggestion dict to expected format.

        Args:
            raw: Raw suggestion from AI
            context: Original context

        Returns:
            Normalized suggestion dict or None if invalid
        """
        # Map AI types to our CommentType values
        type_mapping = {
            "gap": "gap_identified",
            "gap_identified": "gap_identified",
            "clarity": "clarity_needed",
            "clarity_needed": "clarity_needed",
            "methodology": "methodology_concern",
            "methodology_concern": "methodology_concern",
            "consistency": "consistency_issue",
            "consistency_issue": "consistency_issue",
            "completeness": "gap_identified",
            "issue": "gap_identified",
        }

        suggestion_type = raw.get("type", "gap_identified").lower()
        suggestion_type = type_mapping.get(suggestion_type, "gap_identified")

        # Map severity
        severity_mapping = {
            "critical": "critical",
            "major": "major",
            "high": "major",
            "moderate": "minor",
            "minor": "minor",
            "low": "minor",
            "suggestion": "suggestion",
        }
        severity = raw.get("severity", "minor").lower()
        severity = severity_mapping.get(severity, "minor")

        # Build location/anchor data
        location = raw.get("location", {})
        source_type = location.get("source_type", "task")

        # Try to match to a document
        doc_id = location.get("document_id") or location.get("source_id")
        if not doc_id and source_type == "document":
            # Try to find document by title
            doc_title = location.get("document_title", "")
            for doc in context.get("documents", []):
                if doc_title.lower() in doc.get("document_title", "").lower():
                    doc_id = doc["document_id"]
                    break

        anchor_data = {
            "source_type": source_type,
            "source_id": doc_id or context.get("task_id"),
            "document_title": location.get("document_title"),
            "paragraph": location.get("paragraph"),
            "text_snippet": location.get("text_snippet"),
        }

        # Build the normalized suggestion
        content = raw.get("issue") or raw.get("content") or raw.get("description", "")
        if not content:
            return None

        return {
            "type": suggestion_type,
            "severity": severity,
            "content": content,
            "question_for_author": raw.get("question_for_author") or raw.get("question"),
            "why_this_matters": raw.get("why_this_matters") or raw.get("importance"),
            "location": anchor_data,
            "ai_confidence": raw.get("confidence") or raw.get("ai_confidence"),
        }

    def _parse_text_response(
        self,
        text: str,
        context: dict[str, Any],
    ) -> list[dict]:
        """Parse plain text response as fallback.

        Args:
            text: Plain text AI response
            context: Original context

        Returns:
            List of suggestion dicts (may be empty)
        """
        # Simple fallback: create one general suggestion
        if len(text.strip()) > 50:
            return [
                {
                    "type": "gap_identified",
                    "severity": "minor",
                    "content": text[:500],
                    "question_for_author": None,
                    "why_this_matters": None,
                    "location": {
                        "source_type": "task",
                        "source_id": context.get("task_id"),
                    },
                    "ai_confidence": 0.5,
                }
            ]
        return []

    def _extract_text_from_description(self, description: Any) -> str:
        """Extract plain text from task description (may be JSONB TipTap).

        Args:
            description: Task description (string or TipTap JSON)

        Returns:
            Plain text string
        """
        if not description:
            return ""

        if isinstance(description, str):
            return description

        if isinstance(description, dict):
            # TipTap JSON format
            return self._extract_text_from_tiptap(description)

        return str(description)

    def _extract_text_from_content(self, content: Any) -> str:
        """Extract plain text from document content (may be JSONB TipTap).

        Args:
            content: Document content

        Returns:
            Plain text string
        """
        if not content:
            return ""

        if isinstance(content, str):
            return content

        if isinstance(content, dict):
            return self._extract_text_from_tiptap(content)

        return str(content)

    def _extract_text_from_tiptap(self, doc: dict) -> str:
        """Extract plain text from TipTap JSON document.

        Args:
            doc: TipTap JSON document

        Returns:
            Plain text
        """
        texts = []

        def extract(node: dict) -> None:
            if node.get("type") == "text":
                texts.append(node.get("text", ""))
            for child in node.get("content", []):
                extract(child)

        extract(doc)
        return " ".join(texts)

    async def trigger_document_auto_review(
        self,
        document_id: UUID,
        user_id: UUID,
        organization_id: UUID,
        trigger_source: str,
        focus_areas: list[str] | None = None,
    ) -> dict:
        """Trigger auto-review for a single document.

        This is called when a document is created or updated with auto-review enabled.
        It creates a review, generates AI suggestions, and adds them as comments.

        Args:
            document_id: Document to review
            user_id: User triggering the review
            organization_id: Organization for AI access and config
            trigger_source: What triggered this (document_create, document_update)
            focus_areas: Optional focus areas

        Returns:
            Dict with review_id and suggestion_count
        """
        # Get document
        result = await self.db.execute(
            select(Document).where(Document.id == document_id)
        )
        doc = result.scalar_one_or_none()
        if not doc:
            logger.warning("auto_review_document_not_found", document_id=str(document_id))
            return {"review_id": None, "suggestion_count": 0}

        # Extract content for duplicate detection
        content = self._extract_text_from_content(doc.content)

        # Check if should run
        should_run, skip_reason = await self.should_auto_review(
            organization_id=organization_id,
            trigger_source=trigger_source,
            document_id=document_id,
            content=content,
        )

        if not should_run:
            logger.info(
                "auto_review_skipped",
                document_id=str(document_id),
                reason=skip_reason,
            )
            return {"review_id": None, "suggestion_count": 0, "skipped": skip_reason}

        # Create review log
        log = await self.create_review_log(
            task_id=None,
            document_id=document_id,
            content=content,
            trigger_source=trigger_source,
        )

        try:
            # Get config for settings
            config = await self.get_config(organization_id)

            # Generate AI suggestions
            suggestions = await self._generate_document_suggestions(
                document_id=document_id,
                user_id=user_id,
                organization_id=organization_id,
                focus_areas=focus_areas or (config.default_focus_areas if config else None),
            )

            # Limit suggestions if configured
            if config and suggestions:
                suggestions = suggestions[:config.max_suggestions_per_review]

            review_id = None

            # Create review if configured
            if config and config.auto_create_review and suggestions:
                # Create a review for this document
                from researchhub.models.review import Review

                review = Review(
                    document_id=document_id,
                    project_id=doc.project_id,
                    title=f"AI Review: {doc.title}",
                    description=f"Auto-generated review from {trigger_source.replace('_', ' ')}",
                    review_type="feedback",
                    status="pending",
                    priority="normal",
                    requested_by_id=user_id,
                    document_version=doc.version,
                )
                self.db.add(review)
                await self.db.commit()
                await self.db.refresh(review)

                review_id = review.id

                # Add suggestions as comments
                if suggestions:
                    await self.review_service.add_ai_suggestions(
                        review_id=review_id,
                        user_id=user_id,
                        suggestions=suggestions,
                    )

            # Update log
            await self.update_review_log(
                log_id=log.id,
                status="completed",
                suggestions_count=len(suggestions),
                review_id=review_id,
            )

            # Create notification for document owner if suggestions were generated
            if suggestions and doc.created_by_id:
                try:
                    await self.create_ai_suggestion_notification(
                        user_id=doc.created_by_id,
                        organization_id=organization_id,
                        document_title=doc.title,
                        suggestion_count=len(suggestions),
                        review_id=review_id,
                        document_id=document_id,
                    )
                except Exception as e:
                    # Don't fail the review if notification fails
                    logger.warning(
                        "ai_suggestion_notification_failed",
                        document_id=str(document_id),
                        error=str(e),
                    )

            return {
                "review_id": str(review_id) if review_id else None,
                "suggestion_count": len(suggestions),
            }

        except Exception as e:
            logger.error(
                "auto_review_document_failed",
                document_id=str(document_id),
                error=str(e),
            )
            await self.update_review_log(
                log_id=log.id,
                status="failed",
                error_message=str(e),
            )
            raise

    # =========================================================================
    # Configuration and Duplicate Detection
    # =========================================================================

    async def get_config(self, organization_id: UUID) -> AutoReviewConfig | None:
        """Get auto-review configuration for an organization.

        Args:
            organization_id: Organization to get config for

        Returns:
            Config or None if not configured
        """
        result = await self.db.execute(
            select(AutoReviewConfig).where(
                AutoReviewConfig.organization_id == organization_id
            )
        )
        return result.scalar_one_or_none()

    async def get_or_create_config(self, organization_id: UUID) -> AutoReviewConfig:
        """Get or create auto-review configuration for an organization.

        Args:
            organization_id: Organization to get/create config for

        Returns:
            Config instance
        """
        config = await self.get_config(organization_id)
        if config:
            return config

        # Create default config
        config = AutoReviewConfig(organization_id=organization_id)
        self.db.add(config)
        await self.db.commit()
        await self.db.refresh(config)
        return config

    async def should_auto_review(
        self,
        organization_id: UUID,
        trigger_source: str,
        task_id: UUID | None = None,
        document_id: UUID | None = None,
        content: str | None = None,
    ) -> tuple[bool, str | None]:
        """Check if auto-review should run based on config and deduplication.

        Args:
            organization_id: Organization to check
            trigger_source: What triggered this (document_create, task_submit_review, etc.)
            task_id: Optional task ID
            document_id: Optional document ID
            content: Content to check for duplicates

        Returns:
            Tuple of (should_run, reason_if_not)
        """
        # Get config
        config = await self.get_config(organization_id)
        if not config:
            # No config = use defaults (only on task_submit_review)
            if trigger_source != "task_submit_review":
                return False, "Auto-review not configured for this trigger"
        else:
            # Check if trigger is enabled
            trigger_enabled = {
                "document_create": config.on_document_create,
                "document_update": config.on_document_update,
                "task_submit_review": config.on_task_submit_review,
                "manual": True,  # Manual always allowed
            }
            if not trigger_enabled.get(trigger_source, False):
                return False, f"Auto-review not enabled for {trigger_source}"

            # Check content length
            if content and len(content.strip()) < config.min_document_length:
                return False, f"Content too short (min: {config.min_document_length} chars)"

        # Check for duplicate content
        if content:
            content_hash = self._generate_content_hash(content)
            cooldown_hours = config.review_cooldown_hours if config else 24

            is_duplicate = await self._is_duplicate_content(
                content_hash=content_hash,
                task_id=task_id,
                document_id=document_id,
                cooldown_hours=cooldown_hours,
            )
            if is_duplicate:
                return False, "Content already reviewed recently"

        return True, None

    async def _is_duplicate_content(
        self,
        content_hash: str,
        task_id: UUID | None,
        document_id: UUID | None,
        cooldown_hours: int,
    ) -> bool:
        """Check if this content was recently reviewed.

        Args:
            content_hash: Hash of content
            task_id: Optional task ID
            document_id: Optional document ID
            cooldown_hours: Hours to wait before re-reviewing

        Returns:
            True if duplicate (should skip), False otherwise
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=cooldown_hours)

        result = await self.db.execute(
            select(AutoReviewLog).where(
                and_(
                    AutoReviewLog.content_hash == content_hash,
                    AutoReviewLog.created_at >= cutoff,
                    AutoReviewLog.status == "completed",
                )
            ).limit(1)
        )
        existing = result.scalar_one_or_none()
        return existing is not None

    def _generate_content_hash(self, content: str) -> str:
        """Generate a hash of content for duplicate detection.

        Args:
            content: Text content

        Returns:
            SHA256 hash (first 64 chars)
        """
        # Normalize content (lowercase, strip whitespace)
        normalized = " ".join(content.lower().split())
        return hashlib.sha256(normalized.encode()).hexdigest()

    async def create_review_log(
        self,
        task_id: UUID | None,
        document_id: UUID | None,
        content: str,
        trigger_source: str,
        review_id: UUID | None = None,
    ) -> AutoReviewLog:
        """Create an auto-review log entry.

        Args:
            task_id: Task being reviewed
            document_id: Document being reviewed
            content: Content being reviewed
            trigger_source: What triggered this
            review_id: Optional review created

        Returns:
            Created log entry
        """
        log = AutoReviewLog(
            task_id=task_id,
            document_id=document_id,
            content_hash=self._generate_content_hash(content),
            review_id=review_id,
            trigger_source=trigger_source,
            status="pending",
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(log)
        await self.db.commit()
        await self.db.refresh(log)
        return log

    async def update_review_log(
        self,
        log_id: UUID,
        status: str,
        suggestions_count: int = 0,
        error_message: str | None = None,
        review_id: UUID | None = None,
    ) -> None:
        """Update an auto-review log entry.

        Args:
            log_id: Log to update
            status: New status
            suggestions_count: Number of suggestions generated
            error_message: Error if failed
            review_id: Review ID if created
        """
        result = await self.db.execute(
            select(AutoReviewLog).where(AutoReviewLog.id == log_id)
        )
        log = result.scalar_one_or_none()
        if log:
            log.status = status
            log.suggestions_count = suggestions_count
            log.error_message = error_message
            if review_id:
                log.review_id = review_id
            if status in ("completed", "failed"):
                log.completed_at = datetime.now(timezone.utc)
            await self.db.commit()


    async def create_ai_suggestion_notification(
        self,
        user_id: UUID,
        organization_id: UUID,
        document_title: str,
        suggestion_count: int,
        review_id: UUID | None = None,
        document_id: UUID | None = None,
    ) -> None:
        """Create a notification for AI suggestions generated.

        Args:
            user_id: User to notify (document owner or reviewer)
            organization_id: Organization context
            document_title: Title of the reviewed document
            suggestion_count: Number of suggestions generated
            review_id: Optional review ID for navigation
            document_id: Optional document ID for navigation
        """
        # Build the target URL
        if review_id:
            target_url = f"/reviews/{review_id}"
        elif document_id:
            target_url = f"/documents/{document_id}"
        else:
            target_url = None

        notification = Notification(
            notification_type="ai_suggestion",
            title=f"AI Review: {suggestion_count} suggestion{'s' if suggestion_count != 1 else ''} for \"{document_title}\"",
            message=f"Our AI has analyzed your document and found {suggestion_count} area{'s' if suggestion_count != 1 else ''} that may benefit from your attention.",
            target_type="review" if review_id else "document",
            target_id=review_id or document_id,
            target_url=target_url,
            user_id=user_id,
            organization_id=organization_id,
            extra_data={
                "suggestion_count": suggestion_count,
                "document_title": document_title,
                "is_ai_generated": True,
            },
        )
        self.db.add(notification)
        await self.db.commit()
        logger.info(
            "ai_suggestion_notification_created",
            user_id=str(user_id),
            suggestion_count=suggestion_count,
        )


def get_auto_review_service(db: AsyncSession) -> AutoReviewService:
    """Factory function to create an AutoReviewService instance."""
    return AutoReviewService(db)
