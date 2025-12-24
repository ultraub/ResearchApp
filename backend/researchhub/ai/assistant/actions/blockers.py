"""Blocker action tools for the AI Assistant."""

from typing import Any, Dict
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.tools import ActionTool
from researchhub.ai.assistant.schemas import ActionPreview, DiffEntry
from researchhub.models.project import Blocker
from researchhub.models.user import User


class CreateBlockerTool(ActionTool):
    """Create a new blocker for a project or task."""

    @property
    def name(self) -> str:
        return "create_blocker"

    @property
    def description(self) -> str:
        return "Create a new blocker (impediment) that is blocking work. Requires user approval before execution."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The project this blocker belongs to",
                },
                "title": {
                    "type": "string",
                    "description": "The blocker title",
                },
                "description": {
                    "type": "string",
                    "description": "Detailed description of the blocker",
                },
                "blocker_type": {
                    "type": "string",
                    "enum": ["technical", "resource", "dependency", "external", "process", "other"],
                    "default": "other",
                    "description": "Type of blocker",
                },
                "priority": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 5,
                    "default": 3,
                    "description": "Priority level (1-5, 5 being highest)",
                },
                "impact_level": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "critical"],
                    "default": "medium",
                    "description": "Impact level of the blocker",
                },
                "assignee_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "User ID responsible for resolving the blocker",
                },
                "due_date": {
                    "type": "string",
                    "format": "date",
                    "description": "Target resolution date in YYYY-MM-DD format",
                },
            },
            "required": ["project_id", "title"],
        }

    @property
    def entity_type(self) -> str:
        return "blocker"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of the blocker creation."""
        # For create, there's no old state
        old_state = None

        # Build new state
        new_state = {
            "title": input["title"],
            "description": input.get("description"),
            "blocker_type": input.get("blocker_type", "other"),
            "priority": input.get("priority", 3),
            "impact_level": input.get("impact_level", "medium"),
            "status": "open",
            "project_id": input["project_id"],
        }

        # Resolve assignee name if provided
        if input.get("assignee_id"):
            user_result = await db.execute(
                select(User).where(User.id == UUID(input["assignee_id"]))
            )
            user = user_result.scalar_one_or_none()
            new_state["assignee"] = user.display_name if user else "Unknown"
            new_state["assignee_id"] = input["assignee_id"]

        if input.get("due_date"):
            new_state["due_date"] = input["due_date"]

        # Build diff entries - only include fields with values for create
        diff = []
        for field, value in new_state.items():
            if field not in ["project_id", "assignee_id"] and value is not None:  # Skip IDs and null values
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
            description=f"Create blocker: {input['title']}",
        )


class ResolveBlockerTool(ActionTool):
    """Mark a blocker as resolved."""

    @property
    def name(self) -> str:
        return "resolve_blocker"

    @property
    def description(self) -> str:
        return "Mark a blocker as resolved with an optional resolution note. Requires user approval before execution."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "blocker_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The ID of the blocker to resolve",
                },
                "resolution_notes": {
                    "type": "string",
                    "description": "Notes on how the blocker was resolved",
                },
            },
            "required": ["blocker_id"],
        }

    @property
    def entity_type(self) -> str:
        return "blocker"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of blocker resolution."""
        blocker_id = UUID(input["blocker_id"])

        # Get current blocker state
        query = (
            select(Blocker)
            .options(selectinload(Blocker.assignee))
            .where(Blocker.id == blocker_id)
        )
        result = await db.execute(query)
        blocker = result.scalar_one_or_none()

        if not blocker:
            raise ValueError(f"Blocker {blocker_id} not found")

        old_state = {
            "status": blocker.status,
            "resolution_notes": blocker.resolution_notes,
            "resolved_at": blocker.resolved_at.isoformat() if blocker.resolved_at else None,
        }

        new_state = {
            "status": "resolved",
            "resolution_notes": input.get("resolution_notes"),
            "resolved_at": "now",  # Will be set to actual timestamp on execution
        }

        diff = [
            DiffEntry(
                field="status",
                old_value=blocker.status,
                new_value="resolved",
                change_type="modified",
            ),
        ]

        if input.get("resolution_notes"):
            diff.append(DiffEntry(
                field="resolution_notes",
                old_value=blocker.resolution_notes,
                new_value=input["resolution_notes"],
                change_type="added" if not blocker.resolution_notes else "modified",
            ))

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type=self.entity_type,
            entity_id=blocker_id,
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Resolve blocker: {blocker.title}",
        )
