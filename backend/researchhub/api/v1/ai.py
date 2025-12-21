"""AI endpoints for document assistance, knowledge summarization, and more."""

from datetime import datetime, timezone
from typing import AsyncIterator
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.api.v1.auth import CurrentUser
from researchhub.db.session import get_db_session
from researchhub.models.user import User
from researchhub.models.organization import OrganizationMember
from researchhub.models.document import Document
from researchhub.models.knowledge import Paper
from researchhub.models.ai import (
    AIConversation,
    AIConversationMessage,
    AIPromptTemplate,
    AIUsageLog,
    AIOrganizationSettings,
)
from researchhub.ai.service import get_ai_service
from researchhub.ai.schemas import (
    AIFeatureName,
    DocumentAction,
    SummaryType,
    AIGenerateRequest,
    AIGenerateResponse,
    AIDocumentActionRequest,
    AIDocumentActionResponse,
    AIConversationCreate,
    AIConversationMessageCreate,
    AIConversationResponse,
    AIConversationMessageResponse,
    AIConversationListResponse,
    AIPromptTemplateResponse,
)
from researchhub.ai.templates import list_templates
from researchhub.ai.exceptions import (
    AIError,
    AIFeatureDisabledError,
    AITemplateNotFoundError,
    AIPHIDetectedError,
)

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


def handle_ai_error(error: AIError) -> HTTPException:
    """Convert AI errors to HTTP exceptions."""
    if isinstance(error, AIFeatureDisabledError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=error.message,
        )
    elif isinstance(error, AITemplateNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error.message,
        )
    elif isinstance(error, AIPHIDetectedError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=error.message,
        )
    else:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error.message,
        )


# =============================================================================
# Generate Endpoints
# =============================================================================


class GenerateResponse(BaseModel):
    """Response from AI generation."""

    content: str
    model: str
    input_tokens: int
    output_tokens: int
    phi_detected: bool = False
    phi_warnings: list[str] = Field(default_factory=list)


@router.post("/generate", response_model=GenerateResponse)
async def generate(
    request: AIGenerateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> GenerateResponse:
    """Generate AI content using a template.

    This is the primary endpoint for single-shot AI generation.
    Supports all AI features through the template system.
    """
    org_id = await get_user_organization_id(current_user, db)
    ai_service = get_ai_service()

    try:
        # Determine feature from template category
        template = ai_service._get_template(request.template_key, org_id)
        category = template.get("category", "writing")
        feature_map = {
            "writing": AIFeatureName.DOCUMENT_ASSISTANT,
            "analysis": AIFeatureName.KNOWLEDGE_SUMMARIZATION,
            "review": AIFeatureName.REVIEW_HELPER,
            "search": AIFeatureName.SEARCH_COPILOT,
            "task": AIFeatureName.TASK_GENERATION,
        }
        feature_name = feature_map.get(category, AIFeatureName.DOCUMENT_ASSISTANT)

        response = await ai_service.generate(
            user_id=current_user.id,
            organization_id=org_id,
            feature_name=feature_name,
            template_key=request.template_key,
            variables=request.variables,
        )

        return GenerateResponse(
            content=response.content,
            model=response.model,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
        )

    except AIError as e:
        raise handle_ai_error(e)
    except Exception as e:
        logger.error("AI generation failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI generation failed",
        )


@router.post("/generate/stream")
async def generate_stream(
    request: AIGenerateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> StreamingResponse:
    """Generate AI content with streaming response.

    Returns a Server-Sent Events stream of content chunks.
    """
    org_id = await get_user_organization_id(current_user, db)
    ai_service = get_ai_service()

    try:
        # Determine feature from template category
        template = ai_service._get_template(request.template_key, org_id)
        category = template.get("category", "writing")
        feature_map = {
            "writing": AIFeatureName.DOCUMENT_ASSISTANT,
            "analysis": AIFeatureName.KNOWLEDGE_SUMMARIZATION,
            "review": AIFeatureName.REVIEW_HELPER,
            "search": AIFeatureName.SEARCH_COPILOT,
            "task": AIFeatureName.TASK_GENERATION,
        }
        feature_name = feature_map.get(category, AIFeatureName.DOCUMENT_ASSISTANT)

        async def event_generator() -> AsyncIterator[str]:
            try:
                async for chunk in ai_service.generate_stream(
                    user_id=current_user.id,
                    organization_id=org_id,
                    feature_name=feature_name,
                    template_key=request.template_key,
                    variables=request.variables,
                ):
                    yield f"data: {chunk}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                logger.error("Streaming error", error=str(e))
                yield f"data: [ERROR] {str(e)}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )

    except AIError as e:
        raise handle_ai_error(e)


# =============================================================================
# Document Assistant Endpoints
# =============================================================================


@router.post("/document/action", response_model=AIDocumentActionResponse)
async def document_action(
    request: AIDocumentActionRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> AIDocumentActionResponse:
    """Perform a quick action on document content.

    Actions include: expand, simplify, continue, structure, formalize.
    """
    org_id = await get_user_organization_id(current_user, db)

    # Verify document access
    result = await db.execute(
        select(Document).where(Document.id == request.document_id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    ai_service = get_ai_service()

    try:
        response = await ai_service.document_action(
            user_id=current_user.id,
            organization_id=org_id,
            action=request.action,
            document_id=request.document_id,
            selected_text=request.selected_text,
            document_type=request.document_type or document.document_type,
            surrounding_context=request.surrounding_context,
            instructions=request.instructions,
        )

        return AIDocumentActionResponse(
            content=response.content,
            action=request.action,
            model=response.model,
            tokens_used=response.input_tokens + response.output_tokens,
        )

    except AIError as e:
        raise handle_ai_error(e)


@router.post("/document/{document_id}/chat")
async def document_chat(
    document_id: UUID,
    message: str = Query(..., min_length=1, max_length=10000),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db_session),
) -> GenerateResponse:
    """Chat about a specific document.

    Send questions or requests related to the document content.
    """
    org_id = await get_user_organization_id(current_user, db)

    # Get document with content
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    ai_service = get_ai_service()

    try:
        response = await ai_service.generate(
            user_id=current_user.id,
            organization_id=org_id,
            feature_name=AIFeatureName.DOCUMENT_ASSISTANT,
            template_key="document_chat",
            variables={
                "document_type": document.document_type,
                "document_content": document.content_text or str(document.content),
                "user_message": message,
            },
        )

        return GenerateResponse(
            content=response.content,
            model=response.model,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
        )

    except AIError as e:
        raise handle_ai_error(e)


# =============================================================================
# Knowledge Assistant Endpoints
# =============================================================================


class PaperSummarizeRequest(BaseModel):
    """Request to summarize a paper."""

    paper_id: UUID
    summary_type: SummaryType = SummaryType.GENERAL


class PaperSummaryResponse(BaseModel):
    """Response with paper summary."""

    paper_id: UUID
    summary_type: SummaryType
    summary: str
    model: str
    tokens_used: int


@router.post("/knowledge/summarize", response_model=PaperSummaryResponse)
async def summarize_paper(
    request: PaperSummarizeRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> PaperSummaryResponse:
    """Summarize an academic paper.

    Generates a summary based on the paper's title, abstract, and any
    available full text.
    """
    org_id = await get_user_organization_id(current_user, db)

    # Get paper
    result = await db.execute(
        select(Paper).where(Paper.id == request.paper_id)
    )
    paper = result.scalar_one_or_none()
    if not paper:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paper not found",
        )

    ai_service = get_ai_service()

    try:
        response = await ai_service.summarize_paper(
            user_id=current_user.id,
            organization_id=org_id,
            paper_id=paper.id,
            title=paper.title,
            abstract=paper.abstract or "",
            summary_type=request.summary_type,
            authors=", ".join(paper.authors) if paper.authors else None,
            journal=paper.journal,
            year=paper.publication_year,
        )

        return PaperSummaryResponse(
            paper_id=paper.id,
            summary_type=request.summary_type,
            summary=response.content,
            model=response.model,
            tokens_used=response.input_tokens + response.output_tokens,
        )

    except AIError as e:
        raise handle_ai_error(e)


# =============================================================================
# Conversation Endpoints
# =============================================================================


class ConversationResponse(BaseModel):
    """Conversation response model."""

    id: UUID
    feature_name: str
    context_type: str | None
    context_id: UUID | None
    title: str | None
    is_active: bool
    total_input_tokens: int
    total_output_tokens: int
    message_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversationDetailResponse(ConversationResponse):
    """Conversation with messages."""

    messages: list[AIConversationMessageResponse]


class ConversationListResponse(BaseModel):
    """Paginated conversation list."""

    items: list[ConversationResponse]
    total: int
    page: int
    page_size: int


@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    feature_name: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> ConversationListResponse:
    """List user's AI conversations."""
    org_id = await get_user_organization_id(current_user, db)

    # Build query
    query = select(AIConversation).where(
        and_(
            AIConversation.user_id == current_user.id,
            AIConversation.organization_id == org_id,
        )
    )

    if feature_name:
        query = query.where(AIConversation.feature_name == feature_name)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Get paginated results
    query = query.order_by(AIConversation.updated_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    conversations = result.scalars().all()

    items = []
    for conv in conversations:
        # Count messages
        msg_count = await db.scalar(
            select(func.count())
            .where(AIConversationMessage.conversation_id == conv.id)
        ) or 0

        items.append(
            ConversationResponse(
                id=conv.id,
                feature_name=conv.feature_name,
                context_type=conv.context_type,
                context_id=conv.context_id,
                title=conv.title,
                is_active=conv.is_active,
                total_input_tokens=conv.total_input_tokens,
                total_output_tokens=conv.total_output_tokens,
                message_count=msg_count,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
            )
        )

    return ConversationListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/conversations", response_model=ConversationDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    request: AIConversationCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ConversationDetailResponse:
    """Create a new AI conversation."""
    org_id = await get_user_organization_id(current_user, db)

    conversation = AIConversation(
        organization_id=org_id,
        user_id=current_user.id,
        feature_name=request.feature_name.value,
        context_type=request.context_type,
        context_id=request.context_id,
    )
    db.add(conversation)

    messages = []

    # Add initial message if provided
    if request.initial_message:
        user_message = AIConversationMessage(
            conversation_id=conversation.id,
            role="user",
            content=request.initial_message,
        )
        db.add(user_message)
        await db.flush()

        # Generate AI response
        ai_service = get_ai_service()
        try:
            response = await ai_service.generate(
                user_id=current_user.id,
                organization_id=org_id,
                feature_name=request.feature_name,
                template_key="document_chat",  # Default chat template
                variables={"user_message": request.initial_message},
            )

            assistant_message = AIConversationMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=response.content,
                model=response.model,
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
                latency_ms=response.latency_ms,
            )
            db.add(assistant_message)

            # Update conversation token counts
            conversation.total_input_tokens = response.input_tokens
            conversation.total_output_tokens = response.output_tokens
            conversation.primary_model = response.model

            messages = [
                AIConversationMessageResponse(
                    id=user_message.id,
                    role="user",
                    content=user_message.content,
                    created_at=user_message.created_at,
                ),
                AIConversationMessageResponse(
                    id=assistant_message.id,
                    role="assistant",
                    content=assistant_message.content,
                    created_at=assistant_message.created_at,
                ),
            ]

        except AIError as e:
            raise handle_ai_error(e)

    await db.commit()
    await db.refresh(conversation)

    return ConversationDetailResponse(
        id=conversation.id,
        feature_name=conversation.feature_name,
        context_type=conversation.context_type,
        context_id=conversation.context_id,
        title=conversation.title,
        is_active=conversation.is_active,
        total_input_tokens=conversation.total_input_tokens,
        total_output_tokens=conversation.total_output_tokens,
        message_count=len(messages),
        messages=messages,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    conversation_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> ConversationDetailResponse:
    """Get a conversation with all messages."""
    result = await db.execute(
        select(AIConversation)
        .options(selectinload(AIConversation.messages))
        .where(
            and_(
                AIConversation.id == conversation_id,
                AIConversation.user_id == current_user.id,
            )
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    messages = [
        AIConversationMessageResponse(
            id=msg.id,
            role=msg.role,
            content=msg.content,
            created_at=msg.created_at,
        )
        for msg in conversation.messages
    ]

    return ConversationDetailResponse(
        id=conversation.id,
        feature_name=conversation.feature_name,
        context_type=conversation.context_type,
        context_id=conversation.context_id,
        title=conversation.title,
        is_active=conversation.is_active,
        total_input_tokens=conversation.total_input_tokens,
        total_output_tokens=conversation.total_output_tokens,
        message_count=len(messages),
        messages=messages,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


@router.post("/conversations/{conversation_id}/messages", response_model=AIConversationMessageResponse)
async def add_message(
    conversation_id: UUID,
    request: AIConversationMessageCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> AIConversationMessageResponse:
    """Add a message to a conversation and get AI response."""
    org_id = await get_user_organization_id(current_user, db)

    # Get conversation
    result = await db.execute(
        select(AIConversation)
        .options(selectinload(AIConversation.messages))
        .where(
            and_(
                AIConversation.id == conversation_id,
                AIConversation.user_id == current_user.id,
            )
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    # Add user message
    user_message = AIConversationMessage(
        conversation_id=conversation.id,
        role="user",
        content=request.content,
    )
    db.add(user_message)
    await db.flush()

    # Build context from previous messages
    conversation_history = "\n".join([
        f"{msg.role}: {msg.content}"
        for msg in conversation.messages[-10:]  # Last 10 messages for context
    ])

    # Generate AI response
    ai_service = get_ai_service()
    try:
        response = await ai_service.generate(
            user_id=current_user.id,
            organization_id=org_id,
            feature_name=AIFeatureName(conversation.feature_name),
            template_key="document_chat",
            variables={
                "user_message": request.content,
                "conversation_history": conversation_history,
            },
        )

        assistant_message = AIConversationMessage(
            conversation_id=conversation.id,
            role="assistant",
            content=response.content,
            model=response.model,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            latency_ms=response.latency_ms,
        )
        db.add(assistant_message)

        # Update conversation totals
        conversation.total_input_tokens += response.input_tokens
        conversation.total_output_tokens += response.output_tokens

        await db.commit()
        await db.refresh(assistant_message)

        return AIConversationMessageResponse(
            id=assistant_message.id,
            role="assistant",
            content=assistant_message.content,
            created_at=assistant_message.created_at,
        )

    except AIError as e:
        raise handle_ai_error(e)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a conversation."""
    result = await db.execute(
        select(AIConversation).where(
            and_(
                AIConversation.id == conversation_id,
                AIConversation.user_id == current_user.id,
            )
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    await db.delete(conversation)
    await db.commit()


# =============================================================================
# Template Endpoints
# =============================================================================


@router.get("/templates", response_model=list[AIPromptTemplateResponse])
async def list_available_templates(
    current_user: CurrentUser,
    category: str | None = None,
) -> list[AIPromptTemplateResponse]:
    """List available prompt templates.

    Returns both system default templates and organization custom templates.
    """
    templates = list_templates()

    if category:
        templates = [t for t in templates if t["category"] == category]

    return [
        AIPromptTemplateResponse(
            template_key=t["template_key"],
            display_name=t["display_name"],
            category=t["category"],
            description=t.get("description"),
            is_custom=False,
        )
        for t in templates
    ]


# =============================================================================
# Usage & Analytics Endpoints
# =============================================================================


class UsageSummary(BaseModel):
    """Usage summary for a period."""

    period_start: datetime
    period_end: datetime
    total_requests: int
    total_input_tokens: int
    total_output_tokens: int
    total_tokens: int
    estimated_cost_cents: int
    by_feature: dict[str, int]


@router.get("/usage/summary", response_model=UsageSummary)
async def get_usage_summary(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
    days: int = Query(30, ge=1, le=365),
) -> UsageSummary:
    """Get AI usage summary for the current organization."""
    org_id = await get_user_organization_id(current_user, db)

    # Calculate date range
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days)

    # Query usage logs
    result = await db.execute(
        select(
            func.count(AIUsageLog.id).label("total_requests"),
            func.sum(AIUsageLog.input_tokens).label("total_input"),
            func.sum(AIUsageLog.output_tokens).label("total_output"),
            func.sum(AIUsageLog.total_tokens).label("total_tokens"),
            func.sum(AIUsageLog.estimated_cost_cents).label("total_cost"),
        )
        .where(
            and_(
                AIUsageLog.organization_id == org_id,
                AIUsageLog.created_at >= start_date,
                AIUsageLog.created_at <= end_date,
            )
        )
    )
    row = result.one()

    # Get breakdown by feature
    feature_result = await db.execute(
        select(
            AIUsageLog.feature_name,
            func.sum(AIUsageLog.total_tokens).label("tokens"),
        )
        .where(
            and_(
                AIUsageLog.organization_id == org_id,
                AIUsageLog.created_at >= start_date,
                AIUsageLog.created_at <= end_date,
            )
        )
        .group_by(AIUsageLog.feature_name)
    )
    by_feature = {r.feature_name: r.tokens or 0 for r in feature_result}

    return UsageSummary(
        period_start=start_date,
        period_end=end_date,
        total_requests=row.total_requests or 0,
        total_input_tokens=row.total_input or 0,
        total_output_tokens=row.total_output or 0,
        total_tokens=row.total_tokens or 0,
        estimated_cost_cents=row.total_cost or 0,
        by_feature=by_feature,
    )


# Import timedelta for usage summary
from datetime import timedelta

from researchhub.models.review import AutoReviewConfig


# =============================================================================
# Auto-Review Configuration Endpoints
# =============================================================================


class AutoReviewConfigResponse(BaseModel):
    """Response model for auto-review configuration."""

    organization_id: UUID
    on_document_create: bool
    on_document_update: bool
    on_task_submit_review: bool
    default_focus_areas: list[str]
    min_document_length: int
    review_cooldown_hours: int
    max_suggestions_per_review: int
    auto_create_review: bool
    updated_at: datetime

    class Config:
        from_attributes = True


class AutoReviewConfigUpdate(BaseModel):
    """Request model to update auto-review configuration."""

    on_document_create: bool | None = None
    on_document_update: bool | None = None
    on_task_submit_review: bool | None = None
    default_focus_areas: list[str] | None = None
    min_document_length: int | None = Field(None, ge=0, le=100000)
    review_cooldown_hours: int | None = Field(None, ge=0, le=168)  # Max 1 week
    max_suggestions_per_review: int | None = Field(None, ge=1, le=50)
    auto_create_review: bool | None = None


@router.get("/auto-review/config", response_model=AutoReviewConfigResponse)
async def get_auto_review_config(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> AutoReviewConfigResponse:
    """Get the organization's auto-review configuration.

    Returns the current auto-review settings for the user's organization.
    If no configuration exists, creates one with default settings.
    """
    org_id = await get_user_organization_id(current_user, db)

    # Get existing config or create default
    result = await db.execute(
        select(AutoReviewConfig).where(AutoReviewConfig.organization_id == org_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        # Create default config
        config = AutoReviewConfig(
            organization_id=org_id,
            on_document_create=False,
            on_document_update=False,
            on_task_submit_review=True,
            default_focus_areas=[],
            min_document_length=100,
            review_cooldown_hours=24,
            max_suggestions_per_review=10,
            auto_create_review=True,
            updated_by_id=current_user.id,
        )
        db.add(config)
        await db.commit()
        await db.refresh(config)

    return AutoReviewConfigResponse(
        organization_id=config.organization_id,
        on_document_create=config.on_document_create,
        on_document_update=config.on_document_update,
        on_task_submit_review=config.on_task_submit_review,
        default_focus_areas=config.default_focus_areas or [],
        min_document_length=config.min_document_length,
        review_cooldown_hours=config.review_cooldown_hours,
        max_suggestions_per_review=config.max_suggestions_per_review,
        auto_create_review=config.auto_create_review,
        updated_at=config.updated_at,
    )


@router.put("/auto-review/config", response_model=AutoReviewConfigResponse)
async def update_auto_review_config(
    request: AutoReviewConfigUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db_session),
) -> AutoReviewConfigResponse:
    """Update the organization's auto-review configuration.

    Only provided fields will be updated. Requires organization admin permissions.
    """
    org_id = await get_user_organization_id(current_user, db)

    # Check if user is org admin
    result = await db.execute(
        select(OrganizationMember).where(
            and_(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.user_id == current_user.id,
            )
        )
    )
    member = result.scalar_one_or_none()
    if not member or member.role not in ["owner", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only organization admins can update auto-review settings",
        )

    # Get existing config or create one
    result = await db.execute(
        select(AutoReviewConfig).where(AutoReviewConfig.organization_id == org_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        config = AutoReviewConfig(
            organization_id=org_id,
            updated_by_id=current_user.id,
        )
        db.add(config)
        await db.flush()

    # Update only provided fields
    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(config, field, value)

    config.updated_by_id = current_user.id
    config.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(config)

    logger.info(
        "Auto-review config updated",
        organization_id=str(org_id),
        user_id=str(current_user.id),
        changes=list(update_data.keys()),
    )

    return AutoReviewConfigResponse(
        organization_id=config.organization_id,
        on_document_create=config.on_document_create,
        on_document_update=config.on_document_update,
        on_task_submit_review=config.on_task_submit_review,
        default_focus_areas=config.default_focus_areas or [],
        min_document_length=config.min_document_length,
        review_cooldown_hours=config.review_cooldown_hours,
        max_suggestions_per_review=config.max_suggestions_per_review,
        auto_create_review=config.auto_create_review,
        updated_at=config.updated_at,
    )
