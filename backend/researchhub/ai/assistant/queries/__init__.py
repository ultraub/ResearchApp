"""Query tools for the AI Assistant."""

from researchhub.ai.assistant.queries.projects import (
    GetProjectsTool,
    GetProjectDetailsTool,
)
from researchhub.ai.assistant.queries.tasks import (
    GetTasksTool,
    GetTaskDetailsTool,
)
from researchhub.ai.assistant.queries.blockers import GetBlockersTool
from researchhub.ai.assistant.queries.documents import (
    GetDocumentsTool,
    GetDocumentDetailsTool,
)
from researchhub.ai.assistant.queries.search import SearchContentTool
from researchhub.ai.assistant.queries.semantic_search import (
    SemanticSearchTool,
    HybridSearchTool,
)
from researchhub.ai.assistant.queries.attention import GetAttentionSummaryTool
from researchhub.ai.assistant.queries.members import GetTeamMembersTool
from researchhub.ai.assistant.queries.system_docs import (
    ListSystemDocsTool,
    SearchSystemDocsTool,
    ReadSystemDocTool,
)
from researchhub.ai.assistant.queries.strategic import (
    ThinkTool,
    AskUserTool,
)
from researchhub.ai.assistant.queries.unified import (
    UnifiedSearchTool,
    GetDetailsTool,
    GetItemsTool,
)

__all__ = [
    "GetProjectsTool",
    "GetProjectDetailsTool",
    "GetTasksTool",
    "GetTaskDetailsTool",
    "GetBlockersTool",
    "GetDocumentsTool",
    "GetDocumentDetailsTool",
    "SearchContentTool",
    "SemanticSearchTool",
    "HybridSearchTool",
    "GetAttentionSummaryTool",
    "GetTeamMembersTool",
    "ListSystemDocsTool",
    "SearchSystemDocsTool",
    "ReadSystemDocTool",
    "ThinkTool",
    "AskUserTool",
    # Unified tools (consolidated)
    "UnifiedSearchTool",
    "GetDetailsTool",
    "GetItemsTool",
]
