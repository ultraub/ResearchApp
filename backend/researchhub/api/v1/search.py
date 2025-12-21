"""Global search API endpoints."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.db.session import get_db
from researchhub.models import (
    Project,
    Task,
    Document,
    Idea,
    Paper,
    Collection,
    User,
    JournalEntry,
)

router = APIRouter(prefix="/search", tags=["search"])


# --- Search Schemas ---

class SearchResultItem(BaseModel):
    """Individual search result."""
    id: UUID
    type: str  # project, task, document, idea, paper, collection, user
    title: str
    description: str | None = None
    snippet: str | None = None  # Highlighted text snippet
    url: str  # Frontend URL path
    created_at: datetime
    updated_at: datetime | None = None
    metadata: dict | None = None  # Type-specific metadata

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
    q: str = Query(..., min_length=1, description="Search query"),
    organization_id: UUID = Query(...),
    types: list[str] | None = Query(
        None,
        description="Filter by content types: project, task, document, idea, paper, collection, user, journal"
    ),
    project_id: UUID | None = Query(None, description="Filter by project"),
    created_after: datetime | None = Query(None),
    created_before: datetime | None = Query(None),
    sort_by: Literal["relevance", "created_at", "updated_at"] = Query("relevance"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    Global search across all content types.

    Searches projects, tasks, documents, ideas, papers, collections, and users.
    Results are ranked by relevance and filtered by organization.
    """
    search_term = f"%{q.lower()}%"
    results: list[SearchResultItem] = []

    # Determine which types to search
    search_types = types or ["project", "task", "document", "idea", "paper", "collection", "user", "journal"]

    # Search Projects
    if "project" in search_types:
        project_query = (
            select(Project)
            .where(Project.organization_id == organization_id)
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
            results.append(SearchResultItem(
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
                    "visibility": project.visibility,
                },
            ))

    # Search Tasks
    if "task" in search_types:
        task_query = (
            select(Task)
            .where(
                or_(
                    func.lower(Task.title).like(search_term),
                    func.lower(Task.description).like(search_term),
                )
            )
        )
        if project_id:
            task_query = task_query.where(Task.project_id == project_id)
        if created_after:
            task_query = task_query.where(Task.created_at >= created_after)
        if created_before:
            task_query = task_query.where(Task.created_at <= created_before)

        task_results = await db.execute(task_query)
        for task in task_results.scalars().all():
            results.append(SearchResultItem(
                id=task.id,
                type="task",
                title=task.title,
                description=task.description,
                snippet=_get_snippet(task.description, q) if task.description else None,
                url=f"/projects/{task.project_id}/tasks/{task.id}",
                created_at=task.created_at,
                updated_at=task.updated_at,
                metadata={
                    "status": task.status,
                    "priority": task.priority,
                    "project_id": str(task.project_id),
                },
            ))

    # Search Documents
    if "document" in search_types:
        doc_query = (
            select(Document)
            .where(Document.organization_id == organization_id)
            .where(
                or_(
                    func.lower(Document.title).like(search_term),
                    func.lower(Document.content).like(search_term),
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
            results.append(SearchResultItem(
                id=doc.id,
                type="document",
                title=doc.title,
                description=None,
                snippet=_get_snippet(doc.content, q) if doc.content else None,
                url=f"/documents/{doc.id}",
                created_at=doc.created_at,
                updated_at=doc.updated_at,
                metadata={
                    "status": doc.status,
                    "document_type": doc.document_type,
                },
            ))

    # Search Ideas
    if "idea" in search_types:
        idea_query = (
            select(Idea)
            .where(Idea.organization_id == organization_id)
            .where(
                or_(
                    func.lower(Idea.title).like(search_term),
                    func.lower(Idea.description).like(search_term),
                )
            )
        )
        if created_after:
            idea_query = idea_query.where(Idea.created_at >= created_after)
        if created_before:
            idea_query = idea_query.where(Idea.created_at <= created_before)

        idea_results = await db.execute(idea_query)
        for idea in idea_results.scalars().all():
            results.append(SearchResultItem(
                id=idea.id,
                type="idea",
                title=idea.title,
                description=idea.description,
                snippet=_get_snippet(idea.description, q) if idea.description else None,
                url=f"/ideas/{idea.id}",
                created_at=idea.created_at,
                updated_at=idea.updated_at,
                metadata={
                    "status": idea.status,
                    "category": idea.category,
                },
            ))

    # Search Papers
    if "paper" in search_types:
        paper_query = (
            select(Paper)
            .where(Paper.organization_id == organization_id)
            .where(
                or_(
                    func.lower(Paper.title).like(search_term),
                    func.lower(Paper.abstract).like(search_term),
                    func.lower(Paper.authors).like(search_term),
                )
            )
        )
        if created_after:
            paper_query = paper_query.where(Paper.created_at >= created_after)
        if created_before:
            paper_query = paper_query.where(Paper.created_at <= created_before)

        paper_results = await db.execute(paper_query)
        for paper in paper_results.scalars().all():
            results.append(SearchResultItem(
                id=paper.id,
                type="paper",
                title=paper.title,
                description=paper.authors,
                snippet=_get_snippet(paper.abstract, q) if paper.abstract else None,
                url=f"/knowledge/papers/{paper.id}",
                created_at=paper.created_at,
                updated_at=paper.updated_at,
                metadata={
                    "year": paper.year,
                    "journal": paper.journal,
                    "doi": paper.doi,
                },
            ))

    # Search Collections
    if "collection" in search_types:
        coll_query = (
            select(Collection)
            .where(Collection.organization_id == organization_id)
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
            results.append(SearchResultItem(
                id=coll.id,
                type="collection",
                title=coll.name,
                description=coll.description,
                snippet=_get_snippet(coll.description, q) if coll.description else None,
                url=f"/knowledge/collections/{coll.id}",
                created_at=coll.created_at,
                updated_at=coll.updated_at,
                metadata={
                    "is_public": coll.is_public,
                },
            ))

    # Search Users
    if "user" in search_types:
        user_query = (
            select(User)
            .where(
                or_(
                    func.lower(User.email).like(search_term),
                    func.lower(User.display_name).like(search_term),
                )
            )
        )

        user_results = await db.execute(user_query)
        for user in user_results.scalars().all():
            results.append(SearchResultItem(
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
            ))

    # Search Journal Entries
    if "journal" in search_types:
        journal_query = (
            select(JournalEntry)
            .where(JournalEntry.organization_id == organization_id)
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
            results.append(SearchResultItem(
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
            ))

    # Sort results
    if sort_by == "created_at":
        results.sort(key=lambda x: x.created_at, reverse=True)
    elif sort_by == "updated_at":
        results.sort(key=lambda x: x.updated_at or x.created_at, reverse=True)
    else:  # relevance - prioritize title matches
        def relevance_score(item: SearchResultItem) -> int:
            score = 0
            q_lower = q.lower()
            if q_lower in item.title.lower():
                score += 10
                if item.title.lower().startswith(q_lower):
                    score += 5
            if item.description and q_lower in item.description.lower():
                score += 3
            return score
        results.sort(key=relevance_score, reverse=True)

    # Pagination
    total = len(results)
    results = results[skip:skip + limit]
    has_more = skip + len(results) < total

    return SearchResponse(
        results=results,
        total=total,
        query=q,
        filters={
            "types": types,
            "project_id": str(project_id) if project_id else None,
            "created_after": created_after.isoformat() if created_after else None,
            "created_before": created_before.isoformat() if created_before else None,
        },
        has_more=has_more,
    )


@router.get("/suggestions", response_model=list[SearchSuggestion])
async def search_suggestions(
    q: str = Query(..., min_length=1),
    organization_id: UUID = Query(...),
    limit: int = Query(10, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    """
    Get search autocomplete suggestions.

    Returns quick suggestions based on partial query.
    """
    search_term = f"{q.lower()}%"
    suggestions: list[SearchSuggestion] = []

    # Get project name suggestions
    project_query = (
        select(Project.id, Project.name)
        .where(Project.organization_id == organization_id)
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

    # Get document title suggestions
    doc_query = (
        select(Document.id, Document.title)
        .where(Document.organization_id == organization_id)
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

    # Get idea title suggestions
    idea_query = (
        select(Idea.id, Idea.title)
        .where(Idea.organization_id == organization_id)
        .where(func.lower(Idea.title).like(search_term))
        .limit(2)
    )
    idea_results = await db.execute(idea_query)
    for row in idea_results.all():
        suggestions.append(SearchSuggestion(
            text=row.title,
            type="idea",
            id=row.id,
        ))

    # Get paper title suggestions
    paper_query = (
        select(Paper.id, Paper.title)
        .where(Paper.organization_id == organization_id)
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

    # Get journal entry title suggestions
    journal_query = (
        select(JournalEntry.id, JournalEntry.title, JournalEntry.entry_date)
        .where(JournalEntry.organization_id == organization_id)
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
