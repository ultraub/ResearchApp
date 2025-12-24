"""System documentation query tools for the AI Assistant."""

from typing import Any, Dict, List
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.ai.assistant.tools import QueryTool
from researchhub.models.document import Document


class ListSystemDocsTool(QueryTool):
    """List available system documentation."""

    @property
    def name(self) -> str:
        return "list_system_docs"

    @property
    def description(self) -> str:
        return "List all available system documentation. Use this to discover what documentation exists about the system architecture, data models, and features."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "document_type": {
                    "type": "string",
                    "description": "Filter by document type (e.g., 'architecture', 'data_model', 'guide')",
                },
            },
        }

    async def execute(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """List system documentation."""
        document_type = input.get("document_type")

        query = select(Document).where(Document.is_system == True)

        if document_type:
            query = query.where(Document.document_type == document_type)

        query = query.order_by(Document.title)

        result = await db.execute(query)
        docs = result.scalars().all()

        return {
            "documents": [
                {
                    "id": str(doc.id),
                    "title": doc.title,
                    "document_type": doc.document_type,
                    "tags": doc.tags,
                    "word_count": doc.word_count,
                }
                for doc in docs
            ],
            "count": len(docs),
        }


class SearchSystemDocsTool(QueryTool):
    """Search within system documentation."""

    @property
    def name(self) -> str:
        return "search_system_docs"

    @property
    def description(self) -> str:
        return "Search system documentation by keyword. Use this to find information about how the system works, its architecture, data models, or features."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query/keywords to find in documentation",
                },
                "limit": {
                    "type": "integer",
                    "default": 5,
                    "maximum": 10,
                    "description": "Maximum number of results",
                },
            },
            "required": ["query"],
        }

    async def execute(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Search system documentation."""
        query_text = input["query"]
        limit = min(input.get("limit", 5), 10)

        search_pattern = f"%{query_text}%"

        query = (
            select(Document)
            .where(Document.is_system == True)
            .where(
                or_(
                    Document.title.ilike(search_pattern),
                    Document.content_text.ilike(search_pattern),
                )
            )
            .limit(limit)
        )

        result = await db.execute(query)
        docs = result.scalars().all()

        return {
            "query": query_text,
            "results": [
                {
                    "id": str(doc.id),
                    "title": doc.title,
                    "document_type": doc.document_type,
                    "excerpt": self._get_excerpt(doc.content_text, query_text) if doc.content_text else None,
                }
                for doc in docs
            ],
            "count": len(docs),
        }

    def _get_excerpt(self, text: str, query: str, context_chars: int = 200) -> str:
        """Get an excerpt around the query match."""
        lower_text = text.lower()
        lower_query = query.lower()

        pos = lower_text.find(lower_query)
        if pos == -1:
            # Return start of text if no match
            return text[:context_chars * 2] + "..." if len(text) > context_chars * 2 else text

        start = max(0, pos - context_chars)
        end = min(len(text), pos + len(query) + context_chars)

        excerpt = text[start:end]
        if start > 0:
            excerpt = "..." + excerpt
        if end < len(text):
            excerpt = excerpt + "..."

        return excerpt


class ReadSystemDocTool(QueryTool):
    """Read a specific system documentation file."""

    @property
    def name(self) -> str:
        return "read_system_doc"

    @property
    def description(self) -> str:
        return "Read the full content of a system documentation document. Use this when you need detailed information from a specific doc."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "document_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The ID of the document to read",
                },
                "title": {
                    "type": "string",
                    "description": "Alternatively, find by title (partial match)",
                },
            },
        }

    async def execute(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Read a system document."""
        document_id = input.get("document_id")
        title = input.get("title")

        if not document_id and not title:
            return {"error": "Must provide either document_id or title"}

        query = select(Document).where(Document.is_system == True)

        if document_id:
            query = query.where(Document.id == UUID(document_id))
        elif title:
            query = query.where(Document.title.ilike(f"%{title}%"))

        result = await db.execute(query)
        doc = result.scalars().first()

        if not doc:
            return {"error": "Document not found"}

        return {
            "id": str(doc.id),
            "title": doc.title,
            "document_type": doc.document_type,
            "content": doc.content_text,
            "tags": doc.tags,
            "word_count": doc.word_count,
        }
