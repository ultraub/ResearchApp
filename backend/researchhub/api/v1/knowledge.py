"""Knowledge API endpoints for papers and collections."""

from datetime import datetime
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.db.session import get_db
from researchhub.api.v1.auth import get_current_user
from researchhub.models import Paper, Collection, CollectionPaper, PaperHighlight, PaperLink, User
from researchhub.services.external_apis import crossref_service, pubmed_service

logger = structlog.get_logger()

router = APIRouter(tags=["knowledge"])


# --- Paper Schemas ---

class PaperCreate(BaseModel):
    """Schema for creating a paper."""
    doi: str | None = None
    pmid: str | None = None
    title: str = Field(..., min_length=1, max_length=1000)
    authors: list[str] = Field(default_factory=list)
    journal: str | None = None
    publication_date: datetime | None = None
    abstract: str | None = None
    pdf_url: HttpUrl | None = None
    organization_id: UUID


class PaperUpdate(BaseModel):
    """Schema for updating a paper."""
    title: str | None = Field(None, min_length=1, max_length=1000)
    authors: list[str] | None = None
    journal: str | None = None
    publication_date: datetime | None = None
    abstract: str | None = None
    pdf_url: HttpUrl | None = None
    notes: str | None = None
    read_status: str | None = Field(None, pattern="^(unread|reading|read)$")
    rating: int | None = Field(None, ge=1, le=5)


class PaperResponse(BaseModel):
    """Schema for paper response."""
    id: UUID
    doi: str | None
    pmid: str | None
    title: str
    authors: list[str]
    journal: str | None
    publication_date: datetime | None
    abstract: str | None
    pdf_url: str | None
    notes: str | None
    read_status: str
    rating: int | None
    ai_summary: str | None
    ai_key_findings: list[str] | None
    organization_id: UUID
    added_by_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DOIImportRequest(BaseModel):
    """Schema for importing a paper by DOI."""
    doi: str
    organization_id: UUID


class PMIDImportRequest(BaseModel):
    """Schema for importing a paper by PMID."""
    pmid: str
    organization_id: UUID


# --- Collection Schemas ---

class CollectionCreate(BaseModel):
    """Schema for creating a collection."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    color: str | None = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    organization_id: UUID


class CollectionUpdate(BaseModel):
    """Schema for updating a collection."""
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    color: str | None = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    is_shared: bool | None = None


class CollectionResponse(BaseModel):
    """Schema for collection response."""
    id: UUID
    name: str
    description: str | None
    color: str | None
    is_shared: bool
    paper_count: int
    organization_id: UUID
    created_by_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Highlight Schemas ---

class HighlightCreate(BaseModel):
    """Schema for creating a highlight."""
    paper_id: UUID
    text: str
    color: str | None = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    note: str | None = None
    page_number: int | None = None
    position_data: dict | None = None


class HighlightResponse(BaseModel):
    """Schema for highlight response."""
    id: UUID
    paper_id: UUID
    text: str
    color: str
    note: str | None
    page_number: int | None
    position_data: dict | None
    created_by_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


# --- Paper Link Schemas ---

class PaperLinkCreate(BaseModel):
    """Schema for creating a paper link to an entity (project, task, document)."""
    paper_id: UUID
    linked_entity_type: str = Field(..., pattern="^(project|task|document)$")
    linked_entity_id: UUID
    link_type: str = Field(default="reference", pattern="^(reference|citation|related)$")
    notes: str | None = None


class PaperLinkResponse(BaseModel):
    """Schema for paper link response."""
    id: UUID
    paper_id: UUID
    linked_entity_type: str
    linked_entity_id: UUID
    link_type: str
    notes: str | None
    created_by_id: UUID | None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Paper Endpoints ---

@router.post("/papers", response_model=PaperResponse, status_code=status.HTTP_201_CREATED)
async def create_paper(
    paper_data: PaperCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new paper manually."""
    # Check for duplicate DOI or PMID
    if paper_data.doi:
        existing = await db.execute(
            select(Paper).where(
                Paper.doi == paper_data.doi,
                Paper.organization_id == paper_data.organization_id
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Paper with this DOI already exists"
            )

    if paper_data.pmid:
        existing = await db.execute(
            select(Paper).where(
                Paper.pmid == paper_data.pmid,
                Paper.organization_id == paper_data.organization_id
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Paper with this PMID already exists"
            )

    paper = Paper(
        **paper_data.model_dump(exclude={"pdf_url"}),
        pdf_url=str(paper_data.pdf_url) if paper_data.pdf_url else None,
        added_by_id=current_user.id,
    )

    db.add(paper)
    await db.commit()
    await db.refresh(paper)

    return paper


@router.get("/papers", response_model=list[PaperResponse])
async def list_papers(
    organization_id: UUID,
    search: str | None = None,
    read_status: str | None = Query(None, pattern="^(unread|reading|read)$"),
    collection_id: UUID | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List papers with filtering and search."""
    query = select(Paper).where(Paper.organization_id == organization_id)

    if search:
        search_filter = or_(
            Paper.title.ilike(f"%{search}%"),
            Paper.abstract.ilike(f"%{search}%"),
            Paper.doi.ilike(f"%{search}%"),
            Paper.journal.ilike(f"%{search}%"),
        )
        query = query.where(search_filter)

    if read_status:
        query = query.where(Paper.read_status == read_status)

    if collection_id:
        query = query.join(CollectionPaper).where(
            CollectionPaper.collection_id == collection_id
        )

    query = query.order_by(Paper.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/papers/{paper_id}", response_model=PaperResponse)
async def get_paper(
    paper_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific paper by ID."""
    result = await db.execute(
        select(Paper).where(Paper.id == paper_id)
    )
    paper = result.scalar_one_or_none()

    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found"
        )

    return paper


@router.patch("/papers/{paper_id}", response_model=PaperResponse)
async def update_paper(
    paper_id: UUID,
    updates: PaperUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a paper."""
    result = await db.execute(
        select(Paper).where(Paper.id == paper_id)
    )
    paper = result.scalar_one_or_none()

    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found"
        )

    update_data = updates.model_dump(exclude_unset=True)
    if "pdf_url" in update_data and update_data["pdf_url"]:
        update_data["pdf_url"] = str(update_data["pdf_url"])

    for field, value in update_data.items():
        setattr(paper, field, value)

    await db.commit()
    await db.refresh(paper)

    return paper


@router.delete("/papers/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_paper(
    paper_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a paper."""
    result = await db.execute(
        select(Paper).where(Paper.id == paper_id)
    )
    paper = result.scalar_one_or_none()

    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found"
        )

    await db.delete(paper)
    await db.commit()


@router.post("/papers/import/doi", response_model=PaperResponse, status_code=status.HTTP_201_CREATED)
async def import_paper_by_doi(
    request: DOIImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import a paper by DOI from CrossRef API."""
    # Check for existing
    existing = await db.execute(
        select(Paper).where(
            Paper.doi == request.doi,
            Paper.organization_id == request.organization_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Paper with this DOI already exists"
        )

    # Fetch metadata from CrossRef
    logger.info("Fetching paper metadata from CrossRef", doi=request.doi)
    metadata = await crossref_service.fetch_by_doi(request.doi)

    if metadata:
        # Create paper with fetched metadata
        paper = Paper(
            doi=metadata.doi or request.doi,
            title=metadata.title,
            authors=metadata.authors,
            journal=metadata.journal,
            publication_year=metadata.year,
            abstract=metadata.abstract,
            organization_id=request.organization_id,
            added_by_id=current_user.id,
        )
        logger.info("Paper metadata fetched successfully", doi=request.doi, title=metadata.title)
    else:
        # Create placeholder if CrossRef lookup fails
        logger.warning("CrossRef lookup failed, creating placeholder", doi=request.doi)
        paper = Paper(
            doi=request.doi,
            title=f"Paper {request.doi}",
            authors=[],
            organization_id=request.organization_id,
            added_by_id=current_user.id,
        )

    db.add(paper)
    await db.commit()
    await db.refresh(paper)

    return paper


@router.post("/papers/import/pmid", response_model=PaperResponse, status_code=status.HTTP_201_CREATED)
async def import_paper_by_pmid(
    request: PMIDImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Import a paper by PMID from PubMed API."""
    # Check for existing
    existing = await db.execute(
        select(Paper).where(
            Paper.pmid == request.pmid,
            Paper.organization_id == request.organization_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Paper with this PMID already exists"
        )

    # Fetch metadata from PubMed
    logger.info("Fetching paper metadata from PubMed", pmid=request.pmid)
    metadata = await pubmed_service.fetch_by_pmid(request.pmid)

    if metadata:
        # Create paper with fetched metadata
        paper = Paper(
            pmid=metadata.pmid or request.pmid,
            doi=metadata.doi,
            title=metadata.title,
            authors=metadata.authors,
            journal=metadata.journal,
            publication_year=metadata.year,
            abstract=metadata.abstract,
            organization_id=request.organization_id,
            added_by_id=current_user.id,
        )
        logger.info("Paper metadata fetched successfully", pmid=request.pmid, title=metadata.title)
    else:
        # Create placeholder if PubMed lookup fails
        logger.warning("PubMed lookup failed, creating placeholder", pmid=request.pmid)
        paper = Paper(
            pmid=request.pmid,
            title=f"Paper PMID:{request.pmid}",
            authors=[],
            organization_id=request.organization_id,
            added_by_id=current_user.id,
        )

    db.add(paper)
    await db.commit()
    await db.refresh(paper)

    return paper


# --- Collection Endpoints ---

@router.post("/collections", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    collection_data: CollectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new collection."""
    collection = Collection(
        **collection_data.model_dump(),
        created_by_id=current_user.id,
        paper_count=0,
    )

    db.add(collection)
    await db.commit()
    await db.refresh(collection)

    return collection


@router.get("/collections", response_model=list[CollectionResponse])
async def list_collections(
    organization_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List collections for an organization."""
    result = await db.execute(
        select(Collection)
        .where(Collection.organization_id == organization_id)
        .order_by(Collection.name)
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/collections/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    collection_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific collection by ID."""
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalar_one_or_none()

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found"
        )

    return collection


@router.patch("/collections/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: UUID,
    updates: CollectionUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a collection."""
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalar_one_or_none()

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found"
        )

    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(collection, field, value)

    await db.commit()
    await db.refresh(collection)

    return collection


@router.delete("/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a collection."""
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalar_one_or_none()

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found"
        )

    await db.delete(collection)
    await db.commit()


@router.post("/collections/{collection_id}/papers/{paper_id}", status_code=status.HTTP_201_CREATED)
async def add_paper_to_collection(
    collection_id: UUID,
    paper_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a paper to a collection."""
    # Verify collection exists
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found"
        )

    # Verify paper exists
    result = await db.execute(
        select(Paper).where(Paper.id == paper_id)
    )
    paper = result.scalar_one_or_none()
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found"
        )

    # Check if already in collection
    existing = await db.execute(
        select(CollectionPaper).where(
            CollectionPaper.collection_id == collection_id,
            CollectionPaper.paper_id == paper_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Paper already in collection"
        )

    # Add to collection
    collection_paper = CollectionPaper(
        collection_id=collection_id,
        paper_id=paper_id,
        added_by_id=current_user.id,
    )
    db.add(collection_paper)

    # Update paper count
    collection.paper_count += 1

    await db.commit()

    return {"message": "Paper added to collection"}


@router.delete("/collections/{collection_id}/papers/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_paper_from_collection(
    collection_id: UUID,
    paper_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Remove a paper from a collection."""
    result = await db.execute(
        select(CollectionPaper).where(
            CollectionPaper.collection_id == collection_id,
            CollectionPaper.paper_id == paper_id
        )
    )
    collection_paper = result.scalar_one_or_none()

    if not collection_paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not in collection"
        )

    await db.delete(collection_paper)

    # Update paper count
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalar_one_or_none()
    if collection and collection.paper_count > 0:
        collection.paper_count -= 1

    await db.commit()


@router.get("/collections/{collection_id}/papers", response_model=list[PaperResponse])
async def get_collection_papers(
    collection_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get all papers in a collection."""
    result = await db.execute(
        select(Paper)
        .join(CollectionPaper)
        .where(CollectionPaper.collection_id == collection_id)
        .order_by(CollectionPaper.added_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


# --- Highlight Endpoints ---

@router.post("/papers/{paper_id}/highlights", response_model=HighlightResponse, status_code=status.HTTP_201_CREATED)
async def create_highlight(
    paper_id: UUID,
    highlight_data: HighlightCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new highlight on a paper."""
    # Verify paper exists
    result = await db.execute(
        select(Paper).where(Paper.id == paper_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found"
        )

    highlight = PaperHighlight(
        **highlight_data.model_dump(exclude={"paper_id"}),
        paper_id=paper_id,
        created_by_id=current_user.id,
    )

    db.add(highlight)
    await db.commit()
    await db.refresh(highlight)

    return highlight


@router.get("/papers/{paper_id}/highlights", response_model=list[HighlightResponse])
async def get_paper_highlights(
    paper_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get all highlights for a paper."""
    result = await db.execute(
        select(PaperHighlight)
        .where(PaperHighlight.paper_id == paper_id)
        .order_by(PaperHighlight.page_number, PaperHighlight.created_at)
    )
    return result.scalars().all()


@router.delete("/highlights/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_highlight(
    highlight_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a highlight."""
    result = await db.execute(
        select(PaperHighlight).where(PaperHighlight.id == highlight_id)
    )
    highlight = result.scalar_one_or_none()

    if not highlight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Highlight not found"
        )

    await db.delete(highlight)
    await db.commit()


# --- Paper Link Endpoints ---

@router.post("/paper-links", response_model=PaperLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_paper_link(
    link_data: PaperLinkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a link between a paper and an entity (project, task, document)."""
    # Verify paper exists
    result = await db.execute(
        select(Paper).where(Paper.id == link_data.paper_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found"
        )

    # Check for existing link
    existing = await db.execute(
        select(PaperLink).where(
            PaperLink.paper_id == link_data.paper_id,
            PaperLink.linked_entity_type == link_data.linked_entity_type,
            PaperLink.linked_entity_id == link_data.linked_entity_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Link already exists"
        )

    link = PaperLink(
        **link_data.model_dump(),
        created_by_id=current_user.id,
    )

    db.add(link)
    await db.commit()
    await db.refresh(link)

    return link


@router.get("/papers/{paper_id}/links", response_model=list[PaperLinkResponse])
async def get_paper_links(
    paper_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get all links for a paper."""
    result = await db.execute(
        select(PaperLink).where(PaperLink.paper_id == paper_id)
    )
    return result.scalars().all()


@router.get("/projects/{project_id}/papers", response_model=list[PaperResponse])
async def get_project_papers(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get all papers linked to a project."""
    result = await db.execute(
        select(Paper)
        .join(PaperLink, PaperLink.paper_id == Paper.id)
        .where(
            PaperLink.linked_entity_type == "project",
            PaperLink.linked_entity_id == project_id
        )
        .order_by(Paper.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/paper-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_paper_link(
    link_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a paper link."""
    result = await db.execute(
        select(PaperLink).where(PaperLink.id == link_id)
    )
    link = result.scalar_one_or_none()

    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found"
        )

    await db.delete(link)
    await db.commit()
