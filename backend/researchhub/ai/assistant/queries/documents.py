"""Document query tools for the AI Assistant."""

from typing import Any, Dict
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.queries.access import get_accessible_project_ids
from researchhub.ai.assistant.tools import QueryTool
from researchhub.models.document import Document


class GetDocumentsTool(QueryTool):
    """Get documents with optional filters."""

    @property
    def name(self) -> str:
        return "get_documents"

    @property
    def description(self) -> str:
        return "Get documents, optionally filtered by project, status, or type. Returns document titles, statuses, and metadata."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Filter by project ID",
                },
                "status": {
                    "type": "string",
                    "enum": ["draft", "in_review", "approved", "published"],
                    "description": "Filter by document status",
                },
                "document_type": {
                    "type": "string",
                    "enum": ["general", "protocol", "report"],
                    "description": "Filter by document type",
                },
                "limit": {
                    "type": "integer",
                    "default": 20,
                    "maximum": 50,
                    "description": "Maximum number of documents to return",
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
        """Execute the query and return documents."""
        project_id = input.get("project_id")
        status = input.get("status")
        document_type = input.get("document_type")
        limit = min(input.get("limit", 20), 50)

        # Get accessible project IDs for the user
        accessible_project_ids = await get_accessible_project_ids(db, user_id)

        if not accessible_project_ids:
            return {"documents": [], "count": 0}

        # Build query - filter by accessible projects
        # Exclude system docs (those are accessed via system_docs tools)
        query = (
            select(Document)
            .where(Document.project_id.in_(accessible_project_ids))
            .options(selectinload(Document.created_by))
            .where(Document.is_system == False)
        )

        if project_id:
            query = query.where(Document.project_id == UUID(project_id))

        if status:
            query = query.where(Document.status == status)

        if document_type:
            query = query.where(Document.document_type == document_type)

        query = query.order_by(Document.updated_at.desc()).limit(limit)

        result = await db.execute(query)
        documents = result.scalars().all()

        return {
            "documents": [
                {
                    "id": str(doc.id),
                    "title": doc.title,
                    "status": doc.status,
                    "document_type": doc.document_type,
                    "version": doc.version,
                    "word_count": doc.word_count,
                    "created_by": doc.created_by.display_name if doc.created_by else None,
                    "created_at": doc.created_at.isoformat(),
                    "updated_at": doc.updated_at.isoformat(),
                }
                for doc in documents
            ],
            "count": len(documents),
        }


class GetDocumentDetailsTool(QueryTool):
    """Get detailed information about a specific document."""

    @property
    def name(self) -> str:
        return "get_document_details"

    @property
    def description(self) -> str:
        return "Get detailed information about a specific document including content summary, linked tasks, and version history."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "document_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The ID of the document to get details for",
                },
            },
            "required": ["document_id"],
        }

    async def execute(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Execute the query and return document details."""
        document_id = UUID(input["document_id"])

        # Get accessible project IDs for the user
        accessible_project_ids = await get_accessible_project_ids(db, user_id)

        # Get document with relationships - verify user has access to the project
        query = (
            select(Document)
            .options(
                selectinload(Document.created_by),
                selectinload(Document.project),
            )
            .where(Document.id == document_id)
            .where(Document.project_id.in_(accessible_project_ids) if accessible_project_ids else False)
        )

        result = await db.execute(query)
        doc = result.scalar_one_or_none()

        if not doc:
            return {"error": "Document not found"}

        # Get content text preview (first 500 chars)
        content_preview = None
        if doc.content_text:
            content_preview = doc.content_text[:500] + "..." if len(doc.content_text) > 500 else doc.content_text

        return {
            "document": {
                "id": str(doc.id),
                "title": doc.title,
                "status": doc.status,
                "document_type": doc.document_type,
                "version": doc.version,
                "word_count": doc.word_count,
                "content_preview": content_preview,
                "allow_comments": doc.allow_comments,
                "allow_suggestions": doc.allow_suggestions,
                "created_at": doc.created_at.isoformat(),
                "updated_at": doc.updated_at.isoformat(),
            },
            "created_by": {
                "id": str(doc.created_by.id),
                "name": doc.created_by.display_name,
            } if doc.created_by else None,
            "project": {
                "id": str(doc.project.id),
                "name": doc.project.name,
            } if doc.project else None,
        }
