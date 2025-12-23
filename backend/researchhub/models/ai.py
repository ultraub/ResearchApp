"""AI conversation, template, and usage tracking models."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from researchhub.db.base import BaseModel

if TYPE_CHECKING:
    from researchhub.models.organization import Organization
    from researchhub.models.user import User


class AIConversation(BaseModel):
    """AI conversation session for multi-turn interactions.

    Tracks conversations with AI features like Document Assistant chat,
    Knowledge Assistant queries, and other conversational AI features.
    """

    __tablename__ = "ai_conversations"

    # Organization and user
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Feature and context
    feature_name: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True
    )  # document_assistant, knowledge_assistant, etc.

    # Context for the conversation (e.g., which document or paper)
    context_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # document, paper, project, etc.
    context_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True, index=True
    )

    # Conversation metadata
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Token usage tracking for the conversation
    total_input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Model used (may vary across messages)
    primary_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Additional data
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization")
    user: Mapped["User"] = relationship("User")
    messages: Mapped[list["AIConversationMessage"]] = relationship(
        "AIConversationMessage",
        back_populates="conversation",
        lazy="selectin",
        order_by="AIConversationMessage.created_at",
    )

    def __repr__(self) -> str:
        return f"<AIConversation {self.id} feature={self.feature_name}>"


class AIConversationMessage(BaseModel):
    """Individual message in an AI conversation.

    Stores both user messages and AI responses with token counts
    for usage tracking.
    """

    __tablename__ = "ai_conversation_messages"

    conversation_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Message content
    role: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # user, assistant, system
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Token counts for this message
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Model used for this response (for assistant messages)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Response latency in milliseconds (for assistant messages)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # PHI detection results (if any PHI was detected)
    phi_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    phi_types: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Additional data
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    conversation: Mapped["AIConversation"] = relationship(
        "AIConversation", back_populates="messages"
    )

    def __repr__(self) -> str:
        return f"<AIConversationMessage {self.id} role={self.role}>"


class AIPromptTemplate(BaseModel):
    """Custom prompt templates for organizations.

    Allows organizations to customize AI prompts beyond the system defaults.
    """

    __tablename__ = "ai_prompt_templates"

    # Organization that owns this template (null = system template)
    organization_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Template identification
    template_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # writing, analysis, review, search, task
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Prompt content
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_prompt_template: Mapped[str] = mapped_column(Text, nullable=False)

    # Model parameters
    temperature: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    max_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=2000)

    # Template metadata
    required_variables: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )  # Variables that must be provided
    optional_variables: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )  # Variables that can be provided

    # Status
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Version tracking
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Created by
    created_by_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Usage tracking
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    organization: Mapped["Organization | None"] = relationship("Organization")
    created_by: Mapped["User | None"] = relationship("User")

    def __repr__(self) -> str:
        try:
            return f"<AIPromptTemplate {self.template_key}>"
        except Exception:
            try:
                return f"<AIPromptTemplate id={self.id}>"
            except Exception:
                return "<AIPromptTemplate detached>"


class AIUsageLog(BaseModel):
    """Detailed log of AI usage for analytics and billing.

    Tracks individual AI requests with full context for
    usage analysis, cost tracking, and audit purposes.
    """

    __tablename__ = "ai_usage_logs"

    # Organization and user
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Request context
    feature_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    template_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    conversation_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("ai_conversations.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Provider and model
    provider: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # anthropic, azure_openai
    model: Mapped[str] = mapped_column(String(100), nullable=False)

    # Token usage
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False)

    # Cost calculation (in smallest currency unit, e.g., cents)
    estimated_cost_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Performance
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Request details
    request_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="completion"
    )  # completion, stream
    was_cached: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # PHI detection
    phi_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    phi_policy_applied: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # block, warn, redact

    # Error tracking
    was_successful: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Context reference (what entity was this used on)
    context_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    context_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)

    # Additional data
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization")
    user: Mapped["User | None"] = relationship("User")
    conversation: Mapped["AIConversation | None"] = relationship("AIConversation")

    def __repr__(self) -> str:
        return f"<AIUsageLog {self.id} feature={self.feature_name} tokens={self.total_tokens}>"


class AIOrganizationSettings(BaseModel):
    """AI-specific settings for an organization.

    Stores organization-level AI configuration including enabled features,
    PHI handling policies, and provider preferences.
    """

    __tablename__ = "ai_organization_settings"

    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # Feature flags - which AI features are enabled
    features_enabled: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: {
            "document_assistant": True,
            "knowledge_summarization": True,
            "review_helper": True,
            "search_copilot": True,
            "task_generation": True,
        },
    )

    # PHI handling policy
    phi_policy: Mapped[str] = mapped_column(
        String(20), nullable=False, default="warn"
    )  # block, warn, redact

    # Provider preference
    preferred_provider: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # anthropic, azure_openai

    # Usage limits
    monthly_token_limit: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # null = unlimited
    current_month_usage: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    usage_reset_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Rate limiting
    requests_per_minute_limit: Mapped[int] = mapped_column(
        Integer, nullable=False, default=60
    )
    requests_per_day_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Custom model settings
    custom_settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization")

    def __repr__(self) -> str:
        return f"<AIOrganizationSettings org={self.organization_id}>"
