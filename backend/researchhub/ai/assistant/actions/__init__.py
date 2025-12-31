"""Action tools for the AI Assistant."""

from researchhub.ai.assistant.actions.tasks import (
    CreateTaskTool,
    UpdateTaskTool,
    CompleteTaskTool,
    AssignTaskTool,
)
from researchhub.ai.assistant.actions.blockers import (
    CreateBlockerTool,
    ResolveBlockerTool,
)
from researchhub.ai.assistant.actions.documents import (
    CreateDocumentTool,
    UpdateDocumentTool,
    LinkDocumentToTaskTool,
)
from researchhub.ai.assistant.actions.comments import AddCommentTool
from researchhub.ai.assistant.actions.unified import (
    UnifiedCreateTool,
    UnifiedUpdateTool,
    CompleteTool,
)

__all__ = [
    # Original individual tools
    "CreateTaskTool",
    "UpdateTaskTool",
    "CompleteTaskTool",
    "AssignTaskTool",
    "CreateBlockerTool",
    "ResolveBlockerTool",
    "CreateDocumentTool",
    "UpdateDocumentTool",
    "LinkDocumentToTaskTool",
    "AddCommentTool",
    # Unified tools (consolidated)
    "UnifiedCreateTool",
    "UnifiedUpdateTool",
    "CompleteTool",
]
