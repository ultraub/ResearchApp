"""Sharing, invitations, and collaboration API endpoints."""

import secrets
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.db.session import get_db
from researchhub.api.v1.auth import get_current_user
from researchhub.api.v1.projects import check_project_access
from researchhub.models import (
    ProjectShare,
    DocumentShare,
    ShareLink,
    Invitation,
    Comment,
    Reaction,
    Project,
    User,
)
from researchhub.models.project import Task
from researchhub.models.document import Document
from researchhub.services.notification import NotificationService

router = APIRouter(prefix="/sharing", tags=["sharing"])


# --- Access Control Helper ---

async def verify_resource_access(
    db: AsyncSession,
    resource_type: str,
    resource_id: UUID,
    user_id: UUID,
    required_role: str = "viewer",
) -> UUID:
    """
    Verify user has access to a resource and return the project_id.

    For project resources, checks project access directly.
    For task/document resources, gets the parent project and checks access.

    Args:
        db: Database session
        resource_type: Type of resource (project, task, document, etc.)
        resource_id: ID of the resource
        user_id: User ID to check
        required_role: Minimum role required (default: viewer)

    Returns:
        The project_id for the resource

    Raises:
        HTTPException 404 if resource not found
        HTTPException 403 if access denied
    """
    if resource_type == "project":
        # Direct project access check
        await check_project_access(db, resource_id, user_id, required_role)
        return resource_id

    elif resource_type == "task":
        result = await db.execute(select(Task).where(Task.id == resource_id))
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        await check_project_access(db, task.project_id, user_id, required_role)
        return task.project_id

    elif resource_type == "document":
        result = await db.execute(select(Document).where(Document.id == resource_id))
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        await check_project_access(db, doc.project_id, user_id, required_role)
        return doc.project_id

    else:
        # For other resource types (idea, paper, etc.), we may need to extend this
        # For now, raise an error for unsupported types
        raise HTTPException(
            status_code=400,
            detail=f"Access check not implemented for resource type: {resource_type}"
        )


# --- Project Share Schemas ---

class ProjectShareCreate(BaseModel):
    """Schema for creating a project share."""
    project_id: UUID
    user_id: UUID
    role: str = Field("viewer", pattern="^(viewer|editor|admin)$")


class ProjectShareUpdate(BaseModel):
    """Schema for updating a project share."""
    role: str | None = Field(None, pattern="^(viewer|editor|admin)$")
    notify_on_updates: bool | None = None


class ProjectShareResponse(BaseModel):
    """Schema for project share response."""
    id: UUID
    project_id: UUID
    user_id: UUID
    user_name: str | None = None
    user_email: str | None = None
    user_avatar: str | None = None
    role: str
    granted_by_id: UUID
    last_accessed_at: datetime | None
    access_count: int
    notify_on_updates: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Share Link Schemas ---

class ShareLinkCreate(BaseModel):
    """Schema for creating a share link."""
    resource_type: str = Field(..., pattern="^(project|document|collection)$")
    resource_id: UUID
    access_level: str = Field("view", pattern="^(view|comment|edit)$")
    requires_auth: bool = False
    password: str | None = None
    allowed_domains: list[str] | None = None
    expires_in_days: int | None = Field(None, ge=1, le=365)
    max_uses: int | None = Field(None, ge=1)
    organization_id: UUID


class ShareLinkResponse(BaseModel):
    """Schema for share link response."""
    id: UUID
    token: str
    url: str
    resource_type: str
    resource_id: UUID
    access_level: str
    requires_auth: bool
    has_password: bool
    allowed_domains: list[str] | None
    expires_at: datetime | None
    max_uses: int | None
    use_count: int
    is_active: bool
    created_by_id: UUID
    organization_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


# --- Invitation Schemas ---

class InvitationCreate(BaseModel):
    """Schema for creating an invitation."""
    email: EmailStr
    invitation_type: str = Field(..., pattern="^(organization|project)$")
    organization_id: UUID
    project_id: UUID | None = None
    role: str = Field("member", pattern="^(member|admin|viewer|editor)$")
    personal_message: str | None = None


class InvitationResponse(BaseModel):
    """Schema for invitation response."""
    id: UUID
    invitation_type: str
    organization_id: UUID
    organization_name: str | None = None
    project_id: UUID | None
    project_name: str | None = None
    email: str
    role: str
    status: str
    personal_message: str | None
    invited_by_id: UUID
    invited_by_name: str | None = None
    expires_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


# --- Comment Schemas ---

class CommentCreate(BaseModel):
    """Schema for creating a comment."""
    resource_type: str = Field(..., pattern="^(project|task|document|idea|paper)$")
    resource_id: UUID
    content: str = Field(..., min_length=1)
    parent_id: UUID | None = None
    organization_id: UUID


class CommentUpdate(BaseModel):
    """Schema for updating a comment."""
    content: str = Field(..., min_length=1)


class CommentResponse(BaseModel):
    """Schema for comment response."""
    id: UUID
    content: str
    content_html: str | None
    resource_type: str
    resource_id: UUID
    parent_id: UUID | None
    thread_id: UUID | None
    author_id: UUID
    author_name: str | None = None
    author_avatar: str | None = None
    organization_id: UUID
    mentioned_user_ids: list[str] | None
    is_edited: bool
    edited_at: datetime | None
    is_deleted: bool
    is_resolved: bool
    resolved_by_id: UUID | None
    resolved_at: datetime | None
    reply_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Reaction Schemas ---

class ReactionCreate(BaseModel):
    """Schema for creating a reaction."""
    resource_type: str
    resource_id: UUID
    emoji: str = Field(..., max_length=50)


class ReactionResponse(BaseModel):
    """Schema for reaction response."""
    id: UUID
    resource_type: str
    resource_id: UUID
    emoji: str
    user_id: UUID
    user_name: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReactionSummary(BaseModel):
    """Schema for reaction summary."""
    emoji: str
    count: int
    users: list[str]


# --- Project Share Endpoints ---

@router.post("/projects/{project_id}/shares", response_model=ProjectShareResponse, status_code=status.HTTP_201_CREATED)
async def share_project(
    project_id: UUID,
    share_data: ProjectShareCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Share a project with a user."""
    # Verify user has admin access to the project
    await check_project_access(db, project_id, current_user.id, "admin")

    # Check for existing share
    result = await db.execute(
        select(ProjectShare).where(
            ProjectShare.project_id == project_id,
            ProjectShare.user_id == share_data.user_id
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User already has access to this project")

    share = ProjectShare(
        project_id=project_id,
        user_id=share_data.user_id,
        role=share_data.role,
        granted_by_id=current_user.id,
    )

    db.add(share)
    await db.commit()
    await db.refresh(share, ["user"])

    # Send notification to the user receiving access
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()

    if project and project.organization_id:
        notification_service = NotificationService(db)
        await notification_service.notify(
            user_id=share_data.user_id,
            notification_type="document_shared",
            title=f"Project shared with you: {project.name}",
            message=f"You now have {share_data.role} access to '{project.name}'",
            organization_id=project.organization_id,
            target_type="project",
            target_id=project_id,
            target_url=f"/projects/{project_id}",
            sender_id=current_user.id,
        )

    return ProjectShareResponse(
        id=share.id,
        project_id=share.project_id,
        user_id=share.user_id,
        user_name=share.user.display_name if share.user else None,
        user_email=share.user.email if share.user else None,
        user_avatar=share.user.avatar_url if share.user else None,
        role=share.role,
        granted_by_id=share.granted_by_id,
        last_accessed_at=share.last_accessed_at,
        access_count=share.access_count,
        notify_on_updates=share.notify_on_updates,
        created_at=share.created_at,
    )


@router.get("/projects/{project_id}/shares", response_model=list[ProjectShareResponse])
async def get_project_shares(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all shares for a project."""
    # Verify user has access to view project shares (admin required)
    await check_project_access(db, project_id, current_user.id, "admin")

    result = await db.execute(
        select(ProjectShare)
        .where(ProjectShare.project_id == project_id)
        .options(selectinload(ProjectShare.user))
        .order_by(ProjectShare.created_at)
    )
    shares = result.scalars().all()

    return [
        ProjectShareResponse(
            id=share.id,
            project_id=share.project_id,
            user_id=share.user_id,
            user_name=share.user.display_name if share.user else None,
            user_email=share.user.email if share.user else None,
            user_avatar=share.user.avatar_url if share.user else None,
            role=share.role,
            granted_by_id=share.granted_by_id,
            last_accessed_at=share.last_accessed_at,
            access_count=share.access_count,
            notify_on_updates=share.notify_on_updates,
            created_at=share.created_at,
        )
        for share in shares
    ]


@router.patch("/projects/{project_id}/shares/{user_id}", response_model=ProjectShareResponse)
async def update_project_share(
    project_id: UUID,
    user_id: UUID,
    updates: ProjectShareUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a project share."""
    # Verify user has admin access to the project
    await check_project_access(db, project_id, current_user.id, "admin")

    result = await db.execute(
        select(ProjectShare)
        .where(
            ProjectShare.project_id == project_id,
            ProjectShare.user_id == user_id
        )
        .options(selectinload(ProjectShare.user))
    )
    share = result.scalar_one_or_none()

    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(share, field, value)

    await db.commit()
    await db.refresh(share)

    return ProjectShareResponse(
        id=share.id,
        project_id=share.project_id,
        user_id=share.user_id,
        user_name=share.user.display_name if share.user else None,
        user_email=share.user.email if share.user else None,
        user_avatar=share.user.avatar_url if share.user else None,
        role=share.role,
        granted_by_id=share.granted_by_id,
        last_accessed_at=share.last_accessed_at,
        access_count=share.access_count,
        notify_on_updates=share.notify_on_updates,
        created_at=share.created_at,
    )


@router.delete("/projects/{project_id}/shares/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_share(
    project_id: UUID,
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a user's access to a project."""
    # Verify user has admin access to the project
    await check_project_access(db, project_id, current_user.id, "admin")

    result = await db.execute(
        select(ProjectShare).where(
            ProjectShare.project_id == project_id,
            ProjectShare.user_id == user_id
        )
    )
    share = result.scalar_one_or_none()

    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    await db.delete(share)
    await db.commit()


# --- Share Link Endpoints ---

@router.post("/links", response_model=ShareLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_share_link(
    link_data: ShareLinkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a share link for a resource."""
    # Verify user has admin access to the resource before creating share link
    await verify_resource_access(
        db, link_data.resource_type, link_data.resource_id, current_user.id, "admin"
    )

    token = secrets.token_urlsafe(32)

    expires_at = None
    if link_data.expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=link_data.expires_in_days)

    # TODO: Hash password if provided
    password_hash = None

    link = ShareLink(
        token=token,
        resource_type=link_data.resource_type,
        resource_id=link_data.resource_id,
        access_level=link_data.access_level,
        requires_auth=link_data.requires_auth,
        password_hash=password_hash,
        allowed_domains=link_data.allowed_domains,
        expires_at=expires_at,
        max_uses=link_data.max_uses,
        created_by_id=current_user.id,
        organization_id=link_data.organization_id,
    )

    db.add(link)
    await db.commit()
    await db.refresh(link)

    return ShareLinkResponse(
        id=link.id,
        token=link.token,
        url=f"/share/{link.token}",  # TODO: Use proper frontend URL
        resource_type=link.resource_type,
        resource_id=link.resource_id,
        access_level=link.access_level,
        requires_auth=link.requires_auth,
        has_password=link.password_hash is not None,
        allowed_domains=link.allowed_domains,
        expires_at=link.expires_at,
        max_uses=link.max_uses,
        use_count=link.use_count,
        is_active=link.is_active,
        created_by_id=link.created_by_id,
        organization_id=link.organization_id,
        created_at=link.created_at,
    )


@router.get("/links/{token}", response_model=ShareLinkResponse)
async def get_share_link(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get share link details by token."""
    result = await db.execute(
        select(ShareLink).where(ShareLink.token == token)
    )
    link = result.scalar_one_or_none()

    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")

    # User can view link details if they created it OR have access to the resource
    if link.created_by_id != current_user.id:
        await verify_resource_access(
            db, link.resource_type, link.resource_id, current_user.id, "viewer"
        )

    return ShareLinkResponse(
        id=link.id,
        token=link.token,
        url=f"/share/{link.token}",
        resource_type=link.resource_type,
        resource_id=link.resource_id,
        access_level=link.access_level,
        requires_auth=link.requires_auth,
        has_password=link.password_hash is not None,
        allowed_domains=link.allowed_domains,
        expires_at=link.expires_at,
        max_uses=link.max_uses,
        use_count=link.use_count,
        is_active=link.is_active,
        created_by_id=link.created_by_id,
        organization_id=link.organization_id,
        created_at=link.created_at,
    )


@router.delete("/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share_link(
    link_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a share link."""
    result = await db.execute(
        select(ShareLink).where(ShareLink.id == link_id)
    )
    link = result.scalar_one_or_none()

    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")

    # User can revoke if they created the link OR have admin access to the resource
    if link.created_by_id != current_user.id:
        await verify_resource_access(
            db, link.resource_type, link.resource_id, current_user.id, "admin"
        )

    link.is_active = False
    await db.commit()


# --- Invitation Endpoints ---

@router.post("/invitations", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
async def create_invitation(
    invitation_data: InvitationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create an invitation to join an organization or project."""
    # For project invitations, verify user has admin access to the project
    if invitation_data.invitation_type == "project" and invitation_data.project_id:
        await check_project_access(db, invitation_data.project_id, current_user.id, "admin")

    # TODO: For organization invitations, verify user is org admin
    # This would require an org admin check similar to check_project_access

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=7)

    # Check if user already exists
    result = await db.execute(
        select(User).where(User.email == invitation_data.email)
    )
    existing_user = result.scalar_one_or_none()

    invitation = Invitation(
        invitation_type=invitation_data.invitation_type,
        organization_id=invitation_data.organization_id,
        project_id=invitation_data.project_id,
        email=invitation_data.email,
        invited_user_id=existing_user.id if existing_user else None,
        role=invitation_data.role,
        token=token,
        personal_message=invitation_data.personal_message,
        invited_by_id=current_user.id,
        expires_at=expires_at,
    )

    db.add(invitation)
    await db.commit()
    await db.refresh(invitation, ["organization", "project", "invited_by"])

    # Send notification if user already exists in the system
    if existing_user and invitation_data.organization_id:
        notification_service = NotificationService(db)
        target_name = invitation.project.name if invitation.project else (invitation.organization.name if invitation.organization else "organization")
        await notification_service.notify(
            user_id=existing_user.id,
            notification_type="invitation_sent",
            title=f"You're invited to join: {target_name}",
            message=f"You have been invited to join '{target_name}' as {invitation_data.role}",
            organization_id=invitation_data.organization_id,
            target_type="invitation",
            target_id=invitation.id,
            target_url=f"/invitations/{invitation.id}",
            sender_id=current_user.id,
        )

    return InvitationResponse(
        id=invitation.id,
        invitation_type=invitation.invitation_type,
        organization_id=invitation.organization_id,
        organization_name=invitation.organization.name if invitation.organization else None,
        project_id=invitation.project_id,
        project_name=invitation.project.name if invitation.project else None,
        email=invitation.email,
        role=invitation.role,
        status=invitation.status,
        personal_message=invitation.personal_message,
        invited_by_id=invitation.invited_by_id,
        invited_by_name=invitation.invited_by.display_name if invitation.invited_by else None,
        expires_at=invitation.expires_at,
        created_at=invitation.created_at,
    )


@router.get("/invitations", response_model=list[InvitationResponse])
async def get_invitations(
    organization_id: UUID | None = None,
    email: str | None = None,
    invitation_status: str | None = Query(None, alias="status", pattern="^(pending|accepted|declined|expired|revoked)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get invitations with optional filters.

    Users can see:
    - Invitations they created (invited_by_id)
    - Invitations sent to their email
    - Invitations for projects they have admin access to
    """
    query = select(Invitation)

    # Filter to invitations the user can see:
    # 1. They created the invitation
    # 2. The invitation is for their email
    # (For org/project admin access, we'd need additional checks)
    query = query.where(
        or_(
            Invitation.invited_by_id == current_user.id,
            Invitation.email == current_user.email
        )
    )

    if organization_id:
        query = query.where(Invitation.organization_id == organization_id)

    if email:
        query = query.where(Invitation.email == email)

    if invitation_status:
        query = query.where(Invitation.status == invitation_status)

    query = (
        query
        .options(
            selectinload(Invitation.organization),
            selectinload(Invitation.project),
            selectinload(Invitation.invited_by),
        )
        .order_by(Invitation.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    invitations = result.scalars().all()

    return [
        InvitationResponse(
            id=inv.id,
            invitation_type=inv.invitation_type,
            organization_id=inv.organization_id,
            organization_name=inv.organization.name if inv.organization else None,
            project_id=inv.project_id,
            project_name=inv.project.name if inv.project else None,
            email=inv.email,
            role=inv.role,
            status=inv.status,
            personal_message=inv.personal_message,
            invited_by_id=inv.invited_by_id,
            invited_by_name=inv.invited_by.display_name if inv.invited_by else None,
            expires_at=inv.expires_at,
            created_at=inv.created_at,
        )
        for inv in invitations
    ]


@router.post("/invitations/{token}/accept")
async def accept_invitation(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept an invitation."""
    result = await db.execute(
        select(Invitation).where(Invitation.token == token)
    )
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.status != "pending":
        raise HTTPException(status_code=400, detail="Invitation is no longer pending")

    if invitation.expires_at < datetime.utcnow():
        invitation.status = "expired"
        await db.commit()
        raise HTTPException(status_code=400, detail="Invitation has expired")

    # Mark as accepted
    invitation.status = "accepted"
    invitation.responded_at = datetime.utcnow()

    # TODO: Add user to organization/project based on invitation type

    await db.commit()

    # Notify the inviter that their invitation was accepted
    if invitation.invited_by_id and invitation.organization_id:
        # Refresh to get relationships
        await db.refresh(invitation, ["organization", "project"])
        target_name = invitation.project.name if invitation.project else (invitation.organization.name if invitation.organization else "organization")

        notification_service = NotificationService(db)
        await notification_service.notify(
            user_id=invitation.invited_by_id,
            notification_type="invitation_accepted",
            title=f"Invitation accepted: {current_user.display_name}",
            message=f"{current_user.display_name} accepted your invitation to '{target_name}'",
            organization_id=invitation.organization_id,
            target_type="user",
            target_id=current_user.id,
            sender_id=current_user.id,
        )

    return {"message": "Invitation accepted"}


@router.post("/invitations/{token}/decline")
async def decline_invitation(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Decline an invitation."""
    result = await db.execute(
        select(Invitation).where(Invitation.token == token)
    )
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.status != "pending":
        raise HTTPException(status_code=400, detail="Invitation is no longer pending")

    invitation.status = "declined"
    invitation.responded_at = datetime.utcnow()

    await db.commit()

    return {"message": "Invitation declined"}


@router.delete("/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invitation(
    invitation_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a pending invitation."""
    result = await db.execute(
        select(Invitation).where(Invitation.id == invitation_id)
    )
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    # User can revoke if they created the invitation
    # OR if they have admin access to the project (for project invitations)
    if invitation.invited_by_id != current_user.id:
        if invitation.invitation_type == "project" and invitation.project_id:
            await check_project_access(db, invitation.project_id, current_user.id, "admin")
        else:
            # For org invitations, would need org admin check
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to revoke this invitation"
            )

    if invitation.status != "pending":
        raise HTTPException(status_code=400, detail="Can only revoke pending invitations")

    invitation.status = "revoked"
    await db.commit()


# --- Comment Endpoints ---

@router.post("/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    comment_data: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a comment on a resource."""
    # Verify user has access to the resource (member access to comment)
    await verify_resource_access(
        db, comment_data.resource_type, comment_data.resource_id, current_user.id, "member"
    )

    # Determine thread_id
    thread_id = None
    if comment_data.parent_id:
        result = await db.execute(
            select(Comment).where(Comment.id == comment_data.parent_id)
        )
        parent = result.scalar_one_or_none()
        if parent:
            thread_id = parent.thread_id or parent.id

    # TODO: Parse mentions and generate content_html

    comment = Comment(
        content=comment_data.content,
        resource_type=comment_data.resource_type,
        resource_id=comment_data.resource_id,
        parent_id=comment_data.parent_id,
        thread_id=thread_id,
        author_id=current_user.id,
        organization_id=comment_data.organization_id,
    )

    db.add(comment)
    await db.commit()
    await db.refresh(comment, ["author"])

    return CommentResponse(
        id=comment.id,
        content=comment.content,
        content_html=comment.content_html,
        resource_type=comment.resource_type,
        resource_id=comment.resource_id,
        parent_id=comment.parent_id,
        thread_id=comment.thread_id,
        author_id=comment.author_id,
        author_name=comment.author.display_name if comment.author else None,
        author_avatar=comment.author.avatar_url if comment.author else None,
        organization_id=comment.organization_id,
        mentioned_user_ids=comment.mentioned_user_ids,
        is_edited=comment.is_edited,
        edited_at=comment.edited_at,
        is_deleted=comment.is_deleted,
        is_resolved=comment.is_resolved,
        resolved_by_id=comment.resolved_by_id,
        resolved_at=comment.resolved_at,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.get("/comments", response_model=list[CommentResponse])
async def get_comments(
    resource_type: str,
    resource_id: UUID,
    include_replies: bool = True,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get comments for a resource."""
    # Verify user has access to the resource (viewer access to see comments)
    await verify_resource_access(
        db, resource_type, resource_id, current_user.id, "viewer"
    )

    query = (
        select(Comment)
        .where(
            Comment.resource_type == resource_type,
            Comment.resource_id == resource_id,
            Comment.is_deleted == False,
        )
    )

    if not include_replies:
        query = query.where(Comment.parent_id == None)

    query = (
        query
        .options(selectinload(Comment.author))
        .order_by(Comment.created_at)
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(query)
    comments = result.scalars().all()

    # Count replies for each top-level comment
    comment_responses = []
    for comment in comments:
        reply_count = 0
        if comment.parent_id is None:
            count_result = await db.execute(
                select(func.count())
                .where(
                    Comment.thread_id == comment.id,
                    Comment.is_deleted == False,
                )
            )
            reply_count = count_result.scalar() or 0

        comment_responses.append(
            CommentResponse(
                id=comment.id,
                content=comment.content,
                content_html=comment.content_html,
                resource_type=comment.resource_type,
                resource_id=comment.resource_id,
                parent_id=comment.parent_id,
                thread_id=comment.thread_id,
                author_id=comment.author_id,
                author_name=comment.author.display_name if comment.author else None,
                author_avatar=comment.author.avatar_url if comment.author else None,
                organization_id=comment.organization_id,
                mentioned_user_ids=comment.mentioned_user_ids,
                is_edited=comment.is_edited,
                edited_at=comment.edited_at,
                is_deleted=comment.is_deleted,
                is_resolved=comment.is_resolved,
                resolved_by_id=comment.resolved_by_id,
                resolved_at=comment.resolved_at,
                reply_count=reply_count,
                created_at=comment.created_at,
                updated_at=comment.updated_at,
            )
        )

    return comment_responses


@router.patch("/comments/{comment_id}", response_model=CommentResponse)
async def update_comment(
    comment_id: UUID,
    updates: CommentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a comment."""
    result = await db.execute(
        select(Comment)
        .where(Comment.id == comment_id)
        .options(selectinload(Comment.author))
    )
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Only the author can update their comment
    if comment.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own comments"
        )

    comment.content = updates.content
    comment.is_edited = True
    comment.edited_at = datetime.utcnow()

    await db.commit()
    await db.refresh(comment)

    return CommentResponse(
        id=comment.id,
        content=comment.content,
        content_html=comment.content_html,
        resource_type=comment.resource_type,
        resource_id=comment.resource_id,
        parent_id=comment.parent_id,
        thread_id=comment.thread_id,
        author_id=comment.author_id,
        author_name=comment.author.display_name if comment.author else None,
        author_avatar=comment.author.avatar_url if comment.author else None,
        organization_id=comment.organization_id,
        mentioned_user_ids=comment.mentioned_user_ids,
        is_edited=comment.is_edited,
        edited_at=comment.edited_at,
        is_deleted=comment.is_deleted,
        is_resolved=comment.is_resolved,
        resolved_by_id=comment.resolved_by_id,
        resolved_at=comment.resolved_at,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete a comment."""
    result = await db.execute(
        select(Comment).where(Comment.id == comment_id)
    )
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # User can delete if they are the author OR have admin access to the resource
    if comment.author_id != current_user.id:
        await verify_resource_access(
            db, comment.resource_type, comment.resource_id, current_user.id, "admin"
        )

    comment.is_deleted = True
    comment.deleted_at = datetime.utcnow()
    comment.content = "[deleted]"

    await db.commit()


@router.post("/comments/{comment_id}/resolve")
async def resolve_comment(
    comment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a comment as resolved."""
    result = await db.execute(
        select(Comment).where(Comment.id == comment_id)
    )
    comment = result.scalar_one_or_none()

    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Verify user has member access to the resource to resolve comments
    await verify_resource_access(
        db, comment.resource_type, comment.resource_id, current_user.id, "member"
    )

    comment.is_resolved = True
    comment.resolved_by_id = current_user.id
    comment.resolved_at = datetime.utcnow()

    await db.commit()

    return {"message": "Comment resolved"}


# --- Reaction Endpoints ---

@router.post("/reactions", response_model=ReactionResponse, status_code=status.HTTP_201_CREATED)
async def add_reaction(
    reaction_data: ReactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a reaction to a resource."""
    # Verify user has access to the resource (viewer access to react)
    await verify_resource_access(
        db, reaction_data.resource_type, reaction_data.resource_id, current_user.id, "viewer"
    )

    # Check for existing reaction
    result = await db.execute(
        select(Reaction).where(
            Reaction.resource_type == reaction_data.resource_type,
            Reaction.resource_id == reaction_data.resource_id,
            Reaction.user_id == current_user.id,
            Reaction.emoji == reaction_data.emoji,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Reaction already exists")

    reaction = Reaction(
        resource_type=reaction_data.resource_type,
        resource_id=reaction_data.resource_id,
        emoji=reaction_data.emoji,
        user_id=current_user.id,
    )

    db.add(reaction)
    await db.commit()
    await db.refresh(reaction, ["user"])

    return ReactionResponse(
        id=reaction.id,
        resource_type=reaction.resource_type,
        resource_id=reaction.resource_id,
        emoji=reaction.emoji,
        user_id=reaction.user_id,
        user_name=reaction.user.display_name if reaction.user else None,
        created_at=reaction.created_at,
    )


@router.get("/reactions", response_model=list[ReactionSummary])
async def get_reactions(
    resource_type: str,
    resource_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get reaction summary for a resource."""
    # Verify user has access to the resource (viewer access to see reactions)
    await verify_resource_access(
        db, resource_type, resource_id, current_user.id, "viewer"
    )

    result = await db.execute(
        select(Reaction)
        .where(
            Reaction.resource_type == resource_type,
            Reaction.resource_id == resource_id,
        )
        .options(selectinload(Reaction.user))
    )
    reactions = result.scalars().all()

    # Group by emoji
    emoji_groups: dict[str, list[str]] = {}
    for reaction in reactions:
        if reaction.emoji not in emoji_groups:
            emoji_groups[reaction.emoji] = []
        if reaction.user:
            emoji_groups[reaction.emoji].append(reaction.user.display_name or reaction.user.email)

    return [
        ReactionSummary(
            emoji=emoji,
            count=len(users),
            users=users[:5],  # Limit to first 5 users
        )
        for emoji, users in emoji_groups.items()
    ]


@router.delete("/reactions/{reaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_reaction(
    reaction_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a reaction."""
    result = await db.execute(
        select(Reaction).where(
            Reaction.id == reaction_id,
            Reaction.user_id == current_user.id,
        )
    )
    reaction = result.scalar_one_or_none()

    if not reaction:
        raise HTTPException(status_code=404, detail="Reaction not found")

    await db.delete(reaction)
    await db.commit()
