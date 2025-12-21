"""Abstract base class for AI providers.

This module defines the interface that all AI providers must implement,
enabling provider-agnostic AI interactions throughout the application.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import AsyncIterator, List, Literal, Optional
from uuid import UUID, uuid4


@dataclass
class AIMessage:
    """A message in an AI conversation.

    Attributes:
        role: The role of the message sender ('system', 'user', or 'assistant')
        content: The text content of the message
    """
    role: Literal["system", "user", "assistant"]
    content: str


@dataclass
class AIResponse:
    """Response from an AI provider.

    Attributes:
        content: The generated text content
        model: The model identifier used for generation
        input_tokens: Number of tokens in the input/prompt
        output_tokens: Number of tokens in the generated response
        finish_reason: Why generation stopped ('stop', 'max_tokens', etc.)
        latency_ms: Time taken for the request in milliseconds
        request_id: Unique identifier for this request
    """
    content: str
    model: str
    input_tokens: int
    output_tokens: int
    finish_reason: str
    latency_ms: Optional[int] = None
    request_id: UUID = field(default_factory=uuid4)
    created_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def total_tokens(self) -> int:
        """Total tokens used (input + output)."""
        return self.input_tokens + self.output_tokens


class AIProvider(ABC):
    """Abstract base class for AI providers.

    All AI provider implementations (Anthropic, Azure OpenAI, etc.) must
    inherit from this class and implement the abstract methods.

    Example:
        ```python
        provider = AnthropicProvider(api_key="...")

        messages = [
            AIMessage(role="system", content="You are a helpful assistant."),
            AIMessage(role="user", content="Summarize this paper...")
        ]

        response = await provider.complete(messages)
        print(response.content)
        ```
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the name of this provider (e.g., 'anthropic', 'azure_openai')."""
        pass

    @property
    @abstractmethod
    def default_model(self) -> str:
        """Return the default model identifier for this provider."""
        pass

    @abstractmethod
    async def complete(
        self,
        messages: List[AIMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        stop_sequences: Optional[List[str]] = None,
    ) -> AIResponse:
        """Generate a completion for the given messages.

        Args:
            messages: List of messages forming the conversation
            model: Model identifier (uses default if not specified)
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens to generate
            stop_sequences: Optional sequences that stop generation

        Returns:
            AIResponse containing the generated content and metadata

        Raises:
            AIProviderError: If the provider request fails
        """
        pass

    @abstractmethod
    async def stream(
        self,
        messages: List[AIMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        stop_sequences: Optional[List[str]] = None,
    ) -> AsyncIterator[str]:
        """Stream a completion for the given messages.

        Yields chunks of the generated text as they become available.
        Useful for real-time display of AI responses.

        Args:
            messages: List of messages forming the conversation
            model: Model identifier (uses default if not specified)
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens to generate
            stop_sequences: Optional sequences that stop generation

        Yields:
            String chunks of the generated response

        Raises:
            AIProviderError: If the provider request fails
        """
        pass

    async def health_check(self) -> bool:
        """Check if the provider is available and responding.

        Returns:
            True if provider is healthy, False otherwise
        """
        try:
            # Simple health check with minimal tokens
            messages = [AIMessage(role="user", content="Hi")]
            response = await self.complete(messages, max_tokens=5)
            return bool(response.content)
        except Exception:
            return False

    def _validate_messages(self, messages: List[AIMessage]) -> None:
        """Validate message list before sending to provider.

        Args:
            messages: Messages to validate

        Raises:
            ValueError: If messages are invalid
        """
        if not messages:
            raise ValueError("Messages list cannot be empty")

        for msg in messages:
            if msg.role not in ("system", "user", "assistant"):
                raise ValueError(f"Invalid message role: {msg.role}")
            if not msg.content:
                raise ValueError("Message content cannot be empty")
