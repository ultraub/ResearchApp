"""Search query tools for the AI Assistant."""

from typing import Any, Dict, List
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.ai.assistant.tools import QueryTool
from researchhub.models.project import Blocker, Project, Task
from researchhub.models.document import Document


class SearchContentTool(QueryTool):
    """Search across tasks, projects, documents, and blockers."""

    @property
    def name(self) -> str:
        return "search_content"

    @property
    def description(self) -> str:
        return "Search across tasks, projects, documents, and blockers by keyword. Returns matching items with their type and basic info."

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

        search_pattern = f"%{query_text}%"
        results: Dict[str, List[Dict[str, Any]]] = {}

        # Search tasks
        if "task" in entity_types:
            task_query = (
                select(Task)
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
                    "type": "task",
                }
                for task in tasks
            ]

        # Search projects
        if "project" in entity_types:
            project_query = (
                select(Project)
                .where(Project.organization_id == org_id)
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
                    "type": "project",
                }
                for project in projects
            ]

        # Search documents (excluding system docs - use search_system_docs for those)
        if "document" in entity_types:
            doc_query = (
                select(Document)
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
                    "type": "document",
                }
                for doc in documents
            ]

        # Search blockers
        if "blocker" in entity_types:
            blocker_query = (
                select(Blocker)
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
