"""Comment action tools for the AI Assistant."""

from typing import Any, Dict
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.ai.assistant.tools import ActionTool
from researchhub.ai.assistant.schemas import ActionPreview, DiffEntry
from researchhub.models.project import Task, TaskComment
from researchhub.models.document import Document


class AddCommentTool(ActionTool):
    """Add a comment to a task or document."""

    @property
    def name(self) -> str:
        return "add_comment"

    @property
    def description(self) -> str:
        return "Add a comment to a task or document. Requires user approval before execution."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "entity_type": {
                    "type": "string",
                    "enum": ["task", "document"],
                    "description": "Type of entity to comment on",
                },
                "entity_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The ID of the task or document to comment on",
                },
                "content": {
                    "type": "string",
                    "description": "The comment content (markdown supported)",
                },
                "mention_ids": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "format": "uuid",
                    },
                    "description": "User IDs to mention in the comment",
                },
            },
            "required": ["entity_type", "entity_id", "content"],
        }

    @property
    def entity_type(self) -> str:
        return "comment"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of the comment addition."""
        target_type = input["entity_type"]
        target_id = UUID(input["entity_id"])
        content = input["content"]

        # Validate the target entity exists and get its title
        target_title = None
        if target_type == "task":
            result = await db.execute(
                select(Task).where(Task.id == target_id)
            )
            entity = result.scalar_one_or_none()
            if not entity:
                raise ValueError(f"Task {target_id} not found")
            target_title = entity.title
        elif target_type == "document":
            result = await db.execute(
                select(Document).where(Document.id == target_id)
            )
            entity = result.scalar_one_or_none()
            if not entity:
                raise ValueError(f"Document {target_id} not found")
            target_title = entity.title
        else:
            raise ValueError(f"Invalid entity type: {target_type}")

        # For comments, there's no old state
        old_state = None

        # Show preview of content
        content_preview = content[:300] + "..." if len(content) > 300 else content

        new_state = {
            "target_type": target_type,
            "target": target_title,
            "content": content_preview,
        }

        if input.get("mention_ids"):
            new_state["mentions_count"] = len(input["mention_ids"])

        diff = [
            DiffEntry(
                field="comment",
                old_value=None,
                new_value=content_preview,
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
            description=f"Add comment to {target_type}: {target_title}",
        )
