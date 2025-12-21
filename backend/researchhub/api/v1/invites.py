"""Invite code preview and join endpoints.

Handles public invite code lookup and joining teams/organizations via invite codes.
"""

from datetime import datetime, timezone
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db_session
from researchhub.models.organization import (
    InviteCode,
    Organization,
    OrganizationMember,
    Team,
    TeamMember,
)
from researchhub.services.access_control import ensure_org_membership

router = APIRouter()
logger = structlog.get_logger()


# ============================================================================
# Schemas
# ============================================================================

class InvitePreviewResponse(BaseModel):
    """Preview information about an invite code."""

    code: str
    type: str  # "team" or "organization"
    name: str  # Team or organization name
    role: str  # Role that will be assigned
    is_valid: bool
    error: str | None = None  # If not valid, explains why


class JoinRequest(BaseModel):
    """Request to join via invite code."""

    code: str = Field(..., min_length=1, max_length=20)


class JoinResponse(BaseModel):
    """Response after successfully joining."""

    success: bool
    type: str  # "team" or "organization"
    id: UUID  # Team or organization ID
    name: str
    role: str


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/{code}", response_model=InvitePreviewResponse)
async def preview_invite(
    code: str,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Preview an invite code (public endpoint).

    Returns information about what you'll be joining without requiring authentication.
    """
    result = await db.execute(
        select(InviteCode).where(InviteCode.code == code.upper())
    )
    invite = result.scalar_one_or_none()

    if not invite:
        return {
            "code": code,
            "type": "unknown",
            "name": "Unknown",
            "role": "unknown",
            "is_valid": False,
            "error": "Invite code not found",
        }

    # Check validity
    if not invite.is_active:
        return {
            "code": code,
            "type": "team" if invite.team_id else "organization",
            "name": "Unknown",
            "role": invite.role,
            "is_valid": False,
            "error": "Invite code has been revoked",
        }

    if invite.expires_at and datetime.now(timezone.utc) > invite.expires_at:
        return {
            "code": code,
            "type": "team" if invite.team_id else "organization",
            "name": "Unknown",
            "role": invite.role,
            "is_valid": False,
            "error": "Invite code has expired",
        }

    if invite.max_uses is not None and invite.use_count >= invite.max_uses:
        return {
            "code": code,
            "type": "team" if invite.team_id else "organization",
            "name": "Unknown",
            "role": invite.role,
            "is_valid": False,
            "error": "Invite code has reached maximum uses",
        }

    # Get target name
    if invite.team_id:
        result = await db.execute(select(Team).where(Team.id == invite.team_id))
        team = result.scalar_one_or_none()
        if not team:
            return {
                "code": code,
                "type": "team",
                "name": "Unknown",
                "role": invite.role,
                "is_valid": False,
                "error": "Team no longer exists",
            }
        return {
            "code": code,
            "type": "team",
            "name": team.name,
            "role": invite.role,
            "is_valid": True,
            "error": None,
        }
    else:
        result = await db.execute(
            select(Organization).where(Organization.id == invite.organization_id)
        )
        org = result.scalar_one_or_none()
        if not org:
            return {
                "code": code,
                "type": "organization",
                "name": "Unknown",
                "role": invite.role,
                "is_valid": False,
                "error": "Organization no longer exists",
            }
        return {
            "code": code,
            "type": "organization",
            "name": org.name,
            "role": invite.role,
            "is_valid": True,
            "error": None,
        }


@router.post("/join", response_model=JoinResponse)
async def join_via_invite(
    request: JoinRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Join a team or organization using an invite code.

    Requires authentication. The invite code will be validated and
    the user will be added as a member with the role specified in the invite.
    """
    code = request.code.upper()

    result = await db.execute(select(InviteCode).where(InviteCode.code == code))
    invite = result.scalar_one_or_none()

    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite code not found",
        )

    # Validate invite
    if not invite.is_active:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Invite code has been revoked",
        )

    if invite.expires_at and datetime.now(timezone.utc) > invite.expires_at:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Invite code has expired",
        )

    if invite.max_uses is not None and invite.use_count >= invite.max_uses:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Invite code has reached maximum uses",
        )

    # Check email restriction if set
    if invite.email and invite.email.lower() != current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This invite code is restricted to a specific email address",
        )

    # Handle team invite
    if invite.team_id:
        # Check if already a member
        result = await db.execute(
            select(TeamMember).where(
                TeamMember.team_id == invite.team_id,
                TeamMember.user_id == current_user.id,
            )
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You are already a member of this team",
            )

        # Get team
        result = await db.execute(select(Team).where(Team.id == invite.team_id))
        team = result.scalar_one_or_none()
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team no longer exists",
            )

        # Add as member
        team_member = TeamMember(
            team_id=invite.team_id,
            user_id=current_user.id,
            role=invite.role,
        )
        db.add(team_member)

        # Auto-add to organization if team belongs to one
        await ensure_org_membership(db, team, current_user.id)

        # Increment use count
        invite.use_count += 1
        await db.commit()

        logger.info(
            "User joined team via invite",
            user_id=str(current_user.id),
            team_id=str(invite.team_id),
            invite_code=code,
            role=invite.role,
        )

        return {
            "success": True,
            "type": "team",
            "id": team.id,
            "name": team.name,
            "role": invite.role,
        }

    # Handle organization invite
    else:
        # Check if already a member
        result = await db.execute(
            select(OrganizationMember).where(
                OrganizationMember.organization_id == invite.organization_id,
                OrganizationMember.user_id == current_user.id,
            )
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You are already a member of this organization",
            )

        # Get organization
        result = await db.execute(
            select(Organization).where(Organization.id == invite.organization_id)
        )
        org = result.scalar_one_or_none()
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization no longer exists",
            )

        # Add as member
        org_member = OrganizationMember(
            organization_id=invite.organization_id,
            user_id=current_user.id,
            role=invite.role,
        )
        db.add(org_member)

        # Increment use count
        invite.use_count += 1
        await db.commit()

        logger.info(
            "User joined organization via invite",
            user_id=str(current_user.id),
            organization_id=str(invite.organization_id),
            invite_code=code,
            role=invite.role,
        )

        return {
            "success": True,
            "type": "organization",
            "id": org.id,
            "name": org.name,
            "role": invite.role,
        }
