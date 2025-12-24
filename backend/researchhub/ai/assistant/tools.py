"""Tool registry for the AI Assistant.

Defines all available tools (queries and actions) that the AI can call.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, TYPE_CHECKING
from uuid import UUID

from researchhub.ai.providers.base import ToolDefinition

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from researchhub.ai.assistant.schemas import ActionPreview


class BaseTool(ABC):
    """Base class for all assistant tools."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique identifier for the tool."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable description of what the tool does."""
        pass

    @property
    @abstractmethod
    def input_schema(self) -> dict:
        """JSON Schema for the tool's input parameters."""
        pass

    @property
    def is_action(self) -> bool:
        """Whether this tool modifies data (requires approval)."""
        return False

    def to_definition(self) -> ToolDefinition:
        """Convert to ToolDefinition for the provider."""
        return ToolDefinition(
            name=self.name,
            description=self.description,
            input_schema=self.input_schema,
        )

    @abstractmethod
    async def execute(
        self,
        input: Dict[str, Any],
        db: "AsyncSession",
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Execute the tool and return results."""
        pass


class QueryTool(BaseTool):
    """Base class for read-only query tools."""

    @property
    def is_action(self) -> bool:
        return False


class ActionTool(BaseTool):
    """Base class for tools that modify data."""

    @property
    def is_action(self) -> bool:
        return True

    @property
    @abstractmethod
    def entity_type(self) -> str:
        """The type of entity this action modifies."""
        pass

    async def get_old_state(
        self,
        input: Dict[str, Any],
        db: "AsyncSession",
    ) -> Optional[Dict[str, Any]]:
        """Get the current state of the entity being modified.

        Override this for update/delete actions to capture state for diff.
        """
        return None

    def calculate_new_state(
        self,
        input: Dict[str, Any],
        old_state: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Calculate what the new state will be after the action."""
        # Default: just return the input as the new state
        return input

    def generate_description(
        self,
        input: Dict[str, Any],
        old_state: Optional[Dict[str, Any]],
    ) -> str:
        """Generate a human-readable description of the action."""
        return f"{self.name}: {self.entity_type}"

    async def execute(
        self,
        input: Dict[str, Any],
        db: "AsyncSession",
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Action tools don't execute directly - they go through the approval flow.

        Use create_preview() to generate a preview for user approval,
        then use ActionExecutor to execute approved actions.
        """
        raise NotImplementedError(
            f"Action tool '{self.name}' requires user approval. "
            "Use create_preview() to generate a preview, then execute via ActionExecutor."
        )

    @abstractmethod
    async def create_preview(
        self,
        input: Dict[str, Any],
        db: "AsyncSession",
        user_id: UUID,
        org_id: UUID,
    ) -> "ActionPreview":
        """Create a preview of the action for user approval."""
        pass


class ToolRegistry:
    """Registry of available tools for the assistant."""

    def __init__(self):
        self._query_tools: Dict[str, QueryTool] = {}
        self._action_tools: Dict[str, ActionTool] = {}

    def register_query(self, tool: QueryTool) -> None:
        """Register a query tool."""
        self._query_tools[tool.name] = tool

    def register_action(self, tool: ActionTool) -> None:
        """Register an action tool."""
        self._action_tools[tool.name] = tool

    def get_tool(self, name: str) -> Optional[BaseTool]:
        """Get a tool by name."""
        return self._query_tools.get(name) or self._action_tools.get(name)

    def is_query_tool(self, name: str) -> bool:
        """Check if a tool is a query (read-only) tool."""
        return name in self._query_tools

    def is_action_tool(self, name: str) -> bool:
        """Check if a tool is an action (requires approval) tool."""
        return name in self._action_tools

    def get_all_tools(self) -> List[ToolDefinition]:
        """Get all tools as ToolDefinitions for the provider."""
        tools = []
        for tool in self._query_tools.values():
            tools.append(tool.to_definition())
        for tool in self._action_tools.values():
            tools.append(tool.to_definition())
        return tools

    def get_query_tools(self) -> List[QueryTool]:
        """Get all query tools."""
        return list(self._query_tools.values())

    def get_action_tools(self) -> List[ActionTool]:
        """Get all action tools."""
        return list(self._action_tools.values())


def create_default_registry(use_dynamic_queries: bool = False) -> ToolRegistry:
    """Create a registry with all default tools.

    Args:
        use_dynamic_queries: If True, disables specialized query tools
            (get_projects, get_tasks, etc.) to force use of dynamic_query.
            Useful for testing the dynamic query tool's capabilities.
    """
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
    from researchhub.ai.assistant.queries.attention import GetAttentionSummaryTool
    from researchhub.ai.assistant.queries.members import GetTeamMembersTool
    from researchhub.ai.assistant.queries.system_docs import (
        ListSystemDocsTool,
        SearchSystemDocsTool,
        ReadSystemDocTool,
    )
    from researchhub.ai.assistant.queries.dynamic import DynamicQueryTool

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
    from researchhub.ai.assistant.actions.comments import AddCommentTool
    from researchhub.ai.assistant.actions.documents import (
        CreateDocumentTool,
        UpdateDocumentTool,
        LinkDocumentToTaskTool,
    )

    registry = ToolRegistry()

    # Register query tools
    # These specialized tools can be replaced by dynamic_query
    if not use_dynamic_queries:
        registry.register_query(GetProjectsTool())
        registry.register_query(GetProjectDetailsTool())
        registry.register_query(GetTasksTool())
        registry.register_query(GetTaskDetailsTool())
        registry.register_query(GetBlockersTool())
        registry.register_query(GetDocumentsTool())
        registry.register_query(GetDocumentDetailsTool())

    # These tools have unique functionality not replicated by dynamic_query
    registry.register_query(SearchContentTool())  # Full-text search
    registry.register_query(GetAttentionSummaryTool())  # Complex aggregation
    registry.register_query(GetTeamMembersTool())  # User lookup

    # Register system documentation tools
    registry.register_query(ListSystemDocsTool())
    registry.register_query(SearchSystemDocsTool())
    registry.register_query(ReadSystemDocTool())

    # Register dynamic query tool
    # When use_dynamic_queries=True, this is the primary query mechanism
    registry.register_query(DynamicQueryTool())

    # Register action tools
    registry.register_action(CreateTaskTool())
    registry.register_action(UpdateTaskTool())
    registry.register_action(CompleteTaskTool())
    registry.register_action(AssignTaskTool())
    registry.register_action(CreateBlockerTool())
    registry.register_action(ResolveBlockerTool())
    registry.register_action(AddCommentTool())
    registry.register_action(CreateDocumentTool())
    registry.register_action(UpdateDocumentTool())
    registry.register_action(LinkDocumentToTaskTool())

    return registry
