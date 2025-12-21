"""AI module exceptions.

Custom exceptions for AI-related errors, providing structured error handling
across different failure modes.
"""

from typing import Optional


class AIError(Exception):
    """Base exception for AI-related errors."""

    def __init__(self, message: str, code: str = "AI_ERROR"):
        self.message = message
        self.code = code
        super().__init__(message)


class AIProviderError(AIError):
    """Error from the AI provider (Anthropic, Azure OpenAI, etc.).

    Raised when the underlying AI provider returns an error, such as
    authentication failures, invalid requests, or service unavailability.
    """

    def __init__(
        self,
        provider: str,
        message: str,
        status_code: Optional[int] = None,
    ):
        self.provider = provider
        self.status_code = status_code
        super().__init__(
            message=f"[{provider}] {message}",
            code="AI_PROVIDER_ERROR",
        )


class AIRateLimitError(AIError):
    """Rate limit exceeded with the AI provider.

    Raised when too many requests have been made to the AI provider.
    Includes retry information when available.
    """

    def __init__(
        self,
        provider: str,
        message: str,
        retry_after: Optional[int] = None,
    ):
        self.provider = provider
        self.retry_after = retry_after
        super().__init__(
            message=f"[{provider}] Rate limited: {message}",
            code="AI_RATE_LIMITED",
        )


class AIFeatureDisabledError(AIError):
    """Requested AI feature is not enabled for this organization.

    Raised when attempting to use an AI feature that has been disabled
    in the organization's settings.
    """

    def __init__(self, feature_name: str):
        self.feature_name = feature_name
        super().__init__(
            message=f"AI feature '{feature_name}' is not enabled",
            code="AI_FEATURE_DISABLED",
        )


class AIPHIDetectedError(AIError):
    """Protected Health Information (PHI) detected in content.

    Raised when PHI detection identifies sensitive data in content
    that is about to be sent to an AI provider, and the organization's
    policy is set to block such requests.
    """

    def __init__(self, phi_types: list[str]):
        self.phi_types = phi_types
        types_str = ", ".join(phi_types)
        super().__init__(
            message=f"Content may contain protected health information: {types_str}",
            code="AI_PHI_DETECTED",
        )


class AIContextTooLongError(AIError):
    """Content exceeds the maximum allowed context length.

    Raised when the combined input (system prompt + context + user message)
    exceeds the model's maximum context window or configured limits.
    """

    def __init__(self, actual_tokens: int, max_tokens: int):
        self.actual_tokens = actual_tokens
        self.max_tokens = max_tokens
        super().__init__(
            message=f"Content too long: {actual_tokens} tokens exceeds maximum of {max_tokens}",
            code="AI_CONTEXT_TOO_LONG",
        )


class AITemplateNotFoundError(AIError):
    """Requested prompt template does not exist.

    Raised when attempting to use a prompt template that doesn't exist
    in the system or organization's custom templates.
    """

    def __init__(self, template_key: str):
        self.template_key = template_key
        super().__init__(
            message=f"Prompt template '{template_key}' not found",
            code="AI_TEMPLATE_NOT_FOUND",
        )


class AIConversationNotFoundError(AIError):
    """Requested AI conversation does not exist.

    Raised when attempting to access or continue a conversation
    that doesn't exist or has been deleted.
    """

    def __init__(self, conversation_id: str):
        self.conversation_id = conversation_id
        super().__init__(
            message=f"AI conversation '{conversation_id}' not found",
            code="AI_CONVERSATION_NOT_FOUND",
        )
