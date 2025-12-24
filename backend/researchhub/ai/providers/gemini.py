"""Google Gemini AI provider implementation."""

import time
import uuid
from typing import AsyncIterator, List, Optional

from google import genai
from google.genai import types

from researchhub.ai.providers.base import (
    AIMessage,
    AIProvider,
    AIResponse,
    AIResponseWithTools,
    StreamEvent,
    ToolDefinition,
    ToolResult,
    ToolUse,
)
from researchhub.ai.exceptions import AIProviderError, AIRateLimitError


class GeminiProvider(AIProvider):
    """Google Gemini implementation.

    Supports Gemini 2.5 and 3 family models for high-quality text generation
    with advanced reasoning capabilities.

    Features:
        - Streaming responses with real-time text generation
        - Tool/function calling with streaming support
        - Thinking/reasoning transparency (Gemini 3+ models)

    Models:
        - gemini-2.5-flash: Fast, efficient model for general tasks
        - gemini-3-flash-preview: Latest model with thinking capabilities

    Example:
        ```python
        provider = GeminiProvider(api_key="...")

        messages = [
            AIMessage(role="user", content="Summarize this research paper...")
        ]

        response = await provider.complete(messages)
        print(response.content)

        # Streaming with tools and thinking (Gemini 3)
        async for event in provider.stream_with_tools(
            messages=messages,
            tools=tools,
            thinking_level='medium',
        ):
            if event.type == 'thinking':
                print(f"Thinking: {event.data['content']}")
            elif event.type == 'text_delta':
                print(event.data['content'], end='')
        ```
    """

    def __init__(
        self,
        api_key: str,
        default_model: str = "gemini-3-flash-preview",
        timeout: float = 120.0,
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
        """Generate a completion with tool calling support using Gemini.

        Args:
            messages: List of messages forming the conversation
            tools: List of available tools the AI can call
            tool_results: Results from previously requested tool calls
            model: Model identifier (uses default if not specified)
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens to generate

        Returns:
            AIResponseWithTools containing text and/or tool use requests

        Raises:
            AIProviderError: If the Gemini API request fails
            AIRateLimitError: If rate limited by Google
        """
        self._validate_messages(messages)

        model = model or self._default_model
        start_time = time.perf_counter()

        system_from_messages, contents = self._build_contents(messages)
        # Use explicit system parameter if provided, otherwise use system from messages
        system_instruction = system if system else system_from_messages

        # Convert ToolDefinition to Gemini function declarations using SDK types
        # NOTE: Must use parameters_json_schema, not parameters - this is critical!
        function_declarations = []
        for tool in tools:
            func_decl = types.FunctionDeclaration(
                name=tool.name,
                description=tool.description,
                parameters_json_schema=tool.input_schema,
            )
            function_declarations.append(func_decl)

        # If we have tool results, add them to the contents
        # NOTE: Function responses must use role='tool', not 'user' per Gemini SDK docs
        if tool_results:
            for result in tool_results:
                function_response_part = types.Part.from_function_response(
                    name=result.tool_use_id.split("_")[0] if "_" in result.tool_use_id else result.tool_use_id,
                    response={"result": result.content} if not isinstance(result.content, dict) else result.content,
                )
                contents.append(
                    types.Content(
                        role="tool",
                        parts=[function_response_part],
                    )
                )

        try:
            # Build generation config with tools using proper SDK types
            gemini_tools = None
            if function_declarations:
                gemini_tools = [types.Tool(function_declarations=function_declarations)]

            generation_config = types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                tools=gemini_tools,
            )

            if system_instruction:
                generation_config.system_instruction = system_instruction

            # Create fresh client for each request
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

            # Parse response content for text and function calls
            text_content = ""
            tool_uses = []

            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'text') and part.text:
                        text_content += part.text
                    elif hasattr(part, 'function_call') and part.function_call:
                        fc = part.function_call
                        # Generate a unique ID for this tool use (Gemini doesn't provide one)
                        tool_use_id = f"{fc.name}_{uuid.uuid4().hex[:8]}"
                        tool_uses.append(ToolUse(
                            id=tool_use_id,
                            name=fc.name,
                            input=dict(fc.args) if fc.args else {},
                        ))

            return AIResponseWithTools(
                content=text_content,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                finish_reason=finish_reason,
                latency_ms=latency_ms,
                tool_uses=tool_uses,
            )

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

    async def stream_with_tools(
        self,
        messages: List[AIMessage],
        tools: List[ToolDefinition],
        tool_results: Optional[List[ToolResult]] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 30000,
        system: Optional[str] = None,
        thinking_level: Optional[str] = None,
    ) -> AsyncIterator[StreamEvent]:
        """Stream a completion with tool calling support using Gemini.

        Yields StreamEvent objects in real-time as the model generates content,
        including text deltas, tool calls, and thinking indicators (Gemini 3+).

        Args:
            messages: List of messages forming the conversation
            tools: List of available tools the AI can call
            tool_results: Results from previously requested tool calls
            model: Model identifier (uses default if not specified)
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens to generate
            system: Optional system prompt for the conversation
            thinking_level: For Gemini 3+ models, thinking depth ('minimal', 'low', 'medium', 'high')

        Yields:
            StreamEvent objects with types:
            - 'thinking': Model thinking/reasoning (Gemini 3+)
            - 'text_delta': Incremental text content
            - 'tool_call': Tool invocation request
            - 'done': Stream completed
            - 'error': Error occurred
        """
        self._validate_messages(messages)

        model = model or self._default_model
        start_time = time.perf_counter()

        system_from_messages, contents = self._build_contents(messages)
        system_instruction = system if system else system_from_messages

        # Convert ToolDefinition to Gemini function declarations using SDK types
        # NOTE: Must use parameters_json_schema, not parameters - this is critical!
        function_declarations = []
        for tool in tools:
            func_decl = types.FunctionDeclaration(
                name=tool.name,
                description=tool.description,
                parameters_json_schema=tool.input_schema,
            )
            function_declarations.append(func_decl)

        # If we have tool results, add them to the contents
        # NOTE: Function responses must use role='tool', not 'user' per Gemini SDK docs
        if tool_results:
            for result in tool_results:
                function_response_part = types.Part.from_function_response(
                    name=result.tool_use_id.split("_")[0] if "_" in result.tool_use_id else result.tool_use_id,
                    response={"result": result.content} if not isinstance(result.content, dict) else result.content,
                )
                contents.append(
                    types.Content(
                        role="tool",
                        parts=[function_response_part],
                    )
                )

        try:
            # Build generation config with tools using proper SDK types
            gemini_tools = None
            if function_declarations:
                gemini_tools = [types.Tool(function_declarations=function_declarations)]

            generation_config = types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
                tools=gemini_tools,
            )

            if system_instruction:
                generation_config.system_instruction = system_instruction

            # For Gemini 3+ models, configure thinking if requested
            # Gemini 3 Flash supports thinking_level parameter
            is_gemini_3 = model and ("gemini-3" in model.lower() or "gemini3" in model.lower())
            if is_gemini_3 and thinking_level:
                # Gemini 3 thinking configuration
                # Valid levels: 'minimal', 'low', 'medium', 'high'
                try:
                    generation_config.thinking_config = types.ThinkingConfig(
                        thinking_budget=thinking_level,
                    )
                except (AttributeError, TypeError):
                    # ThinkingConfig may not be available in older SDK versions
                    pass

            # Create fresh client for streaming
            client = genai.Client(api_key=self._api_key)

            # Use streaming endpoint
            stream = await client.aio.models.generate_content_stream(
                model=model,
                contents=contents,
                config=generation_config,
            )

            # Track accumulated content for the done event
            total_text = ""
            tool_uses = []
            input_tokens = 0
            output_tokens = 0

            async for chunk in stream:
                # Check for usage metadata updates
                if chunk.usage_metadata:
                    input_tokens = chunk.usage_metadata.prompt_token_count or 0
                    output_tokens = chunk.usage_metadata.candidates_token_count or 0

                # Process candidates
                if chunk.candidates:
                    for candidate in chunk.candidates:
                        if candidate.content and candidate.content.parts:
                            for part in candidate.content.parts:
                                # Handle thinking/reasoning content (Gemini 3+)
                                if hasattr(part, 'thought') and part.thought:
                                    yield StreamEvent(
                                        type=StreamEvent.THINKING,
                                        data={"content": part.thought},
                                    )

                                # Handle text content
                                if hasattr(part, 'text') and part.text:
                                    total_text += part.text
                                    yield StreamEvent(
                                        type=StreamEvent.TEXT_DELTA,
                                        data={"content": part.text},
                                    )

                                # Handle function calls
                                if hasattr(part, 'function_call') and part.function_call:
                                    fc = part.function_call
                                    tool_use_id = f"{fc.name}_{uuid.uuid4().hex[:8]}"
                                    tool_use = ToolUse(
                                        id=tool_use_id,
                                        name=fc.name,
                                        input=dict(fc.args) if fc.args else {},
                                    )
                                    tool_uses.append(tool_use)
                                    yield StreamEvent(
                                        type=StreamEvent.TOOL_CALL,
                                        data={
                                            "id": tool_use_id,
                                            "name": fc.name,
                                            "input": dict(fc.args) if fc.args else {},
                                        },
                                    )

            latency_ms = int((time.perf_counter() - start_time) * 1000)

            # Send completion event
            yield StreamEvent(
                type=StreamEvent.DONE,
                data={
                    "model": model,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "finish_reason": "stop" if not tool_uses else "tool_use",
                    "latency_ms": latency_ms,
                },
            )

        except Exception as e:
            error_str = str(e).lower()
            if "rate" in error_str and "limit" in error_str:
                yield StreamEvent(
                    type=StreamEvent.ERROR,
                    data={"message": f"Rate limit exceeded: {str(e)}"},
                )
            elif "quota" in error_str or "429" in error_str:
                yield StreamEvent(
                    type=StreamEvent.ERROR,
                    data={"message": f"Quota exceeded: {str(e)}"},
                )
            else:
                yield StreamEvent(
                    type=StreamEvent.ERROR,
                    data={"message": str(e)},
                )
