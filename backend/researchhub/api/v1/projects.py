"""Projects API endpoints."""

from datetime import date, datetime
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, and_, exists, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db_session
from researchhub.models.organization import Organization, OrganizationMember, Team, TeamMember
from researchhub.models.project import Project, ProjectMember, ProjectTeam, ProjectExclusion, ProjectTemplate, RecurringTaskRule, Task, ProjectCustomField, MAX_HIERARCHY_DEPTH, Blocker, BlockerLink
from researchhub.services.recurring_task import RecurringTaskService
from researchhub.services.custom_field import CustomFieldService
from researchhub.services.workflow import WorkflowService
from researchhub.services import access_control as ac

router = APIRouter()
logger = structlog.get_logger()


# Request/Response Models
class ProjectCreate(BaseModel):
    """Create a new project."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    team_id: UUID | None = None  # Optional for PERSONAL scope
    project_type: str = Field(default="general")
    parent_id: UUID | None = None
    scope: str = Field(default="TEAM", pattern="^(PERSONAL|TEAM|ORGANIZATION)$")
    additional_team_ids: list[UUID] = Field(default_factory=list)  # Multi-team support
    allow_all_team_members: bool = Field(default=True)  # Blocklist mode
    is_org_public: bool = Field(default=False)  # For ORGANIZATION scope
    org_public_role: str = Field(default="viewer", pattern="^(viewer|member)$")
    start_date: date | None = None
    target_end_date: date | None = None
    tags: list[str] = Field(default_factory=list)
    color: str | None = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    emoji: str | None = Field(None, max_length=10, description="Emoji icon for the project")
    template_id: UUID | None = None


class ProjectUpdate(BaseModel):
    """Update a project."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: str | None = Field(None, pattern="^(active|completed|archived|on_hold)$")
    allow_all_team_members: bool | None = None  # Update blocklist mode
    is_org_public: bool | None = None  # Update org-public status
    org_public_role: str | None = Field(None, pattern="^(viewer|member)$")
    start_date: date | None = None
    target_end_date: date | None = None
    actual_end_date: date | None = None
    tags: list[str] | None = None
    color: str | None = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    emoji: str | None = Field(None, max_length=10, description="Emoji icon for the project")
    settings: dict | None = None


class ProjectMemberAdd(BaseModel):
    """Add a member to a project."""

    user_id: UUID
    role: str = Field(default="member", pattern="^(owner|admin|member|viewer)$")


class ProjectMemberResponse(BaseModel):
    """Project member response."""

    id: UUID
    user_id: UUID
    role: str
    display_name: str | None = None
    email: str | None = None
    notify_on_task_assigned: bool
    notify_on_document_update: bool
    notify_on_comment: bool

    class Config:
        from_attributes = True


class ProjectAncestor(BaseModel):
    """Minimal project info for ancestor breadcrumbs."""

    id: UUID
    name: str
    color: str | None

    class Config:
        from_attributes = True


class ProjectResponse(BaseModel):
    """Project response model."""

    id: UUID
    name: str
    description: str | None
    status: str
    scope: str  # PERSONAL, TEAM, ORGANIZATION
    project_type: str
    team_id: UUID
    parent_id: UUID | None
    start_date: date | None
    target_end_date: date | None
    actual_end_date: date | None
    tags: list[str]
    color: str | None
    emoji: str | None = None
    is_archived: bool
    settings: dict
    created_by_id: UUID | None
    # Creator info
    created_by_name: str | None = None
    created_by_email: str | None = None
    created_at: datetime
    updated_at: datetime
    task_count: int = 0
    completed_task_count: int = 0
    has_children: bool = False
    children_count: int = 0
    ancestors: list[ProjectAncestor] | None = None  # Only populated when include_ancestors=True
    # Team/Organization context for display
    team_name: str | None = None
    team_is_personal: bool = False
    organization_id: UUID | None = None
    organization_name: str | None = None
    # Access control fields
    is_org_public: bool = False
    org_public_role: str = "viewer"
    allow_all_team_members: bool = True
    team_count: int = 1  # Number of teams with access
    exclusion_count: int = 0  # Number of excluded users
    # Demo project flag
    is_demo: bool = False

    class Config:
        from_attributes = True


class ProjectMoveRequest(BaseModel):
    """Request to move a project to a new parent."""

    new_parent_id: UUID | None = Field(
        None, description="New parent project ID, or null to make top-level"
    )


class ProjectListResponse(BaseModel):
    """Paginated project list response."""

    items: list[ProjectResponse]
    total: int
    page: int
    page_size: int
    pages: int


class ProjectTemplateResponse(BaseModel):
    """Project template response."""

    id: UUID
    name: str
    description: str | None
    template_type: str
    is_system: bool
    usage_count: int

    class Config:
        from_attributes = True


async def check_project_access(
    db: AsyncSession,
    project_id: UUID,
    user_id: UUID,
    required_role: str | None = None,
) -> Project:
    """Check if user has access to project using new three-tier access control."""
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.members),
            selectinload(Project.project_teams),
            selectinload(Project.exclusions),
            selectinload(Project.team),
        )
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Use the new access control service
    await ac.check_project_access(db, project, user_id, required_role)

    return project


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Project:
    """Create a new project with three-tier access control."""
    # Get the user for personal team creation if needed
    from researchhub.models.user import User
    user_result = await db.execute(select(User).where(User.id == current_user.id))
    user = user_result.scalar_one()

    # Handle team_id based on scope
    team_id = project_data.team_id
    if project_data.scope == "PERSONAL":
        # Create or get personal team
        personal_team = await ac.get_or_create_personal_team(db, user)
        team_id = personal_team.id
    else:
        # Verify user is member of the specified team
        if not team_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="team_id is required for TEAM and ORGANIZATION scope projects",
            )
        team_result = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == current_user.id,
            )
        )
        if not team_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You must be a team member to create projects",
            )

    # Validate hierarchy depth if parent_id specified
    if project_data.parent_id:
        parent_result = await db.execute(
            select(Project)
            .options(selectinload(Project.parent))
            .where(Project.id == project_data.parent_id)
        )
        parent_project = parent_result.scalar_one_or_none()

        if not parent_project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parent project not found",
            )

        # Check parent is in same team
        if parent_project.team_id != project_data.team_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Subproject must be in the same team as parent",
            )

        # Check hierarchy depth (parent depth + 1 must not exceed max)
        parent_depth = parent_project.get_depth()
        if parent_depth >= MAX_HIERARCHY_DEPTH:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum hierarchy depth ({MAX_HIERARCHY_DEPTH}) exceeded. Cannot create subproject under a subproject.",
            )

    # Get template if specified
    template_structure = {}
    if project_data.template_id:
        template_result = await db.execute(
            select(ProjectTemplate).where(ProjectTemplate.id == project_data.template_id)
        )
        template = template_result.scalar_one_or_none()
        if template:
            template_structure = template.structure
            template.usage_count += 1

    project = Project(
        name=project_data.name,
        description=project_data.description,
        team_id=team_id,  # Use resolved team_id (may be personal team)
        project_type=project_data.project_type,
        parent_id=project_data.parent_id,
        scope=project_data.scope,
        is_org_public=project_data.is_org_public if project_data.scope == "ORGANIZATION" else False,
        org_public_role=project_data.org_public_role,
        allow_all_team_members=project_data.allow_all_team_members,
        start_date=project_data.start_date,
        target_end_date=project_data.target_end_date,
        tags=project_data.tags,
        color=project_data.color,
        emoji=project_data.emoji,
        created_by_id=current_user.id,
        settings=template_structure.get("default_settings", {}),
    )
    db.add(project)
    await db.flush()

    # Add creator as owner
    member = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role="owner",
    )
    db.add(member)

    # Add primary team to project_teams
    primary_team_link = ProjectTeam(
        project_id=project.id,
        team_id=team_id,
        role="member",
        added_by_id=current_user.id,
    )
    db.add(primary_team_link)

    # Add additional teams if specified
    for additional_team_id in project_data.additional_team_ids:
        # Verify user has access to additional team
        add_team_result = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == additional_team_id,
                TeamMember.user_id == current_user.id,
            )
        )
        if add_team_result.scalar_one_or_none():
            additional_team_link = ProjectTeam(
                project_id=project.id,
                team_id=additional_team_id,
                role="member",
                added_by_id=current_user.id,
            )
            db.add(additional_team_link)

    # Create default tasks from template
    if template_structure.get("default_tasks"):
        from researchhub.models.project import Task

        for task_data in template_structure["default_tasks"]:
            task = Task(
                project_id=project.id,
                title=task_data["title"],
                description=task_data.get("description"),
                task_type=task_data.get("task_type", "general"),
                created_by_id=current_user.id,
            )
            db.add(task)

    await db.commit()
    await db.refresh(project)

    logger.info(
        "Project created",
        project_id=str(project.id),
        created_by=str(current_user.id),
    )
    return project


@router.get("/", response_model=ProjectListResponse)
async def list_projects(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    team_id: UUID | None = None,
    parent_id: UUID | None = Query(None, description="Filter by parent project ID"),
    top_level_only: bool = Query(False, description="Only return top-level projects (no parent)"),
    status: str | None = Query(None, pattern="^(active|completed|archived|on_hold)$"),
    scope: str | None = Query(None, pattern="^(PERSONAL|TEAM|ORGANIZATION)$", description="Filter by project scope"),
    search: str | None = Query(None, max_length=100),
    include_archived: bool = Query(False),
    include_ancestors: bool = Query(False, description="Include ancestor chain for breadcrumb display"),
) -> dict:
    """List projects the user has access to."""
    # Get user's team memberships
    team_result = await db.execute(
        select(TeamMember.team_id).where(TeamMember.user_id == current_user.id)
    )
    user_team_ids = [row[0] for row in team_result.all()]

    # Get user's organization memberships for org-public access
    org_result = await db.execute(
        select(OrganizationMember.organization_id).where(
            OrganizationMember.user_id == current_user.id
        )
    )
    user_org_ids = [row[0] for row in org_result.all()]

    # Subquery for projects where user is direct member
    project_member_subquery = (
        select(ProjectMember.project_id)
        .where(ProjectMember.user_id == current_user.id)
        .subquery()
    )

    # Subquery for projects accessible via project_teams (multi-team access)
    # This also handles the primary team_id
    project_teams_subquery = (
        select(ProjectTeam.project_id)
        .where(ProjectTeam.team_id.in_(user_team_ids))
        .subquery()
    )

    # Subquery for org-public projects in user's organizations
    org_public_subquery = (
        select(Project.id)
        .join(Team, Project.team_id == Team.id)
        .where(
            and_(
                Project.is_org_public == True,
                Team.organization_id.in_(user_org_ids),
            )
        )
        .subquery()
    )

    # Subquery for excluded projects (blocklist)
    exclusion_exists = exists(
        select(ProjectExclusion.id).where(
            ProjectExclusion.project_id == Project.id,
            ProjectExclusion.user_id == current_user.id,
        )
    )

    # Base query - projects accessible via:
    # 1. Primary team_id (backward compatibility)
    # 2. project_teams (multi-team access)
    # 3. Direct ProjectMember
    # 4. Org-public projects in user's organizations
    # AND user is not explicitly excluded
    query = select(Project).where(
        and_(
            or_(
                Project.team_id.in_(user_team_ids),
                Project.id.in_(select(project_teams_subquery)),
                Project.id.in_(select(project_member_subquery)),
                Project.id.in_(select(org_public_subquery)),
            ),
            ~exclusion_exists,  # Exclude projects where user is in blocklist
        )
    )

    # Apply filters
    if team_id:
        query = query.where(Project.team_id == team_id)
    if parent_id:
        query = query.where(Project.parent_id == parent_id)
    if top_level_only:
        query = query.where(Project.parent_id.is_(None))
    if status:
        query = query.where(Project.status == status)
    if scope:
        query = query.where(Project.scope == scope)
    if not include_archived:
        query = query.where(Project.is_archived == False)
    if search:
        query = query.where(
            or_(
                Project.name.ilike(f"%{search}%"),
                Project.description.ilike(f"%{search}%"),
            )
        )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination and ordering
    query = query.order_by(Project.updated_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    # Load subprojects, tasks, project_teams, exclusions, team, and creator for computed fields
    query = query.options(
        selectinload(Project.subprojects),
        selectinload(Project.tasks),
        selectinload(Project.project_teams),
        selectinload(Project.exclusions),
        selectinload(Project.team).selectinload(Team.organization),
        selectinload(Project.created_by),
    )

    result = await db.execute(query)
    projects = list(result.scalars().all())

    # Build ancestors map if requested
    ancestors_map: dict[UUID, list[ProjectAncestor]] = {}
    if include_ancestors:
        # Collect all parent_ids we need to fetch
        parent_ids_to_fetch: set[UUID] = set()
        for project in projects:
            if project.parent_id:
                parent_ids_to_fetch.add(project.parent_id)

        # Fetch all needed ancestors in batches, building the full chain
        all_ancestors: dict[UUID, Project] = {}
        while parent_ids_to_fetch:
            # Fetch this batch of parents
            parents_result = await db.execute(
                select(Project).where(Project.id.in_(parent_ids_to_fetch))
            )
            fetched_parents = {p.id: p for p in parents_result.scalars().all()}
            all_ancestors.update(fetched_parents)

            # Find new parent_ids to fetch (grandparents, etc.)
            parent_ids_to_fetch = set()
            for parent in fetched_parents.values():
                if parent.parent_id and parent.parent_id not in all_ancestors:
                    parent_ids_to_fetch.add(parent.parent_id)

        # Build ancestor chains for each project
        for project in projects:
            if project.parent_id:
                chain: list[ProjectAncestor] = []
                current_parent_id = project.parent_id
                while current_parent_id and current_parent_id in all_ancestors:
                    ancestor = all_ancestors[current_parent_id]
                    chain.insert(0, ProjectAncestor(
                        id=ancestor.id,
                        name=ancestor.name,
                        color=ancestor.color,
                    ))
                    current_parent_id = ancestor.parent_id
                ancestors_map[project.id] = chain
            else:
                ancestors_map[project.id] = []

    # Convert to response with computed fields
    project_responses = []
    for project in projects:
        # Extract team and organization info
        team = project.team
        team_name = team.name if team else None
        team_is_personal = team.is_personal if team else False
        organization_id = team.organization_id if team else None
        organization_name = team.organization.name if team and team.organization else None

        response = ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            status=project.status,
            scope=project.scope,
            project_type=project.project_type,
            team_id=project.team_id,
            parent_id=project.parent_id,
            start_date=project.start_date,
            target_end_date=project.target_end_date,
            actual_end_date=project.actual_end_date,
            tags=project.tags,
            color=project.color,
            emoji=project.emoji,
            is_archived=project.is_archived,
            settings=project.settings,
            created_by_id=project.created_by_id,
            created_by_name=project.created_by.display_name if project.created_by else None,
            created_by_email=project.created_by.email if project.created_by else None,
            created_at=project.created_at,
            updated_at=project.updated_at,
            task_count=len(project.tasks) if project.tasks else 0,
            completed_task_count=len([t for t in project.tasks if t.status == "done"]) if project.tasks else 0,
            has_children=len(project.subprojects) > 0 if project.subprojects else False,
            children_count=len(project.subprojects) if project.subprojects else 0,
            ancestors=ancestors_map.get(project.id) if include_ancestors else None,
            team_name=team_name,
            team_is_personal=team_is_personal,
            organization_id=organization_id,
            organization_name=organization_name,
            is_org_public=project.is_org_public,
            org_public_role=project.org_public_role,
            allow_all_team_members=project.allow_all_team_members,
            team_count=len(project.project_teams) if hasattr(project, 'project_teams') and project.project_teams else 1,
            exclusion_count=len(project.exclusions) if hasattr(project, 'exclusions') and project.exclusions else 0,
            is_demo=project.is_demo,
        )
        project_responses.append(response)

    return {
        "items": project_responses,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


@router.get("/templates", response_model=list[ProjectTemplateResponse])
async def list_project_templates(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[ProjectTemplate]:
    """List available project templates."""
    result = await db.execute(
        select(ProjectTemplate)
        .where(
            or_(
                ProjectTemplate.is_system == True,
                ProjectTemplate.created_by_id == current_user.id,
            ),
            ProjectTemplate.is_active == True,
        )
        .order_by(ProjectTemplate.is_system.desc(), ProjectTemplate.usage_count.desc())
    )
    return list(result.scalars().all())


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ProjectResponse:
    """Get a specific project."""
    # Check access first
    await check_project_access(db, project_id, current_user.id)

    # Load project with subprojects, tasks, team, and creator for computed fields
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.subprojects),
            selectinload(Project.tasks),
            selectinload(Project.team).selectinload(Team.organization),
            selectinload(Project.created_by),
        )
        .where(Project.id == project_id)
    )
    project = result.scalar_one()

    # Load project_teams and exclusions for counts
    teams_result = await db.execute(
        select(func.count()).select_from(ProjectTeam).where(ProjectTeam.project_id == project_id)
    )
    team_count = teams_result.scalar() or 1

    exclusions_result = await db.execute(
        select(func.count()).select_from(ProjectExclusion).where(ProjectExclusion.project_id == project_id)
    )
    exclusion_count = exclusions_result.scalar() or 0

    # Extract team and organization info
    team = project.team
    team_name = team.name if team else None
    team_is_personal = team.is_personal if team else False
    organization_id = team.organization_id if team else None
    organization_name = team.organization.name if team and team.organization else None

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        scope=project.scope,
        project_type=project.project_type,
        team_id=project.team_id,
        parent_id=project.parent_id,
        start_date=project.start_date,
        target_end_date=project.target_end_date,
        actual_end_date=project.actual_end_date,
        tags=project.tags,
        color=project.color,
        emoji=project.emoji,
        is_archived=project.is_archived,
        settings=project.settings,
        created_by_id=project.created_by_id,
        created_by_name=project.created_by.display_name if project.created_by else None,
        created_by_email=project.created_by.email if project.created_by else None,
        created_at=project.created_at,
        updated_at=project.updated_at,
        task_count=len(project.tasks) if project.tasks else 0,
        completed_task_count=len([t for t in project.tasks if t.status == "done"]) if project.tasks else 0,
        has_children=len(project.subprojects) > 0 if project.subprojects else False,
        children_count=len(project.subprojects) if project.subprojects else 0,
        team_name=team_name,
        team_is_personal=team_is_personal,
        organization_id=organization_id,
        organization_name=organization_name,
        is_org_public=project.is_org_public,
        org_public_role=project.org_public_role,
        allow_all_team_members=project.allow_all_team_members,
        team_count=team_count,
        exclusion_count=exclusion_count,
        is_demo=project.is_demo,
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    updates: ProjectUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ProjectResponse:
    """Update a project."""
    await check_project_access(db, project_id, current_user.id, "member")

    # Load project with relationships for update
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.subprojects),
            selectinload(Project.tasks),
            selectinload(Project.team).selectinload(Team.organization),
            selectinload(Project.created_by),
        )
        .where(Project.id == project_id)
    )
    project = result.scalar_one()

    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    await db.commit()
    await db.refresh(project)

    logger.info("Project updated", project_id=str(project_id))

    # Load counts for response
    teams_result = await db.execute(
        select(func.count()).select_from(ProjectTeam).where(ProjectTeam.project_id == project_id)
    )
    team_count = teams_result.scalar() or 1

    exclusions_result = await db.execute(
        select(func.count()).select_from(ProjectExclusion).where(ProjectExclusion.project_id == project_id)
    )
    exclusion_count = exclusions_result.scalar() or 0

    # Extract team and organization info
    team = project.team
    team_name = team.name if team else None
    team_is_personal = team.is_personal if team else False
    organization_id = team.organization_id if team else None
    organization_name = team.organization.name if team and team.organization else None

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        scope=project.scope,
        project_type=project.project_type,
        team_id=project.team_id,
        parent_id=project.parent_id,
        start_date=project.start_date,
        target_end_date=project.target_end_date,
        actual_end_date=project.actual_end_date,
        tags=project.tags,
        color=project.color,
        emoji=project.emoji,
        is_archived=project.is_archived,
        settings=project.settings,
        created_by_id=project.created_by_id,
        created_by_name=project.created_by.display_name if project.created_by else None,
        created_by_email=project.created_by.email if project.created_by else None,
        created_at=project.created_at,
        updated_at=project.updated_at,
        task_count=len(project.tasks) if project.tasks else 0,
        completed_task_count=len([t for t in project.tasks if t.status == "done"]) if project.tasks else 0,
        has_children=len(project.subprojects) > 0 if project.subprojects else False,
        children_count=len(project.subprojects) if project.subprojects else 0,
        team_name=team_name,
        team_is_personal=team_is_personal,
        organization_id=organization_id,
        organization_name=organization_name,
        is_org_public=project.is_org_public,
        org_public_role=project.org_public_role,
        allow_all_team_members=project.allow_all_team_members,
        team_count=team_count,
        exclusion_count=exclusion_count,
        is_demo=project.is_demo,
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a project (soft delete by archiving)."""
    project = await check_project_access(db, project_id, current_user.id, "owner")

    project.is_archived = True
    project.status = "archived"
    await db.commit()

    logger.info("Project archived", project_id=str(project_id))


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
async def list_project_members(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    """List project members with user information."""
    from researchhub.models.user import User

    # Verify access
    await check_project_access(db, project_id, current_user.id)

    # Fetch members with user info
    result = await db.execute(
        select(ProjectMember, User)
        .join(User, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id == project_id)
        .order_by(User.display_name)
    )

    members = []
    for member, user in result.all():
        members.append({
            "id": member.id,
            "user_id": member.user_id,
            "role": member.role,
            "display_name": user.display_name,
            "email": user.email,
            "notify_on_task_assigned": member.notify_on_task_assigned,
            "notify_on_document_update": member.notify_on_document_update,
            "notify_on_comment": member.notify_on_comment,
        })

    return members


@router.post("/{project_id}/members", response_model=ProjectMemberResponse)
async def add_project_member(
    project_id: UUID,
    member_data: ProjectMemberAdd,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Add a member to the project."""
    from researchhub.models.user import User

    await check_project_access(db, project_id, current_user.id, "admin")

    # Check if user exists and get their info
    user_result = await db.execute(select(User).where(User.id == member_data.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check if already a member
    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == member_data.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a project member",
        )

    member = ProjectMember(
        project_id=project_id,
        user_id=member_data.user_id,
        role=member_data.role,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)

    logger.info(
        "Project member added",
        project_id=str(project_id),
        user_id=str(member_data.user_id),
    )

    return {
        "id": member.id,
        "user_id": member.user_id,
        "role": member.role,
        "display_name": user.display_name,
        "email": user.email,
        "notify_on_task_assigned": member.notify_on_task_assigned,
        "notify_on_document_update": member.notify_on_document_update,
        "notify_on_comment": member.notify_on_comment,
    }


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_member(
    project_id: UUID,
    user_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove a member from the project."""
    await check_project_access(db, project_id, current_user.id, "admin")

    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    if member.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove project owner",
        )

    await db.delete(member)
    await db.commit()

    logger.info(
        "Project member removed",
        project_id=str(project_id),
        user_id=str(user_id),
    )


# =============================================================================
# Project Team Management (Multi-team access)
# =============================================================================


class ProjectTeamAdd(BaseModel):
    """Add a team to a project."""

    team_id: UUID
    role: str = Field(default="member", pattern="^(admin|member|viewer)$")


class ProjectTeamResponse(BaseModel):
    """Project team response."""

    project_id: UUID
    team_id: UUID
    role: str
    added_by_id: UUID | None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/{project_id}/teams", response_model=list[ProjectTeamResponse])
async def list_project_teams(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[ProjectTeam]:
    """List all teams with access to a project."""
    await check_project_access(db, project_id, current_user.id)

    result = await db.execute(
        select(ProjectTeam).where(ProjectTeam.project_id == project_id)
    )
    return list(result.scalars().all())


@router.post("/{project_id}/teams", response_model=ProjectTeamResponse, status_code=status.HTTP_201_CREATED)
async def add_project_team(
    project_id: UUID,
    team_data: ProjectTeamAdd,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ProjectTeam:
    """Add a team to a project for multi-team access."""
    project = await check_project_access(db, project_id, current_user.id, "admin")

    # Use the access control service
    project_team = await ac.add_team_to_project(
        db,
        project,
        team_data.team_id,
        role=team_data.role,
        added_by_id=current_user.id,
    )

    logger.info(
        "Team added to project",
        project_id=str(project_id),
        team_id=str(team_data.team_id),
    )
    return project_team


@router.delete("/{project_id}/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_team(
    project_id: UUID,
    team_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove a team from a project."""
    project = await check_project_access(db, project_id, current_user.id, "admin")

    await ac.remove_team_from_project(db, project, team_id)

    logger.info(
        "Team removed from project",
        project_id=str(project_id),
        team_id=str(team_id),
    )


# =============================================================================
# Project Exclusions (Blocklist for team-based access)
# =============================================================================


class ProjectExclusionAdd(BaseModel):
    """Add a user to project exclusion list."""

    user_id: UUID
    reason: str | None = None


class ProjectExclusionResponse(BaseModel):
    """Project exclusion response."""

    id: UUID
    project_id: UUID
    user_id: UUID
    excluded_by_id: UUID | None
    reason: str | None
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/{project_id}/exclusions", response_model=list[ProjectExclusionResponse])
async def list_project_exclusions(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[ProjectExclusion]:
    """List all excluded users for a project."""
    await check_project_access(db, project_id, current_user.id, "admin")

    result = await db.execute(
        select(ProjectExclusion).where(ProjectExclusion.project_id == project_id)
    )
    return list(result.scalars().all())


@router.post("/{project_id}/exclusions", response_model=ProjectExclusionResponse, status_code=status.HTTP_201_CREATED)
async def add_project_exclusion(
    project_id: UUID,
    exclusion_data: ProjectExclusionAdd,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ProjectExclusion:
    """Add a user to the project exclusion list (blocklist)."""
    project = await check_project_access(db, project_id, current_user.id, "admin")

    exclusion = await ac.add_project_exclusion(
        db,
        project,
        exclusion_data.user_id,
        excluded_by_id=current_user.id,
        reason=exclusion_data.reason,
    )

    logger.info(
        "User excluded from project",
        project_id=str(project_id),
        user_id=str(exclusion_data.user_id),
    )
    return exclusion


@router.delete("/{project_id}/exclusions/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_exclusion(
    project_id: UUID,
    user_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove a user from the project exclusion list."""
    project = await check_project_access(db, project_id, current_user.id, "admin")

    await ac.remove_project_exclusion(db, project, user_id)

    logger.info(
        "User un-excluded from project",
        project_id=str(project_id),
        user_id=str(user_id),
    )


# =============================================================================
# Project Scope Management
# =============================================================================


class ProjectScopeChange(BaseModel):
    """Change project scope."""

    new_scope: str = Field(..., pattern="^(PERSONAL|TEAM|ORGANIZATION)$")
    team_id: UUID | None = None  # Required when changing from PERSONAL to TEAM/ORG
    is_org_public: bool = False
    org_public_role: str = Field(default="viewer", pattern="^(viewer|member)$")


@router.patch("/{project_id}/scope", response_model=ProjectResponse)
async def change_project_scope(
    project_id: UUID,
    scope_data: ProjectScopeChange,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ProjectResponse:
    """
    Change the scope of a project.

    Scope transition rules:
    - PERSONAL → TEAM/ORG: Must provide team_id, user must be team member
    - TEAM/ORG → PERSONAL: Clears all project_teams, moves to personal team
    - TEAM → ORG: No team changes, can set is_org_public
    - ORG → TEAM: Clears is_org_public
    """
    project = await check_project_access(db, project_id, current_user.id, "owner")

    # Get current user for personal team operations
    from researchhub.models.user import User
    user_result = await db.execute(select(User).where(User.id == current_user.id))
    user = user_result.scalar_one()

    old_scope = project.scope
    new_scope = scope_data.new_scope

    # Handle scope transitions
    if old_scope == "PERSONAL" and new_scope in ("TEAM", "ORGANIZATION"):
        # Must provide a team_id
        if not scope_data.team_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="team_id is required when changing from PERSONAL scope",
            )

        # Verify user is member of target team
        team_member_result = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == scope_data.team_id,
                TeamMember.user_id == current_user.id,
            )
        )
        if not team_member_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You must be a member of the target team",
            )

        # Update primary team and add to project_teams
        project.team_id = scope_data.team_id
        project.scope = new_scope

        # Clear existing project_teams and add new primary team
        await db.execute(
            select(ProjectTeam).where(ProjectTeam.project_id == project_id)
        )
        existing_teams = await db.execute(
            select(ProjectTeam).where(ProjectTeam.project_id == project_id)
        )
        for pt in existing_teams.scalars().all():
            await db.delete(pt)

        new_team_link = ProjectTeam(
            project_id=project.id,
            team_id=scope_data.team_id,
            role="member",
            added_by_id=current_user.id,
        )
        db.add(new_team_link)

    elif old_scope in ("TEAM", "ORGANIZATION") and new_scope == "PERSONAL":
        # Move to personal team
        personal_team = await ac.get_or_create_personal_team(db, user)
        project.team_id = personal_team.id
        project.scope = "PERSONAL"
        project.is_org_public = False

        # Clear all project_teams
        existing_teams = await db.execute(
            select(ProjectTeam).where(ProjectTeam.project_id == project_id)
        )
        for pt in existing_teams.scalars().all():
            await db.delete(pt)

        # Add personal team to project_teams
        personal_team_link = ProjectTeam(
            project_id=project.id,
            team_id=personal_team.id,
            role="owner",
            added_by_id=current_user.id,
        )
        db.add(personal_team_link)

        # Clear exclusions (not applicable for PERSONAL)
        existing_exclusions = await db.execute(
            select(ProjectExclusion).where(ProjectExclusion.project_id == project_id)
        )
        for exc in existing_exclusions.scalars().all():
            await db.delete(exc)

    elif old_scope == "TEAM" and new_scope == "ORGANIZATION":
        # Just update scope and org-public settings
        project.scope = "ORGANIZATION"
        project.is_org_public = scope_data.is_org_public
        project.org_public_role = scope_data.org_public_role

    elif old_scope == "ORGANIZATION" and new_scope == "TEAM":
        # Clear org-public settings
        project.scope = "TEAM"
        project.is_org_public = False

    elif old_scope == new_scope:
        # Same scope - handle team transfer or settings update
        if new_scope == "TEAM" and scope_data.team_id and scope_data.team_id != project.team_id:
            # Transfer to a different team within TEAM scope
            # Verify user is a member of the new team
            membership = await db.execute(
                select(TeamMember).where(
                    TeamMember.team_id == scope_data.team_id,
                    TeamMember.user_id == current_user.id,
                )
            )
            if not membership.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Must be a member of the target team",
                )

            # Clear existing project teams
            await db.execute(
                delete(ProjectTeam).where(ProjectTeam.project_id == project_id)
            )

            # Update primary team
            project.team_id = scope_data.team_id

            # Add new primary team to project_teams
            new_project_team = ProjectTeam(
                project_id=project_id,
                team_id=scope_data.team_id,
                role="owner",
            )
            db.add(new_project_team)

        elif new_scope == "ORGANIZATION":
            project.is_org_public = scope_data.is_org_public
            project.org_public_role = scope_data.org_public_role

    await db.commit()
    await db.refresh(project)

    # Load counts for response
    teams_result = await db.execute(
        select(func.count()).select_from(ProjectTeam).where(ProjectTeam.project_id == project_id)
    )
    team_count = teams_result.scalar() or 1

    exclusions_result = await db.execute(
        select(func.count()).select_from(ProjectExclusion).where(ProjectExclusion.project_id == project_id)
    )
    exclusion_count = exclusions_result.scalar() or 0

    # Load for task counts and creator
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.subprojects), selectinload(Project.tasks), selectinload(Project.created_by))
        .where(Project.id == project_id)
    )
    project = result.scalar_one()

    logger.info(
        "Project scope changed",
        project_id=str(project_id),
        old_scope=old_scope,
        new_scope=new_scope,
    )

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        scope=project.scope,
        project_type=project.project_type,
        team_id=project.team_id,
        parent_id=project.parent_id,
        start_date=project.start_date,
        target_end_date=project.target_end_date,
        actual_end_date=project.actual_end_date,
        tags=project.tags,
        color=project.color,
        emoji=project.emoji,
        is_archived=project.is_archived,
        settings=project.settings,
        created_by_id=project.created_by_id,
        created_by_name=project.created_by.display_name if project.created_by else None,
        created_by_email=project.created_by.email if project.created_by else None,
        created_at=project.created_at,
        updated_at=project.updated_at,
        task_count=len(project.tasks) if project.tasks else 0,
        completed_task_count=len([t for t in project.tasks if t.status == "done"]) if project.tasks else 0,
        has_children=len(project.subprojects) > 0 if project.subprojects else False,
        children_count=len(project.subprojects) if project.subprojects else 0,
        is_org_public=project.is_org_public,
        org_public_role=project.org_public_role,
        allow_all_team_members=project.allow_all_team_members,
        team_count=team_count,
        exclusion_count=exclusion_count,
        is_demo=project.is_demo,
    )


# Hierarchy endpoints

@router.get("/{project_id}/children", response_model=list[ProjectResponse])
async def list_project_children(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    include_archived: bool = Query(False),
) -> list[Project]:
    """List direct children (subprojects) of a project."""
    # Check access to parent project
    await check_project_access(db, project_id, current_user.id)

    # Get children
    query = select(Project).where(Project.parent_id == project_id)
    if not include_archived:
        query = query.where(Project.is_archived == False)
    query = query.order_by(Project.name)

    result = await db.execute(query)
    return list(result.scalars().all())


class ProjectTreeNode(BaseModel):
    """Project with nested children for tree view."""

    id: UUID
    name: str
    description: str | None
    status: str
    parent_id: UUID | None
    has_children: bool
    children_count: int
    task_count: int = 0
    children: list["ProjectTreeNode"] = Field(default_factory=list)

    class Config:
        from_attributes = True


@router.get("/{project_id}/tree", response_model=ProjectTreeNode)
async def get_project_tree(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    include_archived: bool = Query(False),
) -> dict:
    """Get a project with its full hierarchy tree."""
    # Check access
    project = await check_project_access(db, project_id, current_user.id)

    async def build_tree(proj: Project) -> dict:
        """Recursively build tree structure."""
        children_query = select(Project).where(Project.parent_id == proj.id)
        if not include_archived:
            children_query = children_query.where(Project.is_archived == False)

        children_result = await db.execute(children_query)
        children = list(children_result.scalars().all())

        child_trees = []
        for child in children:
            child_tree = await build_tree(child)
            child_trees.append(child_tree)

        return {
            "id": proj.id,
            "name": proj.name,
            "description": proj.description,
            "status": proj.status,
            "parent_id": proj.parent_id,
            "has_children": len(children) > 0,
            "children_count": len(children),
            "task_count": len(proj.tasks) if proj.tasks else 0,
            "children": child_trees,
        }

    return await build_tree(project)


@router.post("/{project_id}/move", response_model=ProjectResponse)
async def move_project(
    project_id: UUID,
    move_data: ProjectMoveRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Project:
    """Move a project to a new parent (or make it top-level)."""
    # Check access to the project being moved (require admin or owner)
    project = await check_project_access(db, project_id, current_user.id, "admin")

    # Prevent moving a project to itself
    if move_data.new_parent_id == project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot move a project to itself",
        )

    # If moving to a new parent
    if move_data.new_parent_id:
        # Check access to the target parent
        new_parent = await check_project_access(db, move_data.new_parent_id, current_user.id)

        # Check same team
        if new_parent.team_id != project.team_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot move project to a different team",
            )

        # Prevent circular references
        # Check if new_parent is a descendant of project
        async def is_descendant(potential_parent_id: UUID, ancestor_id: UUID) -> bool:
            """Check if potential_parent is a descendant of ancestor."""
            if potential_parent_id == ancestor_id:
                return True
            children_result = await db.execute(
                select(Project.id).where(Project.parent_id == ancestor_id)
            )
            for (child_id,) in children_result.all():
                if await is_descendant(potential_parent_id, child_id):
                    return True
            return False

        if await is_descendant(move_data.new_parent_id, project_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot move a project to one of its descendants",
            )

        # Check hierarchy depth
        parent_depth = new_parent.get_depth()
        if parent_depth >= MAX_HIERARCHY_DEPTH:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum hierarchy depth ({MAX_HIERARCHY_DEPTH}) exceeded",
            )

        # Check that project's children won't exceed depth limit
        if project.get_has_children() and parent_depth + 1 >= MAX_HIERARCHY_DEPTH:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot move project with children to this depth - would exceed maximum hierarchy depth",
            )

    # Update parent
    project.parent_id = move_data.new_parent_id
    await db.commit()
    await db.refresh(project)

    logger.info(
        "Project moved",
        project_id=str(project_id),
        new_parent_id=str(move_data.new_parent_id) if move_data.new_parent_id else None,
    )
    return project


@router.get("/{project_id}/ancestors", response_model=list[ProjectResponse])
async def get_project_ancestors(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[Project]:
    """Get the ancestor chain for a project (for breadcrumb navigation)."""
    project = await check_project_access(db, project_id, current_user.id)

    ancestors = []
    current = project

    while current.parent_id:
        parent_result = await db.execute(
            select(Project)
            .options(selectinload(Project.parent))
            .where(Project.id == current.parent_id)
        )
        parent = parent_result.scalar_one_or_none()
        if parent:
            ancestors.insert(0, parent)  # Insert at beginning to maintain order
            current = parent
        else:
            break

    return ancestors


# =============================================================================
# Recurring Task Rules
# =============================================================================

class RecurringRuleCreate(BaseModel):
    """Create a recurring task rule."""

    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    task_type: str = "general"
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")
    tags: list[str] = Field(default_factory=list)
    estimated_hours: float | None = None
    default_assignee_ids: list[UUID] = Field(default_factory=list)
    recurrence_type: str = Field(
        ...,
        pattern="^(daily|weekly|biweekly|monthly|quarterly|yearly|custom)$"
    )
    recurrence_config: dict = Field(default_factory=dict)
    start_date: date
    end_date: date | None = None
    due_date_offset_days: int | None = Field(None, ge=0, le=365)
    is_active: bool = True


class RecurringRuleUpdate(BaseModel):
    """Update a recurring task rule."""

    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    task_type: str | None = None
    priority: str | None = Field(None, pattern="^(low|medium|high|urgent)$")
    tags: list[str] | None = None
    estimated_hours: float | None = None
    default_assignee_ids: list[UUID] | None = None
    recurrence_type: str | None = Field(
        None,
        pattern="^(daily|weekly|biweekly|monthly|quarterly|yearly|custom)$"
    )
    recurrence_config: dict | None = None
    start_date: date | None = None
    end_date: date | None = None
    due_date_offset_days: int | None = Field(None, ge=0, le=365)
    is_active: bool | None = None


class RecurringRuleResponse(BaseModel):
    """Recurring task rule response."""

    id: UUID
    project_id: UUID
    title: str
    description: str | None
    task_type: str
    priority: str
    tags: list[str]
    estimated_hours: float | None
    created_by_id: UUID | None
    default_assignee_ids: list[str]
    recurrence_type: str
    recurrence_config: dict
    start_date: date
    end_date: date | None
    due_date_offset_days: int | None
    next_occurrence: date | None
    last_created_at: datetime | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskResponse(BaseModel):
    """Task response for triggered rules."""

    id: UUID
    title: str
    status: str
    priority: str
    due_date: date | None
    created_at: datetime

    class Config:
        from_attributes = True


@router.post(
    "/{project_id}/recurring-rules",
    response_model=RecurringRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_recurring_rule(
    project_id: UUID,
    rule_data: RecurringRuleCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> RecurringTaskRule:
    """Create a new recurring task rule for a project."""
    # Check project access
    await check_project_access(db, project_id, current_user.id, "member")

    service = RecurringTaskService(db)
    rule = await service.create_rule(
        project_id=project_id,
        title=rule_data.title,
        description=rule_data.description,
        task_type=rule_data.task_type,
        priority=rule_data.priority,
        tags=rule_data.tags,
        estimated_hours=rule_data.estimated_hours,
        default_assignee_ids=rule_data.default_assignee_ids,
        recurrence_type=rule_data.recurrence_type,
        recurrence_config=rule_data.recurrence_config,
        start_date=rule_data.start_date,
        end_date=rule_data.end_date,
        due_date_offset_days=rule_data.due_date_offset_days,
        is_active=rule_data.is_active,
        created_by_id=current_user.id,
    )

    return rule


@router.get(
    "/{project_id}/recurring-rules",
    response_model=list[RecurringRuleResponse],
)
async def list_recurring_rules(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    active_only: bool = Query(True, description="Only return active rules"),
) -> list[RecurringTaskRule]:
    """List all recurring task rules for a project."""
    # Check project access
    await check_project_access(db, project_id, current_user.id)

    service = RecurringTaskService(db)
    rules = await service.get_project_rules(project_id, active_only=active_only)

    return list(rules)


@router.get(
    "/{project_id}/recurring-rules/{rule_id}",
    response_model=RecurringRuleResponse,
)
async def get_recurring_rule(
    project_id: UUID,
    rule_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> RecurringTaskRule:
    """Get a specific recurring task rule."""
    # Check project access
    await check_project_access(db, project_id, current_user.id)

    service = RecurringTaskService(db)
    rule = await service.get_rule(rule_id)

    if not rule or rule.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurring rule not found",
        )

    return rule


@router.patch(
    "/{project_id}/recurring-rules/{rule_id}",
    response_model=RecurringRuleResponse,
)
async def update_recurring_rule(
    project_id: UUID,
    rule_id: UUID,
    updates: RecurringRuleUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> RecurringTaskRule:
    """Update a recurring task rule."""
    # Check project access (require member role to edit)
    await check_project_access(db, project_id, current_user.id, "member")

    service = RecurringTaskService(db)
    rule = await service.get_rule(rule_id)

    if not rule or rule.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurring rule not found",
        )

    update_data = updates.model_dump(exclude_unset=True)
    updated_rule = await service.update_rule(rule_id, **update_data)

    return updated_rule


@router.delete(
    "/{project_id}/recurring-rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_recurring_rule(
    project_id: UUID,
    rule_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a recurring task rule."""
    # Check project access (require admin role to delete)
    await check_project_access(db, project_id, current_user.id, "admin")

    service = RecurringTaskService(db)
    rule = await service.get_rule(rule_id)

    if not rule or rule.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurring rule not found",
        )

    await service.delete_rule(rule_id)


@router.post(
    "/{project_id}/recurring-rules/{rule_id}/trigger",
    response_model=TaskResponse,
)
async def trigger_recurring_rule(
    project_id: UUID,
    rule_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Task:
    """Manually trigger a recurring task rule to create a task now."""
    # Check project access
    await check_project_access(db, project_id, current_user.id, "member")

    service = RecurringTaskService(db)
    rule = await service.get_rule(rule_id)

    if not rule or rule.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recurring rule not found",
        )

    if not rule.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot trigger inactive rule",
        )

    task = await service.trigger_rule(rule_id, created_by_id=current_user.id)

    if not task:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create task from rule",
        )

    return task


# =============================================================================
# Custom Fields
# =============================================================================

class CustomFieldCreate(BaseModel):
    """Create a custom field."""

    name: str = Field(..., min_length=1, max_length=100, pattern="^[a-z][a-z0-9_]*$")
    display_name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    field_type: str = Field(
        ...,
        pattern="^(text|number|date|select|multi_select|user|checkbox|url)$"
    )
    field_config: dict = Field(default_factory=dict)
    applies_to: list[str] = Field(default_factory=lambda: ["task"])
    is_required: bool = False
    position: int | None = None


class CustomFieldUpdate(BaseModel):
    """Update a custom field."""

    display_name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    field_config: dict | None = None
    applies_to: list[str] | None = None
    is_required: bool | None = None
    is_active: bool | None = None
    position: int | None = None


class CustomFieldResponse(BaseModel):
    """Custom field response."""

    id: UUID
    project_id: UUID
    name: str
    display_name: str
    description: str | None
    field_type: str
    field_config: dict
    applies_to: list[str]
    is_required: bool
    is_active: bool
    position: int
    created_by_id: UUID | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FieldReorderRequest(BaseModel):
    """Request to reorder custom fields."""

    field_order: list[UUID] = Field(..., min_length=1)


@router.post(
    "/{project_id}/custom-fields",
    response_model=CustomFieldResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_custom_field(
    project_id: UUID,
    field_data: CustomFieldCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ProjectCustomField:
    """Create a new custom field for a project."""
    # Check project access (require admin role)
    await check_project_access(db, project_id, current_user.id, "admin")

    service = CustomFieldService(db)
    field = await service.create_field(
        project_id=project_id,
        name=field_data.name,
        display_name=field_data.display_name,
        description=field_data.description,
        field_type=field_data.field_type,
        field_config=field_data.field_config,
        applies_to=field_data.applies_to,
        is_required=field_data.is_required,
        position=field_data.position,
        created_by_id=current_user.id,
    )

    return field


@router.get(
    "/{project_id}/custom-fields",
    response_model=list[CustomFieldResponse],
)
async def list_custom_fields(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    active_only: bool = Query(True, description="Only return active fields"),
    applies_to: str | None = Query(None, description="Filter by entity type (task, document)"),
) -> list[ProjectCustomField]:
    """List all custom fields for a project."""
    # Check project access
    await check_project_access(db, project_id, current_user.id)

    service = CustomFieldService(db)
    fields = await service.get_project_fields(
        project_id,
        active_only=active_only,
        applies_to=applies_to,
    )

    return list(fields)


@router.get(
    "/{project_id}/custom-fields/{field_id}",
    response_model=CustomFieldResponse,
)
async def get_custom_field(
    project_id: UUID,
    field_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ProjectCustomField:
    """Get a specific custom field."""
    # Check project access
    await check_project_access(db, project_id, current_user.id)

    service = CustomFieldService(db)
    field = await service.get_field(field_id)

    if not field or field.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found",
        )

    return field


@router.patch(
    "/{project_id}/custom-fields/{field_id}",
    response_model=CustomFieldResponse,
)
async def update_custom_field(
    project_id: UUID,
    field_id: UUID,
    updates: CustomFieldUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ProjectCustomField:
    """Update a custom field."""
    # Check project access (require admin role)
    await check_project_access(db, project_id, current_user.id, "admin")

    service = CustomFieldService(db)
    field = await service.get_field(field_id)

    if not field or field.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found",
        )

    update_data = updates.model_dump(exclude_unset=True)
    updated_field = await service.update_field(field_id, **update_data)

    return updated_field


@router.delete(
    "/{project_id}/custom-fields/{field_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_custom_field(
    project_id: UUID,
    field_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a custom field and all its values."""
    # Check project access (require admin role)
    await check_project_access(db, project_id, current_user.id, "admin")

    service = CustomFieldService(db)
    field = await service.get_field(field_id)

    if not field or field.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom field not found",
        )

    await service.delete_field(field_id)


@router.post(
    "/{project_id}/custom-fields/reorder",
    response_model=list[CustomFieldResponse],
)
async def reorder_custom_fields(
    project_id: UUID,
    reorder_data: FieldReorderRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[ProjectCustomField]:
    """Reorder custom fields for a project."""
    # Check project access (require admin role)
    await check_project_access(db, project_id, current_user.id, "admin")

    service = CustomFieldService(db)
    fields = await service.reorder_fields(project_id, reorder_data.field_order)

    return list(fields)


# =============================================================================
# Review Status
# =============================================================================


class ProjectReviewSummaryResponse(BaseModel):
    """Review summary for a project."""

    total_reviews: int = 0
    pending_reviews: int = 0
    approved_reviews: int = 0
    rejected_reviews: int = 0
    all_approved: bool = True
    overall_status: str = "none"
    ai_suggestion_count: int = 0
    tasks_in_review: int = 0


@router.get(
    "/{project_id}/review-summary",
    response_model=ProjectReviewSummaryResponse,
)
async def get_project_review_summary(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get the aggregate review status for a project."""
    # Verify project access
    await check_project_access(db, project_id, current_user.id)

    workflow_service = WorkflowService(db)
    summary = await workflow_service.get_project_review_summary(project_id)

    return summary


# =============================================================================
# Blockers
# =============================================================================


class ProjectBlockerResponse(BaseModel):
    """Blocker info for a project."""

    id: UUID
    title: str
    status: str
    priority: str
    blocker_type: str
    impact_level: str
    assignee_id: UUID | None
    due_date: date | None
    created_at: datetime
    blocked_items_count: int = 0

    class Config:
        from_attributes = True


@router.get("/{project_id}/blockers", response_model=list[ProjectBlockerResponse])
async def get_project_blockers(
    project_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    active_only: bool = Query(True, description="Only return active (non-resolved) blockers"),
    include_blocking_project: bool = Query(True, description="Include blockers directly blocking the project"),
) -> list[dict]:
    """Get all blockers in a project, optionally including those blocking the project itself."""
    # Verify project access
    await check_project_access(db, project_id, current_user.id)

    # Get all blockers in this project
    query = (
        select(Blocker)
        .options(selectinload(Blocker.blocked_items))
        .where(Blocker.project_id == project_id)
    )

    if active_only:
        query = query.where(Blocker.status.in_(["open", "in_progress"]))

    result = await db.execute(query)
    blockers = result.scalars().all()

    return [
        {
            "id": b.id,
            "title": b.title,
            "status": b.status,
            "priority": b.priority,
            "blocker_type": b.blocker_type,
            "impact_level": b.impact_level,
            "assignee_id": b.assignee_id,
            "due_date": b.due_date,
            "created_at": b.created_at,
            "blocked_items_count": len(b.blocked_items) if b.blocked_items else 0,
        }
        for b in blockers
    ]
