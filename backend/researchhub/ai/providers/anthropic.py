"""Anthropic Claude AI provider implementation."""

import time
from typing import AsyncIterator, List, Optional

import anthropic
from anthropic import AsyncAnthropic

from researchhub.ai.providers.base import (
    AIMessage,
    AIProvider,
    AIResponse,
    AIResponseWithTools,
    ToolDefinition,
    ToolResult,
    ToolUse,
)
from researchhub.ai.exceptions import AIProviderError, AIRateLimitError


class AnthropicProvider(AIProvider):
    """Anthropic Claude implementation.

    Supports Claude 3 family models (Opus, Sonnet, Haiku) for high-quality
    text generation with strong reasoning capabilities.

    Example:
        ```python
        provider = AnthropicProvider(api_key="sk-ant-...")

        messages = [
            AIMessage(role="user", content="Summarize this research paper...")
        ]

        response = await provider.complete(messages)
        print(response.content)
        ```
    """

    def __init__(
        self,
        api_key: str,
        default_model: str = "claude-sonnet-4-20250514",
        timeout: float = 60.0,
    ):
        """Initialize the Anthropic provider.

        Args:
            api_key: Anthropic API key
            default_model: Default model to use for requests
            timeout: Request timeout in seconds
        """
        self.client = AsyncAnthropic(
            api_key=api_key,
            timeout=timeout,
        )
        self._default_model = default_model

    @property
    def provider_name(self) -> str:
        return "anthropic"

    @property
    def default_model(self) -> str:
        return self._default_model

    async def complete(
        self,
        messages: List[AIMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        stop_sequences: Optional[List[str]] = None,
    ) -> AIResponse:
        """Generate a completion using Claude.

        Args:
            messages: List of messages forming the conversation
            model: Model identifier (uses default if not specified)
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens to generate
            stop_sequences: Optional sequences that stop generation

        Returns:
            AIResponse containing the generated content and metadata

        Raises:
            AIProviderError: If the Anthropic API request fails
            AIRateLimitError: If rate limited by Anthropic
        """
        self._validate_messages(messages)

        model = model or self._default_model
        start_time = time.perf_counter()

        # Separate system message from conversation messages
        system_content = None
        conversation_messages = []

        for msg in messages:
            if msg.role == "system":
                system_content = msg.content
            else:
                conversation_messages.append({
                    "role": msg.role,
                    "content": msg.content,
                })

        try:
            # Build request kwargs
            request_kwargs = {
                "model": model,
                "messages": conversation_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }

            if system_content:
                request_kwargs["system"] = system_content

            if stop_sequences:
                request_kwargs["stop_sequences"] = stop_sequences

            response = await self.client.messages.create(**request_kwargs)

            latency_ms = int((time.perf_counter() - start_time) * 1000)

            return AIResponse(
                content=response.content[0].text,
                model=model,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                finish_reason=response.stop_reason or "stop",
                latency_ms=latency_ms,
            )

        except anthropic.RateLimitError as e:
            raise AIRateLimitError(
                provider=self.provider_name,
                message=str(e),
                retry_after=getattr(e, "retry_after", None),
            )
        except anthropic.APIError as e:
            raise AIProviderError(
                provider=self.provider_name,
                message=str(e),
                status_code=getattr(e, "status_code", None),
            )

    async def stream(
        self,
        messages: List[AIMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        stop_sequences: Optional[List[str]] = None,
    ) -> AsyncIterator[str]:
        """Stream a completion using Claude.

        Yields text chunks as they are generated, enabling real-time
        display of responses.

        Args:
            messages: List of messages forming the conversation
            model: Model identifier (uses default if not specified)
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens to generate
            stop_sequences: Optional sequences that stop generation

        Yields:
            String chunks of the generated response

        Raises:
            AIProviderError: If the Anthropic API request fails
            AIRateLimitError: If rate limited by Anthropic
        """
        self._validate_messages(messages)

        model = model or self._default_model

        # Separate system message from conversation messages
        system_content = None
        conversation_messages = []

        for msg in messages:
            if msg.role == "system":
                system_content = msg.content
            else:
                conversation_messages.append({
                    "role": msg.role,
                    "content": msg.content,
                })

        try:
            # Build request kwargs
            request_kwargs = {
                "model": model,
                "messages": conversation_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }

            if system_content:
                request_kwargs["system"] = system_content

            if stop_sequences:
                request_kwargs["stop_sequences"] = stop_sequences

            async with self.client.messages.stream(**request_kwargs) as stream:
                async for text in stream.text_stream:
                    yield text

        except anthropic.RateLimitError as e:
            raise AIRateLimitError(
                provider=self.provider_name,
                message=str(e),
                retry_after=getattr(e, "retry_after", None),
            )
        except anthropic.APIError as e:
            raise AIProviderError(
                provider=self.provider_name,
                message=str(e),
                status_code=getattr(e, "status_code", None),
            )

    async def complete_with_tools(
        self,
        messages: List[AIMessage],
        tools: List[ToolDefinition],
        tool_results: Optional[List[ToolResult]] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 30000,
        system: Optional[str] = None,
    ) -> AIResponseWithTools:
        """Generate a completion with tool calling support using Claude.

        Args:
            messages: List of messages forming the conversation
            tools: List of available tools the AI can call
            tool_results: Results from previously requested tool calls
            model: Model identifier (uses default if not specified)
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens to generate
            system: Optional system prompt for the conversation

        Returns:
            AIResponseWithTools containing text and/or tool use requests

        Raises:
            AIProviderError: If the Anthropic API request fails
            AIRateLimitError: If rate limited by Anthropic
        """
        self._validate_messages(messages)

        model = model or self._default_model
        start_time = time.perf_counter()

        # Separate system message from conversation messages
        system_from_messages = None
        conversation_messages = []

        for msg in messages:
            if msg.role == "system":
                system_from_messages = msg.content
            else:
                conversation_messages.append({
                    "role": msg.role,
                    "content": msg.content,
                })

        # Use explicit system parameter if provided, otherwise use system from messages
        system_content = system if system else system_from_messages

        # If we have tool results, add them to the conversation
        if tool_results:
            # Add a user message with tool_result blocks
            tool_result_content = []
            for result in tool_results:
                tool_result_content.append({
                    "type": "tool_result",
                    "tool_use_id": result.tool_use_id,
                    "content": str(result.content) if not isinstance(result.content, str) else result.content,
                    "is_error": result.is_error,
                })
            conversation_messages.append({
                "role": "user",
                "content": tool_result_content,
            })

        # Convert tools to Anthropic format
        anthropic_tools = []
        for tool in tools:
            anthropic_tools.append({
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.input_schema,
            })

        try:
            # Build request kwargs
            request_kwargs = {
                "model": model,
                "messages": conversation_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "tools": anthropic_tools,
            }

            if system_content:
                request_kwargs["system"] = system_content

            response = await self.client.messages.create(**request_kwargs)

            latency_ms = int((time.perf_counter() - start_time) * 1000)

            # Parse response content
            text_content = ""
            tool_uses = []

            for block in response.content:
                if block.type == "text":
                    text_content += block.text
                elif block.type == "tool_use":
                    tool_uses.append(ToolUse(
                        id=block.id,
                        name=block.name,
                        input=block.input,
                    ))

            return AIResponseWithTools(
                content=text_content,
                model=model,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                finish_reason=response.stop_reason or "stop",
                latency_ms=latency_ms,
                tool_uses=tool_uses,
            )

        except anthropic.RateLimitError as e:
            raise AIRateLimitError(
                provider=self.provider_name,
                message=str(e),
                retry_after=getattr(e, "retry_after", None),
            )
        except anthropic.APIError as e:
            raise AIProviderError(
                provider=self.provider_name,
                message=str(e),
                status_code=getattr(e, "status_code", None),
            )
