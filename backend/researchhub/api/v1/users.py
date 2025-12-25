"""User management endpoints."""

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db_session
from researchhub.models.user import User, UserPreferences

router = APIRouter()
logger = structlog.get_logger()


class UserListItem(BaseModel):
    """User list item for member selection."""

    user_id: UUID
    email: str
    display_name: str

    class Config:
        from_attributes = True


class UserProfileResponse(BaseModel):
    """User profile response."""

    id: UUID
    email: str
    display_name: str
    avatar_url: str | None
    title: str | None
    department: str | None
    research_interests: list[str]
    onboarding_completed: bool
    onboarding_step: int

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    """User profile update request."""

    display_name: str | None = Field(None, min_length=1, max_length=255)
    title: str | None = Field(None, max_length=255)
    department: str | None = Field(None, max_length=255)
    research_interests: list[str] | None = None
    avatar_url: str | None = None


class UserPreferencesResponse(BaseModel):
    """User preferences response."""

    theme: str
    theme_customization: dict = {}
    notification_email: bool
    notification_email_digest: str
    notification_in_app: bool
    default_project_view: str
    editor_font_size: int
    editor_line_height: float
    ai_suggestions_enabled: bool
    additional_settings: dict = {}

    class Config:
        from_attributes = True


class UserPreferencesUpdate(BaseModel):
    """User preferences update request."""

    theme: str | None = Field(None, pattern="^(light|dark|system)$")
    theme_customization: dict | None = None
    notification_email: bool | None = None
    notification_email_digest: str | None = Field(
        None, pattern="^(immediate|daily|weekly|none)$"
    )
    notification_in_app: bool | None = None
    default_project_view: str | None = Field(None, pattern="^(list|grid|grouped)$")
    editor_font_size: int | None = Field(None, ge=10, le=24)
    editor_line_height: float | None = Field(None, ge=1.0, le=2.5)
    ai_suggestions_enabled: bool | None = None
    additional_settings: dict | None = None


class OnboardingStepUpdate(BaseModel):
    """Onboarding step update request."""

    step: int = Field(..., ge=1, le=5)
    completed: bool = False


@router.get("", response_model=list[UserListItem])
async def list_users(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    search: str | None = Query(None, min_length=1, max_length=100),
    limit: int = Query(50, ge=1, le=100),
) -> list[UserListItem]:
    """List all users for member selection.

    Optionally filter by search term (matches email or display_name).
    """
    query = select(User)

    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                User.email.ilike(search_pattern),
                User.display_name.ilike(search_pattern),
            )
        )

    query = query.order_by(User.display_name).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()

    return [
        UserListItem(
            user_id=user.id,
            email=user.email,
            display_name=user.display_name or user.email,
        )
        for user in users
    ]


@router.get("/me/profile", response_model=UserProfileResponse)
async def get_my_profile(current_user: CurrentUser) -> User:
    """Get current user's profile."""
    return current_user


@router.patch("/me/profile", response_model=UserProfileResponse)
async def update_my_profile(
    updates: UserProfileUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> User:
    """Update current user's profile."""
    update_data = updates.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(current_user, field, value)

    await db.commit()
    await db.refresh(current_user)

    logger.info("User profile updated", user_id=str(current_user.id))
    return current_user


@router.get("/me/preferences", response_model=UserPreferencesResponse)
async def get_my_preferences(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> UserPreferences:
    """Get current user's preferences."""
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    preferences = result.scalar_one_or_none()

    if preferences is None:
        # Create default preferences
        preferences = UserPreferences(user_id=current_user.id)
        db.add(preferences)
        await db.commit()
        await db.refresh(preferences)

    return preferences


@router.patch("/me/preferences", response_model=UserPreferencesResponse)
async def update_my_preferences(
    updates: UserPreferencesUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> UserPreferences:
    """Update current user's preferences."""
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    preferences = result.scalar_one_or_none()

    if preferences is None:
        preferences = UserPreferences(user_id=current_user.id)
        db.add(preferences)

    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "additional_settings" and value is not None:
            # Merge additional_settings instead of overwriting
            current_settings = preferences.additional_settings or {}
            preferences.additional_settings = {**current_settings, **value}
        elif field == "theme_customization" and value is not None:
            # Merge theme_customization instead of overwriting
            current_customization = preferences.theme_customization or {}
            preferences.theme_customization = {**current_customization, **value}
        else:
            setattr(preferences, field, value)

    await db.commit()
    await db.refresh(preferences)

    logger.info("User preferences updated", user_id=str(current_user.id))
    return preferences


@router.post("/me/onboarding", response_model=UserProfileResponse)
async def update_onboarding_step(
    step_update: OnboardingStepUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> User:
    """Update user's onboarding progress."""
    current_user.onboarding_step = step_update.step

    if step_update.completed:
        current_user.onboarding_completed = True

    await db.commit()
    await db.refresh(current_user)

    logger.info(
        "Onboarding step updated",
        user_id=str(current_user.id),
        step=step_update.step,
        completed=step_update.completed,
    )
    return current_user


@router.get("/{user_id}", response_model=UserProfileResponse)
async def get_user_profile(
    user_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> User:
    """Get a user's public profile."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user
