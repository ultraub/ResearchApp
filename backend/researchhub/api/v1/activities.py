"""Activity and notification API endpoints."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.db.session import get_db
from researchhub.api.v1.auth import get_current_user
from researchhub.models import Activity, Notification, NotificationPreference, User

router = APIRouter(tags=["activities"])


# --- Activity Schemas ---

class ActivityResponse(BaseModel):
    """Schema for activity response."""
    id: UUID
    activity_type: str
    action: str
    description: str | None
    target_type: str
    target_id: UUID
    target_title: str | None
    parent_type: str | None
    parent_id: UUID | None
    project_id: UUID | None
    organization_id: UUID
    actor_id: UUID
    actor_name: str | None = None
    actor_avatar: str | None = None
    metadata: dict | None
    is_public: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ActivityFeedResponse(BaseModel):
    """Schema for paginated activity feed response."""
    activities: list[ActivityResponse]
    total: int
    has_more: bool


# --- Notification Schemas ---

class NotificationResponse(BaseModel):
    """Schema for notification response."""
    id: UUID
    notification_type: str
    title: str
    message: str | None
    activity_id: UUID | None
    target_type: str | None
    target_id: UUID | None
    target_url: str | None
    user_id: UUID
    sender_id: UUID | None
    sender_name: str | None = None
    organization_id: UUID
    is_read: bool
    read_at: datetime | None
    is_archived: bool
    metadata: dict | None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    """Schema for paginated notification list."""
    notifications: list[NotificationResponse]
    unread_count: int
    total: int
    has_more: bool


class MarkNotificationsRequest(BaseModel):
    """Schema for marking notifications as read."""
    notification_ids: list[UUID] | None = None
    mark_all: bool = False


class NotificationPreferenceUpdate(BaseModel):
    """Schema for updating notification preferences."""
    email_enabled: bool | None = None
    email_frequency: str | None = Field(None, pattern="^(instant|daily|weekly|never)$")
    in_app_enabled: bool | None = None
    notify_mentions: bool | None = None
    notify_assignments: bool | None = None
    notify_comments: bool | None = None
    notify_task_updates: bool | None = None
    notify_document_updates: bool | None = None
    notify_project_updates: bool | None = None
    notify_team_changes: bool | None = None
    quiet_hours_enabled: bool | None = None
    quiet_hours_start: str | None = None
    quiet_hours_end: str | None = None
    quiet_hours_timezone: str | None = None


class NotificationPreferenceResponse(BaseModel):
    """Schema for notification preference response."""
    id: UUID
    user_id: UUID
    email_enabled: bool
    email_frequency: str
    in_app_enabled: bool
    notify_mentions: bool
    notify_assignments: bool
    notify_comments: bool
    notify_task_updates: bool
    notify_document_updates: bool
    notify_project_updates: bool
    notify_team_changes: bool
    quiet_hours_enabled: bool
    quiet_hours_start: str | None
    quiet_hours_end: str | None
    quiet_hours_timezone: str | None

    class Config:
        from_attributes = True


# --- Activity Endpoints ---

@router.get("/feed", response_model=ActivityFeedResponse)
async def get_activity_feed(
    organization_id: UUID,
    project_id: UUID | None = None,
    target_type: str | None = None,
    target_id: UUID | None = None,
    actor_id: UUID | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get activity feed for an organization or project."""
    query = (
        select(Activity)
        .where(Activity.organization_id == organization_id)
        .where(Activity.is_public == True)
    )

    if project_id:
        query = query.where(Activity.project_id == project_id)

    if target_type:
        query = query.where(Activity.target_type == target_type)

    if target_id:
        query = query.where(Activity.target_id == target_id)

    if actor_id:
        query = query.where(Activity.actor_id == actor_id)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Fetch activities with actor info
    query = (
        query
        .options(selectinload(Activity.actor))
        .order_by(Activity.created_at.desc())
        .offset(skip)
        .limit(limit + 1)
    )

    result = await db.execute(query)
    activities = result.scalars().all()

    has_more = len(activities) > limit
    activities = activities[:limit]

    # Build response with actor info
    activity_responses = []
    for activity in activities:
        response = ActivityResponse(
            id=activity.id,
            activity_type=activity.activity_type,
            action=activity.action,
            description=activity.description,
            target_type=activity.target_type,
            target_id=activity.target_id,
            target_title=activity.target_title,
            parent_type=activity.parent_type,
            parent_id=activity.parent_id,
            project_id=activity.project_id,
            organization_id=activity.organization_id,
            actor_id=activity.actor_id,
            actor_name=activity.actor.display_name if activity.actor else None,
            actor_avatar=activity.actor.avatar_url if activity.actor else None,
            metadata=activity.metadata,
            is_public=activity.is_public,
            created_at=activity.created_at,
        )
        activity_responses.append(response)

    return ActivityFeedResponse(
        activities=activity_responses,
        total=total,
        has_more=has_more,
    )


@router.get("/{activity_id}", response_model=ActivityResponse)
async def get_activity(
    activity_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific activity by ID."""
    result = await db.execute(
        select(Activity)
        .where(Activity.id == activity_id)
        .options(selectinload(Activity.actor))
    )
    activity = result.scalar_one_or_none()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )

    return ActivityResponse(
        id=activity.id,
        activity_type=activity.activity_type,
        action=activity.action,
        description=activity.description,
        target_type=activity.target_type,
        target_id=activity.target_id,
        target_title=activity.target_title,
        parent_type=activity.parent_type,
        parent_id=activity.parent_id,
        project_id=activity.project_id,
        organization_id=activity.organization_id,
        actor_id=activity.actor_id,
        actor_name=activity.actor.display_name if activity.actor else None,
        actor_avatar=activity.actor.avatar_url if activity.actor else None,
        metadata=activity.metadata,
        is_public=activity.is_public,
        created_at=activity.created_at,
    )


# --- Notification Endpoints ---

@router.get("/notifications", response_model=NotificationListResponse)
async def get_notifications(
    current_user: User = Depends(get_current_user),
    organization_id: UUID | None = None,
    is_read: bool | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Get notifications for the current user."""
    query = (
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .where(Notification.is_archived == False)
    )

    if organization_id:
        query = query.where(Notification.organization_id == organization_id)

    if is_read is not None:
        query = query.where(Notification.is_read == is_read)

    # Count total and unread
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    unread_query = select(func.count()).select_from(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .where(Notification.is_read == False)
        .where(Notification.is_archived == False)
        .subquery()
    )
    unread_count = await db.scalar(unread_query) or 0

    # Fetch notifications
    query = (
        query
        .options(selectinload(Notification.sender))
        .order_by(Notification.created_at.desc())
        .offset(skip)
        .limit(limit + 1)
    )

    result = await db.execute(query)
    notifications = result.scalars().all()

    has_more = len(notifications) > limit
    notifications = notifications[:limit]

    # Build response
    notification_responses = []
    for notif in notifications:
        response = NotificationResponse(
            id=notif.id,
            notification_type=notif.notification_type,
            title=notif.title,
            message=notif.message,
            activity_id=notif.activity_id,
            target_type=notif.target_type,
            target_id=notif.target_id,
            target_url=notif.target_url,
            user_id=notif.user_id,
            sender_id=notif.sender_id,
            sender_name=notif.sender.display_name if notif.sender else None,
            organization_id=notif.organization_id,
            is_read=notif.is_read,
            read_at=notif.read_at,
            is_archived=notif.is_archived,
            metadata=notif.metadata,
            created_at=notif.created_at,
        )
        notification_responses.append(response)

    return NotificationListResponse(
        notifications=notification_responses,
        unread_count=unread_count,
        total=total,
        has_more=has_more,
    )


@router.post("/notifications/mark-read")
async def mark_notifications_read(
    request: MarkNotificationsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark notifications as read."""
    now = datetime.utcnow()

    if request.mark_all:
        # Mark all unread notifications as read
        await db.execute(
            update(Notification)
            .where(Notification.user_id == current_user.id)
            .where(Notification.is_read == False)
            .values(is_read=True, read_at=now)
        )
    elif request.notification_ids:
        # Mark specific notifications as read
        await db.execute(
            update(Notification)
            .where(Notification.user_id == current_user.id)
            .where(Notification.id.in_(request.notification_ids))
            .values(is_read=True, read_at=now)
        )

    await db.commit()

    return {"message": "Notifications marked as read"}


@router.post("/notifications/{notification_id}/archive")
async def archive_notification(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive a notification."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id
        )
    )
    notification = result.scalar_one_or_none()

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )

    notification.is_archived = True
    await db.commit()

    return {"message": "Notification archived"}


# --- Notification Preferences ---

@router.get("/notifications/preferences", response_model=NotificationPreferenceResponse)
async def get_notification_preferences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get notification preferences for the current user."""
    result = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == current_user.id)
    )
    prefs = result.scalar_one_or_none()

    if not prefs:
        # Create default preferences
        prefs = NotificationPreference(user_id=current_user.id)
        db.add(prefs)
        await db.commit()
        await db.refresh(prefs)

    return prefs


@router.patch("/notifications/preferences", response_model=NotificationPreferenceResponse)
async def update_notification_preferences(
    updates: NotificationPreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update notification preferences for the current user."""
    result = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == current_user.id)
    )
    prefs = result.scalar_one_or_none()

    if not prefs:
        prefs = NotificationPreference(user_id=current_user.id)
        db.add(prefs)

    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(prefs, field, value)

    await db.commit()
    await db.refresh(prefs)

    return prefs
