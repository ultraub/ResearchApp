"""Google Gemini AI provider implementation."""

import time
from typing import AsyncIterator, List, Optional

from google import genai
from google.genai import types

from researchhub.ai.providers.base import AIMessage, AIProvider, AIResponse
from researchhub.ai.exceptions import AIProviderError, AIRateLimitError


class GeminiProvider(AIProvider):
    """Google Gemini implementation.

    Supports Gemini 2.5 and 3 family models for high-quality text generation
    with advanced reasoning capabilities.

    Example:
        ```python
        provider = GeminiProvider(api_key="...")

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
        default_model: str = "gemini-2.5-flash",
        timeout: float = 60.0,
    ):
        """Initialize the Gemini provider.

        Args:
            api_key: Google AI API key (GEMINI_API_KEY)
            default_model: Default model to use for requests
            timeout: Request timeout in seconds
        """
        self._api_key = api_key
        self._default_model = default_model
        self._timeout = timeout

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def default_model(self) -> str:
        return self._default_model

    def _build_contents(
        self,
        messages: List[AIMessage],
    ) -> tuple[Optional[str], list[types.Content]]:
        """Build Gemini contents from AIMessage list.

        Gemini uses a different message format than Anthropic/OpenAI.
        System instructions are passed separately, and messages use
        'user' and 'model' roles (not 'assistant').

        Args:
            messages: List of AIMessage objects

        Returns:
            Tuple of (system_instruction, contents list)
        """
        system_instruction = None
        contents = []

        for msg in messages:
            if msg.role == "system":
                system_instruction = msg.content
            else:
                # Gemini uses 'model' instead of 'assistant'
                role = "model" if msg.role == "assistant" else "user"
                contents.append(
                    types.Content(
                        role=role,
                        parts=[types.Part(text=msg.content)],
                    )
                )

        return system_instruction, contents

    async def complete(
        self,
        messages: List[AIMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        stop_sequences: Optional[List[str]] = None,
    ) -> AIResponse:
        """Generate a completion using Gemini.

        Args:
            messages: List of messages forming the conversation
            model: Model identifier (uses default if not specified)
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens to generate
            stop_sequences: Optional sequences that stop generation

        Returns:
            AIResponse containing the generated content and metadata

        Raises:
            AIProviderError: If the Gemini API request fails
            AIRateLimitError: If rate limited by Google
        """
        self._validate_messages(messages)

        model = model or self._default_model
        start_time = time.perf_counter()

        system_instruction, contents = self._build_contents(messages)

        try:
            # Build generation config
            generation_config = types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                stop_sequences=stop_sequences or [],
            )

            if system_instruction:
                generation_config.system_instruction = system_instruction

            # Create fresh client for each request to avoid "client closed" errors
            client = genai.Client(api_key=self._api_key)
            response = await client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=generation_config,
            )

            latency_ms = int((time.perf_counter() - start_time) * 1000)

            # Extract token usage from response
            usage = response.usage_metadata
            input_tokens = usage.prompt_token_count if usage else 0
            output_tokens = usage.candidates_token_count if usage else 0

            # Get finish reason
            finish_reason = "stop"
            if response.candidates and response.candidates[0].finish_reason:
                finish_reason = response.candidates[0].finish_reason.name.lower()

            return AIResponse(
                content=response.text or "",
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                finish_reason=finish_reason,
                latency_ms=latency_ms,
            )

        except Exception as e:
            error_str = str(e).lower()
            # Check for rate limit errors
            if "rate" in error_str and "limit" in error_str:
                raise AIRateLimitError(
                    provider=self.provider_name,
                    message=str(e),
                    retry_after=None,
                )
            # Check for quota errors
            if "quota" in error_str or "429" in error_str:
                raise AIRateLimitError(
                    provider=self.provider_name,
                    message=str(e),
                    retry_after=None,
                )
            raise AIProviderError(
                provider=self.provider_name,
                message=str(e),
                status_code=None,
            )

    async def stream(
        self,
        messages: List[AIMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        stop_sequences: Optional[List[str]] = None,
    ) -> AsyncIterator[str]:
        """Stream a completion using Gemini.

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
            AIProviderError: If the Gemini API request fails
            AIRateLimitError: If rate limited by Google
        """
        self._validate_messages(messages)

        model = model or self._default_model
        system_instruction, contents = self._build_contents(messages)

        try:
            # Build generation config
            generation_config = types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                stop_sequences=stop_sequences or [],
            )

            if system_instruction:
                generation_config.system_instruction = system_instruction

            # Create fresh client for each request to avoid "client closed" errors
            client = genai.Client(api_key=self._api_key)
            stream = await client.aio.models.generate_content_stream(
                model=model,
                contents=contents,
                config=generation_config,
            )
            async for chunk in stream:
                if chunk.text:
                    yield chunk.text

        except Exception as e:
            error_str = str(e).lower()
            if "rate" in error_str and "limit" in error_str:
                raise AIRateLimitError(
                    provider=self.provider_name,
                    message=str(e),
                    retry_after=None,
                )
            if "quota" in error_str or "429" in error_str:
                raise AIRateLimitError(
                    provider=self.provider_name,
                    message=str(e),
                    retry_after=None,
                )
            raise AIProviderError(
                provider=self.provider_name,
                message=str(e),
                status_code=None,
            )
