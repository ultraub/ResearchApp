"""Unified query tools for the AI Assistant.

Consolidates multiple similar tools into unified tools with entity_type parameter.
This reduces tool count from 38 to ~12, improving LLM tool selection accuracy.

Based on research showing optimal performance at 15-20 tools:
- LongFuncEval 2025: 7-85% performance drop as tool count increases
- "Less is More" paper: Reducing tools improves function-calling performance
"""

import re
from datetime import date
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import Text, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.queries.access import get_accessible_project_ids
from researchhub.ai.assistant.tools import QueryTool
from researchhub.models.document import Document
from researchhub.models.journal import JournalEntry
from researchhub.models.organization import OrganizationMember, Team, TeamMember
from researchhub.models.project import (
    Blocker,
    BlockerLink,
    Project,
    ProjectExclusion,
    ProjectMember,
    ProjectTeam,
    Task,
    TaskAssignment,
    TaskComment,
)
from researchhub.models.user import User
from researchhub.services.embedding import get_embedding_service


# Regex patterns to detect technical terms that benefit from hybrid search
TECHNICAL_TERM_PATTERNS = [
    r'\b[A-Z]{2,}\b',  # Acronyms like FHIR, API, UUID
    r'\b[A-Z][a-z]+[A-Z]\w*\b',  # CamelCase like JavaScript, PostgreSQL
    r'\b\d+\.\d+\b',  # Version numbers like 3.14, 2.0
    r'\b[a-z]+_[a-z]+\b',  # snake_case identifiers
    r'\b[a-z]+-[a-z]+\b',  # kebab-case identifiers
]


def _detect_search_method(query: str) -> str:
    """Detect optimal search method based on query content.

    Returns 'hybrid' for technical terms/acronyms, 'semantic' for concepts.
    """
    for pattern in TECHNICAL_TERM_PATTERNS:
        if re.search(pattern, query):
            return "hybrid"
    return "semantic"


class UnifiedSearchTool(QueryTool):
    """Unified search across all content types.

    Combines: search_content, semantic_search, hybrid_search

    Automatically selects optimal search method:
    - Technical terms, acronyms, codes → hybrid (semantic + keyword)
    - Conceptual queries → semantic
    - Exact phrases → keyword
    """

    @property
    def name(self) -> str:
        return "search"

    @property
    def description(self) -> str:
        return """Search across projects, tasks, documents, and blockers.

Automatically uses the best search method:
- Technical terms (FHIR, API, etc.) → hybrid search
- Conceptual queries → semantic search
- You can override with the 'method' parameter

Use this for finding anything by name, concept, or keyword."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "What to search for. Be descriptive for better results.",
                },
                "entity_types": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["project", "task", "document", "blocker"],
                    },
                    "description": "Entity types to search. Default: all types.",
                },
                "filters": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "description": "Filter by status (e.g., 'active', 'done', 'in_progress')",
                        },
                        "priority": {
                            "type": "string",
                            "enum": ["low", "medium", "high", "urgent", "critical"],
                            "description": "Filter by priority level",
                        },
                        "project_id": {
                            "type": "string",
                            "format": "uuid",
                            "description": "Limit to specific project",
                        },
                        "assignee_id": {
                            "type": "string",
                            "format": "uuid",
                            "description": "Filter by assignee",
                        },
                    },
                },
                "method": {
                    "type": "string",
                    "enum": ["auto", "keyword", "semantic", "hybrid"],
                    "default": "auto",
                    "description": "Search method. 'auto' detects based on query content.",
                },
                "limit": {
                    "type": "integer",
                    "default": 10,
                    "maximum": 30,
                    "description": "Maximum results to return",
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
        """Execute search using optimal method."""
        query_text = input["query"]
        entity_types = input.get("entity_types", ["project", "task", "document", "blocker"])
        filters = input.get("filters", {})
        method = input.get("method", "auto")
        limit = min(input.get("limit", 10), 30)

        # Auto-detect search method
        if method == "auto":
            method = _detect_search_method(query_text)

        # Get accessible project IDs
        accessible_project_ids = await get_accessible_project_ids(db, user_id)
        if not accessible_project_ids:
            return {"query": query_text, "method": method, "results": {}, "total_count": 0}

        project_id = filters.get("project_id")
        if project_id:
            project_id = UUID(project_id) if isinstance(project_id, str) else project_id
            if project_id not in accessible_project_ids:
                return {"error": "Project not accessible", "results": {}, "total_count": 0}

        results: Dict[str, List[Dict[str, Any]]] = {}

        # Execute search based on method
        if method == "keyword":
            results = await self._keyword_search(
                db, query_text, entity_types, accessible_project_ids, project_id, filters, limit
            )
        elif method == "semantic":
            results = await self._semantic_search(
                db, query_text, entity_types, accessible_project_ids, project_id, filters, limit
            )
        else:  # hybrid
            results = await self._hybrid_search(
                db, query_text, entity_types, accessible_project_ids, project_id, filters, limit
            )

        total_count = sum(len(items) for items in results.values())
        return {
            "query": query_text,
            "method": method,
            "results": results,
            "total_count": total_count,
        }

    async def _keyword_search(
        self,
        db: AsyncSession,
        query_text: str,
        entity_types: List[str],
        accessible_project_ids: List[UUID],
        project_id: Optional[UUID],
        filters: Dict[str, Any],
        limit: int,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Keyword-based search using ILIKE."""
        results: Dict[str, List[Dict[str, Any]]] = {}
        search_pattern = f"%{query_text}%"

        if "task" in entity_types:
            query = (
                select(Task)
                .options(selectinload(Task.project), selectinload(Task.assignee))
                .where(Task.project_id.in_(accessible_project_ids))
                .where(
                    or_(
                        Task.title.ilike(search_pattern),
                        Task.description.cast(Text).ilike(search_pattern),
                    )
                )
            )
            if project_id:
                query = query.where(Task.project_id == project_id)
            if filters.get("status"):
                query = query.where(Task.status == filters["status"])
            if filters.get("priority"):
                query = query.where(Task.priority == filters["priority"])

            result = await db.execute(query.limit(limit))
            tasks = result.scalars().all()
            results["tasks"] = [
                {
                    "id": str(t.id),
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "project_name": t.project.name if t.project else None,
                    "assignee": t.assignee.display_name if t.assignee else None,
                    "type": "task",
                }
                for t in tasks
            ]

        if "project" in entity_types:
            query = (
                select(Project)
                .options(selectinload(Project.team))
                .where(Project.id.in_(accessible_project_ids))
                .where(
                    or_(
                        Project.name.ilike(search_pattern),
                        Project.description.ilike(search_pattern),
                    )
                )
            )
            if filters.get("status"):
                query = query.where(Project.status == filters["status"])

            result = await db.execute(query.limit(limit))
            projects = result.scalars().all()
            results["projects"] = [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "status": p.status,
                    "emoji": p.emoji,
                    "type": "project",
                }
                for p in projects
            ]

        if "document" in entity_types:
            query = (
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
                query = query.where(Document.project_id == project_id)
            if filters.get("status"):
                query = query.where(Document.status == filters["status"])

            result = await db.execute(query.limit(limit))
            docs = result.scalars().all()
            results["documents"] = [
                {
                    "id": str(d.id),
                    "title": d.title,
                    "status": d.status,
                    "document_type": d.document_type,
                    "project_name": d.project.name if d.project else None,
                    "type": "document",
                }
                for d in docs
            ]

        if "blocker" in entity_types:
            query = (
                select(Blocker)
                .options(selectinload(Blocker.project))
                .where(Blocker.project_id.in_(accessible_project_ids))
                .where(
                    or_(
                        Blocker.title.ilike(search_pattern),
                        Blocker.description.cast(Text).ilike(search_pattern),
                    )
                )
            )
            if project_id:
                query = query.where(Blocker.project_id == project_id)
            if filters.get("status"):
                query = query.where(Blocker.status == filters["status"])
            if filters.get("priority"):
                query = query.where(Blocker.priority == filters["priority"])

            result = await db.execute(query.limit(limit))
            blockers = result.scalars().all()
            results["blockers"] = [
                {
                    "id": str(b.id),
                    "title": b.title,
                    "status": b.status,
                    "priority": b.priority,
                    "project_name": b.project.name if b.project else None,
                    "type": "blocker",
                }
                for b in blockers
            ]

        return results

    async def _semantic_search(
        self,
        db: AsyncSession,
        query_text: str,
        entity_types: List[str],
        accessible_project_ids: List[UUID],
        project_id: Optional[UUID],
        filters: Dict[str, Any],
        limit: int,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Semantic search using vector embeddings."""
        results: Dict[str, List[Dict[str, Any]]] = {}

        try:
            embedding_service = get_embedding_service()
            query_embedding = await embedding_service.get_embedding(query_text)
        except Exception:
            # Fall back to keyword search if embedding fails
            return await self._keyword_search(
                db, query_text, entity_types, accessible_project_ids, project_id, filters, limit
            )

        similarity_threshold = 0.3

        if "project" in entity_types:
            query = (
                select(
                    Project,
                    (1 - Project.embedding.cosine_distance(query_embedding)).label("similarity"),
                )
                .where(Project.id.in_(accessible_project_ids))
                .where(Project.embedding.isnot(None))
                .where((1 - Project.embedding.cosine_distance(query_embedding)) >= similarity_threshold)
                .order_by((1 - Project.embedding.cosine_distance(query_embedding)).desc())
                .limit(limit)
            )
            if filters.get("status"):
                query = query.where(Project.status == filters["status"])

            result = await db.execute(query)
            rows = result.all()
            results["projects"] = [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "status": p.status,
                    "emoji": p.emoji,
                    "similarity": round(sim, 3),
                    "type": "project",
                }
                for p, sim in rows
            ]

        if "task" in entity_types:
            query = (
                select(
                    Task,
                    (1 - Task.embedding.cosine_distance(query_embedding)).label("similarity"),
                )
                .options(selectinload(Task.project), selectinload(Task.assignee))
                .where(Task.project_id.in_(accessible_project_ids))
                .where(Task.embedding.isnot(None))
                .where((1 - Task.embedding.cosine_distance(query_embedding)) >= similarity_threshold)
                .order_by((1 - Task.embedding.cosine_distance(query_embedding)).desc())
                .limit(limit)
            )
            if project_id:
                query = query.where(Task.project_id == project_id)
            if filters.get("status"):
                query = query.where(Task.status == filters["status"])
            if filters.get("priority"):
                query = query.where(Task.priority == filters["priority"])

            result = await db.execute(query)
            rows = result.all()
            results["tasks"] = [
                {
                    "id": str(t.id),
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "project_name": t.project.name if t.project else None,
                    "assignee": t.assignee.display_name if t.assignee else None,
                    "similarity": round(sim, 3),
                    "type": "task",
                }
                for t, sim in rows
            ]

        if "document" in entity_types:
            query = (
                select(
                    Document,
                    (1 - Document.embedding.cosine_distance(query_embedding)).label("similarity"),
                )
                .options(selectinload(Document.project))
                .where(Document.project_id.in_(accessible_project_ids))
                .where(Document.is_system == False)
                .where(Document.embedding.isnot(None))
                .where((1 - Document.embedding.cosine_distance(query_embedding)) >= similarity_threshold)
                .order_by((1 - Document.embedding.cosine_distance(query_embedding)).desc())
                .limit(limit)
            )
            if project_id:
                query = query.where(Document.project_id == project_id)
            if filters.get("status"):
                query = query.where(Document.status == filters["status"])

            result = await db.execute(query)
            rows = result.all()
            results["documents"] = [
                {
                    "id": str(d.id),
                    "title": d.title,
                    "status": d.status,
                    "document_type": d.document_type,
                    "project_name": d.project.name if d.project else None,
                    "similarity": round(sim, 3),
                    "type": "document",
                }
                for d, sim in rows
            ]

        return results

    async def _hybrid_search(
        self,
        db: AsyncSession,
        query_text: str,
        entity_types: List[str],
        accessible_project_ids: List[UUID],
        project_id: Optional[UUID],
        filters: Dict[str, Any],
        limit: int,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Hybrid search combining semantic and keyword using RRF."""
        # Get results from both methods
        keyword_results = await self._keyword_search(
            db, query_text, entity_types, accessible_project_ids, project_id, filters, limit * 2
        )
        semantic_results = await self._semantic_search(
            db, query_text, entity_types, accessible_project_ids, project_id, filters, limit * 2
        )

        # Combine using Reciprocal Rank Fusion
        combined: Dict[str, List[Dict[str, Any]]] = {}
        k = 60  # RRF constant

        for entity_type in entity_types:
            key = f"{entity_type}s" if not entity_type.endswith("s") else entity_type
            keyword_items = keyword_results.get(key, [])
            semantic_items = semantic_results.get(key, [])

            # Calculate RRF scores
            scores: Dict[str, float] = {}
            items_map: Dict[str, Dict[str, Any]] = {}

            for rank, item in enumerate(keyword_items, start=1):
                item_id = item["id"]
                scores[item_id] = scores.get(item_id, 0) + 1.0 / (k + rank)
                items_map[item_id] = item

            for rank, item in enumerate(semantic_items, start=1):
                item_id = item["id"]
                scores[item_id] = scores.get(item_id, 0) + 1.0 / (k + rank)
                if item_id not in items_map:
                    items_map[item_id] = item

            # Sort by RRF score and take top results
            sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)[:limit]
            combined[key] = [items_map[item_id] for item_id in sorted_ids]

        return combined


class GetDetailsTool(QueryTool):
    """Get detailed information about any entity.

    Combines: get_project_details, get_task_details, get_document_details
    """

    @property
    def name(self) -> str:
        return "get_details"

    @property
    def description(self) -> str:
        return """Get full details of a project, task, document, or blocker.

Includes related data like:
- Projects: task breakdown, recent tasks, member count
- Tasks: description, comments, blockers, assignee
- Documents: content preview, project, status
- Blockers: description, blocked items, assignee"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "entity_type": {
                    "type": "string",
                    "enum": ["project", "task", "document", "blocker"],
                    "description": "Type of entity to get details for",
                },
                "id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Entity ID (UUID)",
                },
                "name": {
                    "type": "string",
                    "description": "Entity name (alternative to ID, uses fuzzy matching)",
                },
                "include": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["comments", "blockers", "tasks", "members", "activity"],
                    },
                    "description": "Additional related data to include",
                },
            },
            "required": ["entity_type"],
        }

    async def execute(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Get entity details based on type."""
        entity_type = input["entity_type"]
        entity_id = input.get("id")
        entity_name = input.get("name")
        include = input.get("include", [])

        if not entity_id and not entity_name:
            return {"error": "Either 'id' or 'name' is required"}

        accessible_project_ids = await get_accessible_project_ids(db, user_id)
        if not accessible_project_ids:
            return {"error": "No accessible projects"}

        if entity_type == "project":
            return await self._get_project_details(db, entity_id, entity_name, accessible_project_ids, include, user_id)
        elif entity_type == "task":
            return await self._get_task_details(db, entity_id, entity_name, accessible_project_ids, include)
        elif entity_type == "document":
            return await self._get_document_details(db, entity_id, entity_name, accessible_project_ids, include)
        elif entity_type == "blocker":
            return await self._get_blocker_details(db, entity_id, entity_name, accessible_project_ids, include)
        else:
            return {"error": f"Unknown entity type: {entity_type}"}

    async def _get_project_details(
        self,
        db: AsyncSession,
        entity_id: Optional[str],
        entity_name: Optional[str],
        accessible_project_ids: List[UUID],
        include: List[str],
        user_id: UUID,
    ) -> Dict[str, Any]:
        """Get project details."""
        project = None

        if entity_id:
            try:
                pid = UUID(entity_id)
                result = await db.execute(
                    select(Project)
                    .options(selectinload(Project.members))
                    .where(Project.id == pid)
                    .where(Project.id.in_(accessible_project_ids))
                )
                project = result.scalar_one_or_none()
            except ValueError:
                entity_name = entity_id

        if not project and entity_name:
            result = await db.execute(
                select(Project)
                .options(selectinload(Project.members))
                .where(Project.id.in_(accessible_project_ids))
                .where(Project.name.ilike(f"%{entity_name}%"))
                .limit(1)
            )
            project = result.scalar_one_or_none()

        if not project:
            return {"error": "Project not found"}

        # Get task breakdown
        status_counts = {}
        for status in ["idea", "todo", "in_progress", "in_review", "done"]:
            count_result = await db.execute(
                select(func.count(Task.id))
                .where(Task.project_id == project.id)
                .where(Task.status == status)
            )
            status_counts[status] = count_result.scalar() or 0

        response = {
            "project": {
                "id": str(project.id),
                "name": project.name,
                "description": project.description,
                "status": project.status,
                "emoji": project.emoji,
                "start_date": project.start_date.isoformat() if project.start_date else None,
                "target_end_date": project.target_end_date.isoformat() if project.target_end_date else None,
            },
            "task_breakdown": status_counts,
            "total_tasks": sum(status_counts.values()),
            "member_count": len(project.members) if project.members else 0,
        }

        if "tasks" in include:
            tasks_result = await db.execute(
                select(Task)
                .where(Task.project_id == project.id)
                .order_by(Task.updated_at.desc())
                .limit(10)
            )
            tasks = tasks_result.scalars().all()
            response["recent_tasks"] = [
                {"id": str(t.id), "title": t.title, "status": t.status, "priority": t.priority}
                for t in tasks
            ]

        return response

    async def _get_task_details(
        self,
        db: AsyncSession,
        entity_id: Optional[str],
        entity_name: Optional[str],
        accessible_project_ids: List[UUID],
        include: List[str],
    ) -> Dict[str, Any]:
        """Get task details."""
        task = None

        if entity_id:
            try:
                tid = UUID(entity_id)
                result = await db.execute(
                    select(Task)
                    .options(selectinload(Task.assignee), selectinload(Task.project))
                    .where(Task.id == tid)
                    .where(Task.project_id.in_(accessible_project_ids))
                )
                task = result.scalar_one_or_none()
            except ValueError:
                entity_name = entity_id

        if not task and entity_name:
            result = await db.execute(
                select(Task)
                .options(selectinload(Task.assignee), selectinload(Task.project))
                .where(Task.project_id.in_(accessible_project_ids))
                .where(Task.title.ilike(f"%{entity_name}%"))
                .limit(1)
            )
            task = result.scalar_one_or_none()

        if not task:
            return {"error": "Task not found"}

        response = {
            "task": {
                "id": str(task.id),
                "title": task.title,
                "description": task.description if isinstance(task.description, str) else None,
                "status": task.status,
                "priority": task.priority,
                "due_date": task.due_date.isoformat() if task.due_date else None,
                "created_at": task.created_at.isoformat(),
                "updated_at": task.updated_at.isoformat(),
            },
            "assignee": {
                "id": str(task.assignee.id),
                "name": task.assignee.display_name,
            } if task.assignee else None,
            "project": {
                "id": str(task.project.id),
                "name": task.project.name,
            } if task.project else None,
        }

        if "comments" in include or True:  # Always include comments for tasks
            comments_result = await db.execute(
                select(TaskComment)
                .options(selectinload(TaskComment.user))
                .where(TaskComment.task_id == task.id)
                .order_by(TaskComment.created_at.desc())
                .limit(10)
            )
            comments = comments_result.scalars().all()
            response["comments"] = [
                {
                    "id": str(c.id),
                    "content": c.content,
                    "author": c.user.display_name if c.user else "Unknown",
                    "created_at": c.created_at.isoformat(),
                }
                for c in comments
            ]

        if "blockers" in include or True:  # Always include blockers for tasks
            blocker_links_result = await db.execute(
                select(BlockerLink)
                .options(selectinload(BlockerLink.blocker))
                .where(BlockerLink.blocked_entity_type == "task")
                .where(BlockerLink.blocked_entity_id == task.id)
            )
            blocker_links = blocker_links_result.scalars().all()
            response["blockers"] = [
                {
                    "id": str(link.blocker.id),
                    "title": link.blocker.title,
                    "status": link.blocker.status,
                }
                for link in blocker_links if link.blocker
            ]

        return response

    async def _get_document_details(
        self,
        db: AsyncSession,
        entity_id: Optional[str],
        entity_name: Optional[str],
        accessible_project_ids: List[UUID],
        include: List[str],
    ) -> Dict[str, Any]:
        """Get document details."""
        doc = None

        if entity_id:
            try:
                did = UUID(entity_id)
                result = await db.execute(
                    select(Document)
                    .options(selectinload(Document.project))
                    .where(Document.id == did)
                    .where(Document.project_id.in_(accessible_project_ids))
                )
                doc = result.scalar_one_or_none()
            except ValueError:
                entity_name = entity_id

        if not doc and entity_name:
            result = await db.execute(
                select(Document)
                .options(selectinload(Document.project))
                .where(Document.project_id.in_(accessible_project_ids))
                .where(Document.title.ilike(f"%{entity_name}%"))
                .limit(1)
            )
            doc = result.scalar_one_or_none()

        if not doc:
            return {"error": "Document not found"}

        content_preview = None
        if doc.content_text:
            content_preview = doc.content_text[:500] + "..." if len(doc.content_text) > 500 else doc.content_text

        return {
            "document": {
                "id": str(doc.id),
                "title": doc.title,
                "status": doc.status,
                "document_type": doc.document_type,
                "content_preview": content_preview,
                "created_at": doc.created_at.isoformat(),
                "updated_at": doc.updated_at.isoformat(),
            },
            "project": {
                "id": str(doc.project.id),
                "name": doc.project.name,
            } if doc.project else None,
        }

    async def _get_blocker_details(
        self,
        db: AsyncSession,
        entity_id: Optional[str],
        entity_name: Optional[str],
        accessible_project_ids: List[UUID],
        include: List[str],
    ) -> Dict[str, Any]:
        """Get blocker details."""
        blocker = None

        if entity_id:
            try:
                bid = UUID(entity_id)
                result = await db.execute(
                    select(Blocker)
                    .options(selectinload(Blocker.project), selectinload(Blocker.blocked_items))
                    .where(Blocker.id == bid)
                    .where(Blocker.project_id.in_(accessible_project_ids))
                )
                blocker = result.scalar_one_or_none()
            except ValueError:
                entity_name = entity_id

        if not blocker and entity_name:
            result = await db.execute(
                select(Blocker)
                .options(selectinload(Blocker.project), selectinload(Blocker.blocked_items))
                .where(Blocker.project_id.in_(accessible_project_ids))
                .where(Blocker.title.ilike(f"%{entity_name}%"))
                .limit(1)
            )
            blocker = result.scalar_one_or_none()

        if not blocker:
            return {"error": "Blocker not found"}

        return {
            "blocker": {
                "id": str(blocker.id),
                "title": blocker.title,
                "description": blocker.description if isinstance(blocker.description, str) else None,
                "status": blocker.status,
                "priority": blocker.priority,
                "impact_level": blocker.impact_level,
                "created_at": blocker.created_at.isoformat(),
                "updated_at": blocker.updated_at.isoformat(),
            },
            "project": {
                "id": str(blocker.project.id),
                "name": blocker.project.name,
            } if blocker.project else None,
            "blocked_items_count": len(blocker.blocked_items) if blocker.blocked_items else 0,
        }


class GetItemsTool(QueryTool):
    """Get a list of entities with optional filters.

    Combines: get_projects, get_tasks, get_documents, get_blockers
    """

    @property
    def name(self) -> str:
        return "get_items"

    @property
    def description(self) -> str:
        return """List projects, tasks, documents, or blockers with optional filters.

Use this to:
- List all projects
- Get tasks filtered by status, assignee, or project
- Find overdue or stalled items
- List documents by type or project"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "entity_type": {
                    "type": "string",
                    "enum": ["project", "task", "document", "blocker"],
                    "description": "Type of entity to list",
                },
                "filters": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "description": "Filter by status",
                        },
                        "priority": {
                            "type": "string",
                            "enum": ["low", "medium", "high", "urgent", "critical"],
                        },
                        "project_id": {
                            "type": "string",
                            "format": "uuid",
                            "description": "Filter by project",
                        },
                        "assignee_id": {
                            "type": "string",
                            "format": "uuid",
                            "description": "Filter by assignee (tasks only)",
                        },
                        "is_overdue": {
                            "type": "boolean",
                            "description": "Only show overdue items",
                        },
                        "is_stalled": {
                            "type": "boolean",
                            "description": "Only show stalled items (no update in 7+ days)",
                        },
                    },
                },
                "limit": {
                    "type": "integer",
                    "default": 20,
                    "maximum": 50,
                },
            },
            "required": ["entity_type"],
        }

    async def execute(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Get list of entities."""
        entity_type = input["entity_type"]
        filters = input.get("filters", {})
        limit = min(input.get("limit", 20), 50)

        accessible_project_ids = await get_accessible_project_ids(db, user_id)
        if not accessible_project_ids:
            return {"items": [], "count": 0}

        if entity_type == "project":
            return await self._get_projects(db, accessible_project_ids, filters, limit)
        elif entity_type == "task":
            return await self._get_tasks(db, accessible_project_ids, filters, limit, org_id)
        elif entity_type == "document":
            return await self._get_documents(db, accessible_project_ids, filters, limit)
        elif entity_type == "blocker":
            return await self._get_blockers(db, accessible_project_ids, filters, limit)
        else:
            return {"error": f"Unknown entity type: {entity_type}"}

    async def _get_projects(
        self,
        db: AsyncSession,
        accessible_project_ids: List[UUID],
        filters: Dict[str, Any],
        limit: int,
    ) -> Dict[str, Any]:
        """Get list of projects."""
        query = (
            select(Project)
            .where(Project.id.in_(accessible_project_ids))
            .where(Project.is_archived == False)
            .where(Project.is_demo == False)
        )

        if filters.get("status"):
            query = query.where(Project.status == filters["status"])

        query = query.order_by(Project.updated_at.desc()).limit(limit)
        result = await db.execute(query)
        projects = result.scalars().all()

        items = []
        for p in projects:
            task_count_result = await db.execute(
                select(func.count(Task.id)).where(Task.project_id == p.id)
            )
            task_count = task_count_result.scalar() or 0

            items.append({
                "id": str(p.id),
                "name": p.name,
                "status": p.status,
                "emoji": p.emoji,
                "task_count": task_count,
                "type": "project",
            })

        return {"items": items, "count": len(items)}

    async def _get_tasks(
        self,
        db: AsyncSession,
        accessible_project_ids: List[UUID],
        filters: Dict[str, Any],
        limit: int,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Get list of tasks."""
        from datetime import datetime, timedelta

        query = (
            select(Task)
            .options(selectinload(Task.project), selectinload(Task.assignee))
            .where(Task.project_id.in_(accessible_project_ids))
        )

        conditions = []

        if filters.get("status"):
            conditions.append(Task.status == filters["status"])

        if filters.get("priority"):
            conditions.append(Task.priority == filters["priority"])

        if filters.get("project_id"):
            conditions.append(Task.project_id == UUID(filters["project_id"]))

        if filters.get("assignee_id"):
            assignee_id = UUID(filters["assignee_id"])
            assigned_via_assignments = select(TaskAssignment.task_id).where(
                TaskAssignment.user_id == assignee_id
            )
            conditions.append(
                or_(Task.assignee_id == assignee_id, Task.id.in_(assigned_via_assignments))
            )

        if filters.get("is_overdue"):
            today = date.today()
            conditions.append(Task.due_date < today)
            conditions.append(Task.status != "done")

        if filters.get("is_stalled"):
            stalled_threshold = datetime.utcnow() - timedelta(days=7)
            conditions.append(Task.status == "in_progress")
            conditions.append(Task.updated_at < stalled_threshold)

        if conditions:
            query = query.where(and_(*conditions))

        query = query.order_by(Task.due_date.asc().nullslast(), Task.priority.desc()).limit(limit)
        result = await db.execute(query)
        tasks = result.scalars().all()

        return {
            "items": [
                {
                    "id": str(t.id),
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                    "assignee": t.assignee.display_name if t.assignee else None,
                    "project_name": t.project.name if t.project else None,
                    "type": "task",
                }
                for t in tasks
            ],
            "count": len(tasks),
        }

    async def _get_documents(
        self,
        db: AsyncSession,
        accessible_project_ids: List[UUID],
        filters: Dict[str, Any],
        limit: int,
    ) -> Dict[str, Any]:
        """Get list of documents."""
        query = (
            select(Document)
            .options(selectinload(Document.project))
            .where(Document.project_id.in_(accessible_project_ids))
            .where(Document.is_system == False)
        )

        if filters.get("status"):
            query = query.where(Document.status == filters["status"])

        if filters.get("project_id"):
            query = query.where(Document.project_id == UUID(filters["project_id"]))

        query = query.order_by(Document.updated_at.desc()).limit(limit)
        result = await db.execute(query)
        docs = result.scalars().all()

        return {
            "items": [
                {
                    "id": str(d.id),
                    "title": d.title,
                    "status": d.status,
                    "document_type": d.document_type,
                    "project_name": d.project.name if d.project else None,
                    "type": "document",
                }
                for d in docs
            ],
            "count": len(docs),
        }

    async def _get_blockers(
        self,
        db: AsyncSession,
        accessible_project_ids: List[UUID],
        filters: Dict[str, Any],
        limit: int,
    ) -> Dict[str, Any]:
        """Get list of blockers."""
        query = (
            select(Blocker)
            .options(selectinload(Blocker.project))
            .where(Blocker.project_id.in_(accessible_project_ids))
        )

        if filters.get("status"):
            query = query.where(Blocker.status == filters["status"])

        if filters.get("priority"):
            query = query.where(Blocker.priority == filters["priority"])

        if filters.get("project_id"):
            query = query.where(Blocker.project_id == UUID(filters["project_id"]))

        query = query.order_by(Blocker.priority.desc(), Blocker.updated_at.desc()).limit(limit)
        result = await db.execute(query)
        blockers = result.scalars().all()

        return {
            "items": [
                {
                    "id": str(b.id),
                    "title": b.title,
                    "status": b.status,
                    "priority": b.priority,
                    "impact_level": b.impact_level,
                    "project_name": b.project.name if b.project else None,
                    "type": "blocker",
                }
                for b in blockers
            ],
            "count": len(blockers),
        }
