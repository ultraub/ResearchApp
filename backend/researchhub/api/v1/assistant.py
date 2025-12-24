"""AI Assistant endpoints for context-aware chat with tool calling."""

import json
from typing import AsyncIterator, List, Optional
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db_session
from researchhub.models.user import User
from researchhub.models.organization import OrganizationMember
from researchhub.models.ai import AIPendingAction
from researchhub.ai.assistant.service import AssistantService
from researchhub.ai.assistant.schemas import (
    AssistantChatRequest,
    PageContext,
    ChatMessage,
)
from researchhub.ai.assistant.executors import approve_action, reject_action
from researchhub.ai.providers import get_provider

router = APIRouter()
logger = structlog.get_logger()


# =============================================================================
# Helper Functions
# =============================================================================


async def get_user_organization_id(
    user: User,
    db: AsyncSession,
) -> UUID:
    """Get the user's primary organization ID."""
    result = await db.execute(
        select(OrganizationMember.organization_id)
        .where(OrganizationMember.user_id == user.id)
        .limit(1)
    )
    org_id = result.scalar_one_or_none()
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of any organization",
        )
    return org_id


# =============================================================================
# Request/Response Models
# =============================================================================


class ChatMessageInput(BaseModel):
    """Input message for chat."""

    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class PageContextInput(BaseModel):
    """Page context input."""

    type: str
    id: Optional[str] = None
    project_id: Optional[str] = None
    name: Optional[str] = None


class AssistantChatInput(BaseModel):
    """Request body for assistant chat."""

    message: str = Field(..., min_length=1, max_length=10000)
    conversation_id: Optional[UUID] = None
    messages: List[ChatMessageInput] = Field(default_factory=list)
    page_context: Optional[PageContextInput] = None


class PendingActionResponse(BaseModel):
    """Response model for a pending action."""

    action_id: UUID
    tool_name: str
    entity_type: str
    entity_id: Optional[UUID] = None
    old_state: Optional[dict] = None
    new_state: dict
    status: str
    expires_at: str
    created_at: str


class ActionApprovalRequest(BaseModel):
    """Request to approve an action."""

    pass  # No additional fields needed for approval


class ActionRejectionRequest(BaseModel):
    """Request to reject an action."""

    reason: Optional[str] = Field(None, max_length=1000)


class ActionResponse(BaseModel):
    """Response from action approval/rejection."""

    success: bool
    message: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None


# =============================================================================
# Chat Endpoint
# =============================================================================


@router.post("/chat")
async def assistant_chat(
    request: AssistantChatInput,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> StreamingResponse:
    """Chat with the AI assistant.

    Returns a Server-Sent Events stream with:
    - text: AI response text chunks
    - tool_call: Tool being called
    - tool_result: Result from a query tool
    - action_preview: Preview of an action requiring approval
    - done: Chat completed
    - error: Error occurred
    """
    org_id = await get_user_organization_id(current_user, db)

    # Convert request to internal format
    page_context = None
    if request.page_context:
        page_context = PageContext(
            type=request.page_context.type,
            id=request.page_context.id,
            project_id=request.page_context.project_id,
            name=request.page_context.name,
        )

    messages = [
        ChatMessage(role=msg.role, content=msg.content)
        for msg in request.messages
    ]

    chat_request = AssistantChatRequest(
        message=request.message,
        conversation_id=request.conversation_id,
        messages=messages,
        page_context=page_context,
    )

    # Get provider
    provider = get_provider()

    # Create service
    service = AssistantService(
        provider=provider,
        db=db,
        user_id=current_user.id,
        org_id=org_id,
    )

    async def event_generator() -> AsyncIterator[str]:
        try:
            logger.info("Starting assistant chat stream")
            event_count = 0
            async for event in service.chat(chat_request):
                event_count += 1
                event_type = event.event.value if hasattr(event.event, 'value') else str(event.event)
                logger.info("Yielding event", event_type=event_type, event_count=event_count)
                event_data = json.dumps(event.data)
                yield f"event: {event_type}\ndata: {event_data}\n\n"
            logger.info("Chat stream completed", total_events=event_count)
        except Exception as e:
            logger.error("Assistant chat error", error=str(e), error_type=type(e).__name__)
            import traceback
            logger.error("Traceback", tb=traceback.format_exc())
            error_data = json.dumps({"message": str(e)})
            yield f"event: error\ndata: {error_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# =============================================================================
# Pending Actions Endpoints
# =============================================================================


@router.get("/actions/pending", response_model=List[PendingActionResponse])
async def list_pending_actions(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    conversation_id: Optional[UUID] = None,
) -> List[PendingActionResponse]:
    """List pending actions for the current user.

    Optionally filter by conversation ID.
    """
    org_id = await get_user_organization_id(current_user, db)

    provider = get_provider()
    service = AssistantService(
        provider=provider,
        db=db,
        user_id=current_user.id,
        org_id=org_id,
    )

    actions = await service.get_pending_actions(conversation_id)

    return [
        PendingActionResponse(
            action_id=UUID(a["action_id"]),
            tool_name=a["tool_name"],
            entity_type=a["entity_type"],
            entity_id=UUID(a["entity_id"]) if a["entity_id"] else None,
            old_state=a["old_state"],
            new_state=a["new_state"],
            status=a["status"],
            expires_at=a["expires_at"],
            created_at=a["created_at"],
        )
        for a in actions
    ]


@router.post("/actions/{action_id}/approve", response_model=ActionResponse)
async def approve_pending_action(
    action_id: UUID,
    request: ActionApprovalRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ActionResponse:
    """Approve and execute a pending action.

    The action will be executed immediately after approval.
    """
    org_id = await get_user_organization_id(current_user, db)

    result = await approve_action(
        db=db,
        action_id=action_id,
        user_id=current_user.id,
        org_id=org_id,
    )

    if not result.get("success", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "Failed to approve action"),
        )

    return ActionResponse(
        success=True,
        message=result.get("message", "Action executed successfully"),
        entity_type=result.get("entity_type"),
        entity_id=result.get("entity_id"),
    )


@router.post("/actions/{action_id}/reject", response_model=ActionResponse)
async def reject_pending_action(
    action_id: UUID,
    request: ActionRejectionRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ActionResponse:
    """Reject a pending action.

    The action will be marked as rejected and will not be executed.
    """
    result = await reject_action(
        db=db,
        action_id=action_id,
        user_id=current_user.id,
        reason=request.reason,
    )

    if not result.get("success", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error", "Failed to reject action"),
        )

    return ActionResponse(
        success=True,
        message=result.get("message", "Action rejected"),
    )


@router.get("/actions/{action_id}", response_model=PendingActionResponse)
async def get_pending_action(
    action_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> PendingActionResponse:
    """Get details of a specific pending action."""
    result = await db.execute(
        select(AIPendingAction).where(
            and_(
                AIPendingAction.id == action_id,
                AIPendingAction.user_id == current_user.id,
            )
        )
    )
    action = result.scalar_one_or_none()

    if not action:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Action not found",
        )

    return PendingActionResponse(
        action_id=action.id,
        tool_name=action.tool_name,
        entity_type=action.entity_type,
        entity_id=action.entity_id,
        old_state=action.old_state,
        new_state=action.new_state,
        status=action.status,
        expires_at=action.expires_at.isoformat(),
        created_at=action.created_at.isoformat(),
    )
