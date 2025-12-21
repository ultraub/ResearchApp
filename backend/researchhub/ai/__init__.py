"""AI module for Pasteur.

Provides intelligent assistance across the platform through a provider-agnostic
architecture, supporting document writing, knowledge analysis, task generation,
and search enhancement.
"""

from researchhub.ai.providers.base import AIProvider, AIMessage, AIResponse
from researchhub.ai.schemas import (
    AIGenerateRequest,
    AIGenerateResponse,
    AIConversationCreate,
    AIConversationResponse,
    AIDocumentActionRequest,
    AIKnowledgeSummarizeRequest,
    AITaskExtractionRequest,
)
from researchhub.ai.service import AIService
from researchhub.ai.phi_detector import PHIDetector

__all__ = [
    # Providers
    "AIProvider",
    "AIMessage",
    "AIResponse",
    # Schemas
    "AIGenerateRequest",
    "AIGenerateResponse",
    "AIConversationCreate",
    "AIConversationResponse",
    "AIDocumentActionRequest",
    "AIKnowledgeSummarizeRequest",
    "AITaskExtractionRequest",
    # Service
    "AIService",
    "PHIDetector",
]
