"""Pydantic schemas for the AI Assistant."""

from datetime import datetime
from enum import Enum
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PageContextType(str, Enum):
    """Types of pages the user can be viewing."""

    # List views (plural)
    DASHBOARD = "dashboard"
    PROJECTS = "projects"
    TASKS = "tasks"
    DOCUMENTS = "documents"
    BLOCKERS = "blockers"
    GENERAL = "general"

    # Detail views (singular)
    PROJECT = "project"
    TASK = "task"
    DOCUMENT = "document"
    BLOCKER = "blocker"
    KNOWLEDGE = "knowledge"
    TEAM = "team"


class PageContext(BaseModel):
    """Context about the current page the user is viewing."""

    type: PageContextType
    id: Optional[UUID] = None
    name: Optional[str] = None
    project_id: Optional[UUID] = None
    project_name: Optional[str] = None
    metadata: Optional[dict] = None


class SSEEventType(str, Enum):
    """Types of Server-Sent Events from the assistant."""

    TEXT = "text"
    TEXT_DELTA = "text_delta"
    THINKING = "thinking"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    ACTION_PREVIEW = "action_preview"
    DONE = "done"
    ERROR = "error"


class SSEEvent(BaseModel):
    """A Server-Sent Event from the assistant."""

    event: SSEEventType
    data: dict


class DiffEntry(BaseModel):
    """A single field change in a diff."""

    field: str
    old_value: Optional[Any] = None
    new_value: Any
    change_type: str = "modify"  # add, modify, remove
    old_display: Optional[str] = None
    new_display: Optional[str] = None


class ActionPreview(BaseModel):
    """Preview of a pending action for user approval.

    Note: action_id and expires_at are optional during creation
    (set by create_preview) and populated later when the pending
    action is stored in the database.
    """

    tool_name: str
    tool_input: dict  # Original input to the tool
    entity_type: str
    entity_id: Optional[UUID] = None
    description: Optional[str] = None
    old_state: Optional[dict] = None
    new_state: dict
    diff: List[DiffEntry] = Field(default_factory=list)
    # Set after storing pending action
    action_id: Optional[UUID] = None
    expires_at: Optional[datetime] = None


class ActionExecutionResult(BaseModel):
    """Result of executing an approved action."""

    action_id: UUID
    success: bool
    entity_type: str
    entity_id: Optional[UUID] = None
    result: Optional[dict] = None
    error: Optional[str] = None


# Request/Response schemas for API endpoints


class ChatMessage(BaseModel):
    """A message in the conversation history."""

    role: str  # "user" or "assistant"
    content: str


class AssistantChatRequest(BaseModel):
    """Request to chat with the assistant."""

    message: str
    conversation_id: Optional[UUID] = None
    messages: List[ChatMessage] = Field(default_factory=list)
    page_context: Optional[PageContext] = None


class AssistantChatResponse(BaseModel):
    """Non-streaming response from the assistant."""

    conversation_id: UUID
    message_id: UUID
    content: str
    actions: List[ActionPreview] = Field(default_factory=list)


class PendingActionResponse(BaseModel):
    """Response with pending action details."""

    id: UUID
    tool_name: str
    entity_type: str
    entity_id: Optional[UUID] = None
    description: Optional[str] = None
    old_state: Optional[dict] = None
    new_state: dict
    diff: List[DiffEntry] = Field(default_factory=list)
    status: str
    created_at: datetime
    expires_at: datetime

    class Config:
        from_attributes = True
