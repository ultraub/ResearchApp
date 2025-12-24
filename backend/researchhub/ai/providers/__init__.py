"""AI Provider implementations."""

from typing import Optional

from researchhub.ai.providers.base import (
    AIProvider,
    AIMessage,
    AIResponse,
    AIResponseWithTools,
    ToolDefinition,
    ToolUse,
    ToolResult,
)
from researchhub.ai.providers.anthropic import AnthropicProvider
from researchhub.ai.providers.azure_openai import AzureOpenAIProvider


def get_provider(provider_name: Optional[str] = None) -> AIProvider:
    """Get an AI provider instance.

    Args:
        provider_name: Provider to use ('anthropic' or 'azure_openai').
                      Uses default from settings if not specified.

    Returns:
        AIProvider instance
    """
    from researchhub.ai.service import get_ai_service

    service = get_ai_service()
    return service._get_provider(provider_name)


__all__ = [
    "AIProvider",
    "AIMessage",
    "AIResponse",
    "AIResponseWithTools",
    "ToolDefinition",
    "ToolUse",
    "ToolResult",
    "AnthropicProvider",
    "AzureOpenAIProvider",
    "get_provider",
]
