"""Organization management endpoints."""

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db_session
from researchhub.models.organization import (
    Department,
    InviteCode,
    Organization,
    OrganizationMember,
    Team,
    TeamMember,
)
from researchhub.models.user import User

router = APIRouter()
logger = structlog.get_logger()


class OrganizationResponse(BaseModel):
    """Organization response."""

    id: UUID
    name: str
    slug: str
    logo_url: str | None
    settings: dict

    class Config:
        from_attributes = True


class OrganizationCreate(BaseModel):
    """Organization create request."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100, pattern="^[a-z0-9-]+$")


class DepartmentResponse(BaseModel):
    """Department response."""

    id: UUID
    name: str
    organization_id: UUID

    class Config:
        from_attributes = True


class DepartmentCreate(BaseModel):
    """Department create request."""

    name: str = Field(..., min_length=1, max_length=255)


class TeamResponse(BaseModel):
    """Team response."""

    id: UUID
    name: str
    description: str | None
    department_id: UUID | None
    organization_id: UUID | None  # Nullable for personal teams
    is_personal: bool = False

    class Config:
        from_attributes = True


class TeamCreate(BaseModel):
    """Team create request."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    department_id: UUID | None = None


class MemberResponse(BaseModel):
    """Organization member response."""

    user_id: UUID
    email: str
    display_name: str
    role: str

    class Config:
        from_attributes = True


class MemberInvite(BaseModel):
    """Member invite request."""

    email: str
    role: str = Field(default="member", pattern="^(admin|member)$")


@router.get("/", response_model=list[OrganizationResponse])
async def list_my_organizations(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[Organization]:
    """List organizations the current user belongs to."""
    result = await db.execute(
        select(Organization)
        .join(OrganizationMember)
        .where(OrganizationMember.user_id == current_user.id)
    )
    return list(result.scalars().all())


@router.get("/my/teams", response_model=list[TeamResponse])
async def list_my_teams(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[Team]:
    """List all teams the current user is a member of."""
    result = await db.execute(
        select(Team)
        .join(TeamMember)
        .where(TeamMember.user_id == current_user.id)
    )
    return list(result.scalars().all())


@router.post("/", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    org_data: OrganizationCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Organization:
    """Create a new organization."""
    # Check if slug is already taken
    result = await db.execute(
        select(Organization).where(Organization.slug == org_data.slug)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization slug already exists",
        )

    # Create organization
    organization = Organization(
        name=org_data.name,
        slug=org_data.slug,
        settings={},  # Explicitly initialize settings as empty dict
    )
    db.add(organization)
    await db.flush()

    # Add creator as admin
    member = OrganizationMember(
        organization_id=organization.id,
        user_id=current_user.id,
        role="admin",
    )
    db.add(member)
    await db.commit()
    await db.refresh(organization)

    logger.info(
        "Organization created",
        org_id=str(organization.id),
        created_by=str(current_user.id),
    )
    return organization


@router.get("/{org_id}", response_model=OrganizationResponse)
async def get_organization(
    org_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Organization:
    """Get organization details."""
    # Verify user is a member
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    result = await db.execute(select(Organization).where(Organization.id == org_id))
    organization = result.scalar_one_or_none()

    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    return organization


@router.get("/{org_id}/departments", response_model=list[DepartmentResponse])
async def list_departments(
    org_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[Department]:
    """List departments in an organization."""
    # Verify membership
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    result = await db.execute(
        select(Department).where(Department.organization_id == org_id)
    )
    return list(result.scalars().all())


@router.post(
    "/{org_id}/departments",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_department(
    org_id: UUID,
    dept_data: DepartmentCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Department:
    """Create a new department."""
    # Verify admin role
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.role == "admin",
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    department = Department(
        organization_id=org_id,
        name=dept_data.name,
    )
    db.add(department)
    await db.commit()
    await db.refresh(department)

    logger.info(
        "Department created",
        dept_id=str(department.id),
        org_id=str(org_id),
    )
    return department


@router.get("/{org_id}/teams", response_model=list[TeamResponse])
async def list_teams(
    org_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[Team]:
    """List teams in an organization."""
    # Verify membership
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    result = await db.execute(select(Team).where(Team.organization_id == org_id))
    return list(result.scalars().all())


@router.post(
    "/{org_id}/teams",
    response_model=TeamResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_team(
    org_id: UUID,
    team_data: TeamCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Team:
    """Create a new team."""
    # Verify admin role
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.role == "admin",
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    # Verify department exists if provided
    if team_data.department_id:
        result = await db.execute(
            select(Department).where(
                Department.id == team_data.department_id,
                Department.organization_id == org_id,
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Department not found",
            )

    team = Team(
        organization_id=org_id,
        name=team_data.name,
        description=team_data.description,
        department_id=team_data.department_id,
    )
    db.add(team)
    await db.flush()

    # Add creator as team lead
    team_member = TeamMember(
        team_id=team.id,
        user_id=current_user.id,
        role="lead",
    )
    db.add(team_member)
    await db.commit()
    await db.refresh(team)

    logger.info(
        "Team created",
        team_id=str(team.id),
        org_id=str(org_id),
    )
    return team


@router.get("/{org_id}/members", response_model=list[MemberResponse])
async def list_organization_members(
    org_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    """List members of an organization."""
    # Verify membership
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    result = await db.execute(
        select(OrganizationMember, User)
        .join(User)
        .where(OrganizationMember.organization_id == org_id)
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


# ============================================================================
# Additional Schemas
# ============================================================================

class OrganizationUpdate(BaseModel):
    """Organization update request."""

    name: str | None = Field(None, min_length=1, max_length=255)
    logo_url: str | None = None


class MemberAdd(BaseModel):
    """Add member request."""

    user_id: UUID
    role: str = Field(default="member", pattern="^(admin|member)$")


class MemberUpdate(BaseModel):
    """Update member role."""

    role: str = Field(..., pattern="^(admin|member)$")


class InviteCodeCreate(BaseModel):
    """Create invite code request."""

    role: str = Field(default="member", pattern="^(admin|member)$")
    email: str | None = None
    expires_in_hours: int | None = Field(default=168, ge=1, le=720)
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


# ============================================================================
# Helper functions
# ============================================================================

def generate_org_invite_code() -> str:
    """Generate a short, readable invite code for organizations."""
    charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    code = "".join(secrets.choice(charset) for _ in range(6))
    return f"ORG-{code}"


async def verify_org_admin(
    db: AsyncSession, org_id: UUID, user_id: UUID
) -> OrganizationMember:
    """Verify user is an organization admin."""
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
            OrganizationMember.role == "admin",
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return membership


# ============================================================================
# Organization Update Endpoint
# ============================================================================

@router.patch("/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: UUID,
    org_data: OrganizationUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> Organization:
    """Update organization. Requires admin role."""
    await verify_org_admin(db, org_id, current_user.id)

    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    if org_data.name is not None:
        org.name = org_data.name
    if org_data.logo_url is not None:
        org.logo_url = org_data.logo_url

    await db.commit()
    await db.refresh(org)

    logger.info("Organization updated", org_id=str(org_id), updated_by=str(current_user.id))
    return org


# ============================================================================
# Organization Member Management
# ============================================================================

@router.post(
    "/{org_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_organization_member(
    org_id: UUID,
    member_data: MemberAdd,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Add member to organization. Requires admin role."""
    await verify_org_admin(db, org_id, current_user.id)

    # Check if user exists
    result = await db.execute(select(User).where(User.id == member_data.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check if already a member
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == member_data.user_id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member",
        )

    # Add member
    member = OrganizationMember(
        organization_id=org_id,
        user_id=member_data.user_id,
        role=member_data.role,
    )
    db.add(member)
    await db.commit()

    logger.info(
        "Organization member added",
        org_id=str(org_id),
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


@router.patch("/{org_id}/members/{user_id}", response_model=MemberResponse)
async def update_organization_member(
    org_id: UUID,
    user_id: UUID,
    member_data: MemberUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Update organization member role. Requires admin role."""
    await verify_org_admin(db, org_id, current_user.id)

    # Get target membership
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member",
        )

    # Can't demote yourself as the only admin
    if user_id == current_user.id and membership.role == "admin" and member_data.role != "admin":
        result = await db.execute(
            select(func.count())
            .select_from(OrganizationMember)
            .where(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.role == "admin",
            )
        )
        admin_count = result.scalar()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the only admin",
            )

    # Get user info
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one()

    # Update role
    membership.role = member_data.role
    await db.commit()

    logger.info(
        "Organization member role updated",
        org_id=str(org_id),
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


@router.delete("/{org_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_organization_member(
    org_id: UUID,
    user_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove member from organization. Requires admin role or self-removal."""
    # Check if self-removal
    is_self_removal = current_user.id == user_id

    if not is_self_removal:
        await verify_org_admin(db, org_id, current_user.id)

    # Get target membership
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not a member",
        )

    # Can't remove the last admin
    if membership.role == "admin":
        result = await db.execute(
            select(func.count())
            .select_from(OrganizationMember)
            .where(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.role == "admin",
            )
        )
        admin_count = result.scalar()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last admin",
            )

    await db.delete(membership)
    await db.commit()

    logger.info(
        "Organization member removed",
        org_id=str(org_id),
        user_id=str(user_id),
        removed_by=str(current_user.id),
        self_removal=is_self_removal,
    )


# ============================================================================
# Organization Invite Code Management
# ============================================================================

@router.post(
    "/{org_id}/invites",
    response_model=InviteCodeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_org_invite(
    org_id: UUID,
    invite_data: InviteCodeCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> InviteCode:
    """Create an invite code for this organization. Requires admin role."""
    await verify_org_admin(db, org_id, current_user.id)

    # Generate unique code
    code = generate_org_invite_code()
    for _ in range(5):
        result = await db.execute(select(InviteCode).where(InviteCode.code == code))
        if not result.scalar_one_or_none():
            break
        code = generate_org_invite_code()
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
        organization_id=org_id,
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
        "Organization invite code created",
        org_id=str(org_id),
        code=code,
        created_by=str(current_user.id),
    )

    return invite


@router.get("/{org_id}/invites", response_model=list[InviteCodeResponse])
async def list_org_invites(
    org_id: UUID,
    current_user: CurrentUser,
    active_only: bool = Query(default=True),
    db: AsyncSession = Depends(get_db_session),
) -> list[InviteCode]:
    """List invite codes for this organization. Requires admin role."""
    await verify_org_admin(db, org_id, current_user.id)

    query = select(InviteCode).where(InviteCode.organization_id == org_id)
    if active_only:
        query = query.where(InviteCode.is_active == True)

    result = await db.execute(query.order_by(InviteCode.created_at.desc()))
    return list(result.scalars().all())


@router.delete("/{org_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_org_invite(
    org_id: UUID,
    invite_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Revoke an invite code. Requires admin role."""
    await verify_org_admin(db, org_id, current_user.id)

    result = await db.execute(
        select(InviteCode).where(
            InviteCode.id == invite_id,
            InviteCode.organization_id == org_id,
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
        "Organization invite code revoked",
        org_id=str(org_id),
        invite_id=str(invite_id),
        revoked_by=str(current_user.id),
    )
