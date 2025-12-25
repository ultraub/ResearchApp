"""Export endpoints for generating PDF and CSV files."""

import csv
import io
from datetime import datetime
from typing import Literal
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db_session
from researchhub.models.document import Document
from researchhub.models.idea import Idea
from researchhub.models.knowledge import Paper
from researchhub.models.organization import OrganizationMember
from researchhub.models.project import Project, Task
from researchhub.services.pdf_generator import pdf_generator

router = APIRouter(prefix="/exports")
logger = structlog.get_logger()


class ExportRequest(BaseModel):
    """Export request parameters."""

    format: Literal["csv", "pdf"] = "csv"
    include_metadata: bool = True


def generate_csv(headers: list[str], rows: list[list]) -> io.StringIO:
    """Generate CSV content from headers and rows."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    output.seek(0)
    return output


async def verify_org_access(
    organization_id: UUID,
    user: CurrentUser,
    db: AsyncSession,
) -> None:
    """Verify user has access to organization."""
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this organization",
        )


@router.get("/projects/{project_id}")
async def export_project(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    format: Literal["csv", "pdf"] = Query("csv"),
    include_tasks: bool = Query(True),
    include_documents: bool = Query(True),
):
    """Export project data with tasks and documents."""
    # Fetch project with related data
    query = select(Project).options(selectinload(Project.team)).where(Project.id == project_id)
    if include_tasks:
        query = query.options(selectinload(Project.tasks))
    if include_documents:
        query = query.options(selectinload(Project.documents))

    result = await db.execute(query)
    project = result.scalar_one_or_none()

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    org_id = project.team.organization_id if project.team else None
    if org_id:
        await verify_org_access(org_id, current_user, db)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"project_{project.name.replace(' ', '_')}_{timestamp}"

    if format == "csv":
        headers = ["Type", "Name", "Status", "Created", "Updated", "Description"]
        rows = [
            ["Project", project.name, project.status,
             project.created_at.isoformat(),
             project.updated_at.isoformat() if project.updated_at else "",
             project.description or ""]
        ]

        if include_tasks:
            for task in project.tasks:
                rows.append([
                    "Task", task.title, task.status,
                    task.created_at.isoformat(),
                    task.updated_at.isoformat() if task.updated_at else "",
                    task.description or ""
                ])

        if include_documents:
            for doc in project.documents:
                rows.append([
                    "Document", doc.title, "N/A",
                    doc.created_at.isoformat(),
                    doc.updated_at.isoformat() if doc.updated_at else "",
                    ""
                ])

        output = generate_csv(headers, rows)

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
        )

    else:  # PDF
        # Prepare task data
        task_list = []
        if include_tasks:
            for task in project.tasks:
                task_list.append({
                    'title': task.title,
                    'status': task.status,
                    'priority': task.priority,
                    'due_date': task.due_date.isoformat() if task.due_date else 'N/A',
                })

        # Prepare document data
        doc_list = []
        if include_documents:
            for doc in project.documents:
                doc_list.append({
                    'title': doc.title,
                    'document_type': getattr(doc, 'document_type', 'N/A'),
                    'created_at': doc.created_at.strftime('%Y-%m-%d'),
                })

        output = pdf_generator.generate_project_pdf(
            project_name=project.name,
            project_status=project.status,
            project_description=project.description,
            tasks=task_list,
            documents=doc_list,
        )

        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}.pdf"}
        )


@router.get("/tasks")
async def export_tasks(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    organization_id: UUID = Query(...),
    project_id: UUID | None = Query(None),
    status_filter: str | None = Query(None),
    format: Literal["csv", "pdf"] = Query("csv"),
):
    """Export tasks to CSV or PDF."""
    await verify_org_access(organization_id, current_user, db)

    query = select(Task).join(Project).where(Project.organization_id == organization_id)

    if project_id:
        query = query.where(Task.project_id == project_id)
    if status_filter:
        query = query.where(Task.status == status_filter)

    query = query.order_by(Task.created_at.desc())

    result = await db.execute(query)
    tasks = result.scalars().all()

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"tasks_export_{timestamp}"

    if format == "csv":
        headers = ["Title", "Status", "Priority", "Due Date", "Created", "Assignee", "Project"]
        rows = []

        for task in tasks:
            rows.append([
                task.title,
                task.status,
                task.priority,
                task.due_date.isoformat() if task.due_date else "",
                task.created_at.isoformat(),
                str(task.assignee_id) if task.assignee_id else "",
                str(task.project_id),
            ])

        output = generate_csv(headers, rows)

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
        )

    else:  # PDF
        task_list = []
        for task in tasks:
            task_list.append({
                'title': task.title,
                'status': task.status,
                'priority': task.priority,
                'due_date': task.due_date.isoformat() if task.due_date else 'N/A',
                'assignee': str(task.assignee_id)[:8] if task.assignee_id else 'Unassigned',
            })

        output = pdf_generator.generate_tasks_pdf(task_list)

        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}.pdf"}
        )


@router.get("/documents/{document_id}")
async def export_document(
    document_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    format: Literal["md", "html", "pdf"] = Query("md"),
):
    """Export a document in various formats."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    # Verify access through project
    result = await db.execute(
        select(Project).options(selectinload(Project.team)).where(Project.id == document.project_id)
    )
    project = result.scalar_one_or_none()
    if project and project.team and project.team.organization_id:
        await verify_org_access(project.team.organization_id, current_user, db)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"doc_{document.title.replace(' ', '_')}_{timestamp}"

    content = document.content or ""

    if format == "md":
        return StreamingResponse(
            iter([f"# {document.title}\n\n{content}"]),
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename={filename}.md"}
        )

    elif format == "html":
        html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{document.title}</title>
    <style>
        body {{ font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }}
        h1 {{ border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }}
    </style>
</head>
<body>
    <h1>{document.title}</h1>
    <div>{content}</div>
    <footer style="margin-top: 2rem; color: #666; font-size: 0.875rem;">
        Exported from Pasteur on {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}
    </footer>
</body>
</html>"""

        return StreamingResponse(
            iter([html_content]),
            media_type="text/html",
            headers={"Content-Disposition": f"attachment; filename={filename}.html"}
        )

    else:  # PDF
        metadata = {
            'Created': document.created_at.strftime('%Y-%m-%d'),
            'Last Updated': document.updated_at.strftime('%Y-%m-%d') if document.updated_at else None,
        }

        output = pdf_generator.generate_document_pdf(
            title=document.title,
            content=content,
            metadata=metadata,
        )

        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}.pdf"}
        )


@router.get("/ideas")
async def export_ideas(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    organization_id: UUID = Query(...),
    project_id: UUID | None = Query(None),
    format: Literal["csv", "pdf"] = Query("csv"),
):
    """Export ideas to CSV or PDF."""
    await verify_org_access(organization_id, current_user, db)

    query = select(Idea).where(Idea.organization_id == organization_id)

    if project_id:
        query = query.where(Idea.project_id == project_id)

    query = query.order_by(Idea.created_at.desc())

    result = await db.execute(query)
    ideas = result.scalars().all()

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"ideas_export_{timestamp}"

    if format == "csv":
        headers = ["Title", "Status", "Priority", "Type", "Created", "Tags"]
        rows = []

        for idea in ideas:
            rows.append([
                idea.title,
                idea.status,
                idea.priority,
                idea.idea_type,
                idea.created_at.isoformat(),
                ", ".join(idea.tags) if idea.tags else "",
            ])

        output = generate_csv(headers, rows)

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
        )

    else:  # PDF
        idea_list = []
        for idea in ideas:
            idea_list.append({
                'title': idea.title,
                'status': idea.status,
                'priority': idea.priority,
                'idea_type': idea.idea_type,
                'tags': idea.tags if idea.tags else [],
            })

        output = pdf_generator.generate_ideas_pdf(idea_list)

        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}.pdf"}
        )


@router.get("/papers")
async def export_papers(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    organization_id: UUID = Query(...),
    collection_id: UUID | None = Query(None),
    format: Literal["csv", "bibtex"] = Query("csv"),
):
    """Export papers to CSV or BibTeX format."""
    await verify_org_access(organization_id, current_user, db)

    query = select(Paper).where(Paper.organization_id == organization_id)

    if collection_id:
        # Would need to join with collection_papers table
        pass

    query = query.order_by(Paper.created_at.desc())

    result = await db.execute(query)
    papers = result.scalars().all()

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"papers_export_{timestamp}"

    if format == "csv":
        headers = ["Title", "Authors", "Year", "Journal", "DOI", "PMID", "Added"]
        rows = []

        for paper in papers:
            authors = ", ".join(paper.authors) if paper.authors else ""
            rows.append([
                paper.title,
                authors,
                paper.year or "",
                paper.journal or "",
                paper.doi or "",
                paper.pmid or "",
                paper.created_at.isoformat(),
            ])

        output = generate_csv(headers, rows)

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
        )

    else:  # BibTeX
        bibtex_entries = []

        for i, paper in enumerate(papers):
            # Generate citation key
            first_author = paper.authors[0].split()[-1] if paper.authors else "Unknown"
            year = paper.year or "0000"
            cite_key = f"{first_author.lower()}{year}_{i}"

            authors = " and ".join(paper.authors) if paper.authors else ""

            entry = f"""@article{{{cite_key},
  title = {{{paper.title}}},
  author = {{{authors}}},
  year = {{{year}}},
  journal = {{{paper.journal or ""}}},
  doi = {{{paper.doi or ""}}}
}}"""
            bibtex_entries.append(entry)

        bibtex_content = "\n\n".join(bibtex_entries)

        return StreamingResponse(
            iter([bibtex_content]),
            media_type="application/x-bibtex",
            headers={"Content-Disposition": f"attachment; filename={filename}.bib"}
        )


@router.get("/analytics")
async def export_analytics(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    organization_id: UUID = Query(...),
    format: Literal["csv", "pdf"] = Query("csv"),
):
    """Export analytics data to CSV or PDF."""
    await verify_org_access(organization_id, current_user, db)

    # Gather analytics data
    projects_result = await db.execute(
        select(Project).where(Project.organization_id == organization_id)
    )
    projects = projects_result.scalars().all()

    tasks_result = await db.execute(
        select(Task)
        .join(Project)
        .where(Project.organization_id == organization_id)
    )
    tasks = tasks_result.scalars().all()

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"analytics_export_{timestamp}"

    # Calculate metrics
    total_projects = len(projects)
    active_projects = len([p for p in projects if p.status == "active"])
    total_tasks = len(tasks)
    completed_tasks = len([t for t in tasks if t.status == "completed"])

    task_statuses = {}
    for task in tasks:
        task_statuses[task.status] = task_statuses.get(task.status, 0) + 1

    if format == "csv":
        headers = ["Metric", "Value"]
        rows = [
            ["Total Projects", total_projects],
            ["Active Projects", active_projects],
            ["Total Tasks", total_tasks],
            ["Completed Tasks", completed_tasks],
            ["Completion Rate", f"{(completed_tasks / total_tasks * 100) if total_tasks > 0 else 0:.1f}%"],
        ]

        # Add task status breakdown
        for status, count in task_statuses.items():
            rows.append([f"Tasks - {status}", count])

        output = generate_csv(headers, rows)

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
        )

    else:  # PDF
        metrics = {
            'total_projects': total_projects,
            'active_projects': active_projects,
            'total_tasks': total_tasks,
            'completed_tasks': completed_tasks,
            'completion_rate': f"{(completed_tasks / total_tasks * 100) if total_tasks > 0 else 0:.1f}%",
            'task_statuses': task_statuses,
        }

        output = pdf_generator.generate_analytics_pdf(metrics)

        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}.pdf"}
        )
