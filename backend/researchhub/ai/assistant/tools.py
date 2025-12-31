"""Tool registry for the AI Assistant.

Defines all available tools (queries and actions) that the AI can call.
Supports Tier 1 (always available) and Tier 2 (loaded on demand) tools.
"""

import re
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Set, TYPE_CHECKING
from uuid import UUID

from researchhub.ai.providers.base import ToolDefinition

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from researchhub.ai.assistant.schemas import ActionPreview


# Tier 2 tool triggers - keywords that indicate which tools should be loaded
TIER2_TRIGGERS: Dict[str, List[str]] = {
    # Team/collaboration tools
    "team_activity": ["team activity", "what's everyone", "team updates", "recent activity"],
    "workload": ["workload", "who has capacity", "bandwidth", "availability"],
    "collaborators": ["collaborators", "who worked on", "who contributed"],

    # Journal tools
    "journal": ["journal", "daily log", "reflection", "notes for today", "diary"],

    # System documentation tools
    "system_docs": ["help", "how do i", "documentation", "guide", "tutorial", "learn how"],

    # Dynamic query (complex cross-entity queries)
    "dynamic_query": ["complex query", "custom filter", "advanced search", "sql-like"],
}


def detect_tier2_tools(user_message: str) -> Set[str]:
    """Detect which Tier 2 tool categories to load based on user message.

    Args:
        user_message: The user's message to analyze

    Returns:
        Set of Tier 2 tool category names to load
    """
    tools_to_load: Set[str] = set()
    message_lower = user_message.lower()

    for tool_category, triggers in TIER2_TRIGGERS.items():
        for trigger in triggers:
            if trigger in message_lower:
                tools_to_load.add(tool_category)
                break  # Found a match for this category, move to next

    return tools_to_load


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

    def load_tier2_tools(self, categories: Set[str]) -> List[str]:
        """Dynamically load Tier 2 tools based on detected categories.

        This method is called when user message triggers suggest additional tools
        should be made available. Tools are only loaded once (idempotent).

        Args:
            categories: Set of Tier 2 category names to load

        Returns:
            List of tool names that were newly loaded
        """
        loaded: List[str] = []

        if "team_activity" in categories:
            if "get_team_activity" not in self._query_tools:
                from researchhub.ai.assistant.queries.collaboration import GetTeamActivityTool
                tool = GetTeamActivityTool()
                self._query_tools[tool.name] = tool
                loaded.append(tool.name)

            if "get_recent_activity" not in self._query_tools:
                from researchhub.ai.assistant.queries.collaboration import GetRecentActivityTool
                tool = GetRecentActivityTool()
                self._query_tools[tool.name] = tool
                loaded.append(tool.name)

        if "workload" in categories:
            if "get_user_workload" not in self._query_tools:
                from researchhub.ai.assistant.queries.collaboration import GetUserWorkloadTool
                tool = GetUserWorkloadTool()
                self._query_tools[tool.name] = tool
                loaded.append(tool.name)

        if "collaborators" in categories:
            if "get_collaborators" not in self._query_tools:
                from researchhub.ai.assistant.queries.collaboration import GetCollaboratorsTool
                tool = GetCollaboratorsTool()
                self._query_tools[tool.name] = tool
                loaded.append(tool.name)

        if "journal" in categories:
            if "create_journal_entry" not in self._action_tools:
                from researchhub.ai.assistant.actions.journal import (
                    CreateJournalEntryTool,
                    UpdateJournalEntryTool,
                    LinkJournalEntryTool,
                )
                for tool_cls in [CreateJournalEntryTool, UpdateJournalEntryTool, LinkJournalEntryTool]:
                    tool = tool_cls()
                    self._action_tools[tool.name] = tool
                    loaded.append(tool.name)

        if "system_docs" in categories:
            if "list_system_docs" not in self._query_tools:
                from researchhub.ai.assistant.queries.system_docs import (
                    ListSystemDocsTool,
                    SearchSystemDocsTool,
                    ReadSystemDocTool,
                )
                for tool_cls in [ListSystemDocsTool, SearchSystemDocsTool, ReadSystemDocTool]:
                    tool = tool_cls()
                    self._query_tools[tool.name] = tool
                    loaded.append(tool.name)

        if "dynamic_query" in categories:
            if "dynamic_query" not in self._query_tools:
                from researchhub.ai.assistant.queries.dynamic import DynamicQueryTool
                tool = DynamicQueryTool()
                self._query_tools[tool.name] = tool
                loaded.append(tool.name)

        return loaded

    def get_loaded_tool_names(self) -> List[str]:
        """Get names of all currently loaded tools."""
        return list(self._query_tools.keys()) + list(self._action_tools.keys())


def create_default_registry(
    use_dynamic_queries: bool = False,
    use_unified_tools: bool = True,
) -> ToolRegistry:
    """Create a registry with all default tools.

    Args:
        use_dynamic_queries: If True, disables specialized query tools
            (get_projects, get_tasks, etc.) to force use of dynamic_query.
            Useful for testing the dynamic query tool's capabilities.
        use_unified_tools: If True, uses consolidated tools (search, get_details,
            get_items) instead of individual query tools. Reduces tool count
            from ~38 to ~18 for better LLM tool selection accuracy.
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
    from researchhub.ai.assistant.queries.dynamic import DynamicQueryTool
    from researchhub.ai.assistant.queries.collaboration import (
        GetTeamActivityTool,
        GetUserWorkloadTool,
        GetCollaboratorsTool,
        GetRecentActivityTool,
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
    from researchhub.ai.assistant.actions.projects import (
        CreateProjectTool,
        UpdateProjectTool,
        ArchiveProjectTool,
    )
    from researchhub.ai.assistant.actions.journal import (
        CreateJournalEntryTool,
        UpdateJournalEntryTool,
        LinkJournalEntryTool,
    )
    from researchhub.ai.assistant.actions.unified import (
        UnifiedCreateTool,
        UnifiedUpdateTool,
        CompleteTool as UnifiedCompleteTool,
    )

    registry = ToolRegistry()

    # Register query tools based on mode
    if use_unified_tools:
        # Consolidated tools - reduces tool count for better LLM accuracy
        # Based on research: optimal performance at 15-20 tools
        registry.register_query(UnifiedSearchTool())  # Combines search_content, semantic, hybrid
        registry.register_query(GetDetailsTool())     # Combines all get_*_details tools
        registry.register_query(GetItemsTool())       # Combines all get_* list tools
        registry.register_query(GetAttentionSummaryTool())  # Keep for attention/overdue queries
        registry.register_query(GetTeamMembersTool())  # Keep for user lookup
        registry.register_query(ThinkTool())
        registry.register_query(AskUserTool())
        # Note: System docs and collaboration tools are Tier 2 (loaded on demand)
    elif use_dynamic_queries:
        # Dynamic query mode - use dynamic_query for everything
        registry.register_query(DynamicQueryTool())
        registry.register_query(GetTeamMembersTool())
        registry.register_query(SemanticSearchTool())
        registry.register_query(HybridSearchTool())
        registry.register_query(ThinkTool())
        registry.register_query(AskUserTool())
    else:
        # Original mode - all individual tools (38 total)
        registry.register_query(GetProjectsTool())
        registry.register_query(GetProjectDetailsTool())
        registry.register_query(GetTasksTool())
        registry.register_query(GetTaskDetailsTool())
        registry.register_query(GetBlockersTool())
        registry.register_query(GetDocumentsTool())
        registry.register_query(GetDocumentDetailsTool())
        registry.register_query(SearchContentTool())
        registry.register_query(GetAttentionSummaryTool())
        registry.register_query(GetTeamMembersTool())
        registry.register_query(SemanticSearchTool())
        registry.register_query(HybridSearchTool())
        registry.register_query(ListSystemDocsTool())
        registry.register_query(SearchSystemDocsTool())
        registry.register_query(ReadSystemDocTool())
        registry.register_query(DynamicQueryTool())
        registry.register_query(GetTeamActivityTool())
        registry.register_query(GetUserWorkloadTool())
        registry.register_query(GetCollaboratorsTool())
        registry.register_query(GetRecentActivityTool())
        registry.register_query(ThinkTool())
        registry.register_query(AskUserTool())

    # Register action tools based on mode
    if use_unified_tools:
        # Consolidated action tools - reduces tool count from 16 to 6
        # create: task, blocker, document, project, comment
        # update: task, document, project
        # complete: task, blocker (resolve)
        registry.register_action(UnifiedCreateTool())
        registry.register_action(UnifiedUpdateTool())
        registry.register_action(UnifiedCompleteTool())
        registry.register_action(AssignTaskTool())  # Keep separate - clear single purpose
        registry.register_action(LinkDocumentToTaskTool())  # Keep - specialized linking
        registry.register_action(ArchiveProjectTool())  # Keep - specialized archive
        # Note: Journal tools are Tier 2 (loaded on demand)
    else:
        # Original mode - all individual action tools (16 total)
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

        # Register project action tools
        registry.register_action(CreateProjectTool())
        registry.register_action(UpdateProjectTool())
        registry.register_action(ArchiveProjectTool())

        # Register journal entry action tools
        registry.register_action(CreateJournalEntryTool())
        registry.register_action(UpdateJournalEntryTool())
        registry.register_action(LinkJournalEntryTool())

    return registry
