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
        return """Search for projects, documents, tasks, journal entries, and papers semantically related to a query.
Unlike keyword search (search_content), this finds conceptually similar content
even when exact words don't match.

Best used for:
- Finding projects related to a research area or topic
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
                        "enum": ["project", "document", "task", "journal_entry", "paper"],
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
                    "default": 0.3,
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
        entity_types = input.get("entity_types", ["project", "document", "task", "journal_entry", "paper"])
        project_id = input.get("project_id")
        limit = min(input.get("limit", 10), 30)
        similarity_threshold = input.get("similarity_threshold", 0.3)

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

        # Search projects (requires project access)
        if "project" in entity_types and accessible_project_ids:
            project_results = await self._search_projects(
                db=db,
                query_embedding=query_embedding,
                accessible_project_ids=accessible_project_ids,
                limit=limit,
                similarity_threshold=similarity_threshold,
            )
            if project_results:
                results["projects"] = project_results

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

    async def _search_projects(
        self,
        db: AsyncSession,
        query_embedding: List[float],
        accessible_project_ids: List[UUID],
        limit: int,
        similarity_threshold: float,
    ) -> List[Dict[str, Any]]:
        """Search projects by semantic similarity."""
        distance_expr = Project.embedding.cosine_distance(query_embedding)

        # Base query with access control
        query = (
            select(Project, distance_expr.label("distance"))
            .options(selectinload(Project.team))
            .where(
                and_(
                    Project.id.in_(accessible_project_ids),
                    Project.embedding.isnot(None),
                    Project.status != "archived",
                )
            )
        )

        # Order by similarity (ascending distance)
        query = query.order_by(distance_expr).limit(limit * 2)

        result = await db.execute(query)
        rows = result.all()

        # Filter by similarity threshold and format results
        projects = []
        for project, distance in rows:
            similarity = 1 - distance
            if similarity >= similarity_threshold:
                projects.append({
                    "id": str(project.id),
                    "name": project.name,
                    "description": project.description[:200] + "..." if project.description and len(project.description) > 200 else project.description,
                    "status": project.status,
                    "project_type": project.project_type,
                    "team_name": project.team.name if project.team else None,
                    "similarity_score": round(similarity, 3),
                    "type": "project",
                })
                if len(projects) >= limit:
                    break

        return projects

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
    """Combined semantic and full-text search using Reciprocal Rank Fusion (RRF).

    Based on academic research showing hybrid search outperforms either method alone:
    - Semantic: Captures conceptual meaning and synonyms
    - Full-Text Search (FTS): Captures exact terms, acronyms, codes (e.g., "FHIR")

    Uses RRF algorithm to combine rankings from both search methods.
    """

    @property
    def name(self) -> str:
        return "hybrid_search"

    @property
    def description(self) -> str:
        return """Combined semantic and keyword search for comprehensive results.
Uses Reciprocal Rank Fusion (RRF) to merge results from:
- Semantic search: Finds conceptually related content
- Full-text search: Finds exact term matches (acronyms, codes, technical terms)

BEST CHOICE when:
- Searching for technical terms, acronyms, or codes (FHIR, API, etc.)
- Not sure if semantic or keyword search will work better
- Need thorough coverage across different terminology"""

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
                        "enum": ["project", "task", "document", "journal_entry", "paper"],
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
                    "default": 10,
                    "maximum": 30,
                    "description": "Maximum total results per entity type",
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
        """Execute hybrid search combining semantic and FTS with RRF."""
        query_text = input["query"]
        entity_types = input.get("entity_types", ["project", "task", "document", "journal_entry", "paper"])
        project_id = input.get("project_id")
        limit = min(input.get("limit", 10), 30)

        # Get accessible project IDs for the user
        accessible_project_ids = await get_accessible_project_ids(db, user_id)

        if not accessible_project_ids:
            return {
                "query": query_text,
                "results": {},
                "total_count": 0,
                "search_type": "hybrid",
            }

        # Generate embedding for semantic search
        embedding_service = get_embedding_service()
        try:
            query_embedding = await embedding_service.generate_embedding(query_text)
        except Exception:
            query_embedding = None

        results: Dict[str, List[Dict[str, Any]]] = {}

        # Search each entity type with hybrid approach
        if "project" in entity_types:
            project_results = await self._hybrid_search_projects(
                db=db,
                query_text=query_text,
                query_embedding=query_embedding,
                accessible_project_ids=accessible_project_ids,
                limit=limit,
            )
            if project_results:
                results["projects"] = project_results

        if "document" in entity_types:
            doc_results = await self._hybrid_search_documents(
                db=db,
                query_text=query_text,
                query_embedding=query_embedding,
                accessible_project_ids=accessible_project_ids,
                project_id=UUID(project_id) if project_id else None,
                limit=limit,
            )
            if doc_results:
                results["documents"] = doc_results

        if "task" in entity_types:
            task_results = await self._hybrid_search_tasks(
                db=db,
                query_text=query_text,
                query_embedding=query_embedding,
                accessible_project_ids=accessible_project_ids,
                project_id=UUID(project_id) if project_id else None,
                limit=limit,
            )
            if task_results:
                results["tasks"] = task_results

        if "journal_entry" in entity_types:
            journal_results = await self._hybrid_search_journal_entries(
                db=db,
                query_text=query_text,
                query_embedding=query_embedding,
                user_id=user_id,
                org_id=org_id,
                accessible_project_ids=accessible_project_ids,
                project_id=UUID(project_id) if project_id else None,
                limit=limit,
            )
            if journal_results:
                results["journal_entries"] = journal_results

        if "paper" in entity_types:
            paper_results = await self._hybrid_search_papers(
                db=db,
                query_text=query_text,
                query_embedding=query_embedding,
                org_id=org_id,
                limit=limit,
            )
            if paper_results:
                results["papers"] = paper_results

        total_count = sum(len(items) for items in results.values())

        return {
            "query": query_text,
            "results": results,
            "total_count": total_count,
            "search_type": "hybrid",
        }

    def _reciprocal_rank_fusion(
        self,
        semantic_results: List[Dict[str, Any]],
        fts_results: List[Dict[str, Any]],
        k: int = 60,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Combine rankings using Reciprocal Rank Fusion (RRF).

        RRF formula: score(d) = sum(1 / (k + rank(d)))
        where k is a constant (typically 60) and rank is 1-indexed position.

        Args:
            semantic_results: Results from semantic search with similarity_score
            fts_results: Results from FTS with fts_rank
            k: RRF constant (default 60, from research)
            limit: Maximum results to return
        """
        scores: Dict[str, float] = {}
        items: Dict[str, Dict[str, Any]] = {}

        # Score semantic results
        for rank, item in enumerate(semantic_results, start=1):
            item_id = item.get("id")
            if item_id:
                rrf_score = 1.0 / (k + rank)
                scores[item_id] = scores.get(item_id, 0) + rrf_score
                if item_id not in items:
                    items[item_id] = item.copy()
                    items[item_id]["match_type"] = "semantic"

        # Score FTS results
        for rank, item in enumerate(fts_results, start=1):
            item_id = item.get("id")
            if item_id:
                rrf_score = 1.0 / (k + rank)
                scores[item_id] = scores.get(item_id, 0) + rrf_score
                if item_id not in items:
                    items[item_id] = item.copy()
                    items[item_id]["match_type"] = "keyword"
                else:
                    # Found in both - mark as hybrid match
                    items[item_id]["match_type"] = "hybrid"

        # Sort by RRF score and return top results
        sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)

        results = []
        for item_id in sorted_ids[:limit]:
            item = items[item_id]
            item["rrf_score"] = round(scores[item_id], 4)
            results.append(item)

        return results

    async def _hybrid_search_projects(
        self,
        db: AsyncSession,
        query_text: str,
        query_embedding: List[float] | None,
        accessible_project_ids: List[UUID],
        limit: int,
    ) -> List[Dict[str, Any]]:
        """Hybrid search for projects."""
        semantic_results = []
        fts_results = []

        # Semantic search
        if query_embedding:
            distance_expr = Project.embedding.cosine_distance(query_embedding)
            semantic_query = (
                select(Project, distance_expr.label("distance"))
                .options(selectinload(Project.team))
                .where(
                    and_(
                        Project.id.in_(accessible_project_ids),
                        Project.embedding.isnot(None),
                        Project.status != "archived",
                    )
                )
                .order_by(distance_expr)
                .limit(limit * 2)
            )
            result = await db.execute(semantic_query)
            for project, distance in result.all():
                similarity = 1 - distance
                if similarity >= 0.2:  # Lower threshold for RRF
                    semantic_results.append({
                        "id": str(project.id),
                        "name": project.name,
                        "description": project.description[:200] + "..." if project.description and len(project.description) > 200 else project.description,
                        "status": project.status,
                        "project_type": project.project_type,
                        "team_name": project.team.name if project.team else None,
                        "similarity_score": round(similarity, 3),
                        "type": "project",
                    })

        # Full-text search using PostgreSQL FTS
        from sqlalchemy import func, text
        tsquery = func.plainto_tsquery('english', query_text)
        fts_query = (
            select(
                Project,
                func.ts_rank(Project.search_vector, tsquery).label("rank")
            )
            .options(selectinload(Project.team))
            .where(
                and_(
                    Project.id.in_(accessible_project_ids),
                    Project.search_vector.isnot(None),
                    Project.status != "archived",
                    Project.search_vector.op('@@')(tsquery),
                )
            )
            .order_by(text("rank DESC"))
            .limit(limit * 2)
        )
        try:
            result = await db.execute(fts_query)
            for project, rank in result.all():
                fts_results.append({
                    "id": str(project.id),
                    "name": project.name,
                    "description": project.description[:200] + "..." if project.description and len(project.description) > 200 else project.description,
                    "status": project.status,
                    "project_type": project.project_type,
                    "team_name": project.team.name if project.team else None,
                    "fts_rank": round(float(rank), 4),
                    "type": "project",
                })
        except Exception:
            # FTS columns may not exist yet, fall back to ILIKE
            pass

        return self._reciprocal_rank_fusion(semantic_results, fts_results, limit=limit)

    async def _hybrid_search_documents(
        self,
        db: AsyncSession,
        query_text: str,
        query_embedding: List[float] | None,
        accessible_project_ids: List[UUID],
        project_id: UUID | None,
        limit: int,
    ) -> List[Dict[str, Any]]:
        """Hybrid search for documents."""
        semantic_results = []
        fts_results = []

        # Base conditions
        base_conditions = [
            Document.project_id.in_(accessible_project_ids),
            Document.is_archived == False,
            Document.is_system == False,
        ]
        if project_id:
            base_conditions.append(Document.project_id == project_id)

        # Semantic search
        if query_embedding:
            distance_expr = Document.embedding.cosine_distance(query_embedding)
            semantic_query = (
                select(Document, distance_expr.label("distance"))
                .options(selectinload(Document.project))
                .where(and_(*base_conditions, Document.embedding.isnot(None)))
                .order_by(distance_expr)
                .limit(limit * 2)
            )
            result = await db.execute(semantic_query)
            for doc, distance in result.all():
                similarity = 1 - distance
                if similarity >= 0.2:
                    semantic_results.append({
                        "id": str(doc.id),
                        "title": doc.title,
                        "status": doc.status,
                        "document_type": doc.document_type,
                        "project_name": doc.project.name if doc.project else None,
                        "project_id": str(doc.project_id) if doc.project_id else None,
                        "similarity_score": round(similarity, 3),
                        "type": "document",
                    })

        # Full-text search
        from sqlalchemy import func, text
        tsquery = func.plainto_tsquery('english', query_text)
        fts_query = (
            select(
                Document,
                func.ts_rank(Document.search_vector, tsquery).label("rank")
            )
            .options(selectinload(Document.project))
            .where(
                and_(
                    *base_conditions,
                    Document.search_vector.isnot(None),
                    Document.search_vector.op('@@')(tsquery),
                )
            )
            .order_by(text("rank DESC"))
            .limit(limit * 2)
        )
        try:
            result = await db.execute(fts_query)
            for doc, rank in result.all():
                fts_results.append({
                    "id": str(doc.id),
                    "title": doc.title,
                    "status": doc.status,
                    "document_type": doc.document_type,
                    "project_name": doc.project.name if doc.project else None,
                    "project_id": str(doc.project_id) if doc.project_id else None,
                    "fts_rank": round(float(rank), 4),
                    "type": "document",
                })
        except Exception:
            pass

        return self._reciprocal_rank_fusion(semantic_results, fts_results, limit=limit)

    async def _hybrid_search_tasks(
        self,
        db: AsyncSession,
        query_text: str,
        query_embedding: List[float] | None,
        accessible_project_ids: List[UUID],
        project_id: UUID | None,
        limit: int,
    ) -> List[Dict[str, Any]]:
        """Hybrid search for tasks."""
        semantic_results = []
        fts_results = []

        # Base conditions
        base_conditions = [Task.project_id.in_(accessible_project_ids)]
        if project_id:
            base_conditions.append(Task.project_id == project_id)

        # Semantic search
        if query_embedding:
            distance_expr = Task.embedding.cosine_distance(query_embedding)
            semantic_query = (
                select(Task, distance_expr.label("distance"))
                .options(selectinload(Task.project), selectinload(Task.assignee))
                .where(and_(*base_conditions, Task.embedding.isnot(None)))
                .order_by(distance_expr)
                .limit(limit * 2)
            )
            result = await db.execute(semantic_query)
            for task, distance in result.all():
                similarity = 1 - distance
                if similarity >= 0.2:
                    semantic_results.append({
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

        # Full-text search
        from sqlalchemy import func, text
        tsquery = func.plainto_tsquery('english', query_text)
        fts_query = (
            select(
                Task,
                func.ts_rank(Task.search_vector, tsquery).label("rank")
            )
            .options(selectinload(Task.project), selectinload(Task.assignee))
            .where(
                and_(
                    *base_conditions,
                    Task.search_vector.isnot(None),
                    Task.search_vector.op('@@')(tsquery),
                )
            )
            .order_by(text("rank DESC"))
            .limit(limit * 2)
        )
        try:
            result = await db.execute(fts_query)
            for task, rank in result.all():
                fts_results.append({
                    "id": str(task.id),
                    "title": task.title,
                    "status": task.status,
                    "priority": task.priority,
                    "project_name": task.project.name if task.project else None,
                    "project_id": str(task.project_id) if task.project_id else None,
                    "assignee": task.assignee.display_name if task.assignee else None,
                    "due_date": task.due_date.isoformat() if task.due_date else None,
                    "fts_rank": round(float(rank), 4),
                    "type": "task",
                })
        except Exception:
            pass

        return self._reciprocal_rank_fusion(semantic_results, fts_results, limit=limit)

    async def _hybrid_search_journal_entries(
        self,
        db: AsyncSession,
        query_text: str,
        query_embedding: List[float] | None,
        user_id: UUID,
        org_id: UUID,
        accessible_project_ids: List[UUID],
        project_id: UUID | None,
        limit: int,
    ) -> List[Dict[str, Any]]:
        """Hybrid search for journal entries."""
        semantic_results = []
        fts_results = []

        # Access control conditions
        access_conditions = [
            and_(JournalEntry.scope == "personal", JournalEntry.user_id == user_id),
        ]
        if accessible_project_ids:
            access_conditions.append(
                and_(JournalEntry.scope == "project", JournalEntry.project_id.in_(accessible_project_ids))
            )

        base_conditions = [
            JournalEntry.organization_id == org_id,
            JournalEntry.is_archived == False,
            or_(*access_conditions),
        ]
        if project_id:
            base_conditions.append(JournalEntry.project_id == project_id)

        # Semantic search
        if query_embedding:
            distance_expr = JournalEntry.embedding.cosine_distance(query_embedding)
            semantic_query = (
                select(JournalEntry, distance_expr.label("distance"))
                .options(selectinload(JournalEntry.project))
                .where(and_(*base_conditions, JournalEntry.embedding.isnot(None)))
                .order_by(distance_expr)
                .limit(limit * 2)
            )
            result = await db.execute(semantic_query)
            for entry, distance in result.all():
                similarity = 1 - distance
                if similarity >= 0.2:
                    semantic_results.append({
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

        # Full-text search
        from sqlalchemy import func, text
        tsquery = func.plainto_tsquery('english', query_text)
        fts_query = (
            select(
                JournalEntry,
                func.ts_rank(JournalEntry.search_vector, tsquery).label("rank")
            )
            .options(selectinload(JournalEntry.project))
            .where(
                and_(
                    *base_conditions,
                    JournalEntry.search_vector.isnot(None),
                    JournalEntry.search_vector.op('@@')(tsquery),
                )
            )
            .order_by(text("rank DESC"))
            .limit(limit * 2)
        )
        try:
            result = await db.execute(fts_query)
            for entry, rank in result.all():
                fts_results.append({
                    "id": str(entry.id),
                    "title": entry.title or f"Entry {entry.entry_date}",
                    "entry_date": entry.entry_date.isoformat() if entry.entry_date else None,
                    "entry_type": entry.entry_type,
                    "scope": entry.scope,
                    "project_name": entry.project.name if entry.project else None,
                    "project_id": str(entry.project_id) if entry.project_id else None,
                    "tags": entry.tags or [],
                    "fts_rank": round(float(rank), 4),
                    "type": "journal_entry",
                })
        except Exception:
            pass

        return self._reciprocal_rank_fusion(semantic_results, fts_results, limit=limit)

    async def _hybrid_search_papers(
        self,
        db: AsyncSession,
        query_text: str,
        query_embedding: List[float] | None,
        org_id: UUID,
        limit: int,
    ) -> List[Dict[str, Any]]:
        """Hybrid search for papers."""
        semantic_results = []
        fts_results = []

        # Semantic search
        if query_embedding:
            distance_expr = Paper.embedding.cosine_distance(query_embedding)
            semantic_query = (
                select(Paper, distance_expr.label("distance"))
                .where(and_(Paper.organization_id == org_id, Paper.embedding.isnot(None)))
                .order_by(distance_expr)
                .limit(limit * 2)
            )
            result = await db.execute(semantic_query)
            for paper, distance in result.all():
                similarity = 1 - distance
                if similarity >= 0.2:
                    semantic_results.append({
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

        # Full-text search
        from sqlalchemy import func, text
        tsquery = func.plainto_tsquery('english', query_text)
        fts_query = (
            select(
                Paper,
                func.ts_rank(Paper.search_vector, tsquery).label("rank")
            )
            .where(
                and_(
                    Paper.organization_id == org_id,
                    Paper.search_vector.isnot(None),
                    Paper.search_vector.op('@@')(tsquery),
                )
            )
            .order_by(text("rank DESC"))
            .limit(limit * 2)
        )
        try:
            result = await db.execute(fts_query)
            for paper, rank in result.all():
                fts_results.append({
                    "id": str(paper.id),
                    "title": paper.title,
                    "authors": paper.authors or [],
                    "journal": paper.journal,
                    "publication_year": paper.publication_year,
                    "doi": paper.doi,
                    "read_status": paper.read_status,
                    "tags": paper.tags or [],
                    "fts_rank": round(float(rank), 4),
                    "type": "paper",
                })
        except Exception:
            pass

        return self._reciprocal_rank_fusion(semantic_results, fts_results, limit=limit)
