"""Team management endpoints.

Anyone can create teams. Team creators become owners with full control.
Teams can be standalone (no organization) or belong to an organization.
"""

import secrets
import string
from datetime import datetime, timedelta, timezone
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db_session
from researchhub.models.organization import (
    InviteCode,
    Organization,
    OrganizationMember,
    Team,
    TeamMember,
)
from researchhub.models.project import Project
from researchhub.models.user import User
from researchhub.services.access_control import ensure_org_membership

router = APIRouter()
logger = structlog.get_logger()


# ============================================================================
# Schemas
# ============================================================================

class TeamCreate(BaseModel):
    """Team create request."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    organization_id: UUID | None = None  # Optional: standalone teams allowed


class TeamUpdate(BaseModel):
    """Team update request."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


class TeamResponse(BaseModel):
    """Team response."""

    id: UUID
    name: str
    description: str | None
    organization_id: UUID | None
    department_id: UUID | None
    is_personal: bool
    member_count: int | None = None
    project_count: int | None = None

    class Config:
        from_attributes = True


class TeamMemberResponse(BaseModel):
    """Team member response."""

    user_id: UUID
    email: str
    display_name: str
    role: str  # owner, lead, member

    class Config:
        from_attributes = True


class TeamMemberAdd(BaseModel):
    """Add team member request."""

    user_id: UUID
    role: str = Field(default="member", pattern="^(lead|member)$")


class TeamMemberUpdate(BaseModel):
    """Update team member role."""

    role: str = Field(..., pattern="^(owner|lead|member)$")


class InviteCodeCreate(BaseModel):
    """Create invite code request."""

    role: str = Field(default="member", pattern="^(lead|member)$")
    email: str | None = None  # Optional: restrict to specific email
    expires_in_hours: int | None = Field(default=168, ge=1, le=720)  # 1 hour to 30 days
    max_uses: int | None = Field(default=None, ge=1, le=100)


class InviteCodeResponse(BaseModel):
    """Invite code response."""

    id: UUID
    code: str
    role: str
    email: str | None
    expires_at: datetime | None
    max_uses: int | None
    use_count: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectResponse(BaseModel):
    """Simplified project response for team projects."""

    id: UUID
    name: str
    description: str | None
    status: str
    color: str | None

    class Config:
        from_attributes = True


# ============================================================================
# Helper functions
# ============================================================================

def generate_invite_code() -> str:
    """Generate a short, readable invite code (e.g., 'TM-X8B2P4')."""
    # Use base32-like charset (no 0/O/1/I for readability)
    charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    code = "".join(secrets.choice(charset) for _ in range(6))
    return f"TM-{code}"


async def get_team_membership(
    db: AsyncSession, team_id: UUID, user_id: UUID
) -> TeamMember | None:
    """Get user's team membership."""
    result = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def verify_team_access(
    db: AsyncSession,
    team_id: UUID,
    user_id: UUID,
    required_roles: list[str] | None = None,
) -> tuple[Team, TeamMember]:
    """Verify user has access to team, optionally with required roles."""
    # Get team
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Get membership
    membership = await get_team_membership(db, team_id, user_id)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a team member",
        )

    if required_roles and membership.role not in required_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires {' or '.join(required_roles)} role",
        )

    return team, membership


# ============================================================================
# Team CRUD endpoints
# ============================================================================


class TeamDetailResponse(BaseModel):
    """Team detail response with user's role."""

    id: UUID
    name: str
    description: str | None
    organization_id: UUID | None
    department_id: UUID | None
    is_personal: bool
    owner_id: UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    member_count: int
    project_count: int
    current_user_role: str | None = None

    class Config:
        from_attributes = True


class TeamListResponse(BaseModel):
    """Paginated team list response."""

    items: list[TeamDetailResponse]
    total: int
    page: int
    page_size: int
    pages: int


@router.get("/", response_model=TeamListResponse)
async def list_teams(
    current_user: CurrentUser,
    organization_id: UUID | None = Query(default=None, description="Filter by organization"),
    include_personal: bool = Query(default=False, description="Include personal teams"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """List teams the current user is a member of.

    Returns teams with the user's role and membership counts.
    """
    # Base query: teams where user is a member
    base_query = (
        select(Team, TeamMember.role)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(TeamMember.user_id == current_user.id)
    )

    # Apply filters
    if organization_id:
        base_query = base_query.where(Team.organization_id == organization_id)
    if not include_personal:
        base_query = base_query.where(Team.is_personal == False)

    # Get total count
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination and ordering
    offset = (page - 1) * page_size
    query = base_query.order_by(Team.name).offset(offset).limit(page_size)
    result = await db.execute(query)

    items = []
    for team, role in result.all():
        # Get member count
        member_count_result = await db.execute(
            select(func.count())
            .select_from(TeamMember)
            .where(TeamMember.team_id == team.id)
        )
        member_count = member_count_result.scalar() or 0

        # Get project count
        project_count_result = await db.execute(
            select(func.count())
            .select_from(Project)
            .where(Project.team_id == team.id, Project.is_archived == False)
        )
        project_count = project_count_result.scalar() or 0

        items.append({
            "id": team.id,
            "name": team.name,
            "description": team.description,
            "organization_id": team.organization_id,
            "department_id": team.department_id,
            "is_personal": team.is_personal,
            "owner_id": team.owner_id,
            "created_at": team.created_at,
            "updated_at": team.updated_at,
            "member_count": member_count,
            "project_count": project_count,
            "current_user_role": role,
        })

    pages = (total + page_size - 1) // page_size if total > 0 else 1

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


@router.post("/", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    team_data: TeamCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Create a new team. Anyone can create teams.

    Creator automatically becomes the team owner.
    Teams can be standalone or belong to an organization.
    """
    # If organization_id provided, verify user is a member
    if team_data.organization_id:
        result = await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == team_data.organization_id,
                OrganizationMember.user_id == current_user.id,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Must be organization member to create team in org",
            )

    # Create team
    team = Team(
        name=team_data.name,
        description=team_data.description,
        organization_id=team_data.organization_id,
        is_personal=False,
    )
    db.add(team)
    await db.flush()

    # Add creator as owner
    team_member = TeamMember(
        team_id=team.id,
        user_id=current_user.id,
        role="owner",
    )
    db.add(team_member)
    await db.commit()
    await db.refresh(team)

    logger.info(
        "Team created",
        team_id=str(team.id),
        created_by=str(current_user.id),
        org_id=str(team_data.organization_id) if team_data.organization_id else None,
    )

    return {
        "id": team.id,
        "name": team.name,
        "description": team.description,
        "organization_id": team.organization_id,
        "department_id": team.department_id,
        "is_personal": team.is_personal,
        "member_count": 1,
        "project_count": 0,
    }


@router.get("/{team_id}", response_model=TeamDetailResponse)
async def get_team(
    team_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get team details. Requires team membership."""
    team, membership = await verify_team_access(db, team_id, current_user.id)

    # Get counts
    member_count = await db.execute(
        select(func.count()).select_from(TeamMember).where(TeamMember.team_id == team_id)
    )
    project_count = await db.execute(
        select(func.count()).select_from(Project).where(Project.team_id == team_id, Project.is_archived == False)
    )

    return {
        "id": team.id,
        "name": team.name,
        "description": team.description,
        "organization_id": team.organization_id,
        "department_id": team.department_id,
        "is_personal": team.is_personal,
        "owner_id": team.owner_id,
        "created_at": team.created_at,
        "updated_at": team.updated_at,
        "member_count": member_count.scalar(),
        "project_count": project_count.scalar(),
        "current_user_role": membership.role,
    }


@router.patch("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: UUID,
    team_data: TeamUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Update team. Requires owner or lead role."""
    team, _ = await verify_team_access(
        db, team_id, current_user.id, required_roles=["owner", "lead"]
    )

    # Update fields
    if team_data.name is not None:
        team.name = team_data.name
    if team_data.description is not None:
        team.description = team_data.description

    await db.commit()
    await db.refresh(team)

    logger.info("Team updated", team_id=str(team_id), updated_by=str(current_user.id))

    # Get counts
    member_count = await db.execute(
        select(func.count()).select_from(TeamMember).where(TeamMember.team_id == team_id)
    )
    project_count = await db.execute(
        select(func.count()).select_from(Project).where(Project.team_id == team_id)
    )

    return {
        "id": team.id,
        "name": team.name,
        "description": team.description,
        "organization_id": team.organization_id,
        "department_id": team.department_id,
        "is_personal": team.is_personal,
        "member_count": member_count.scalar(),
        "project_count": project_count.scalar(),
    }


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete team. Requires owner role only."""
    team, _ = await verify_team_access(
        db, team_id, current_user.id, required_roles=["owner"]
    )

    # Can't delete personal teams
    if team.is_personal:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete personal teams",
        )

    await db.delete(team)
    await db.commit()

    logger.info("Team deleted", team_id=str(team_id), deleted_by=str(current_user.id))


# ============================================================================
# Team member endpoints
# ============================================================================

@router.get("/{team_id}/members", response_model=list[TeamMemberResponse])
async def list_team_members(
    team_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    """List team members. Requires team membership."""
    await verify_team_access(db, team_id, current_user.id)

    result = await db.execute(
        select(TeamMember, User)
        .join(User)
        .where(TeamMember.team_id == team_id)
        .order_by(
            # Sort by role: owner first, then lead, then member
            case(
                (TeamMember.role == "owner", 1),
                (TeamMember.role == "lead", 2),
                else_=3,
            ),
            User.display_name,
        )
    )

    members = []
    for member, user in result.all():
        members.append({
            "user_id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "role": member.role,
        })

    return members


@router.post(
    "/{team_id}/members",
    response_model=TeamMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_team_member(
    team_id: UUID,
    member_data: TeamMemberAdd,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Add member to team. Requires owner or lead role."""
    team, _ = await verify_team_access(
        db, team_id, current_user.id, required_roles=["owner", "lead"]
    )

    # Check if user exists
    result = await db.execute(select(User).where(User.id == member_data.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check if already a member
    existing = await get_team_membership(db, team_id, member_data.user_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a team member",
        )

    # Add member
    team_member = TeamMember(
        team_id=team_id,
        user_id=member_data.user_id,
        role=member_data.role,
    )
    db.add(team_member)

    # Auto-add to organization if team belongs to one
    await ensure_org_membership(db, team, member_data.user_id)

    await db.commit()

    logger.info(
        "Team member added",
        team_id=str(team_id),
        user_id=str(member_data.user_id),
        role=member_data.role,
        added_by=str(current_user.id),
    )

    return {
        "user_id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": member_data.role,
    }


@router.patch("/{team_id}/members/{user_id}", response_model=TeamMemberResponse)
async def update_team_member(
    team_id: UUID,
    user_id: UUID,
    member_data: TeamMemberUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Update team member role. Requires owner or lead role.

    - Only owners can change someone to/from owner
    - Leads can change members to lead and vice versa
    """
    _, current_membership = await verify_team_access(
        db, team_id, current_user.id, required_roles=["owner", "lead"]
    )

    # Get target membership
    target_membership = await get_team_membership(db, team_id, user_id)
    if not target_membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a team member",
        )

    # Check permissions for owner role changes
    if member_data.role == "owner" or target_membership.role == "owner":
        if current_membership.role != "owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owners can transfer ownership",
            )

    # Can't demote yourself as the only owner
    if (
        target_membership.user_id == current_user.id
        and target_membership.role == "owner"
        and member_data.role != "owner"
    ):
        # Check if there are other owners
        result = await db.execute(
            select(func.count())
            .select_from(TeamMember)
            .where(TeamMember.team_id == team_id, TeamMember.role == "owner")
        )
        owner_count = result.scalar()
        if owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the only owner",
            )

    # Get user info
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()

    # Update role
    target_membership.role = member_data.role
    await db.commit()

    logger.info(
        "Team member role updated",
        team_id=str(team_id),
        user_id=str(user_id),
        new_role=member_data.role,
        updated_by=str(current_user.id),
    )

    return {
        "user_id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": member_data.role,
    }


@router.delete("/{team_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_team_member(
    team_id: UUID,
    user_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove member from team. Requires owner or lead role.

    - Cannot remove the last owner
    - Leads cannot remove owners
    - Users can leave teams themselves
    """
    _, current_membership = await verify_team_access(
        db, team_id, current_user.id, required_roles=["owner", "lead", "member"]
    )

    # Get target membership
    target_membership = await get_team_membership(db, team_id, user_id)
    if not target_membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a team member",
        )

    # Users can remove themselves
    is_self_removal = current_user.id == user_id

    if not is_self_removal:
        # Need owner or lead role to remove others
        if current_membership.role not in ["owner", "lead"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot remove other members",
            )

        # Leads can't remove owners
        if target_membership.role == "owner" and current_membership.role != "owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owners can remove other owners",
            )

    # Can't remove the last owner
    if target_membership.role == "owner":
        result = await db.execute(
            select(func.count())
            .select_from(TeamMember)
            .where(TeamMember.team_id == team_id, TeamMember.role == "owner")
        )
        owner_count = result.scalar()
        if owner_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last owner",
            )

    await db.delete(target_membership)
    await db.commit()

    logger.info(
        "Team member removed",
        team_id=str(team_id),
        user_id=str(user_id),
        removed_by=str(current_user.id),
        self_removal=is_self_removal,
    )


# ============================================================================
# Team projects endpoints
# ============================================================================

@router.get("/{team_id}/projects", response_model=list[ProjectResponse])
async def list_team_projects(
    team_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[Project]:
    """List projects belonging to this team. Requires team membership."""
    await verify_team_access(db, team_id, current_user.id)

    result = await db.execute(
        select(Project)
        .where(Project.team_id == team_id, Project.is_archived == False)
        .order_by(Project.updated_at.desc())
    )

    return list(result.scalars().all())


# ============================================================================
# Team invite code endpoints
# ============================================================================

@router.post(
    "/{team_id}/invites",
    response_model=InviteCodeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_team_invite(
    team_id: UUID,
    invite_data: InviteCodeCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> InviteCode:
    """Create an invite code for this team. Requires owner or lead role."""
    await verify_team_access(
        db, team_id, current_user.id, required_roles=["owner", "lead"]
    )

    # Generate unique code
    code = generate_invite_code()
    # Ensure uniqueness (retry if collision)
    for _ in range(5):
        result = await db.execute(select(InviteCode).where(InviteCode.code == code))
        if not result.scalar_one_or_none():
            break
        code = generate_invite_code()
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate unique invite code",
        )

    # Calculate expiration
    expires_at = None
    if invite_data.expires_in_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=invite_data.expires_in_hours)

    invite = InviteCode(
        code=code,
        team_id=team_id,
        role=invite_data.role,
        created_by=current_user.id,
        email=invite_data.email,
        expires_at=expires_at,
        max_uses=invite_data.max_uses,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    logger.info(
        "Team invite code created",
        team_id=str(team_id),
        code=code,
        created_by=str(current_user.id),
    )

    return invite


@router.get("/{team_id}/invites", response_model=list[InviteCodeResponse])
async def list_team_invites(
    team_id: UUID,
    current_user: CurrentUser,
    active_only: bool = Query(default=True),
    db: AsyncSession = Depends(get_db_session),
) -> list[InviteCode]:
    """List invite codes for this team. Requires owner or lead role."""
    await verify_team_access(
        db, team_id, current_user.id, required_roles=["owner", "lead"]
    )

    query = select(InviteCode).where(InviteCode.team_id == team_id)
    if active_only:
        query = query.where(InviteCode.is_active == True)

    result = await db.execute(query.order_by(InviteCode.created_at.desc()))
    return list(result.scalars().all())


@router.delete("/{team_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_team_invite(
    team_id: UUID,
    invite_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Revoke an invite code. Requires owner or lead role."""
    await verify_team_access(
        db, team_id, current_user.id, required_roles=["owner", "lead"]
    )

    result = await db.execute(
        select(InviteCode).where(
            InviteCode.id == invite_id,
            InviteCode.team_id == team_id,
        )
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite code not found",
        )

    invite.is_active = False
    await db.commit()

    logger.info(
        "Team invite code revoked",
        team_id=str(team_id),
        invite_id=str(invite_id),
        revoked_by=str(current_user.id),
    )
