"""Semantic search query tool for the AI Assistant.

Enables the assistant to find documents, tasks, and other entities
based on semantic similarity rather than just keyword matching.
"""

from typing import Any, Dict, List
from uuid import UUID

from pgvector.sqlalchemy import Vector
from sqlalchemy import Text, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.queries.access import get_accessible_project_ids
from researchhub.ai.assistant.tools import QueryTool
from researchhub.config import get_settings
from researchhub.models.document import Document
from researchhub.models.journal import JournalEntry
from researchhub.models.knowledge import Paper
from researchhub.models.organization import Team
from researchhub.models.project import Project, Task
from researchhub.services.embedding import get_embedding_service


class SemanticSearchTool(QueryTool):
    """Search for content semantically related to a query.

    Unlike keyword search, this finds conceptually similar content
    even without exact term matches. Uses vector embeddings and
    cosine similarity for matching.
    """

    @property
    def name(self) -> str:
        return "semantic_search"

    @property
    def description(self) -> str:
        return """Search for documents, tasks, journal entries, and papers semantically related to a query.
Unlike keyword search (search_content), this finds conceptually similar content
even when exact words don't match.

Best used for:
- Finding documents about a topic (even with different terminology)
- Discovering related tasks and work items
- Finding relevant journal entries and lab notes
- Discovering related research papers
- Exploring connections between concepts
- When keyword search returns no or poor results

Note: Only searches entities that have embeddings generated. Use search_content
for comprehensive keyword-based search."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language description of what you're looking for. Be descriptive - semantic search works better with context.",
                },
                "entity_types": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["document", "task", "journal_entry", "paper"],
                    },
                    "description": "Filter to specific entity types. If not provided, searches all entity types.",
                },
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Limit search to a specific project (optional)",
                },
                "limit": {
                    "type": "integer",
                    "default": 10,
                    "maximum": 30,
                    "description": "Maximum number of results to return",
                },
                "similarity_threshold": {
                    "type": "number",
                    "default": 0.5,
                    "minimum": 0.0,
                    "maximum": 1.0,
                    "description": "Minimum similarity score (0-1). Higher values return more relevant but fewer results.",
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
        """Execute semantic search and return results."""
        query_text = input["query"]
        entity_types = input.get("entity_types", ["document", "task", "journal_entry", "paper"])
        project_id = input.get("project_id")
        limit = min(input.get("limit", 10), 30)
        similarity_threshold = input.get("similarity_threshold", 0.5)

        # Get accessible project IDs for the user
        accessible_project_ids = await get_accessible_project_ids(db, user_id)

        # Generate embedding for query
        embedding_service = get_embedding_service()
        try:
            query_embedding = await embedding_service.generate_embedding(query_text)
        except ValueError as e:
            return {
                "query": query_text,
                "results": {},
                "total_count": 0,
                "error": str(e),
            }
        except Exception as e:
            return {
                "query": query_text,
                "results": {},
                "total_count": 0,
                "error": f"Failed to generate query embedding: {str(e)}",
            }

        results: Dict[str, List[Dict[str, Any]]] = {}

        # Search documents (requires project access)
        if "document" in entity_types and accessible_project_ids:
            doc_results = await self._search_documents(
                db=db,
                query_embedding=query_embedding,
                accessible_project_ids=accessible_project_ids,
                project_id=UUID(project_id) if project_id else None,
                limit=limit,
                similarity_threshold=similarity_threshold,
            )
            if doc_results:
                results["documents"] = doc_results

        # Search tasks (requires project access)
        if "task" in entity_types and accessible_project_ids:
            task_results = await self._search_tasks(
                db=db,
                query_embedding=query_embedding,
                accessible_project_ids=accessible_project_ids,
                project_id=UUID(project_id) if project_id else None,
                limit=limit,
                similarity_threshold=similarity_threshold,
            )
            if task_results:
                results["tasks"] = task_results

        # Search journal entries (user's personal + project entries)
        if "journal_entry" in entity_types:
            journal_results = await self._search_journal_entries(
                db=db,
                query_embedding=query_embedding,
                user_id=user_id,
                org_id=org_id,
                accessible_project_ids=accessible_project_ids,
                project_id=UUID(project_id) if project_id else None,
                limit=limit,
                similarity_threshold=similarity_threshold,
            )
            if journal_results:
                results["journal_entries"] = journal_results

        # Search papers (organization-wide access)
        if "paper" in entity_types:
            paper_results = await self._search_papers(
                db=db,
                query_embedding=query_embedding,
                org_id=org_id,
                limit=limit,
                similarity_threshold=similarity_threshold,
            )
            if paper_results:
                results["papers"] = paper_results

        total_count = sum(len(items) for items in results.values())

        return {
            "query": query_text,
            "results": results,
            "total_count": total_count,
            "search_type": "semantic",
        }

    async def _search_documents(
        self,
        db: AsyncSession,
        query_embedding: List[float],
        accessible_project_ids: List[UUID],
        project_id: UUID | None,
        limit: int,
        similarity_threshold: float,
    ) -> List[Dict[str, Any]]:
        """Search documents by semantic similarity."""
        # Calculate cosine distance (lower = more similar)
        # We'll convert to similarity score (1 - distance)
        distance_expr = Document.embedding.cosine_distance(query_embedding)

        # Base query with access control
        query = (
            select(Document, distance_expr.label("distance"))
            .options(selectinload(Document.project))
            .where(
                and_(
                    Document.project_id.in_(accessible_project_ids),
                    Document.embedding.isnot(None),
                    Document.is_archived == False,
                    Document.is_system == False,
                )
            )
        )

        # Filter by project if specified
        if project_id:
            query = query.where(Document.project_id == project_id)

        # Order by similarity (ascending distance)
        query = query.order_by(distance_expr).limit(limit * 2)  # Get extra for filtering

        result = await db.execute(query)
        rows = result.all()

        # Filter by similarity threshold and format results
        documents = []
        for doc, distance in rows:
            similarity = 1 - distance  # Convert distance to similarity
            if similarity >= similarity_threshold:
                documents.append({
                    "id": str(doc.id),
                    "title": doc.title,
                    "status": doc.status,
                    "document_type": doc.document_type,
                    "project_name": doc.project.name if doc.project else None,
                    "project_id": str(doc.project_id) if doc.project_id else None,
                    "similarity_score": round(similarity, 3),
                    "type": "document",
                })
                if len(documents) >= limit:
                    break

        return documents

    async def _search_tasks(
        self,
        db: AsyncSession,
        query_embedding: List[float],
        accessible_project_ids: List[UUID],
        project_id: UUID | None,
        limit: int,
        similarity_threshold: float,
    ) -> List[Dict[str, Any]]:
        """Search tasks by semantic similarity."""
        distance_expr = Task.embedding.cosine_distance(query_embedding)

        # Base query with access control
        query = (
            select(Task, distance_expr.label("distance"))
            .options(
                selectinload(Task.project),
                selectinload(Task.assignee),
            )
            .where(
                and_(
                    Task.project_id.in_(accessible_project_ids),
                    Task.embedding.isnot(None),
                )
            )
        )

        # Filter by project if specified
        if project_id:
            query = query.where(Task.project_id == project_id)

        # Order by similarity
        query = query.order_by(distance_expr).limit(limit * 2)

        result = await db.execute(query)
        rows = result.all()

        # Filter by similarity threshold and format results
        tasks = []
        for task, distance in rows:
            similarity = 1 - distance
            if similarity >= similarity_threshold:
                tasks.append({
                    "id": str(task.id),
                    "title": task.title,
                    "status": task.status,
                    "priority": task.priority,
                    "project_name": task.project.name if task.project else None,
                    "project_id": str(task.project_id) if task.project_id else None,
                    "assignee": task.assignee.display_name if task.assignee else None,
                    "due_date": task.due_date.isoformat() if task.due_date else None,
                    "similarity_score": round(similarity, 3),
                    "type": "task",
                })
                if len(tasks) >= limit:
                    break

        return tasks

    async def _search_journal_entries(
        self,
        db: AsyncSession,
        query_embedding: List[float],
        user_id: UUID,
        org_id: UUID,
        accessible_project_ids: List[UUID],
        project_id: UUID | None,
        limit: int,
        similarity_threshold: float,
    ) -> List[Dict[str, Any]]:
        """Search journal entries by semantic similarity.

        Journal entries can be:
        - Personal (scope='personal', user_id matches)
        - Project-based (scope='project', project_id in accessible projects)
        """
        distance_expr = JournalEntry.embedding.cosine_distance(query_embedding)

        # Access control: personal entries OR project entries user can access
        access_conditions = [
            # Personal entries belonging to user
            and_(
                JournalEntry.scope == "personal",
                JournalEntry.user_id == user_id,
            ),
        ]

        # Add project entries if user has accessible projects
        if accessible_project_ids:
            access_conditions.append(
                and_(
                    JournalEntry.scope == "project",
                    JournalEntry.project_id.in_(accessible_project_ids),
                )
            )

        # Base query with access control
        query = (
            select(JournalEntry, distance_expr.label("distance"))
            .options(selectinload(JournalEntry.project))
            .where(
                and_(
                    JournalEntry.organization_id == org_id,
                    JournalEntry.embedding.isnot(None),
                    JournalEntry.is_archived == False,
                    or_(*access_conditions),
                )
            )
        )

        # Filter by project if specified
        if project_id:
            query = query.where(JournalEntry.project_id == project_id)

        # Order by similarity
        query = query.order_by(distance_expr).limit(limit * 2)

        result = await db.execute(query)
        rows = result.all()

        # Filter by similarity threshold and format results
        entries = []
        for entry, distance in rows:
            similarity = 1 - distance
            if similarity >= similarity_threshold:
                entries.append({
                    "id": str(entry.id),
                    "title": entry.title or f"Entry {entry.entry_date}",
                    "entry_date": entry.entry_date.isoformat() if entry.entry_date else None,
                    "entry_type": entry.entry_type,
                    "scope": entry.scope,
                    "project_name": entry.project.name if entry.project else None,
                    "project_id": str(entry.project_id) if entry.project_id else None,
                    "tags": entry.tags or [],
                    "similarity_score": round(similarity, 3),
                    "type": "journal_entry",
                })
                if len(entries) >= limit:
                    break

        return entries

    async def _search_papers(
        self,
        db: AsyncSession,
        query_embedding: List[float],
        org_id: UUID,
        limit: int,
        similarity_threshold: float,
    ) -> List[Dict[str, Any]]:
        """Search papers by semantic similarity.

        Papers are organization-scoped and accessible to all org members.
        """
        distance_expr = Paper.embedding.cosine_distance(query_embedding)

        # Base query - papers are org-wide
        query = (
            select(Paper, distance_expr.label("distance"))
            .where(
                and_(
                    Paper.organization_id == org_id,
                    Paper.embedding.isnot(None),
                )
            )
        )

        # Order by similarity
        query = query.order_by(distance_expr).limit(limit * 2)

        result = await db.execute(query)
        rows = result.all()

        # Filter by similarity threshold and format results
        papers = []
        for paper, distance in rows:
            similarity = 1 - distance
            if similarity >= similarity_threshold:
                papers.append({
                    "id": str(paper.id),
                    "title": paper.title,
                    "authors": paper.authors or [],
                    "journal": paper.journal,
                    "publication_year": paper.publication_year,
                    "doi": paper.doi,
                    "read_status": paper.read_status,
                    "tags": paper.tags or [],
                    "similarity_score": round(similarity, 3),
                    "type": "paper",
                })
                if len(papers) >= limit:
                    break

        return papers


class HybridSearchTool(QueryTool):
    """Combined semantic and keyword search for comprehensive results.

    Runs both semantic search and keyword search, merging and ranking
    results for the best coverage.
    """

    @property
    def name(self) -> str:
        return "hybrid_search"

    @property
    def description(self) -> str:
        return """Combined semantic and keyword search for comprehensive results.
Runs both search methods and merges results, providing the best of both approaches:
- Semantic: Finds conceptually related content
- Keyword: Finds exact term matches

Use this when you need thorough coverage and aren't sure which search type is best."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query - can be natural language or keywords",
                },
                "entity_types": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["task", "document", "journal_entry", "paper"],
                    },
                    "description": "Filter to specific entity types",
                },
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Limit search to a specific project",
                },
                "limit": {
                    "type": "integer",
                    "default": 15,
                    "maximum": 30,
                    "description": "Maximum total results",
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
        """Execute hybrid search combining semantic and keyword approaches."""
        from researchhub.ai.assistant.queries.search import SearchContentTool

        query_text = input["query"]
        entity_types = input.get("entity_types", ["task", "document", "journal_entry", "paper"])
        project_id = input.get("project_id")
        limit = min(input.get("limit", 15), 30)

        # Run both searches
        semantic_tool = SemanticSearchTool()
        keyword_tool = SearchContentTool()

        semantic_input = {
            "query": query_text,
            "entity_types": entity_types,
            "project_id": project_id,
            "limit": limit,
            "similarity_threshold": 0.4,  # Lower threshold for hybrid
        }

        keyword_input = {
            "query": query_text,
            "entity_types": entity_types,
            "project_id": project_id,
            "limit": limit,
        }

        # Execute both searches
        semantic_results = await semantic_tool.execute(
            semantic_input, db, user_id, org_id
        )
        keyword_results = await keyword_tool.execute(
            keyword_input, db, user_id, org_id
        )

        # Merge results, prioritizing semantic matches but including keyword-only finds
        merged_results = self._merge_results(
            semantic_results.get("results", {}),
            keyword_results.get("results", {}),
            limit,
        )

        total_count = sum(len(items) for items in merged_results.values())

        return {
            "query": query_text,
            "results": merged_results,
            "total_count": total_count,
            "search_type": "hybrid",
            "semantic_count": semantic_results.get("total_count", 0),
            "keyword_count": keyword_results.get("total_count", 0),
        }

    def _merge_results(
        self,
        semantic: Dict[str, List],
        keyword: Dict[str, List],
        limit: int,
    ) -> Dict[str, List]:
        """Merge semantic and keyword results, deduplicating by ID."""
        merged = {}

        # Process each entity type
        for entity_type in set(list(semantic.keys()) + list(keyword.keys())):
            seen_ids = set()
            combined = []

            # Add semantic results first (higher priority)
            for item in semantic.get(entity_type, []):
                item_id = item.get("id")
                if item_id and item_id not in seen_ids:
                    item["match_type"] = "semantic"
                    combined.append(item)
                    seen_ids.add(item_id)

            # Add keyword results not already in semantic
            for item in keyword.get(entity_type, []):
                item_id = item.get("id")
                if item_id and item_id not in seen_ids:
                    item["match_type"] = "keyword"
                    combined.append(item)
                    seen_ids.add(item_id)

            if combined:
                merged[entity_type] = combined[:limit]

        return merged
