"""Azure OpenAI AI provider implementation."""

import time
from typing import AsyncIterator, List, Optional

import openai
from openai import AsyncAzureOpenAI

from researchhub.ai.providers.base import AIMessage, AIProvider, AIResponse
from researchhub.ai.exceptions import AIProviderError, AIRateLimitError


class AzureOpenAIProvider(AIProvider):
    """Azure OpenAI implementation.

    Supports Azure-hosted OpenAI models (GPT-4, GPT-3.5-turbo) for enterprise
    deployments with Azure compliance and security.

    Example:
        ```python
        provider = AzureOpenAIProvider(
            endpoint="https://my-resource.openai.azure.com",
            api_key="...",
            deployment="gpt-4"
        )

        messages = [
            AIMessage(role="user", content="Summarize this research paper...")
        ]

        response = await provider.complete(messages)
        print(response.content)
        ```
    """

    def __init__(
        self,
        endpoint: str,
        api_key: str,
        deployment: str,
        api_version: str = "2024-02-01",
        timeout: float = 60.0,
    ):
        """Initialize the Azure OpenAI provider.

        Args:
            endpoint: Azure OpenAI resource endpoint URL
            api_key: Azure OpenAI API key
            deployment: Model deployment name
            api_version: Azure OpenAI API version
            timeout: Request timeout in seconds
        """
        self.client = AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            api_key=api_key,
            api_version=api_version,
            timeout=timeout,
        )
        self.deployment = deployment

    @property
    def provider_name(self) -> str:
        return "azure_openai"

    @property
    def default_model(self) -> str:
        return self.deployment

    async def complete(
        self,
        messages: List[AIMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
        stop_sequences: Optional[List[str]] = None,
    ) -> AIResponse:
        """Generate a completion using Azure OpenAI.

        Args:
            messages: List of messages forming the conversation
            model: Model/deployment identifier (uses default if not specified)
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens to generate
            stop_sequences: Optional sequences that stop generation

        Returns:
            AIResponse containing the generated content and metadata

        Raises:
            AIProviderError: If the Azure OpenAI API request fails
            AIRateLimitError: If rate limited by Azure OpenAI
        """
        self._validate_messages(messages)

        deployment = model or self.deployment
        start_time = time.perf_counter()

        # Convert messages to OpenAI format
        openai_messages = [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]

        try:
            request_kwargs = {
                "model": deployment,
                "messages": openai_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }

            if stop_sequences:
                request_kwargs["stop"] = stop_sequences

            response = await self.client.chat.completions.create(**request_kwargs)

            latency_ms = int((time.perf_counter() - start_time) * 1000)

            return AIResponse(
                content=response.choices[0].message.content or "",
                model=deployment,
                input_tokens=response.usage.prompt_tokens if response.usage else 0,
                output_tokens=response.usage.completion_tokens if response.usage else 0,
                finish_reason=response.choices[0].finish_reason or "stop",
                latency_ms=latency_ms,
            )

        except openai.RateLimitError as e:
            raise AIRateLimitError(
                provider=self.provider_name,
                message=str(e),
                retry_after=None,
            )
        except openai.APIError as e:
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
        """Stream a completion using Azure OpenAI.

        Yields text chunks as they are generated, enabling real-time
        display of responses.

        Args:
            messages: List of messages forming the conversation
            model: Model/deployment identifier (uses default if not specified)
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens to generate
            stop_sequences: Optional sequences that stop generation

        Yields:
            String chunks of the generated response

        Raises:
            AIProviderError: If the Azure OpenAI API request fails
            AIRateLimitError: If rate limited by Azure OpenAI
        """
        self._validate_messages(messages)

        deployment = model or self.deployment

        # Convert messages to OpenAI format
        openai_messages = [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]

        try:
            request_kwargs = {
                "model": deployment,
                "messages": openai_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "stream": True,
            }

            if stop_sequences:
                request_kwargs["stop"] = stop_sequences

            stream = await self.client.chat.completions.create(**request_kwargs)

            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except openai.RateLimitError as e:
            raise AIRateLimitError(
                provider=self.provider_name,
                message=str(e),
                retry_after=None,
            )
        except openai.APIError as e:
            raise AIProviderError(
                provider=self.provider_name,
                message=str(e),
                status_code=getattr(e, "status_code", None),
            )
