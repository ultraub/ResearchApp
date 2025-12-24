"""Journal entry action tools for the AI Assistant."""

from datetime import date
from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.tools import ActionTool
from researchhub.ai.assistant.schemas import ActionPreview, DiffEntry
from researchhub.models.journal import JournalEntry, JournalEntryLink
from researchhub.models.project import Project
from researchhub.models.user import User


class CreateJournalEntryTool(ActionTool):
    """Create a new journal entry."""

    @property
    def name(self) -> str:
        return "create_journal_entry"

    @property
    def description(self) -> str:
        return """Create a new journal entry. Requires user approval before execution.

Journal entries support two scopes:
- personal: Personal reflection and notes (default)
- project: Shared lab notebook entries linked to a project

Entry types: observation, experiment, meeting, idea, reflection, protocol"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Entry title (optional but recommended)",
                },
                "content_text": {
                    "type": "string",
                    "description": "The journal entry content as plain text",
                },
                "entry_date": {
                    "type": "string",
                    "format": "date",
                    "description": "Date of the entry in YYYY-MM-DD format. Defaults to today.",
                },
                "scope": {
                    "type": "string",
                    "enum": ["personal", "project"],
                    "default": "personal",
                    "description": "Entry scope - personal journal or project lab notebook",
                },
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Project ID for project-scope entries (required if scope=project)",
                },
                "entry_type": {
                    "type": "string",
                    "enum": ["observation", "experiment", "meeting", "idea", "reflection", "protocol"],
                    "default": "observation",
                    "description": "Type of journal entry",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Tags for organizing the entry",
                },
                "mood": {
                    "type": "string",
                    "description": "Optional mood/status indicator",
                },
            },
            "required": ["content_text"],
        }

    @property
    def entity_type(self) -> str:
        return "journal_entry"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of the journal entry creation."""
        scope = input.get("scope", "personal")
        entry_date = input.get("entry_date", str(date.today()))

        new_state = {
            "title": input.get("title") or f"Entry for {entry_date}",
            "content_preview": input["content_text"][:200] + ("..." if len(input["content_text"]) > 200 else ""),
            "entry_date": entry_date,
            "scope": scope,
            "entry_type": input.get("entry_type", "observation"),
        }

        # Handle project resolution for project scope
        if scope == "project" and input.get("project_id"):
            project_result = await db.execute(
                select(Project).where(Project.id == UUID(input["project_id"]))
            )
            project = project_result.scalar_one_or_none()
            if project:
                new_state["project"] = project.name

        if input.get("tags"):
            new_state["tags"] = input["tags"]

        if input.get("mood"):
            new_state["mood"] = input["mood"]

        # Build diff entries
        diff = []
        for field, value in new_state.items():
            if value is not None:
                diff.append(DiffEntry(
                    field=field,
                    old_value=None,
                    new_value=value,
                    change_type="added",
                ))

        title_display = new_state.get("title", "Untitled")
        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type=self.entity_type,
            entity_id=None,
            old_state=None,
            new_state=new_state,
            diff=diff,
            description=f"Create journal entry: {title_display}",
        )


class UpdateJournalEntryTool(ActionTool):
    """Update an existing journal entry."""

    @property
    def name(self) -> str:
        return "update_journal_entry"

    @property
    def description(self) -> str:
        return """Update an existing journal entry's properties.

Use update_journal_entry when the user wants to:
- Change the title or content
- Update the entry date
- Change the entry type
- Modify tags or mood
- Pin or archive the entry"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "entry_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The journal entry to update",
                },
                "title": {
                    "type": "string",
                    "description": "New entry title",
                },
                "content_text": {
                    "type": "string",
                    "description": "New entry content as plain text",
                },
                "entry_date": {
                    "type": "string",
                    "format": "date",
                    "description": "New entry date in YYYY-MM-DD format",
                },
                "entry_type": {
                    "type": "string",
                    "enum": ["observation", "experiment", "meeting", "idea", "reflection", "protocol"],
                    "description": "New entry type",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "New tags for the entry",
                },
                "mood": {
                    "type": "string",
                    "description": "New mood/status indicator",
                },
                "is_pinned": {
                    "type": "boolean",
                    "description": "Whether to pin the entry",
                },
                "is_archived": {
                    "type": "boolean",
                    "description": "Whether to archive the entry",
                },
            },
            "required": ["entry_id"],
        }

    @property
    def entity_type(self) -> str:
        return "journal_entry"

    async def get_old_state(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
    ) -> Optional[Dict[str, Any]]:
        """Get the current state of the journal entry."""
        result = await db.execute(
            select(JournalEntry)
            .where(JournalEntry.id == UUID(input["entry_id"]))
            .options(selectinload(JournalEntry.project))
        )
        entry = result.scalar_one_or_none()
        if not entry:
            return None

        return {
            "title": entry.title,
            "content_preview": (entry.content_text[:200] + "...") if entry.content_text and len(entry.content_text) > 200 else entry.content_text,
            "entry_date": str(entry.entry_date),
            "entry_type": entry.entry_type,
            "tags": entry.tags,
            "mood": entry.mood,
            "is_pinned": entry.is_pinned,
            "is_archived": entry.is_archived,
        }

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of the journal entry update."""
        old_state = await self.get_old_state(input, db)
        if old_state is None:
            return ActionPreview(
                tool_name=self.name,
                tool_input=input,
                entity_type=self.entity_type,
                entity_id=input.get("entry_id"),
                old_state=None,
                new_state=None,
                diff=[],
                description="Journal entry not found",
            )

        # Calculate new state
        new_state = old_state.copy()
        fields_to_update = ["title", "entry_date", "entry_type", "tags", "mood", "is_pinned", "is_archived"]

        for field in fields_to_update:
            if field in input and input[field] is not None:
                new_state[field] = input[field]

        # Handle content separately (show preview)
        if input.get("content_text"):
            content = input["content_text"]
            new_state["content_preview"] = content[:200] + ("..." if len(content) > 200 else "")

        # Build diff
        diff = []
        for field in fields_to_update + ["content_preview"]:
            old_val = old_state.get(field)
            new_val = new_state.get(field)
            if old_val != new_val:
                diff.append(DiffEntry(
                    field=field,
                    old_value=old_val,
                    new_value=new_val,
                    change_type="modified",
                ))

        title = new_state.get("title") or "Untitled"
        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type=self.entity_type,
            entity_id=input["entry_id"],
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Update journal entry: {title}",
        )


class LinkJournalEntryTool(ActionTool):
    """Link a journal entry to other entities."""

    @property
    def name(self) -> str:
        return "link_journal_entry"

    @property
    def description(self) -> str:
        return """Link a journal entry to a project, task, or document.

Use this to create connections between journal entries and other work items.
Link types: reference, result, follow_up, related"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "entry_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The journal entry to link from",
                },
                "entity_type": {
                    "type": "string",
                    "enum": ["project", "task", "document"],
                    "description": "Type of entity to link to",
                },
                "entity_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "ID of the entity to link to",
                },
                "link_type": {
                    "type": "string",
                    "enum": ["reference", "result", "follow_up", "related"],
                    "default": "reference",
                    "description": "Type of link relationship",
                },
                "notes": {
                    "type": "string",
                    "description": "Optional notes about the link",
                },
            },
            "required": ["entry_id", "entity_type", "entity_id"],
        }

    @property
    def entity_type(self) -> str:
        return "journal_entry_link"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of linking the journal entry."""
        # Get journal entry
        entry_result = await db.execute(
            select(JournalEntry).where(JournalEntry.id == UUID(input["entry_id"]))
        )
        entry = entry_result.scalar_one_or_none()

        entry_title = entry.title if entry else "Unknown entry"

        # Get linked entity name
        entity_name = "Unknown"
        linked_type = input["entity_type"]
        linked_id = UUID(input["entity_id"])

        if linked_type == "project":
            result = await db.execute(select(Project).where(Project.id == linked_id))
            entity = result.scalar_one_or_none()
            if entity:
                entity_name = entity.name
        elif linked_type == "task":
            from researchhub.models.project import Task
            result = await db.execute(select(Task).where(Task.id == linked_id))
            entity = result.scalar_one_or_none()
            if entity:
                entity_name = entity.title
        elif linked_type == "document":
            from researchhub.models.document import Document
            result = await db.execute(select(Document).where(Document.id == linked_id))
            entity = result.scalar_one_or_none()
            if entity:
                entity_name = entity.title

        new_state = {
            "journal_entry": entry_title,
            "linked_to": f"{linked_type}: {entity_name}",
            "link_type": input.get("link_type", "reference"),
        }

        if input.get("notes"):
            new_state["notes"] = input["notes"]

        diff = []
        for field, value in new_state.items():
            if value is not None:
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
            old_state=None,
            new_state=new_state,
            diff=diff,
            description=f"Link '{entry_title}' to {linked_type}: {entity_name}",
        )
