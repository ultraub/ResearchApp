"""Global search API endpoints."""

import structlog
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db
from researchhub.models import (
    Blocker,
    Project,
    Review,
    Task,
    Document,
    Idea,
    Paper,
    Collection,
    User,
    JournalEntry,
)
from researchhub.models.organization import TeamMember, OrganizationMember
from researchhub.services.embedding import get_embedding_service

logger = structlog.get_logger()

router = APIRouter(tags=["search"])

# Scoring constants for hybrid search ranking
SCORE_EXACT_TITLE_MATCH = 100  # Query exactly matches title
SCORE_PARTIAL_TITLE_MATCH = 50  # Query found in title
SCORE_CONTENT_MATCH = 20  # Query found in content/description
SCORE_SEMANTIC_MULTIPLIER = 40  # Similarity score (0-1) multiplied by this

# Entity types that support semantic search (have embeddings)
SEMANTIC_ENTITY_TYPES = {"document", "task", "journal", "paper"}


def _calculate_keyword_score(query: str, title: str, content: str | None = None) -> float:
    """Calculate relevance score for keyword matches."""
    score = 0.0
    q_lower = query.lower()
    title_lower = title.lower()

    # Title matching
    if title_lower == q_lower:
        score += SCORE_EXACT_TITLE_MATCH
    elif q_lower in title_lower:
        score += SCORE_PARTIAL_TITLE_MATCH
        # Bonus for title starting with query
        if title_lower.startswith(q_lower):
            score += 10

    # Content matching
    if content and q_lower in content.lower():
        score += SCORE_CONTENT_MATCH

    return score


def _merge_result(
    results: dict[str, "SearchResultItem"],
    item: "SearchResultItem",
    match_type: str,
) -> None:
    """Merge a search result into the results dict, combining scores for duplicates."""
    key = f"{item.type}:{item.id}"

    if key in results:
        existing = results[key]
        # Combine scores and mark as found by both methods
        existing.score = (existing.score or 0) + (item.score or 0)
        existing.match_type = "both"
        # Keep the better snippet
        if item.snippet and not existing.snippet:
            existing.snippet = item.snippet
    else:
        item.match_type = match_type
        results[key] = item


# --- Search Schemas ---

class SearchResultItem(BaseModel):
    """Individual search result."""
    id: UUID
    type: str  # project, task, document, idea, paper, collection, user, journal, blocker, review
    title: str
    description: str | None = None
    snippet: str | None = None  # Highlighted text snippet
    url: str  # Frontend URL path
    created_at: datetime
    updated_at: datetime | None = None
    metadata: dict | None = None  # Type-specific metadata
    score: float | None = None  # Relevance score (for ranking)
    match_type: str | None = None  # "keyword", "semantic", or "both"

    class Config:
        from_attributes = True


class SearchResponse(BaseModel):
    """Paginated search response."""
    results: list[SearchResultItem]
    total: int
    query: str
    filters: dict
    has_more: bool


class SearchSuggestion(BaseModel):
    """Search autocomplete suggestion."""
    text: str
    type: str
    id: UUID | None = None


# --- Search Endpoints ---

@router.get("", response_model=SearchResponse)
async def global_search(
    current_user: CurrentUser,
    q: str = Query(..., min_length=1, description="Search query"),
    organization_id: UUID = Query(...),  # Kept for backward compatibility / filtering
    types: list[str] | None = Query(
        None,
        description="Filter by content types: project, task, document, idea, paper, collection, user, journal, blocker, review"
    ),
    project_id: UUID | None = Query(None, description="Filter by project"),
    created_after: datetime | None = Query(None),
    created_before: datetime | None = Query(None),
    mode: Literal["hybrid", "keyword", "semantic"] = Query(
        "hybrid",
        description="Search mode: hybrid (default, combines keyword + semantic), keyword (exact matches), semantic (conceptual similarity)"
    ),
    sort_by: Literal["relevance", "created_at", "updated_at"] = Query("relevance"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    Global search across all content types.

    Searches projects, tasks, documents, ideas, papers, collections, users,
    journal entries, blockers, and reviews.

    Search modes:
    - hybrid (default): Combines keyword and semantic search with smart ranking.
      Keyword matches (especially title matches) rank highest, semantic matches
      fill in conceptually related results.
    - keyword: Traditional SQL LIKE matching for exact terms.
    - semantic: Vector similarity search for conceptual matches (only for
      document, task, journal, paper - others fall back to keyword).

    Results are ranked by relevance and filtered by user's accessible content.
    """
    search_term = f"%{q.lower()}%"
    results: dict[str, SearchResultItem] = {}  # keyed by "type:id" for deduplication

    # Determine if we should run keyword and/or semantic search
    run_keyword = mode in ("hybrid", "keyword")
    run_semantic = mode in ("hybrid", "semantic")

    # Get user's team memberships (includes personal teams)
    team_result = await db.execute(
        select(TeamMember.team_id).where(TeamMember.user_id == current_user.id)
    )
    user_team_ids = [row[0] for row in team_result.all()]

    # Get user's organization memberships (for user search scoping)
    org_result = await db.execute(
        select(OrganizationMember.organization_id)
        .where(OrganizationMember.user_id == current_user.id)
    )
    user_org_ids = [row[0] for row in org_result.all()]

    # Determine which types to search
    search_types = types or [
        "project", "task", "document", "idea", "paper",
        "collection", "user", "journal", "blocker", "review"
    ]

    # Get embedding for semantic search if needed
    query_embedding = None
    if run_semantic:
        try:
            embedding_service = get_embedding_service()
            query_embedding = await embedding_service.generate_embedding(q)
        except Exception as e:
            logger.warning("Failed to get query embedding, falling back to keyword search", error=str(e))
            if mode == "semantic":
                # Pure semantic mode failed, return empty results
                return SearchResponse(
                    results=[],
                    total=0,
                    query=q,
                    filters={
                        "types": types,
                        "project_id": str(project_id) if project_id else None,
                        "created_after": created_after.isoformat() if created_after else None,
                        "created_before": created_before.isoformat() if created_before else None,
                        "mode": mode,
                    },
                    has_more=False,
                )
            # For hybrid mode, continue with keyword only
            run_semantic = False

    # ============================================================
    # KEYWORD SEARCH (for all entity types)
    # ============================================================

    if run_keyword:
        # Search Projects - use team membership for access control
        if "project" in search_types and user_team_ids:
            project_query = (
                select(Project)
                .where(Project.team_id.in_(user_team_ids))
                .where(Project.is_archived == False)
                .where(
                    or_(
                        func.lower(Project.name).like(search_term),
                        func.lower(Project.description).like(search_term),
                    )
                )
            )
            if created_after:
                project_query = project_query.where(Project.created_at >= created_after)
            if created_before:
                project_query = project_query.where(Project.created_at <= created_before)

            project_results = await db.execute(project_query)
            for project in project_results.scalars().all():
                score = _calculate_keyword_score(q, project.name, project.description)
                item = SearchResultItem(
                    id=project.id,
                    type="project",
                    title=project.name,
                    description=project.description,
                    snippet=_get_snippet(project.description, q) if project.description else None,
                    url=f"/projects/{project.id}",
                    created_at=project.created_at,
                    updated_at=project.updated_at,
                    metadata={
                        "status": project.status,
                        "scope": project.scope,
                    },
                    score=score,
                )
                _merge_result(results, item, "keyword")

        # Search Tasks - use team membership via project for access control
        # Note: Task.description is JSONB (TipTap format), so we only search title
        if "task" in search_types and user_team_ids:
            task_query = (
                select(Task)
                .join(Project, Task.project_id == Project.id)
                .where(Project.team_id.in_(user_team_ids))
                .where(func.lower(Task.title).like(search_term))
            )
            if project_id:
                task_query = task_query.where(Task.project_id == project_id)
            if created_after:
                task_query = task_query.where(Task.created_at >= created_after)
            if created_before:
                task_query = task_query.where(Task.created_at <= created_before)

            task_results = await db.execute(task_query)
            for task in task_results.scalars().all():
                score = _calculate_keyword_score(q, task.title)
                item = SearchResultItem(
                    id=task.id,
                    type="task",
                    title=task.title,
                    description=None,  # JSONB can't be displayed as string
                    snippet=None,
                    url=f"/projects/{task.project_id}?task={task.id}",
                    created_at=task.created_at,
                    updated_at=task.updated_at,
                    metadata={
                        "status": task.status,
                        "priority": task.priority,
                        "project_id": str(task.project_id),
                    },
                    score=score,
                )
                _merge_result(results, item, "keyword")

        # Search Documents - use team membership via project for access control
        if "document" in search_types and user_team_ids:
            doc_query = (
                select(Document)
                .join(Project, Document.project_id == Project.id)
                .where(Project.team_id.in_(user_team_ids))
                .where(
                    or_(
                        func.lower(Document.title).like(search_term),
                        func.lower(Document.content_text).like(search_term),
                    )
                )
            )
            if project_id:
                doc_query = doc_query.where(Document.project_id == project_id)
            if created_after:
                doc_query = doc_query.where(Document.created_at >= created_after)
            if created_before:
                doc_query = doc_query.where(Document.created_at <= created_before)

            doc_results = await db.execute(doc_query)
            for doc in doc_results.scalars().all():
                score = _calculate_keyword_score(q, doc.title, doc.content_text)
                item = SearchResultItem(
                    id=doc.id,
                    type="document",
                    title=doc.title,
                    description=None,
                    snippet=_get_snippet(doc.content_text, q) if doc.content_text else None,
                    url=f"/documents/{doc.id}",
                    created_at=doc.created_at,
                    updated_at=doc.updated_at,
                    metadata={
                        "status": doc.status,
                        "document_type": doc.document_type,
                    },
                    score=score,
                )
                _merge_result(results, item, "keyword")

        # Search Blockers - use team membership via project for access control
        if "blocker" in search_types and user_team_ids:
            blocker_query = (
                select(Blocker)
                .join(Project, Blocker.project_id == Project.id)
                .where(Project.team_id.in_(user_team_ids))
                .where(func.lower(Blocker.title).like(search_term))
            )
            if project_id:
                blocker_query = blocker_query.where(Blocker.project_id == project_id)
            if created_after:
                blocker_query = blocker_query.where(Blocker.created_at >= created_after)
            if created_before:
                blocker_query = blocker_query.where(Blocker.created_at <= created_before)

            blocker_results = await db.execute(blocker_query)
            for blocker in blocker_results.scalars().all():
                score = _calculate_keyword_score(q, blocker.title)
                item = SearchResultItem(
                    id=blocker.id,
                    type="blocker",
                    title=blocker.title,
                    description=None,  # JSONB can't be displayed as string
                    snippet=None,
                    url=f"/projects/{blocker.project_id}/blockers/{blocker.id}",
                    created_at=blocker.created_at,
                    updated_at=blocker.updated_at,
                    metadata={
                        "status": blocker.status,
                        "priority": blocker.priority,
                        "blocker_type": blocker.blocker_type,
                        "impact_level": blocker.impact_level,
                        "project_id": str(blocker.project_id),
                    },
                    score=score,
                )
                _merge_result(results, item, "keyword")

        # Search Reviews - use team membership via project for access control
        if "review" in search_types and user_team_ids:
            review_query = (
                select(Review)
                .join(Project, Review.project_id == Project.id)
                .where(Project.team_id.in_(user_team_ids))
                .where(
                    or_(
                        func.lower(Review.title).like(search_term),
                        func.lower(Review.description).like(search_term),
                    )
                )
            )
            if project_id:
                review_query = review_query.where(Review.project_id == project_id)
            if created_after:
                review_query = review_query.where(Review.created_at >= created_after)
            if created_before:
                review_query = review_query.where(Review.created_at <= created_before)

            review_results = await db.execute(review_query)
            for review in review_results.scalars().all():
                score = _calculate_keyword_score(q, review.title, review.description)
                item = SearchResultItem(
                    id=review.id,
                    type="review",
                    title=review.title,
                    description=review.description[:200] if review.description else None,
                    snippet=_get_snippet(review.description, q) if review.description else None,
                    url=f"/reviews/{review.id}",
                    created_at=review.created_at,
                    updated_at=review.updated_at,
                    metadata={
                        "status": review.status,
                        "priority": review.priority,
                        "review_type": review.review_type,
                        "project_id": str(review.project_id),
                        "document_id": str(review.document_id),
                    },
                    score=score,
                )
                _merge_result(results, item, "keyword")

        # Search Ideas - these have organization_id directly
        if "idea" in search_types and user_org_ids:
            idea_query = (
                select(Idea)
                .where(Idea.organization_id.in_(user_org_ids))
                .where(
                    or_(
                        func.lower(Idea.title).like(search_term),
                        func.lower(Idea.content).like(search_term),
                    )
                )
            )
            if created_after:
                idea_query = idea_query.where(Idea.created_at >= created_after)
            if created_before:
                idea_query = idea_query.where(Idea.created_at <= created_before)

            idea_results = await db.execute(idea_query)
            for idea in idea_results.scalars().all():
                score = _calculate_keyword_score(q, idea.title or "", idea.content)
                item = SearchResultItem(
                    id=idea.id,
                    type="idea",
                    title=idea.title or idea.content[:100],  # Use content start if no title
                    description=idea.content[:200] if idea.content else None,
                    snippet=_get_snippet(idea.content, q) if idea.content else None,
                    url=f"/ideas/{idea.id}",
                    created_at=idea.created_at,
                    updated_at=idea.updated_at,
                    metadata={
                        "status": idea.status,
                        "source": idea.source,
                    },
                    score=score,
                )
                _merge_result(results, item, "keyword")

        # Search Papers - these have organization_id directly
        # Note: Paper.authors is ARRAY type, can't use .like() - only search title and abstract
        if "paper" in search_types and user_org_ids:
            paper_query = (
                select(Paper)
                .where(Paper.organization_id.in_(user_org_ids))
                .where(
                    or_(
                        func.lower(Paper.title).like(search_term),
                        func.lower(Paper.abstract).like(search_term),
                    )
                )
            )
            if created_after:
                paper_query = paper_query.where(Paper.created_at >= created_after)
            if created_before:
                paper_query = paper_query.where(Paper.created_at <= created_before)

            paper_results = await db.execute(paper_query)
            for paper in paper_results.scalars().all():
                score = _calculate_keyword_score(q, paper.title, paper.abstract)
                item = SearchResultItem(
                    id=paper.id,
                    type="paper",
                    title=paper.title,
                    description=", ".join(paper.authors) if paper.authors else None,
                    snippet=_get_snippet(paper.abstract, q) if paper.abstract else None,
                    url=f"/knowledge/papers/{paper.id}",
                    created_at=paper.created_at,
                    updated_at=paper.updated_at,
                    metadata={
                        "year": paper.publication_year,
                        "journal": paper.journal,
                        "doi": paper.doi,
                    },
                    score=score,
                )
                _merge_result(results, item, "keyword")

        # Search Collections - these have organization_id directly
        if "collection" in search_types and user_org_ids:
            coll_query = (
                select(Collection)
                .where(Collection.organization_id.in_(user_org_ids))
                .where(
                    or_(
                        func.lower(Collection.name).like(search_term),
                        func.lower(Collection.description).like(search_term),
                    )
                )
            )
            if created_after:
                coll_query = coll_query.where(Collection.created_at >= created_after)
            if created_before:
                coll_query = coll_query.where(Collection.created_at <= created_before)

            coll_results = await db.execute(coll_query)
            for coll in coll_results.scalars().all():
                score = _calculate_keyword_score(q, coll.name, coll.description)
                item = SearchResultItem(
                    id=coll.id,
                    type="collection",
                    title=coll.name,
                    description=coll.description,
                    snippet=_get_snippet(coll.description, q) if coll.description else None,
                    url=f"/knowledge/collections/{coll.id}",
                    created_at=coll.created_at,
                    updated_at=coll.updated_at,
                    metadata={
                        "visibility": coll.visibility,
                    },
                    score=score,
                )
                _merge_result(results, item, "keyword")

        # Search Users - scoped to users in same organizations (security fix)
        if "user" in search_types and user_org_ids:
            # Get users who are members of organizations the current user belongs to
            user_query = (
                select(User)
                .join(OrganizationMember, User.id == OrganizationMember.user_id)
                .where(OrganizationMember.organization_id.in_(user_org_ids))
                .where(
                    or_(
                        func.lower(User.email).like(search_term),
                        func.lower(User.display_name).like(search_term),
                    )
                )
                .distinct()  # User might be in multiple orgs
            )

            user_results = await db.execute(user_query)
            for user in user_results.scalars().all():
                score = _calculate_keyword_score(q, user.display_name or user.email, user.email)
                item = SearchResultItem(
                    id=user.id,
                    type="user",
                    title=user.display_name or user.email,
                    description=user.email if user.display_name else None,
                    snippet=None,
                    url=f"/users/{user.id}",
                    created_at=user.created_at,
                    updated_at=user.updated_at,
                    metadata={
                        "avatar_url": user.avatar_url,
                    },
                    score=score,
                )
                _merge_result(results, item, "keyword")

        # Search Journal Entries - these have organization_id directly
        if "journal" in search_types and user_org_ids:
            journal_query = (
                select(JournalEntry)
                .where(JournalEntry.organization_id.in_(user_org_ids))
                .where(JournalEntry.is_archived == False)
                .where(
                    or_(
                        func.lower(JournalEntry.title).like(search_term),
                        func.lower(JournalEntry.content_text).like(search_term),
                    )
                )
            )
            if project_id:
                journal_query = journal_query.where(JournalEntry.project_id == project_id)
            if created_after:
                journal_query = journal_query.where(JournalEntry.created_at >= created_after)
            if created_before:
                journal_query = journal_query.where(JournalEntry.created_at <= created_before)

            journal_results = await db.execute(journal_query)
            for journal in journal_results.scalars().all():
                score = _calculate_keyword_score(
                    q,
                    journal.title or f"Journal Entry - {journal.entry_date.isoformat()}",
                    journal.content_text
                )
                item = SearchResultItem(
                    id=journal.id,
                    type="journal",
                    title=journal.title or f"Journal Entry - {journal.entry_date.isoformat()}",
                    description=journal.content_text[:200] if journal.content_text else None,
                    snippet=_get_snippet(journal.content_text, q) if journal.content_text else None,
                    url=f"/journals/{journal.id}",
                    created_at=journal.created_at,
                    updated_at=journal.updated_at,
                    metadata={
                        "entry_type": journal.entry_type,
                        "entry_date": journal.entry_date.isoformat(),
                        "scope": journal.scope,
                        "project_id": str(journal.project_id) if journal.project_id else None,
                    },
                    score=score,
                )
                _merge_result(results, item, "keyword")

    # ============================================================
    # SEMANTIC SEARCH (for embeddable entities only)
    # ============================================================

    if run_semantic and query_embedding:
        # Import pgvector operators
        from pgvector.sqlalchemy import Vector

        # Semantic search limit (we fetch more than needed for merging)
        semantic_limit = min(limit * 2, 50)

        # Search Tasks semantically
        if "task" in search_types and user_team_ids:
            # Use raw SQL for vector similarity search
            task_semantic_query = (
                select(
                    Task,
                    (1 - Task.embedding.cosine_distance(query_embedding)).label("similarity")
                )
                .join(Project, Task.project_id == Project.id)
                .where(Project.team_id.in_(user_team_ids))
                .where(Task.embedding.isnot(None))
                .order_by((1 - Task.embedding.cosine_distance(query_embedding)).desc())
                .limit(semantic_limit)
            )
            if project_id:
                task_semantic_query = task_semantic_query.where(Task.project_id == project_id)
            if created_after:
                task_semantic_query = task_semantic_query.where(Task.created_at >= created_after)
            if created_before:
                task_semantic_query = task_semantic_query.where(Task.created_at <= created_before)

            task_semantic_results = await db.execute(task_semantic_query)
            for row in task_semantic_results.all():
                task = row[0]
                similarity = row[1]
                if similarity and similarity > 0.3:  # Minimum similarity threshold
                    semantic_score = similarity * SCORE_SEMANTIC_MULTIPLIER
                    item = SearchResultItem(
                        id=task.id,
                        type="task",
                        title=task.title,
                        description=None,
                        snippet=None,
                        url=f"/projects/{task.project_id}?task={task.id}",
                        created_at=task.created_at,
                        updated_at=task.updated_at,
                        metadata={
                            "status": task.status,
                            "priority": task.priority,
                            "project_id": str(task.project_id),
                        },
                        score=semantic_score,
                    )
                    _merge_result(results, item, "semantic")

        # Search Documents semantically
        if "document" in search_types and user_team_ids:
            doc_semantic_query = (
                select(
                    Document,
                    (1 - Document.embedding.cosine_distance(query_embedding)).label("similarity")
                )
                .join(Project, Document.project_id == Project.id)
                .where(Project.team_id.in_(user_team_ids))
                .where(Document.embedding.isnot(None))
                .order_by((1 - Document.embedding.cosine_distance(query_embedding)).desc())
                .limit(semantic_limit)
            )
            if project_id:
                doc_semantic_query = doc_semantic_query.where(Document.project_id == project_id)
            if created_after:
                doc_semantic_query = doc_semantic_query.where(Document.created_at >= created_after)
            if created_before:
                doc_semantic_query = doc_semantic_query.where(Document.created_at <= created_before)

            doc_semantic_results = await db.execute(doc_semantic_query)
            for row in doc_semantic_results.all():
                doc = row[0]
                similarity = row[1]
                if similarity and similarity > 0.3:
                    semantic_score = similarity * SCORE_SEMANTIC_MULTIPLIER
                    item = SearchResultItem(
                        id=doc.id,
                        type="document",
                        title=doc.title,
                        description=None,
                        snippet=doc.content_text[:150] + "..." if doc.content_text and len(doc.content_text) > 150 else doc.content_text,
                        url=f"/documents/{doc.id}",
                        created_at=doc.created_at,
                        updated_at=doc.updated_at,
                        metadata={
                            "status": doc.status,
                            "document_type": doc.document_type,
                        },
                        score=semantic_score,
                    )
                    _merge_result(results, item, "semantic")

        # Search Journal Entries semantically
        if "journal" in search_types and user_org_ids:
            journal_semantic_query = (
                select(
                    JournalEntry,
                    (1 - JournalEntry.embedding.cosine_distance(query_embedding)).label("similarity")
                )
                .where(JournalEntry.organization_id.in_(user_org_ids))
                .where(JournalEntry.is_archived == False)
                .where(JournalEntry.embedding.isnot(None))
                .order_by((1 - JournalEntry.embedding.cosine_distance(query_embedding)).desc())
                .limit(semantic_limit)
            )
            if project_id:
                journal_semantic_query = journal_semantic_query.where(JournalEntry.project_id == project_id)
            if created_after:
                journal_semantic_query = journal_semantic_query.where(JournalEntry.created_at >= created_after)
            if created_before:
                journal_semantic_query = journal_semantic_query.where(JournalEntry.created_at <= created_before)

            journal_semantic_results = await db.execute(journal_semantic_query)
            for row in journal_semantic_results.all():
                journal = row[0]
                similarity = row[1]
                if similarity and similarity > 0.3:
                    semantic_score = similarity * SCORE_SEMANTIC_MULTIPLIER
                    item = SearchResultItem(
                        id=journal.id,
                        type="journal",
                        title=journal.title or f"Journal Entry - {journal.entry_date.isoformat()}",
                        description=journal.content_text[:200] if journal.content_text else None,
                        snippet=journal.content_text[:150] + "..." if journal.content_text and len(journal.content_text) > 150 else journal.content_text,
                        url=f"/journals/{journal.id}",
                        created_at=journal.created_at,
                        updated_at=journal.updated_at,
                        metadata={
                            "entry_type": journal.entry_type,
                            "entry_date": journal.entry_date.isoformat(),
                            "scope": journal.scope,
                            "project_id": str(journal.project_id) if journal.project_id else None,
                        },
                        score=semantic_score,
                    )
                    _merge_result(results, item, "semantic")

        # Search Papers semantically
        if "paper" in search_types and user_org_ids:
            paper_semantic_query = (
                select(
                    Paper,
                    (1 - Paper.embedding.cosine_distance(query_embedding)).label("similarity")
                )
                .where(Paper.organization_id.in_(user_org_ids))
                .where(Paper.embedding.isnot(None))
                .order_by((1 - Paper.embedding.cosine_distance(query_embedding)).desc())
                .limit(semantic_limit)
            )
            if created_after:
                paper_semantic_query = paper_semantic_query.where(Paper.created_at >= created_after)
            if created_before:
                paper_semantic_query = paper_semantic_query.where(Paper.created_at <= created_before)

            paper_semantic_results = await db.execute(paper_semantic_query)
            for row in paper_semantic_results.all():
                paper = row[0]
                similarity = row[1]
                if similarity and similarity > 0.3:
                    semantic_score = similarity * SCORE_SEMANTIC_MULTIPLIER
                    item = SearchResultItem(
                        id=paper.id,
                        type="paper",
                        title=paper.title,
                        description=", ".join(paper.authors) if paper.authors else None,
                        snippet=paper.abstract[:150] + "..." if paper.abstract and len(paper.abstract) > 150 else paper.abstract,
                        url=f"/knowledge/papers/{paper.id}",
                        created_at=paper.created_at,
                        updated_at=paper.updated_at,
                        metadata={
                            "year": paper.publication_year,
                            "journal": paper.journal,
                            "doi": paper.doi,
                        },
                        score=semantic_score,
                    )
                    _merge_result(results, item, "semantic")

    # ============================================================
    # SORT AND PAGINATE RESULTS
    # ============================================================

    # Convert dict to list for sorting
    results_list = list(results.values())

    # Sort results
    if sort_by == "created_at":
        results_list.sort(key=lambda x: x.created_at, reverse=True)
    elif sort_by == "updated_at":
        results_list.sort(key=lambda x: x.updated_at or x.created_at, reverse=True)
    else:  # relevance - use calculated scores
        # Sort by score (descending), then by created_at (descending) as tiebreaker
        results_list.sort(key=lambda x: (x.score or 0, x.created_at), reverse=True)

    # Pagination
    total = len(results_list)
    paginated_results = results_list[skip:skip + limit]
    has_more = skip + len(paginated_results) < total

    return SearchResponse(
        results=paginated_results,
        total=total,
        query=q,
        filters={
            "types": types,
            "project_id": str(project_id) if project_id else None,
            "created_after": created_after.isoformat() if created_after else None,
            "created_before": created_before.isoformat() if created_before else None,
            "mode": mode,
        },
        has_more=has_more,
    )


@router.get("/suggestions", response_model=list[SearchSuggestion])
async def search_suggestions(
    current_user: CurrentUser,
    q: str = Query(..., min_length=1),
    organization_id: UUID = Query(...),  # Kept for backward compatibility
    limit: int = Query(10, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    """
    Get search autocomplete suggestions.

    Returns quick suggestions based on partial query.
    """
    search_term = f"{q.lower()}%"
    suggestions: list[SearchSuggestion] = []

    # Get user's team memberships (includes personal teams)
    team_result = await db.execute(
        select(TeamMember.team_id).where(TeamMember.user_id == current_user.id)
    )
    user_team_ids = [row[0] for row in team_result.all()]

    # Get user's organization memberships
    org_result = await db.execute(
        select(OrganizationMember.organization_id)
        .where(OrganizationMember.user_id == current_user.id)
    )
    user_org_ids = [row[0] for row in org_result.all()]

    # Get project name suggestions - use team membership
    if user_team_ids:
        project_query = (
            select(Project.id, Project.name)
            .where(Project.team_id.in_(user_team_ids))
            .where(Project.is_archived == False)
            .where(func.lower(Project.name).like(search_term))
            .limit(3)
        )
        project_results = await db.execute(project_query)
        for row in project_results.all():
            suggestions.append(SearchSuggestion(
                text=row.name,
                type="project",
                id=row.id,
            ))

    # Get task title suggestions - use team membership via project
    if user_team_ids:
        task_query = (
            select(Task.id, Task.title)
            .join(Project, Task.project_id == Project.id)
            .where(Project.team_id.in_(user_team_ids))
            .where(func.lower(Task.title).like(search_term))
            .limit(3)
        )
        task_results = await db.execute(task_query)
        for row in task_results.all():
            suggestions.append(SearchSuggestion(
                text=row.title,
                type="task",
                id=row.id,
            ))

    # Get document title suggestions - use team membership via project
    if user_team_ids:
        doc_query = (
            select(Document.id, Document.title)
            .join(Project, Document.project_id == Project.id)
            .where(Project.team_id.in_(user_team_ids))
            .where(func.lower(Document.title).like(search_term))
            .limit(3)
        )
        doc_results = await db.execute(doc_query)
        for row in doc_results.all():
            suggestions.append(SearchSuggestion(
                text=row.title,
                type="document",
                id=row.id,
            ))

    # Get blocker title suggestions - use team membership via project
    if user_team_ids:
        blocker_query = (
            select(Blocker.id, Blocker.title)
            .join(Project, Blocker.project_id == Project.id)
            .where(Project.team_id.in_(user_team_ids))
            .where(func.lower(Blocker.title).like(search_term))
            .limit(2)
        )
        blocker_results = await db.execute(blocker_query)
        for row in blocker_results.all():
            suggestions.append(SearchSuggestion(
                text=row.title,
                type="blocker",
                id=row.id,
            ))

    # Get review title suggestions - use team membership via project
    if user_team_ids:
        review_query = (
            select(Review.id, Review.title)
            .join(Project, Review.project_id == Project.id)
            .where(Project.team_id.in_(user_team_ids))
            .where(func.lower(Review.title).like(search_term))
            .limit(2)
        )
        review_results = await db.execute(review_query)
        for row in review_results.all():
            suggestions.append(SearchSuggestion(
                text=row.title,
                type="review",
                id=row.id,
            ))

    # Get idea suggestions - use organization membership
    if user_org_ids:
        idea_query = (
            select(Idea.id, Idea.title, Idea.content)
            .where(Idea.organization_id.in_(user_org_ids))
            .where(
                or_(
                    func.lower(Idea.title).like(search_term),
                    func.lower(Idea.content).like(search_term),
                )
            )
            .limit(2)
        )
        idea_results = await db.execute(idea_query)
        for row in idea_results.all():
            suggestions.append(SearchSuggestion(
                text=row.title or row.content[:50],  # Fallback to content start if no title
                type="idea",
                id=row.id,
            ))

    # Get paper title suggestions - use organization membership
    if user_org_ids:
        paper_query = (
            select(Paper.id, Paper.title)
            .where(Paper.organization_id.in_(user_org_ids))
            .where(func.lower(Paper.title).like(search_term))
            .limit(2)
        )
        paper_results = await db.execute(paper_query)
        for row in paper_results.all():
            suggestions.append(SearchSuggestion(
                text=row.title,
                type="paper",
                id=row.id,
            ))

    # Get journal entry title suggestions - use organization membership
    if user_org_ids:
        journal_query = (
            select(JournalEntry.id, JournalEntry.title, JournalEntry.entry_date)
            .where(JournalEntry.organization_id.in_(user_org_ids))
            .where(JournalEntry.is_archived == False)
            .where(func.lower(JournalEntry.title).like(search_term))
            .limit(2)
        )
        journal_results = await db.execute(journal_query)
        for row in journal_results.all():
            suggestions.append(SearchSuggestion(
                text=row.title or f"Journal Entry - {row.entry_date.isoformat()}",
                type="journal",
                id=row.id,
            ))

    return suggestions[:limit]


@router.get("/recent")
async def recent_searches(
    user_id: UUID = Query(...),
    limit: int = Query(10, ge=1, le=20),
):
    """
    Get user's recent searches.

    Note: This would typically be stored in a separate table or cache.
    For now, returns empty list as placeholder.
    """
    # TODO: Implement recent search tracking
    return []


def _get_snippet(text: str | None, query: str, max_length: int = 150) -> str | None:
    """Extract a snippet around the search query match."""
    if not text:
        return None

    text_lower = text.lower()
    query_lower = query.lower()

    # Find the position of the query
    pos = text_lower.find(query_lower)
    if pos == -1:
        # Return beginning of text if no match
        return text[:max_length] + "..." if len(text) > max_length else text

    # Calculate snippet boundaries
    start = max(0, pos - 50)
    end = min(len(text), pos + len(query) + 100)

    snippet = text[start:end]

    # Add ellipsis if truncated
    if start > 0:
        snippet = "..." + snippet
    if end < len(text):
        snippet = snippet + "..."

    return snippet
