"""Embedding service for generating and managing vector embeddings.

Supports both OpenAI and Azure OpenAI for generating embeddings
that enable semantic search across documents, tasks, and other entities.
"""

import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import structlog
from openai import AsyncAzureOpenAI, AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.config import get_settings
from researchhub.models.document import Document
from researchhub.models.journal import JournalEntry
from researchhub.models.knowledge import Paper
from researchhub.models.project import Project, Task

logger = structlog.get_logger()

# Entity type to model class mapping
EMBEDDABLE_ENTITIES = {
    "document": Document,
    "task": Task,
    "journal_entry": JournalEntry,
    "paper": Paper,
    "project": Project,
}


class EmbeddingService:
    """Service for generating and managing vector embeddings.

    Handles embedding generation using OpenAI or Azure OpenAI embedding APIs
    and provides utilities for extracting embeddable text from entities.

    Provider selection:
    - If AZURE_OPENAI_ENDPOINT is configured, uses Azure OpenAI
    - Otherwise, uses OpenAI directly (requires OPENAI_API_KEY)
    """

    def __init__(self, db: AsyncSession | None = None):
        """Initialize the embedding service.

        Args:
            db: Optional database session for entity operations.
        """
        self.db = db
        self.settings = get_settings()
        self._client: AsyncOpenAI | AsyncAzureOpenAI | None = None
        self._use_azure: bool | None = None

    @property
    def use_azure(self) -> bool:
        """Determine if Azure OpenAI should be used."""
        if self._use_azure is None:
            self._use_azure = bool(self.settings.azure_openai_endpoint)
        return self._use_azure

    @property
    def client(self) -> AsyncOpenAI | AsyncAzureOpenAI:
        """Lazy-initialize the OpenAI or Azure OpenAI client."""
        if self._client is None:
            if self.use_azure:
                # Use Azure OpenAI
                azure_endpoint = self.settings.azure_openai_endpoint
                azure_key = self.settings.azure_openai_api_key.get_secret_value()
                if not azure_endpoint or not azure_key:
                    raise ValueError(
                        "Azure OpenAI not fully configured. "
                        "Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY."
                    )
                self._client = AsyncAzureOpenAI(
                    azure_endpoint=azure_endpoint,
                    api_key=azure_key,
                    api_version="2024-02-01",  # Use a stable API version
                )
                logger.info("embedding_service_initialized", provider="azure_openai")
            else:
                # Use OpenAI directly
                api_key = self.settings.openai_api_key.get_secret_value()
                if not api_key:
                    raise ValueError(
                        "No embedding provider configured. "
                        "Set either AZURE_OPENAI_ENDPOINT or OPENAI_API_KEY."
                    )
                self._client = AsyncOpenAI(api_key=api_key)
                logger.info("embedding_service_initialized", provider="openai")
        return self._client

    @property
    def model_name(self) -> str:
        """Get the model/deployment name for embedding generation."""
        if self.use_azure:
            return self.settings.azure_embedding_deployment
        return self.settings.embedding_model

    async def generate_embedding(self, text: str) -> list[float]:
        """Generate an embedding vector for the given text.

        Args:
            text: The text to embed. Will be truncated if too long.

        Returns:
            A list of floats representing the embedding vector.

        Raises:
            ValueError: If embedding provider is not configured.
            Exception: If embedding generation fails.
        """
        # Truncate text if too long (OpenAI has ~8K token limit for embeddings)
        # Rough estimate: 4 chars per token, leave buffer
        max_chars = 30000
        if len(text) > max_chars:
            text = text[:max_chars]
            logger.warning(
                "embedding_text_truncated",
                original_length=len(text),
                truncated_to=max_chars,
            )

        try:
            # Azure OpenAI doesn't support dimensions parameter for all models
            if self.use_azure:
                response = await self.client.embeddings.create(
                    model=self.model_name,
                    input=text,
                )
            else:
                response = await self.client.embeddings.create(
                    model=self.model_name,
                    input=text,
                    dimensions=self.settings.embedding_dimensions,
                )
            return response.data[0].embedding
        except Exception as e:
            logger.error(
                "embedding_generation_failed",
                error=str(e),
                text_length=len(text),
                provider="azure" if self.use_azure else "openai",
            )
            raise

    async def generate_embeddings_batch(
        self, texts: list[str]
    ) -> list[list[float]]:
        """Generate embeddings for multiple texts in a single API call.

        More efficient than calling generate_embedding multiple times.

        Args:
            texts: List of texts to embed.

        Returns:
            List of embedding vectors in the same order as input texts.
        """
        if not texts:
            return []

        # Truncate each text
        max_chars = 30000
        truncated_texts = [t[:max_chars] if len(t) > max_chars else t for t in texts]

        try:
            # Azure OpenAI doesn't support dimensions parameter for all models
            if self.use_azure:
                response = await self.client.embeddings.create(
                    model=self.model_name,
                    input=truncated_texts,
                )
            else:
                response = await self.client.embeddings.create(
                    model=self.model_name,
                    input=truncated_texts,
                    dimensions=self.settings.embedding_dimensions,
                )
            # Sort by index to ensure correct order
            sorted_data = sorted(response.data, key=lambda x: x.index)
            return [item.embedding for item in sorted_data]
        except Exception as e:
            logger.error(
                "batch_embedding_generation_failed",
                error=str(e),
                batch_size=len(texts),
                provider="azure" if self.use_azure else "openai",
            )
            raise

    def extract_text_for_embedding(
        self, entity_type: str, entity: Any
    ) -> str | None:
        """Extract the text content from an entity for embedding.

        Different entity types have different fields that should be embedded.

        Args:
            entity_type: The type of entity ("document", "task", etc.)
            entity: The entity instance.

        Returns:
            The extracted text, or None if no embeddable content.
        """
        if entity_type == "document":
            return self._extract_document_text(entity)
        elif entity_type == "task":
            return self._extract_task_text(entity)
        elif entity_type == "journal_entry":
            return self._extract_journal_entry_text(entity)
        elif entity_type == "paper":
            return self._extract_paper_text(entity)
        elif entity_type == "project":
            return self._extract_project_text(entity)
        else:
            logger.warning(
                "unknown_entity_type_for_embedding",
                entity_type=entity_type,
            )
            return None

    def _extract_document_text(self, doc: Document) -> str | None:
        """Extract embeddable text from a Document."""
        parts = []

        if doc.title:
            parts.append(doc.title)

        # Use content_text if available (plain text extraction)
        if doc.content_text:
            parts.append(doc.content_text)
        elif doc.content:
            # Fall back to extracting from TipTap JSON
            extracted = self._extract_text_from_tiptap(doc.content)
            if extracted:
                parts.append(extracted)

        if not parts:
            return None

        return "\n\n".join(parts)

    def _extract_task_text(self, task: Task) -> str | None:
        """Extract embeddable text from a Task."""
        parts = []

        if task.title:
            parts.append(task.title)

        if task.description:
            # Description is TipTap JSON format
            extracted = self._extract_text_from_tiptap(task.description)
            if extracted:
                parts.append(extracted)

        if not parts:
            return None

        return "\n\n".join(parts)

    def _extract_journal_entry_text(self, entry: JournalEntry) -> str | None:
        """Extract embeddable text from a JournalEntry."""
        parts = []

        if entry.title:
            parts.append(entry.title)

        # Use content_text if available (plain text extraction)
        if entry.content_text:
            parts.append(entry.content_text)
        elif entry.content:
            # Fall back to extracting from TipTap JSON
            extracted = self._extract_text_from_tiptap(entry.content)
            if extracted:
                parts.append(extracted)

        # Include tags for context
        if entry.tags:
            parts.append(f"Tags: {', '.join(entry.tags)}")

        # Include entry type for context
        if entry.entry_type:
            parts.append(f"Type: {entry.entry_type}")

        if not parts:
            return None

        return "\n\n".join(parts)

    def _extract_paper_text(self, paper: Paper) -> str | None:
        """Extract embeddable text from a Paper."""
        parts = []

        if paper.title:
            parts.append(paper.title)

        if paper.authors:
            parts.append(f"Authors: {', '.join(paper.authors)}")

        if paper.abstract:
            parts.append(paper.abstract)

        # Include AI-generated summary if available
        if paper.ai_summary:
            parts.append(f"Summary: {paper.ai_summary}")

        # Include key findings
        if paper.ai_key_findings:
            parts.append(f"Key findings: {', '.join(paper.ai_key_findings)}")

        # Include keywords
        if paper.keywords:
            parts.append(f"Keywords: {', '.join(paper.keywords)}")

        # Include user notes
        if paper.notes:
            parts.append(f"Notes: {paper.notes}")

        # Include tags
        if paper.tags:
            parts.append(f"Tags: {', '.join(paper.tags)}")

        if not parts:
            return None

        return "\n\n".join(parts)

    def _extract_project_text(self, project: Project) -> str | None:
        """Extract embeddable text from a Project."""
        parts = []

        if project.name:
            parts.append(project.name)

        if project.description:
            parts.append(project.description)

        # Include project type for context
        if project.project_type and project.project_type != "general":
            parts.append(f"Type: {project.project_type}")

        if not parts:
            return None

        return "\n\n".join(parts)

    def _extract_text_from_tiptap(self, content: dict | None) -> str | None:
        """Extract plain text from TipTap JSON content.

        TipTap stores content as a JSON document with nested nodes.
        This recursively extracts all text content.
        """
        if not content:
            return None

        def extract_text(node: dict) -> str:
            """Recursively extract text from a TipTap node."""
            if not isinstance(node, dict):
                return ""

            result = []

            # Get text from text nodes
            if node.get("type") == "text":
                text = node.get("text", "")
                result.append(text)

            # Recursively process child nodes
            content = node.get("content", [])
            if isinstance(content, list):
                for child in content:
                    result.append(extract_text(child))

            return " ".join(filter(None, result))

        text = extract_text(content)
        # Clean up extra whitespace
        text = re.sub(r"\s+", " ", text).strip()
        return text if text else None

    async def embed_entity(
        self,
        entity_type: str,
        entity_id: UUID,
    ) -> bool:
        """Generate and store embedding for a specific entity.

        Args:
            entity_type: The type of entity ("document", "task", etc.)
            entity_id: The UUID of the entity.

        Returns:
            True if embedding was generated and stored, False otherwise.
        """
        if self.db is None:
            raise ValueError("Database session required for embed_entity")

        model_class = EMBEDDABLE_ENTITIES.get(entity_type)
        if not model_class:
            logger.warning(
                "unsupported_entity_type_for_embedding",
                entity_type=entity_type,
            )
            return False

        # Fetch entity
        result = await self.db.execute(
            select(model_class).where(model_class.id == entity_id)
        )
        entity = result.scalar_one_or_none()

        if not entity:
            logger.warning(
                "entity_not_found_for_embedding",
                entity_type=entity_type,
                entity_id=str(entity_id),
            )
            return False

        # Extract text
        text = self.extract_text_for_embedding(entity_type, entity)
        if not text:
            logger.info(
                "no_embeddable_content",
                entity_type=entity_type,
                entity_id=str(entity_id),
            )
            return False

        # Generate embedding
        try:
            embedding = await self.generate_embedding(text)
        except Exception as e:
            logger.error(
                "failed_to_generate_embedding",
                entity_type=entity_type,
                entity_id=str(entity_id),
                error=str(e),
            )
            return False

        # Store embedding
        entity.embedding = embedding
        entity.embedding_model = self.settings.embedding_model
        entity.embedded_at = datetime.now(timezone.utc)

        await self.db.commit()

        logger.info(
            "embedding_generated",
            entity_type=entity_type,
            entity_id=str(entity_id),
            embedding_model=self.settings.embedding_model,
        )

        return True

    async def embed_entities_batch(
        self,
        entity_type: str,
        entity_ids: list[UUID],
    ) -> dict[str, int]:
        """Generate embeddings for multiple entities of the same type.

        More efficient than calling embed_entity multiple times.

        Args:
            entity_type: The type of entities.
            entity_ids: List of entity UUIDs.

        Returns:
            Dict with counts: {"success": N, "skipped": M, "failed": K}
        """
        if self.db is None:
            raise ValueError("Database session required for embed_entities_batch")

        model_class = EMBEDDABLE_ENTITIES.get(entity_type)
        if not model_class:
            return {"success": 0, "skipped": 0, "failed": len(entity_ids)}

        # Fetch all entities
        result = await self.db.execute(
            select(model_class).where(model_class.id.in_(entity_ids))
        )
        entities = {e.id: e for e in result.scalars().all()}

        # Extract texts and track which entities have content
        texts = []
        entities_with_text = []
        skipped = 0

        for entity_id in entity_ids:
            entity = entities.get(entity_id)
            if not entity:
                skipped += 1
                continue

            text = self.extract_text_for_embedding(entity_type, entity)
            if text:
                texts.append(text)
                entities_with_text.append(entity)
            else:
                skipped += 1

        if not texts:
            return {"success": 0, "skipped": skipped, "failed": 0}

        # Generate embeddings in batch
        try:
            embeddings = await self.generate_embeddings_batch(texts)
        except Exception as e:
            logger.error(
                "batch_embedding_failed",
                entity_type=entity_type,
                batch_size=len(texts),
                error=str(e),
            )
            return {"success": 0, "skipped": skipped, "failed": len(texts)}

        # Store embeddings
        now = datetime.now(timezone.utc)
        for entity, embedding in zip(entities_with_text, embeddings):
            entity.embedding = embedding
            entity.embedding_model = self.settings.embedding_model
            entity.embedded_at = now

        await self.db.commit()

        logger.info(
            "batch_embeddings_generated",
            entity_type=entity_type,
            count=len(embeddings),
        )

        return {"success": len(embeddings), "skipped": skipped, "failed": 0}


def get_embedding_service(db: AsyncSession | None = None) -> EmbeddingService:
    """Factory function to get an EmbeddingService instance."""
    return EmbeddingService(db)
