"""Project access control service.

Implements three-tier project access control with multi-team support:
- PERSONAL: Owner-only access
- TEAM: Team members via project_teams (with blocklist exclusions)
- ORGANIZATION: Private by default, optionally org-public
"""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

import structlog

from researchhub.models.organization import Organization, Team, TeamMember, OrganizationMember
from researchhub.models.project import Project, ProjectMember, ProjectTeam, ProjectExclusion
from researchhub.models.collaboration import ProjectShare
from researchhub.models.user import User

logger = structlog.get_logger()


# Role hierarchy for permission checking (higher = more permissions)
# editor: can modify content but cannot manage access/membership
ROLE_HIERARCHY = {"owner": 5, "admin": 4, "editor": 3, "member": 2, "viewer": 1}


def has_sufficient_role(user_role: str, required_role: str) -> bool:
    """Check if user_role meets or exceeds required_role."""
    return ROLE_HIERARCHY.get(user_role, 0) >= ROLE_HIERARCHY.get(required_role, 0)


async def check_project_access_fast(
    db: AsyncSession,
    project_id: UUID,
    user_id: UUID,
    required_role: str | None = None,
) -> tuple[Project, str]:
    """
    Optimized single-query access check for a project.

    Consolidates 8-12 sequential queries into 1-2 queries for ~80% faster access checks.

    Returns:
        Tuple of (Project, effective_role) if access granted

    Raises:
        HTTPException 404 if project not found
        HTTPException 403 if access denied or insufficient role
    """
    # Single query to get project + all access-relevant data
    result = await db.execute(
        select(
            Project,
            # Direct member access
            ProjectMember.role.label('member_role'),
            # Share access
            ProjectShare.role.label('share_role'),
            # Exclusion check
            ProjectExclusion.id.label('exclusion_id'),
            # Team access (via project_teams)
            TeamMember.role.label('team_member_role'),
            ProjectTeam.role.label('project_team_role'),
            Team.owner_id.label('team_owner_id'),
            Team.organization_id.label('team_org_id'),
            # Org access
            OrganizationMember.role.label('org_member_role'),
        )
        .select_from(Project)
        .outerjoin(
            ProjectMember,
            and_(
                ProjectMember.project_id == Project.id,
                ProjectMember.user_id == user_id,
            )
        )
        .outerjoin(
            ProjectShare,
            and_(
                ProjectShare.project_id == Project.id,
                ProjectShare.user_id == user_id,
            )
        )
        .outerjoin(
            ProjectExclusion,
            and_(
                ProjectExclusion.project_id == Project.id,
                ProjectExclusion.user_id == user_id,
            )
        )
        .outerjoin(ProjectTeam, ProjectTeam.project_id == Project.id)
        .outerjoin(Team, Team.id == ProjectTeam.team_id)
        .outerjoin(
            TeamMember,
            and_(
                TeamMember.team_id == ProjectTeam.team_id,
                TeamMember.user_id == user_id,
            )
        )
        .outerjoin(
            OrganizationMember,
            and_(
                OrganizationMember.organization_id == Team.organization_id,
                OrganizationMember.user_id == user_id,
            )
        )
        .where(Project.id == project_id)
    )

    rows = result.all()

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # All rows have the same project, just different join results
    project = rows[0][0]

    # Check for exclusion first (any row with exclusion_id means excluded)
    for row in rows:
        if row.exclusion_id is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied - you have been excluded from this project",
            )

    # Priority 1: Direct ProjectMember (highest priority)
    for row in rows:
        if row.member_role is not None:
            return project, _validate_role(row.member_role, required_role)

    # Priority 2: ProjectShare
    for row in rows:
        if row.share_role is not None:
            return project, _validate_role(row.share_role, required_role)

    # Priority 3: Scope-based access
    if project.scope == "PERSONAL":
        if project.created_by_id == user_id:
            return project, _validate_role("owner", required_role)
        # Check parent inheritance before denying
        inherited = await _check_parent_access_fast(db, project, user_id)
        if inherited:
            return project, _validate_role(inherited, required_role)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied - this is a personal project",
        )

    elif project.scope == "TEAM":
        if not project.allow_all_team_members:
            # Check parent inheritance before denying
            inherited = await _check_parent_access_fast(db, project, user_id)
            if inherited:
                return project, _validate_role(inherited, required_role)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied - explicit membership required for this project",
            )

        # Check team-based access from the joined data
        best_role = None
        for row in rows:
            # Team owner gets owner access
            if row.team_owner_id == user_id:
                return project, _validate_role("owner", required_role)

            # Team member gets project_team role (possibly escalated if lead)
            if row.team_member_role is not None and row.project_team_role is not None:
                effective_role = row.project_team_role
                if row.team_member_role == "lead":
                    if ROLE_HIERARCHY.get(effective_role, 0) < ROLE_HIERARCHY["admin"]:
                        effective_role = "admin"
                if best_role is None or ROLE_HIERARCHY.get(effective_role, 0) > ROLE_HIERARCHY.get(best_role, 0):
                    best_role = effective_role

        if best_role:
            return project, _validate_role(best_role, required_role)

        # Check parent inheritance before denying
        inherited = await _check_parent_access_fast(db, project, user_id)
        if inherited:
            return project, _validate_role(inherited, required_role)

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied - you are not a member of any team with access to this project",
        )

    elif project.scope == "ORGANIZATION":
        # Check team-based access first (always available for ORGANIZATION scope)
        best_role = None
        has_org_membership = False

        for row in rows:
            # Team owner gets owner access
            if row.team_owner_id == user_id:
                return project, _validate_role("owner", required_role)

            # Team member gets project_team role
            if row.team_member_role is not None and row.project_team_role is not None:
                effective_role = row.project_team_role
                if row.team_member_role == "lead":
                    if ROLE_HIERARCHY.get(effective_role, 0) < ROLE_HIERARCHY["admin"]:
                        effective_role = "admin"
                if best_role is None or ROLE_HIERARCHY.get(effective_role, 0) > ROLE_HIERARCHY.get(best_role, 0):
                    best_role = effective_role

            # Track org membership for org-public fallback
            if row.org_member_role is not None:
                has_org_membership = True

        if best_role:
            return project, _validate_role(best_role, required_role)

        # Not a team member, check org-public access
        if project.is_org_public and has_org_membership:
            return project, _validate_role(project.org_public_role, required_role)

        # Check parent inheritance before denying
        inherited = await _check_parent_access_fast(db, project, user_id)
        if inherited:
            return project, _validate_role(inherited, required_role)

        if not project.is_org_public:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied - this organization project is not public",
            )

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied - you are not a member of this organization",
        )

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied",
    )


async def _check_parent_access_fast(
    db: AsyncSession,
    project: Project,
    user_id: UUID,
    max_depth: int = 10,
) -> str | None:
    """
    Check if user has access to any parent project (inheritance).
    Uses recursive call to check_project_access_fast for efficiency.
    """
    if not project.parent_id or max_depth <= 0:
        return None

    try:
        _, parent_role = await check_project_access_fast(
            db, project.parent_id, user_id, None
        )
        # Admins/owners inherit their full role, others get member
        if ROLE_HIERARCHY.get(parent_role, 0) >= ROLE_HIERARCHY["admin"]:
            return parent_role
        return "member"
    except HTTPException:
        return None


async def check_project_access(
    db: AsyncSession,
    project: Project,
    user_id: UUID,
    required_role: str | None = None,
) -> str:
    """
    Check if user has access to project and return their effective role.

    Access priority (first match wins):
    1. Direct ProjectMember → use that role
    2. ProjectShare → use share role
    3. Scope-based access:
       - PERSONAL: owner (created_by_id) only
       - TEAM: member of any team in project_teams + not excluded
       - ORGANIZATION: team member, or if is_org_public → org members get org_public_role
    4. Parent project inheritance → if user has access to parent, inherit that role

    Args:
        db: Database session
        project: Project to check access for
        user_id: User ID to check
        required_role: Optional minimum role required

    Returns:
        The user's effective role for this project

    Raises:
        HTTPException 403 if access denied or insufficient role
    """
    # Try direct access first (without parent inheritance)
    try:
        return await _check_direct_project_access(db, project, user_id, required_role)
    except HTTPException:
        pass  # No direct access, try parent inheritance

    # Check parent project inheritance
    inherited_role = await _check_parent_access(db, project, user_id)
    if inherited_role:
        return _validate_role(inherited_role, required_role)

    # No access through any path
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied",
    )


async def _check_direct_project_access(
    db: AsyncSession,
    project: Project,
    user_id: UUID,
    required_role: str | None = None,
) -> str:
    """Check direct access to a project (without parent inheritance)."""
    # 1. Check direct ProjectMember (highest priority)
    member_result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == user_id,
        )
    )
    member = member_result.scalar_one_or_none()
    if member:
        return _validate_role(member.role, required_role)

    # 2. Check ProjectShare for explicit sharing
    share_result = await db.execute(
        select(ProjectShare).where(
            ProjectShare.project_id == project.id,
            ProjectShare.user_id == user_id,
        )
    )
    share = share_result.scalar_one_or_none()
    if share:
        return _validate_role(share.role, required_role)

    # 3. Check if explicitly excluded (before team-based access)
    exclusion_result = await db.execute(
        select(ProjectExclusion).where(
            ProjectExclusion.project_id == project.id,
            ProjectExclusion.user_id == user_id,
        )
    )
    if exclusion_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied - you have been excluded from this project",
        )

    # 4. Scope-based access
    if project.scope == "PERSONAL":
        return await _check_personal_access(project, user_id, required_role)
    elif project.scope == "TEAM":
        return await _check_team_access(db, project, user_id, required_role)
    elif project.scope == "ORGANIZATION":
        return await _check_organization_access(db, project, user_id, required_role)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied",
    )


async def _check_parent_access(
    db: AsyncSession,
    project: Project,
    user_id: UUID,
    max_depth: int = 10,
) -> str | None:
    """
    Check if user has access to any parent project (inheritance).

    Walks up the project hierarchy and checks if user has access to any ancestor.
    If so, returns the inherited role (capped at 'member' for inherited access).

    Args:
        db: Database session
        project: Project to check parent access for
        user_id: User ID to check
        max_depth: Maximum depth to traverse (prevents infinite loops)

    Returns:
        The inherited role if user has parent access, None otherwise
    """
    if not project.parent_id or max_depth <= 0:
        return None

    # Get parent project
    parent_result = await db.execute(
        select(Project).where(Project.id == project.parent_id)
    )
    parent = parent_result.scalar_one_or_none()
    if not parent:
        return None

    # Check if user has direct access to parent
    try:
        parent_role = await _check_direct_project_access(db, parent, user_id, None)
        # User has access to parent - inherit access to child
        # Cap inherited role at 'member' to prevent automatic admin/owner escalation
        # unless they have admin/owner on parent
        if ROLE_HIERARCHY.get(parent_role, 0) >= ROLE_HIERARCHY["admin"]:
            return parent_role  # Admins/owners inherit their full role
        return "member"  # Others get member access to children
    except HTTPException:
        pass  # No direct access to parent, check grandparent

    # Recursively check grandparent
    return await _check_parent_access(db, parent, user_id, max_depth - 1)


async def _check_personal_access(
    project: Project,
    user_id: UUID,
    required_role: str | None,
) -> str:
    """Check access for personal scope - owner only."""
    if project.created_by_id == user_id:
        return _validate_role("owner", required_role)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied - this is a personal project",
    )


async def _check_team_access(
    db: AsyncSession,
    project: Project,
    user_id: UUID,
    required_role: str | None,
) -> str:
    """Check access for team scope via project_teams."""
    if not project.allow_all_team_members:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied - explicit membership required for this project",
        )

    # Get all teams linked to this project (with team details for owner check)
    project_teams_result = await db.execute(
        select(ProjectTeam, Team)
        .join(Team, ProjectTeam.team_id == Team.id)
        .where(ProjectTeam.project_id == project.id)
    )
    project_teams = project_teams_result.all()

    # Check if user is a member of any of these teams
    for pt, team in project_teams:
        # Check if user is the team owner - grant owner access
        if team.owner_id == user_id:
            return _validate_role("owner", required_role)

        team_member_result = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == pt.team_id,
                TeamMember.user_id == user_id,
            )
        )
        team_member = team_member_result.scalar_one_or_none()
        if team_member:
            # Use the role from project_teams, or escalate if team lead
            effective_role = pt.role
            if team_member.role == "lead":
                effective_role = "admin" if ROLE_HIERARCHY.get(effective_role, 0) < ROLE_HIERARCHY["admin"] else effective_role
            return _validate_role(effective_role, required_role)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied - you are not a member of any team with access to this project",
    )


async def _check_organization_access(
    db: AsyncSession,
    project: Project,
    user_id: UUID,
    required_role: str | None,
) -> str:
    """Check access for organization scope.

    For ORGANIZATION scope, team-based access is ALWAYS available regardless
    of allow_all_team_members setting (that flag only controls TEAM scope).
    """
    # Check team-based access (always available for ORGANIZATION scope)
    # NOTE: We check project_teams directly, NOT via _check_team_access,
    # because allow_all_team_members should only apply to TEAM scope projects.
    project_teams_result = await db.execute(
        select(ProjectTeam, Team)
        .join(Team, ProjectTeam.team_id == Team.id)
        .where(ProjectTeam.project_id == project.id)
    )
    project_teams = project_teams_result.all()

    for pt, team in project_teams:
        # Check if user is the team owner - grant owner access
        if team.owner_id == user_id:
            return _validate_role("owner", required_role)

        team_member_result = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == pt.team_id,
                TeamMember.user_id == user_id,
            )
        )
        team_member = team_member_result.scalar_one_or_none()
        if team_member:
            # Use the role from project_teams, or escalate if team lead
            effective_role = pt.role
            if team_member.role == "lead":
                effective_role = "admin" if ROLE_HIERARCHY.get(effective_role, 0) < ROLE_HIERARCHY["admin"] else effective_role
            return _validate_role(effective_role, required_role)

    # Not a team member, check org-public access
    if not project.is_org_public:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied - this organization project is not public",
        )

    # Get the primary team to find the organization
    team_result = await db.execute(
        select(Team).where(Team.id == project.team_id)
    )
    team = team_result.scalar_one_or_none()

    if not team or not team.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied - project has no organization",
        )

    # Check if user is an organization member
    org_member_result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == team.organization_id,
            OrganizationMember.user_id == user_id,
        )
    )
    if org_member_result.scalar_one_or_none():
        return _validate_role(project.org_public_role, required_role)

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied - you are not a member of this organization",
    )


def _validate_role(user_role: str, required_role: str | None) -> str:
    """Validate user role against required role and return user role."""
    if required_role and not has_sufficient_role(user_role, required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions - requires {required_role} role or higher",
        )
    return user_role


async def get_or_create_personal_team(
    db: AsyncSession,
    user: User,
) -> Team:
    """
    Get or create user's personal team.

    Personal teams:
    - Have is_personal=True
    - Have owner_id set to the user
    - Have organization_id=NULL (org-independent)
    - Are hidden from normal team listings

    Args:
        db: Database session
        user: User to get/create personal team for

    Returns:
        The user's personal team
    """
    # Check if personal team already exists via user reference
    if user.personal_team_id:
        result = await db.execute(
            select(Team).where(Team.id == user.personal_team_id)
        )
        team = result.scalar_one_or_none()
        if team:
            return team

    # Check by owner_id (in case personal_team_id wasn't set)
    # Use scalars().first() in case there are duplicate personal teams
    result = await db.execute(
        select(Team).where(
            Team.owner_id == user.id,
            Team.is_personal == True,
        )
    )
    existing_team = result.scalars().first()
    if existing_team:
        # Update user reference
        user.personal_team_id = existing_team.id
        await db.commit()
        return existing_team

    # Create personal team
    personal_team = Team(
        organization_id=None,  # Org-independent
        name=f"{user.display_name}'s Personal",
        description="Personal projects",
        is_personal=True,
        owner_id=user.id,
    )
    db.add(personal_team)
    await db.flush()

    # Add owner as team member
    team_member = TeamMember(
        team_id=personal_team.id,
        user_id=user.id,
        role="lead",
    )
    db.add(team_member)

    # Update user reference
    user.personal_team_id = personal_team.id

    await db.commit()
    await db.refresh(personal_team)

    return personal_team


def _generate_org_slug(name: str, user_id: str) -> str:
    """
    Generate a unique slug for an organization.

    Format: {sanitized-name}-{uuid[:8]}
    Example: "robert-barretts-org-a1b2c3d4"
    """
    import re
    # Sanitize: lowercase, replace non-alphanumeric with hyphens
    slug_base = name.lower()
    slug_base = re.sub(r"[^a-z0-9]+", "-", slug_base)
    slug_base = re.sub(r"^-+|-+$", "", slug_base)  # Trim leading/trailing hyphens
    slug_base = re.sub(r"-+", "-", slug_base)  # Collapse multiple hyphens

    # Add UUID suffix for uniqueness (first 8 chars)
    uuid_suffix = user_id.replace("-", "")[:8]

    return f"{slug_base}-{uuid_suffix}"


async def get_or_create_personal_organization(
    db: AsyncSession,
    user: User,
) -> Organization:
    """
    Get or create user's default personal organization.

    Personal organizations:
    - Named "{display_name}'s Organization"
    - User is added as admin
    - Created automatically on first login

    Args:
        db: Database session
        user: User to get/create personal organization for

    Returns:
        The user's personal organization
    """
    # Check if user already has any organization membership
    # Use scalars().first() since user may have multiple org memberships
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.user_id == user.id,
        )
    )
    existing_membership = result.scalars().first()

    if existing_membership:
        # User already has an organization, get it
        org_result = await db.execute(
            select(Organization).where(
                Organization.id == existing_membership.organization_id
            )
        )
        org = org_result.scalar_one_or_none()
        if org:
            return org

    # Create personal organization
    display_name = user.display_name or user.email.split("@")[0]
    org_name = f"{display_name}'s Organization"
    org_slug = _generate_org_slug(display_name, str(user.id))

    organization = Organization(
        name=org_name,
        slug=org_slug,
        settings={},
    )
    db.add(organization)
    await db.flush()

    # Add user as admin
    org_member = OrganizationMember(
        organization_id=organization.id,
        user_id=user.id,
        role="admin",
    )
    db.add(org_member)

    logger.info(
        "Created personal organization for user",
        user_id=str(user.id),
        organization_id=str(organization.id),
        organization_name=org_name,
    )

    await db.commit()
    await db.refresh(organization)

    return organization


async def ensure_org_membership(
    db: AsyncSession,
    team: Team,
    user_id: UUID,
) -> OrganizationMember | None:
    """
    Ensure user is a member of the team's organization.

    When a user joins a team that belongs to an organization, they should
    automatically become an organization member. This provides:
    - Visibility in organization directory
    - Access to org-public projects
    - Organization-level settings access

    The user gets "member" role (not admin) - admin requires explicit promotion.

    Args:
        db: Database session
        team: Team being joined
        user_id: User joining the team

    Returns:
        The OrganizationMember if created, None if already exists or no org
    """
    # Skip if team has no organization (personal/standalone teams)
    if not team.organization_id:
        return None

    # Check if already an organization member
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == team.organization_id,
            OrganizationMember.user_id == user_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return None  # Already a member, nothing to do

    # Create organization membership
    org_member = OrganizationMember(
        organization_id=team.organization_id,
        user_id=user_id,
        role="member",  # Always member via cascade - admin requires explicit promotion
    )
    db.add(org_member)

    logger.info(
        "Auto-added user to organization via team membership",
        user_id=str(user_id),
        organization_id=str(team.organization_id),
        team_id=str(team.id),
    )

    return org_member


async def add_team_to_project(
    db: AsyncSession,
    project: Project,
    team_id: UUID,
    role: str = "member",
    added_by_id: UUID | None = None,
) -> ProjectTeam:
    """
    Add a team to a project for multi-team access.

    Args:
        db: Database session
        project: Project to add team to
        team_id: Team to add
        role: Default role for team members (default: "member")
        added_by_id: User who added the team

    Returns:
        The created ProjectTeam link

    Raises:
        HTTPException 409 if team is already linked
    """
    # Check if team is already linked
    existing_result = await db.execute(
        select(ProjectTeam).where(
            ProjectTeam.project_id == project.id,
            ProjectTeam.team_id == team_id,
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Team is already linked to this project",
        )

    # Verify team exists
    team_result = await db.execute(select(Team).where(Team.id == team_id))
    if not team_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    project_team = ProjectTeam(
        project_id=project.id,
        team_id=team_id,
        role=role,
        added_by_id=added_by_id,
    )
    db.add(project_team)
    await db.commit()
    await db.refresh(project_team)

    return project_team


async def remove_team_from_project(
    db: AsyncSession,
    project: Project,
    team_id: UUID,
) -> None:
    """
    Remove a team from a project.

    Note: Cannot remove the primary team (project.team_id).

    Args:
        db: Database session
        project: Project to remove team from
        team_id: Team to remove

    Raises:
        HTTPException 400 if trying to remove primary team
        HTTPException 404 if team link not found
    """
    if project.team_id == team_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the primary team from a project",
        )

    result = await db.execute(
        select(ProjectTeam).where(
            ProjectTeam.project_id == project.id,
            ProjectTeam.team_id == team_id,
        )
    )
    project_team = result.scalar_one_or_none()

    if not project_team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team is not linked to this project",
        )

    await db.delete(project_team)
    await db.commit()


async def add_project_exclusion(
    db: AsyncSession,
    project: Project,
    user_id: UUID,
    excluded_by_id: UUID,
    reason: str | None = None,
) -> ProjectExclusion:
    """
    Add a user to project exclusion list (blocklist).

    Args:
        db: Database session
        project: Project to add exclusion to
        user_id: User to exclude
        excluded_by_id: User who added the exclusion
        reason: Optional reason for exclusion

    Returns:
        The created ProjectExclusion

    Raises:
        HTTPException 400 if project is not TEAM scope
        HTTPException 409 if user is already excluded
    """
    if project.scope != "TEAM":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exclusions only apply to TEAM scope projects",
        )

    # Check if already excluded
    existing_result = await db.execute(
        select(ProjectExclusion).where(
            ProjectExclusion.project_id == project.id,
            ProjectExclusion.user_id == user_id,
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already excluded from this project",
        )

    exclusion = ProjectExclusion(
        project_id=project.id,
        user_id=user_id,
        excluded_by_id=excluded_by_id,
        reason=reason,
    )
    db.add(exclusion)
    await db.commit()
    await db.refresh(exclusion)

    return exclusion


async def remove_project_exclusion(
    db: AsyncSession,
    project: Project,
    user_id: UUID,
) -> None:
    """
    Remove a user from project exclusion list.

    Args:
        db: Database session
        project: Project to remove exclusion from
        user_id: User to un-exclude

    Raises:
        HTTPException 404 if exclusion not found
    """
    result = await db.execute(
        select(ProjectExclusion).where(
            ProjectExclusion.project_id == project.id,
            ProjectExclusion.user_id == user_id,
        )
    )
    exclusion = result.scalar_one_or_none()

    if not exclusion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not excluded from this project",
        )

    await db.delete(exclusion)
    await db.commit()
