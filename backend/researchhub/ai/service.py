"""AI Service - Central orchestrator for AI interactions.

This service coordinates all AI functionality including provider selection,
template management, PHI detection, context building, and usage tracking.
"""

import logging
from datetime import datetime
from typing import Any, AsyncIterator, Optional
from uuid import UUID

from researchhub.ai.providers.base import AIMessage, AIProvider, AIResponse
from researchhub.ai.providers.anthropic import AnthropicProvider
from researchhub.ai.providers.azure_openai import AzureOpenAIProvider
from researchhub.ai.providers.gemini import GeminiProvider
from researchhub.ai.phi_detector import PHIDetector, PHIDetectionResult
from researchhub.ai.templates import DEFAULT_TEMPLATES, render_template
from researchhub.ai.schemas import AIFeatureName, DocumentAction, SummaryType
from researchhub.ai.exceptions import (
    AIFeatureDisabledError,
    AITemplateNotFoundError,
    AIPHIDetectedError,
)
from researchhub.config import get_settings

logger = logging.getLogger(__name__)


class AIService:
    """Central orchestrator for AI interactions.

    Handles all AI requests by:
    1. Validating feature availability
    2. Loading and rendering prompt templates
    3. Building context from related entities
    4. Checking for PHI
    5. Routing to the appropriate provider
    6. Logging usage for tracking

    Example:
        ```python
        service = AIService()

        response = await service.generate(
            user_id=user.id,
            organization_id=org.id,
            feature_name=AIFeatureName.DOCUMENT_ASSISTANT,
            template_key="document_expand",
            variables={
                "selected_text": "Patients were randomized.",
                "document_type": "study protocol"
            }
        )
        print(response.content)
        ```
    """

    def __init__(self):
        """Initialize the AI service."""
        self.settings = get_settings()
        self.phi_detector = PHIDetector()
        self._providers: dict[str, AIProvider] = {}

    def _get_provider(self, provider_name: Optional[str] = None) -> AIProvider:
        """Get or create an AI provider instance.

        Args:
            provider_name: Provider to use ('anthropic' or 'azure_openai')
                          Uses default from settings if not specified.

        Returns:
            AIProvider instance
        """
        provider_name = provider_name or self.settings.ai_primary_provider

        if provider_name in self._providers:
            return self._providers[provider_name]

        if provider_name == "anthropic":
            api_key = self.settings.anthropic_api_key.get_secret_value()
            if not api_key:
                raise ValueError("Anthropic API key not configured")

            provider = AnthropicProvider(
                api_key=api_key,
                default_model=self.settings.anthropic_model,
            )
        elif provider_name == "azure_openai":
            api_key = self.settings.azure_openai_api_key.get_secret_value()
            endpoint = self.settings.azure_openai_endpoint
            if not api_key or not endpoint:
                raise ValueError("Azure OpenAI not fully configured")

            provider = AzureOpenAIProvider(
                endpoint=endpoint,
                api_key=api_key,
                deployment=self.settings.azure_openai_deployment,
            )
        elif provider_name == "gemini":
            api_key = self.settings.gemini_api_key.get_secret_value()
            if not api_key:
                raise ValueError("Gemini API key not configured")

            provider = GeminiProvider(
                api_key=api_key,
                default_model=self.settings.gemini_model,
            )
        else:
            raise ValueError(f"Unknown provider: {provider_name}")

        self._providers[provider_name] = provider
        return provider

    def _get_template(
        self,
        template_key: str,
        organization_id: Optional[UUID] = None,
    ) -> dict:
        """Get a prompt template by key.

        First checks for organization-specific custom template,
        then falls back to default templates.

        Args:
            template_key: Template identifier
            organization_id: Organization for custom templates

        Returns:
            Template dictionary

        Raises:
            AITemplateNotFoundError: If template doesn't exist
        """
        # TODO: Check database for custom org template first
        # custom = await self.db.get_custom_template(organization_id, template_key)
        # if custom:
        #     return custom

        if template_key in DEFAULT_TEMPLATES:
            return DEFAULT_TEMPLATES[template_key]

        raise AITemplateNotFoundError(template_key)

    def _build_messages(
        self,
        template: dict,
        variables: dict[str, Any],
    ) -> list[AIMessage]:
        """Build AI messages from a template and variables.

        Args:
            template: Template dictionary with system_prompt and user_prompt_template
            variables: Variables to substitute in templates

        Returns:
            List of AIMessage objects
        """
        messages = []

        # System message
        if template.get("system_prompt"):
            system_content = render_template(template["system_prompt"], variables)
            messages.append(AIMessage(role="system", content=system_content))

        # User message
        if template.get("user_prompt_template"):
            user_content = render_template(template["user_prompt_template"], variables)
            messages.append(AIMessage(role="user", content=user_content))

        return messages

    async def _check_feature_enabled(
        self,
        organization_id: UUID,
        feature_name: AIFeatureName,
    ) -> bool:
        """Check if an AI feature is enabled for the organization.

        Args:
            organization_id: Organization to check
            feature_name: Feature to check

        Returns:
            True if enabled

        Raises:
            AIFeatureDisabledError: If feature is disabled
        """
        # Global feature flag
        if not self.settings.feature_ai_enabled:
            raise AIFeatureDisabledError(feature_name.value)

        # TODO: Check organization-specific settings from database
        # org_settings = await self.db.get_org_ai_settings(organization_id)
        # if not org_settings.features.get(feature_name.value, False):
        #     raise AIFeatureDisabledError(feature_name.value)

        return True

    async def _check_phi(
        self,
        content: str,
        organization_id: UUID,
    ) -> tuple[PHIDetectionResult, str]:
        """Check content for PHI and apply organization policy.

        Args:
            content: Content to check
            organization_id: Organization for policy lookup

        Returns:
            Tuple of (detection result, processed content)

        Raises:
            AIPHIDetectedError: If PHI found and policy is 'block'
        """
        # TODO: Get organization PHI policy from database
        # policy = await self.db.get_org_phi_policy(organization_id)
        policy = "warn"  # Default to warn for now

        return await self.phi_detector.detect_and_decide(content, policy)

    async def _log_usage(
        self,
        organization_id: UUID,
        user_id: UUID,
        feature_name: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        latency_ms: Optional[int] = None,
    ) -> None:
        """Log AI usage for tracking and billing.

        Args:
            organization_id: Organization
            user_id: User who made the request
            feature_name: Feature used
            model: Model used
            input_tokens: Input token count
            output_tokens: Output token count
            latency_ms: Request latency
        """
        # TODO: Save to database
        # await self.db.create_usage_log(
        #     organization_id=organization_id,
        #     user_id=user_id,
        #     feature_name=feature_name,
        #     model=model,
        #     input_tokens=input_tokens,
        #     output_tokens=output_tokens,
        #     latency_ms=latency_ms,
        # )
        logger.info(
            "AI usage",
            extra={
                "organization_id": str(organization_id),
                "user_id": str(user_id),
                "feature_name": feature_name,
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "latency_ms": latency_ms,
            },
        )

    async def generate(
        self,
        user_id: UUID,
        organization_id: UUID,
        feature_name: AIFeatureName,
        template_key: str,
        variables: dict[str, Any],
        provider_name: Optional[str] = None,
    ) -> AIResponse:
        """Generate AI content using a template.

        This is the main entry point for non-streaming AI generation.

        Args:
            user_id: User making the request
            organization_id: User's organization
            feature_name: AI feature being used
            template_key: Template to use
            variables: Template variables
            provider_name: Optional provider override

        Returns:
            AIResponse with generated content

        Raises:
            AIFeatureDisabledError: If feature is disabled
            AITemplateNotFoundError: If template doesn't exist
            AIPHIDetectedError: If PHI detected and policy is block
            AIProviderError: If provider request fails
        """
        # 1. Check feature enabled
        await self._check_feature_enabled(organization_id, feature_name)

        # 2. Get template
        template = self._get_template(template_key, organization_id)

        # 3. Build messages
        messages = self._build_messages(template, variables)

        # 4. PHI check on combined content
        combined_content = " ".join(m.content for m in messages)
        phi_result, processed_content = await self._check_phi(
            combined_content,
            organization_id,
        )

        # If content was redacted, rebuild messages with redacted content
        if phi_result.redacted_text:
            # For simplicity, we'll just use the original messages
            # In production, you'd want to rebuild with redacted content
            pass

        # 5. Get provider
        provider = self._get_provider(provider_name)

        # 6. Execute
        response = await provider.complete(
            messages=messages,
            temperature=template.get("temperature", 0.7),
            max_tokens=template.get("max_tokens", 2000),
        )

        # 7. Log usage
        await self._log_usage(
            organization_id=organization_id,
            user_id=user_id,
            feature_name=feature_name.value,
            model=response.model,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            latency_ms=response.latency_ms,
        )

        return response

    async def generate_stream(
        self,
        user_id: UUID,
        organization_id: UUID,
        feature_name: AIFeatureName,
        template_key: str,
        variables: dict[str, Any],
        provider_name: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """Generate AI content with streaming.

        Similar to generate() but yields content chunks as they arrive.

        Args:
            user_id: User making the request
            organization_id: User's organization
            feature_name: AI feature being used
            template_key: Template to use
            variables: Template variables
            provider_name: Optional provider override

        Yields:
            String chunks of generated content

        Raises:
            Same exceptions as generate()
        """
        # 1. Check feature enabled
        await self._check_feature_enabled(organization_id, feature_name)

        # 2. Get template
        template = self._get_template(template_key, organization_id)

        # 3. Build messages
        messages = self._build_messages(template, variables)

        # 4. PHI check
        combined_content = " ".join(m.content for m in messages)
        phi_result, _ = await self._check_phi(combined_content, organization_id)

        # 5. Get provider
        provider = self._get_provider(provider_name)

        # 6. Stream
        async for chunk in provider.stream(
            messages=messages,
            temperature=template.get("temperature", 0.7),
            max_tokens=template.get("max_tokens", 2000),
        ):
            yield chunk

        # Note: Usage logging for streaming is more complex
        # Would need to track token counts differently

    # =========================================================================
    # Convenience methods for specific features
    # =========================================================================

    async def document_action(
        self,
        user_id: UUID,
        organization_id: UUID,
        action: DocumentAction,
        document_id: UUID,
        selected_text: Optional[str] = None,
        document_type: Optional[str] = None,
        surrounding_context: Optional[str] = None,
        previous_content: Optional[str] = None,
        instructions: Optional[str] = None,
    ) -> AIResponse:
        """Perform a document quick action.

        Args:
            user_id: User making the request
            organization_id: User's organization
            action: Action to perform (expand, simplify, etc.)
            document_id: Document being edited
            selected_text: Text selected by user (for expand, simplify, formalize)
            document_type: Type of document
            surrounding_context: Text around selection
            previous_content: Previous content (for continue)
            instructions: Additional user instructions

        Returns:
            AIResponse with generated content
        """
        # Map action to template
        template_map = {
            DocumentAction.EXPAND: "document_expand",
            DocumentAction.SIMPLIFY: "document_simplify",
            DocumentAction.CONTINUE: "document_continue",
            DocumentAction.STRUCTURE: "document_structure",
            DocumentAction.FORMALIZE: "document_formalize",
        }

        template_key = template_map[action]

        variables = {
            "document_type": document_type,
            "selected_text": selected_text,
            "surrounding_context": surrounding_context,
            "previous_content": previous_content,
            "instructions": instructions,
        }

        return await self.generate(
            user_id=user_id,
            organization_id=organization_id,
            feature_name=AIFeatureName.DOCUMENT_ASSISTANT,
            template_key=template_key,
            variables=variables,
        )

    async def summarize_paper(
        self,
        user_id: UUID,
        organization_id: UUID,
        paper_id: UUID,
        title: str,
        abstract: str,
        summary_type: SummaryType = SummaryType.GENERAL,
        authors: Optional[str] = None,
        journal: Optional[str] = None,
        year: Optional[int] = None,
        full_text: Optional[str] = None,
    ) -> AIResponse:
        """Summarize an academic paper.

        Args:
            user_id: User making the request
            organization_id: User's organization
            paper_id: Paper being summarized
            title: Paper title
            abstract: Paper abstract
            summary_type: Type of summary to generate
            authors: Paper authors
            journal: Journal name
            year: Publication year
            full_text: Full paper text if available

        Returns:
            AIResponse with summary
        """
        template_map = {
            SummaryType.GENERAL: "paper_summarize_general",
            SummaryType.METHODS: "paper_summarize_methods",
            SummaryType.FINDINGS: "paper_summarize_findings",
        }

        template_key = template_map[summary_type]

        variables = {
            "title": title,
            "abstract": abstract,
            "authors": authors,
            "journal": journal,
            "year": year,
            "full_text": full_text,
        }

        return await self.generate(
            user_id=user_id,
            organization_id=organization_id,
            feature_name=AIFeatureName.KNOWLEDGE_SUMMARIZATION,
            template_key=template_key,
            variables=variables,
        )

    async def suggest_review_comments(
        self,
        user_id: UUID,
        organization_id: UUID,
        document_id: UUID,
        document_content: str,
        document_type: Optional[str] = None,
        focus_areas: Optional[list[str]] = None,
    ) -> AIResponse:
        """Suggest review comments for a document.

        Args:
            user_id: User making the request
            organization_id: User's organization
            document_id: Document being reviewed
            document_content: Full document content
            document_type: Type of document
            focus_areas: Areas to focus review on

        Returns:
            AIResponse with suggested comments
        """
        variables = {
            "document_type": document_type,
            "document_content": document_content,
            "focus_areas": focus_areas,
        }

        return await self.generate(
            user_id=user_id,
            organization_id=organization_id,
            feature_name=AIFeatureName.REVIEW_HELPER,
            template_key="review_suggest",
            variables=variables,
        )

    async def extract_tasks_from_notes(
        self,
        user_id: UUID,
        organization_id: UUID,
        notes: str,
        project_name: Optional[str] = None,
        team_members: Optional[list[str]] = None,
    ) -> AIResponse:
        """Extract tasks from meeting notes or text.

        Args:
            user_id: User making the request
            organization_id: User's organization
            notes: Text to extract tasks from
            project_name: Name of target project
            team_members: Team member names for assignee matching

        Returns:
            AIResponse with extracted tasks
        """
        variables = {
            "notes": notes,
            "project_name": project_name,
            "team_members": team_members,
        }

        return await self.generate(
            user_id=user_id,
            organization_id=organization_id,
            feature_name=AIFeatureName.TASK_GENERATION,
            template_key="task_from_notes",
            variables=variables,
        )


# Global service instance
_ai_service: Optional[AIService] = None


def get_ai_service() -> AIService:
    """Get the global AI service instance.

    Returns:
        AIService singleton
    """
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service
