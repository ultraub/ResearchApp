"""Blocker query tools for the AI Assistant."""

from typing import Any, Dict
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.tools import QueryTool
from researchhub.models.project import Blocker, BlockerLink


class GetBlockersTool(QueryTool):
    """Get blockers with optional filters."""

    @property
    def name(self) -> str:
        return "get_blockers"

    @property
    def description(self) -> str:
        return "Get blockers (impediments blocking work), optionally filtered by project or status. Returns blocker titles, statuses, priorities, and what they're blocking."

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
                    "enum": ["open", "in_progress", "resolved", "wont_fix"],
                    "description": "Filter by blocker status",
                },
                "limit": {
                    "type": "integer",
                    "default": 20,
                    "maximum": 50,
                    "description": "Maximum number of blockers to return",
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
        """Execute the query and return blockers."""
        project_id = input.get("project_id")
        status = input.get("status")
        limit = min(input.get("limit", 20), 50)

        # Build query
        query = (
            select(Blocker)
            .options(
                selectinload(Blocker.assignee),
                selectinload(Blocker.blocker_links),
            )
        )

        if project_id:
            query = query.where(Blocker.project_id == UUID(project_id))

        if status:
            query = query.where(Blocker.status == status)

        query = query.order_by(Blocker.priority.desc(), Blocker.created_at.desc()).limit(limit)

        result = await db.execute(query)
        blockers = result.scalars().all()

        return {
            "blockers": [
                {
                    "id": str(blocker.id),
                    "title": blocker.title,
                    "description": blocker.description,
                    "status": blocker.status,
                    "priority": blocker.priority,
                    "blocker_type": blocker.blocker_type,
                    "impact_level": blocker.impact_level,
                    "assignee": blocker.assignee.display_name if blocker.assignee else None,
                    "due_date": blocker.due_date.isoformat() if blocker.due_date else None,
                    "blocked_items_count": len(blocker.blocker_links) if blocker.blocker_links else 0,
                    "created_at": blocker.created_at.isoformat(),
                }
                for blocker in blockers
            ],
            "count": len(blockers),
        }
