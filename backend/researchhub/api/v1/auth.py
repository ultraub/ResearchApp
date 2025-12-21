"""Authentication endpoints for Azure AD and guest access."""

from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.config import get_settings
from researchhub.db.session import get_db_session
from researchhub.models.user import User
from researchhub.services.access_control import get_or_create_personal_team
from researchhub.services.google_oauth import GoogleOAuthService

router = APIRouter()
logger = structlog.get_logger()
settings = get_settings()
security = HTTPBearer(auto_error=False)


class TokenResponse(BaseModel):
    """JWT token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str | None = None


class GoogleLoginRequest(BaseModel):
    """Google OAuth login request with authorization code."""

    code: str
    redirect_uri: str


class GuestTokenRequest(BaseModel):
    """Request to validate a guest access token."""

    token: str


class UserResponse(BaseModel):
    """User information response."""

    id: UUID
    email: str
    display_name: str
    avatar_url: str | None
    onboarding_completed: bool
    created_at: datetime

    class Config:
        from_attributes = True


def create_access_token(user_id: UUID, expires_delta: timedelta | None = None) -> str:
    """Create a JWT access token."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.jwt_access_token_expire_minutes
        )

    to_encode = {
        "sub": str(user_id),
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(
        to_encode,
        settings.jwt_secret_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )


def create_refresh_token(user_id: UUID) -> str:
    """Create a JWT refresh token."""
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days)
    to_encode = {
        "sub": str(user_id),
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(
        to_encode,
        settings.jwt_secret_key.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: AsyncSession = Depends(get_db_session),
) -> User:
    """Get the current authenticated user from JWT token."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Dev token bypass for local development
    if credentials.credentials == "dev-token-for-testing" and settings.environment == "development":
        from researchhub.models.organization import Organization, OrganizationMember, Team, TeamMember

        # Find or create dev user
        result = await db.execute(select(User).where(User.email == "dev@researchhub.local"))
        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                email="dev@researchhub.local",
                display_name="Dev User",
                title="Developer",
                department="Engineering",
                onboarding_completed=True,
                onboarding_step=5,
            )
            db.add(user)
            await db.flush()
            logger.info("Created dev user", user_id=str(user.id))

        # Always ensure dev user has org and team membership
        # Check if user has any team membership
        team_member_result = await db.execute(
            select(TeamMember).where(TeamMember.user_id == user.id).limit(1)
        )
        existing_team_member = team_member_result.scalar_one_or_none()

        if existing_team_member is None:
            # Find or create dev organization
            org_result = await db.execute(select(Organization).where(Organization.slug == "dev-org"))
            org = org_result.scalar_one_or_none()

            if org is None:
                org = Organization(
                    name="Dev Organization",
                    slug="dev-org",
                )
                db.add(org)
                await db.flush()
                logger.info("Created dev organization", org_id=str(org.id))

            # Check org membership
            org_member_result = await db.execute(
                select(OrganizationMember).where(
                    OrganizationMember.organization_id == org.id,
                    OrganizationMember.user_id == user.id,
                )
            )
            if org_member_result.scalar_one_or_none() is None:
                org_member = OrganizationMember(
                    organization_id=org.id,
                    user_id=user.id,
                    role="owner",
                )
                db.add(org_member)

            # Find or create dev team
            team_result = await db.execute(
                select(Team).where(Team.organization_id == org.id, Team.name == "Dev Team")
            )
            team = team_result.scalar_one_or_none()

            if team is None:
                team = Team(
                    name="Dev Team",
                    organization_id=org.id,
                )
                db.add(team)
                await db.flush()
                logger.info("Created dev team", team_id=str(team.id))

            # Add user to team
            team_member = TeamMember(
                team_id=team.id,
                user_id=user.id,
                role="owner",
            )
            db.add(team_member)

            await db.commit()
            await db.refresh(user)
            logger.info("Added dev user to org and team", user_id=str(user.id))

        return user

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
        )
        user_id = payload.get("sub")
        token_type = payload.get("type")

        if user_id is None or token_type != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )

        result = await db.execute(select(User).where(User.id == UUID(user_id)))
        user = result.scalar_one_or_none()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is disabled",
            )

        return user

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


async def get_current_user_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: AsyncSession = Depends(get_db_session),
) -> User | None:
    """Get the current user if authenticated, otherwise None."""
    if not credentials:
        return None

    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None


# Type alias for dependency injection
CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_current_user_optional)]


@router.post("/google/login", response_model=TokenResponse)
async def google_login(
    request: GoogleLoginRequest,
    db: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    """Exchange Google OAuth authorization code for tokens."""
    google_service = GoogleOAuthService()

    try:
        # Exchange code for Google tokens
        google_tokens = await google_service.exchange_code(request.code, request.redirect_uri)

        # Get user info from Google
        user_info = await google_service.get_user_info(google_tokens["access_token"])

        # Find or create user by Google ID
        result = await db.execute(
            select(User).where(User.google_id == user_info["id"])
        )
        user = result.scalar_one_or_none()

        is_new_user = user is None
        if is_new_user:
            # Create new user
            user = User(
                email=user_info["email"],
                display_name=user_info.get("name", user_info["email"]),
                google_id=user_info["id"],
                avatar_url=user_info.get("picture"),
            )
            db.add(user)
            await db.flush()
            logger.info("Created new user from Google", user_id=str(user.id))
        else:
            # Update last login and avatar if changed
            user.last_login_at = datetime.now(timezone.utc)
            if user_info.get("picture") and user.avatar_url != user_info["picture"]:
                user.avatar_url = user_info["picture"]
            logger.info("User logged in via Google", user_id=str(user.id))

        # Ensure user has a personal team (creates one if missing)
        await get_or_create_personal_team(db, user)

        await db.commit()

        # Create our JWT tokens
        access_token = create_access_token(user.id)
        refresh_token = create_refresh_token(user.id)

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.jwt_access_token_expire_minutes * 60,
        )

    except ValueError as e:
        # ValueError contains specific error messages from GoogleOAuthService
        logger.error("Google login failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )
    except Exception as e:
        logger.error("Google login failed unexpectedly", error=str(e), error_type=type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Please try again.",
        )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    """Refresh access token using refresh token."""
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_key.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
        )
        user_id = payload.get("sub")
        token_type = payload.get("type")

        if user_id is None or token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
            )

        # Verify user still exists and is active
        result = await db.execute(select(User).where(User.id == UUID(user_id)))
        user = result.scalar_one_or_none()

        if user is None or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or disabled",
            )

        # Create new tokens
        access_token = create_access_token(user.id)
        refresh_token = create_refresh_token(user.id)

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.jwt_access_token_expire_minutes * 60,
        )

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: CurrentUser) -> User:
    """Get current user information."""
    return current_user


@router.post("/logout")
async def logout(current_user: CurrentUser) -> dict[str, str]:
    """Logout current user (client should discard tokens)."""
    logger.info("User logged out", user_id=str(current_user.id))
    return {"message": "Successfully logged out"}
