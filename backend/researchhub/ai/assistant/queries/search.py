"""Search query tools for the AI Assistant."""

from typing import Any, Dict, List
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.queries.access import get_accessible_project_ids
from researchhub.ai.assistant.tools import QueryTool
from researchhub.models.project import Blocker, Project, Task
from researchhub.models.document import Document
from researchhub.models.organization import Team


class SearchContentTool(QueryTool):
    """Search across tasks, projects, documents, and blockers."""

    @property
    def name(self) -> str:
        return "search_content"

    @property
    def description(self) -> str:
        return "Search across tasks, projects, documents, and blockers by keyword. Use this to find entities when you only have a name or partial match. Returns IDs and context (project name, assignee, etc.) for disambiguation."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query/keywords to search for",
                },
                "entity_types": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["task", "project", "document", "blocker"],
                    },
                    "description": "Filter to specific entity types. If not provided, searches all types.",
                },
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Limit search to a specific project",
                },
                "limit": {
                    "type": "integer",
                    "default": 10,
                    "maximum": 30,
                    "description": "Maximum number of results per entity type",
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
        """Execute the search and return results."""
        query_text = input["query"]
        entity_types = input.get("entity_types", ["task", "project", "document", "blocker"])
        project_id = input.get("project_id")
        limit = min(input.get("limit", 10), 30)

        # Get accessible project IDs for the user
        accessible_project_ids = await get_accessible_project_ids(db, user_id)

        if not accessible_project_ids:
            return {
                "query": query_text,
                "results": {},
                "total_count": 0,
            }

        search_pattern = f"%{query_text}%"
        results: Dict[str, List[Dict[str, Any]]] = {}

        # Search tasks - include project and assignee for disambiguation
        if "task" in entity_types:
            task_query = (
                select(Task)
                .options(
                    selectinload(Task.project),
                    selectinload(Task.assignee),
                )
                .where(Task.project_id.in_(accessible_project_ids))
                .where(
                    or_(
                        Task.title.ilike(search_pattern),
                        Task.description.cast(str).ilike(search_pattern),
                    )
                )
            )
            if project_id:
                task_query = task_query.where(Task.project_id == UUID(project_id))

            task_query = task_query.limit(limit)
            task_result = await db.execute(task_query)
            tasks = task_result.scalars().all()

            results["tasks"] = [
                {
                    "id": str(task.id),
                    "title": task.title,
                    "status": task.status,
                    "priority": task.priority,
                    "project_name": task.project.name if task.project else None,
                    "assignee": task.assignee.display_name if task.assignee else None,
                    "due_date": task.due_date.isoformat() if task.due_date else None,
                    "type": "task",
                }
                for task in tasks
            ]

        # Search projects - include team for context
        if "project" in entity_types:
            project_query = (
                select(Project)
                .options(selectinload(Project.team))
                .where(Project.id.in_(accessible_project_ids))
                .where(
                    or_(
                        Project.name.ilike(search_pattern),
                        Project.description.ilike(search_pattern),
                    )
                )
                .limit(limit)
            )
            project_result = await db.execute(project_query)
            projects = project_result.scalars().all()

            results["projects"] = [
                {
                    "id": str(project.id),
                    "name": project.name,
                    "status": project.status,
                    "emoji": project.emoji,
                    "team_name": project.team.name if project.team else None,
                    "type": "project",
                }
                for project in projects
            ]

        # Search documents - include project for context
        # (excluding system docs - use search_system_docs for those)
        if "document" in entity_types:
            doc_query = (
                select(Document)
                .options(selectinload(Document.project))
                .where(Document.project_id.in_(accessible_project_ids))
                .where(Document.is_system == False)
                .where(
                    or_(
                        Document.title.ilike(search_pattern),
                        Document.content_text.ilike(search_pattern),
                    )
                )
            )
            if project_id:
                doc_query = doc_query.where(Document.project_id == UUID(project_id))

            doc_query = doc_query.limit(limit)
            doc_result = await db.execute(doc_query)
            documents = doc_result.scalars().all()

            results["documents"] = [
                {
                    "id": str(doc.id),
                    "title": doc.title,
                    "status": doc.status,
                    "document_type": doc.document_type,
                    "project_name": doc.project.name if doc.project else None,
                    "type": "document",
                }
                for doc in documents
            ]

        # Search blockers - include project and blocked item count for context
        if "blocker" in entity_types:
            blocker_query = (
                select(Blocker)
                .options(
                    selectinload(Blocker.project),
                    selectinload(Blocker.blocker_links),
                )
                .where(Blocker.project_id.in_(accessible_project_ids))
                .where(
                    or_(
                        Blocker.title.ilike(search_pattern),
                        Blocker.description.ilike(search_pattern),
                    )
                )
            )
            if project_id:
                blocker_query = blocker_query.where(Blocker.project_id == UUID(project_id))

            blocker_query = blocker_query.limit(limit)
            blocker_result = await db.execute(blocker_query)
            blockers = blocker_result.scalars().all()

            results["blockers"] = [
                {
                    "id": str(blocker.id),
                    "title": blocker.title,
                    "status": blocker.status,
                    "priority": blocker.priority,
                    "project_name": blocker.project.name if blocker.project else None,
                    "blocked_items_count": len(blocker.blocker_links) if blocker.blocker_links else 0,
                    "type": "blocker",
                }
                for blocker in blockers
            ]

        total_count = sum(len(items) for items in results.values())

        return {
            "query": query_text,
            "results": results,
            "total_count": total_count,
        }
