"""Pydantic schemas for AI module requests and responses."""

from datetime import datetime
from enum import Enum
from typing import Any, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# Enums
# =============================================================================


class AIFeatureName(str, Enum):
    """Available AI features."""
    DOCUMENT_ASSISTANT = "document_assistant"
    KNOWLEDGE_SUMMARIZATION = "knowledge_summarization"
    REVIEW_HELPER = "review_helper"
    SEARCH_COPILOT = "search_copilot"
    TASK_GENERATION = "task_generation"


class DocumentAction(str, Enum):
    """Quick actions for document assistant."""
    EXPAND = "expand"
    SIMPLIFY = "simplify"
    CONTINUE = "continue"
    STRUCTURE = "structure"
    FORMALIZE = "formalize"


class PHIPolicy(str, Enum):
    """How to handle detected PHI."""
    BLOCK = "block"
    WARN = "warn"
    REDACT = "redact"


class SummaryType(str, Enum):
    """Types of paper summaries."""
    GENERAL = "general"
    METHODS = "methods"
    FINDINGS = "findings"


# =============================================================================
# Base Schemas
# =============================================================================


class AIMessageSchema(BaseModel):
    """A message in an AI conversation."""
    role: Literal["system", "user", "assistant"]
    content: str


class PHIFindingSchema(BaseModel):
    """A detected PHI occurrence."""
    type: str
    start: int
    end: int
    text: str


class PHIDetectionResultSchema(BaseModel):
    """Result of PHI detection."""
    has_phi: bool
    findings: List[PHIFindingSchema] = Field(default_factory=list)
    policy_action: Optional[PHIPolicy] = None


# =============================================================================
# Generate Request/Response
# =============================================================================


class AIGenerateRequest(BaseModel):
    """Request to generate AI content using a template."""
    template_key: str = Field(..., description="Template identifier (e.g., 'document_expand')")
    variables: dict[str, Any] = Field(default_factory=dict, description="Template variables")
    context_type: Optional[str] = Field(None, description="Context type: 'document', 'project', etc.")
    context_id: Optional[UUID] = Field(None, description="ID of the context object")
    stream: bool = Field(False, description="Whether to stream the response")

    model_config = {"json_schema_extra": {
        "example": {
            "template_key": "document_expand",
            "variables": {
                "document_type": "study protocol",
                "selected_text": "Patients were randomized to treatment groups."
            },
            "context_type": "document",
            "context_id": "123e4567-e89b-12d3-a456-426614174000"
        }
    }}


class AIGenerateResponse(BaseModel):
    """Response from AI generation."""
    content: str
    model: str
    input_tokens: int
    output_tokens: int
    request_id: UUID
    phi_detected: bool = False
    phi_warnings: List[str] = Field(default_factory=list)


# =============================================================================
# Conversation Schemas
# =============================================================================


class AIConversationCreate(BaseModel):
    """Create a new AI conversation."""
    feature_name: AIFeatureName
    context_type: Optional[str] = None
    context_id: Optional[UUID] = None
    initial_message: Optional[str] = Field(None, description="Optional first user message")


class AIConversationMessageCreate(BaseModel):
    """Add a message to an existing conversation."""
    content: str = Field(..., min_length=1, max_length=50000)
    stream: bool = Field(False, description="Whether to stream the response")


class AIConversationMessageResponse(BaseModel):
    """A message in a conversation response."""
    id: UUID
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


class AIConversationResponse(BaseModel):
    """Full conversation with messages."""
    id: UUID
    feature_name: AIFeatureName
    context_type: Optional[str]
    context_id: Optional[UUID]
    messages: List[AIConversationMessageResponse]
    created_at: datetime
    updated_at: datetime


class AIConversationListResponse(BaseModel):
    """List of conversations (without full messages)."""
    id: UUID
    feature_name: AIFeatureName
    context_type: Optional[str]
    context_id: Optional[UUID]
    message_count: int
    last_message_preview: Optional[str]
    created_at: datetime
    updated_at: datetime


# =============================================================================
# Document Assistant Schemas
# =============================================================================


class AIDocumentActionRequest(BaseModel):
    """Request for a document quick action."""
    action: DocumentAction
    document_id: UUID
    selected_text: Optional[str] = Field(None, description="Text selected by user")
    document_type: Optional[str] = Field(None, description="Type of document")
    surrounding_context: Optional[str] = Field(None, description="Text around selection")
    instructions: Optional[str] = Field(None, description="Additional user instructions")
    stream: bool = Field(False, description="Whether to stream the response")

    model_config = {"json_schema_extra": {
        "example": {
            "action": "expand",
            "document_id": "123e4567-e89b-12d3-a456-426614174000",
            "selected_text": "Patients were randomized.",
            "document_type": "study protocol"
        }
    }}


class AIDocumentActionResponse(BaseModel):
    """Response from a document quick action."""
    content: str
    action: DocumentAction
    model: str
    tokens_used: int


# =============================================================================
# Knowledge Assistant Schemas
# =============================================================================


class AIKnowledgeSummarizeRequest(BaseModel):
    """Request to summarize a knowledge item (paper)."""
    paper_id: UUID
    summary_type: SummaryType = SummaryType.GENERAL
    include_key_findings: bool = True
    include_limitations: bool = True


class AIKnowledgeSummaryResponse(BaseModel):
    """Structured summary of a paper."""
    paper_id: UUID
    summary_type: SummaryType
    summary: str
    key_findings: Optional[List[str]] = None
    methodology_brief: Optional[str] = None
    limitations: Optional[List[str]] = None
    model: str
    tokens_used: int


class AIKnowledgeCompareRequest(BaseModel):
    """Request to compare multiple papers."""
    paper_ids: List[UUID] = Field(..., min_length=2, max_length=5)
    focus_areas: Optional[List[str]] = Field(
        None,
        description="Specific areas to compare (e.g., 'methodology', 'findings')"
    )


class AIKnowledgeCompareResponse(BaseModel):
    """Comparison of multiple papers."""
    paper_ids: List[UUID]
    methodology_comparison: str
    findings_comparison: str
    agreements: List[str]
    conflicts: List[str]
    synthesis: str
    model: str
    tokens_used: int


# =============================================================================
# Review Assistant Schemas
# =============================================================================


class AIReviewSuggestRequest(BaseModel):
    """Request to suggest review comments."""
    document_id: UUID
    focus_areas: Optional[List[str]] = Field(
        None,
        description="Areas to focus on (e.g., 'clarity', 'methodology')"
    )


class AIReviewSuggestion(BaseModel):
    """A suggested review comment."""
    location: str
    type: Literal["clarity", "accuracy", "completeness", "style"]
    comment: str
    severity: Literal["minor", "moderate", "major"]


class AIReviewSuggestResponse(BaseModel):
    """Response with suggested review comments."""
    document_id: UUID
    suggestions: List[AIReviewSuggestion]
    model: str
    tokens_used: int


# =============================================================================
# Search Copilot Schemas
# =============================================================================


class AISearchInterpretRequest(BaseModel):
    """Request to interpret a natural language search query."""
    query: str = Field(..., min_length=1, max_length=500)


class AISearchInterpretResponse(BaseModel):
    """Interpreted search query with structured parameters."""
    original_query: str
    interpretation: str
    entity_types: List[str]
    keywords: List[str]
    filters: dict[str, Any]
    suggested_queries: List[str]


# =============================================================================
# Task Generator Schemas
# =============================================================================


class AITaskExtractionRequest(BaseModel):
    """Request to extract tasks from text (meeting notes, emails, etc.)."""
    content: str = Field(..., min_length=10, max_length=50000)
    project_id: Optional[UUID] = Field(None, description="Target project for tasks")
    team_member_names: Optional[List[str]] = Field(
        None,
        description="Team member names for assignee matching"
    )


class AIExtractedTask(BaseModel):
    """A task extracted from text."""
    name: str
    description: Optional[str] = None
    assignee_suggestion: Optional[str] = None
    due_date_suggestion: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)


class AITaskExtractionResponse(BaseModel):
    """Response with extracted tasks."""
    tasks: List[AIExtractedTask]
    source_preview: str
    model: str
    tokens_used: int


# =============================================================================
# Usage Tracking Schemas
# =============================================================================


class AIUsageStatsRequest(BaseModel):
    """Request for usage statistics."""
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    feature_name: Optional[AIFeatureName] = None


class AIFeatureUsageStats(BaseModel):
    """Usage stats for a single feature."""
    feature_name: AIFeatureName
    request_count: int
    total_tokens: int
    avg_latency_ms: float


class AIUsageStatsResponse(BaseModel):
    """AI usage statistics response."""
    period_start: datetime
    period_end: datetime
    total_requests: int
    total_tokens: int
    by_feature: List[AIFeatureUsageStats]
    daily_usage: List[dict[str, Any]]


# =============================================================================
# Template Schemas
# =============================================================================


class AIPromptTemplateResponse(BaseModel):
    """A prompt template."""
    template_key: str
    display_name: str
    category: str
    description: Optional[str] = None
    is_custom: bool = False
