"""AI Assistant module for context-aware chat with tool calling.

This module provides an AI assistant that can:
- Answer questions about user data (projects, tasks, documents, etc.)
- Propose actions (create/update/delete) with approval workflow
- Maintain conversation context and page awareness
"""

from researchhub.ai.assistant.service import AssistantService
from researchhub.ai.assistant.tools import ToolRegistry

__all__ = [
    "AssistantService",
    "ToolRegistry",
]
