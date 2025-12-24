"""Document action tools for the AI Assistant."""

from typing import Any, Dict
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.tools import ActionTool
from researchhub.ai.assistant.schemas import ActionPreview, DiffEntry
from researchhub.models.document import Document
from researchhub.models.project import Task


class CreateDocumentTool(ActionTool):
    """Create a new document in a project."""

    @property
    def name(self) -> str:
        return "create_document"

    @property
    def description(self) -> str:
        return "Create a new document in a project. Requires user approval before execution."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The project to create the document in",
                },
                "title": {
                    "type": "string",
                    "description": "The document title",
                },
                "document_type": {
                    "type": "string",
                    "enum": ["general", "protocol", "report"],
                    "default": "general",
                    "description": "Type of document",
                },
                "content": {
                    "type": "string",
                    "description": "Initial document content (markdown supported)",
                },
                "status": {
                    "type": "string",
                    "enum": ["draft", "in_review", "approved", "published"],
                    "default": "draft",
                    "description": "Initial document status",
                },
            },
            "required": ["project_id", "title"],
        }

    @property
    def entity_type(self) -> str:
        return "document"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of the document creation."""
        # For create, there's no old state
        old_state = None

        # Build new state
        new_state = {
            "title": input["title"],
            "document_type": input.get("document_type", "general"),
            "status": input.get("status", "draft"),
            "project_id": input["project_id"],
        }

        if input.get("content"):
            # Show preview of content (first 200 chars)
            content = input["content"]
            new_state["content_preview"] = content[:200] + "..." if len(content) > 200 else content

        # Build diff entries - only include fields with values for create
        diff = []
        for field, value in new_state.items():
            if field != "project_id" and value is not None:  # Skip IDs and null values
                diff.append(DiffEntry(
                    field=field,
                    old_value=None,
                    new_value=value,
                    change_type="added",
                ))

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type=self.entity_type,
            entity_id=None,
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Create document: {input['title']}",
        )


class UpdateDocumentTool(ActionTool):
    """Update an existing document's metadata or content."""

    @property
    def name(self) -> str:
        return "update_document"

    @property
    def description(self) -> str:
        return "Update a document's title, status, or content. Requires user approval before execution."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "document_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The ID of the document to update",
                },
                "title": {
                    "type": "string",
                    "description": "New document title",
                },
                "status": {
                    "type": "string",
                    "enum": ["draft", "in_review", "approved", "published"],
                    "description": "New document status",
                },
                "content": {
                    "type": "string",
                    "description": "New document content (replaces existing)",
                },
            },
            "required": ["document_id"],
        }

    @property
    def entity_type(self) -> str:
        return "document"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of the document update."""
        document_id = UUID(input["document_id"])

        # Get current document state
        query = select(Document).where(Document.id == document_id)
        result = await db.execute(query)
        doc = result.scalar_one_or_none()

        if not doc:
            raise ValueError(f"Document {document_id} not found")

        # Build old state
        old_state = {
            "title": doc.title,
            "status": doc.status,
        }
        if doc.content_text:
            old_state["content_preview"] = doc.content_text[:200] + "..." if len(doc.content_text) > 200 else doc.content_text

        # Build new state
        new_state = old_state.copy()
        diff = []

        if "title" in input and input["title"] is not None:
            if old_state["title"] != input["title"]:
                new_state["title"] = input["title"]
                diff.append(DiffEntry(
                    field="title",
                    old_value=old_state["title"],
                    new_value=input["title"],
                    change_type="modified",
                ))

        if "status" in input and input["status"] is not None:
            if old_state["status"] != input["status"]:
                new_state["status"] = input["status"]
                diff.append(DiffEntry(
                    field="status",
                    old_value=old_state["status"],
                    new_value=input["status"],
                    change_type="modified",
                ))

        if "content" in input and input["content"] is not None:
            content = input["content"]
            new_preview = content[:200] + "..." if len(content) > 200 else content
            new_state["content_preview"] = new_preview
            diff.append(DiffEntry(
                field="content",
                old_value=old_state.get("content_preview"),
                new_value=new_preview,
                change_type="modified",
            ))

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type=self.entity_type,
            entity_id=document_id,
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Update document: {doc.title}",
        )


class LinkDocumentToTaskTool(ActionTool):
    """Link a document to a task as a deliverable or reference."""

    @property
    def name(self) -> str:
        return "link_document_to_task"

    @property
    def description(self) -> str:
        return "Link a document to a task as a deliverable or reference. Requires user approval before execution."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "document_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The ID of the document to link",
                },
                "task_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The ID of the task to link to",
                },
                "link_type": {
                    "type": "string",
                    "enum": ["deliverable", "reference", "related"],
                    "default": "related",
                    "description": "Type of relationship between document and task",
                },
            },
            "required": ["document_id", "task_id"],
        }

    @property
    def entity_type(self) -> str:
        return "document_link"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of the document-task link."""
        document_id = UUID(input["document_id"])
        task_id = UUID(input["task_id"])

        # Get document
        doc_result = await db.execute(
            select(Document).where(Document.id == document_id)
        )
        doc = doc_result.scalar_one_or_none()

        if not doc:
            raise ValueError(f"Document {document_id} not found")

        # Get task
        task_result = await db.execute(
            select(Task).where(Task.id == task_id)
        )
        task = task_result.scalar_one_or_none()

        if not task:
            raise ValueError(f"Task {task_id} not found")

        # For links, there's no old state
        old_state = None

        new_state = {
            "document": doc.title,
            "task": task.title,
            "link_type": input.get("link_type", "related"),
        }

        diff = [
            DiffEntry(
                field="link",
                old_value=None,
                new_value=f"{doc.title} → {task.title} ({input.get('link_type', 'related')})",
                change_type="added",
            ),
        ]

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type=self.entity_type,
            entity_id=None,
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Link document '{doc.title}' to task '{task.title}'",
        )
