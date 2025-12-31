"""Tool budget management for the AI Assistant.

Manages separate budgets for different tool types to enable efficient
tool usage while preventing runaway queries.
"""

from typing import Dict, Optional, Set


class ToolBudget:
    """Manages separate budgets for different tool types.

    Budget Types:
    - Query: Tools that fetch data (get_*, search_*, dynamic_query)
    - Action: Tools that modify data (create_*, update_*, etc.)
    - Meta: Strategic tools (think, ask_user)

    Reset Triggers:
    - New user message: Resets query and meta budgets
    - After ask_user completes: Partial query budget restore
    - After action executed: Small query budget restore
    """

    # Tool type classification
    QUERY_TOOLS: Set[str] = {
        "get_projects",
        "get_project_details",
        "get_tasks",
        "get_task_details",
        "get_blockers",
        "get_documents",
        "get_document_details",
        "search_content",
        "semantic_search",
        "hybrid_search",
        "dynamic_query",
        "get_team_members",
        "get_attention_summary",
        "get_team_activity",
        "get_user_workload",
        "get_collaborators",
        "get_recent_activity",
        "list_system_docs",
        "search_system_docs",
        "read_system_doc",
    }

    ACTION_TOOLS: Set[str] = {
        "create_task",
        "update_task",
        "complete_task",
        "assign_task",
        "create_blocker",
        "resolve_blocker",
        "add_comment",
        "create_document",
        "update_document",
        "link_document_to_task",
        "create_project",
        "update_project",
        "archive_project",
        "create_journal_entry",
        "update_journal_entry",
        "link_journal_entry",
    }

    META_TOOLS: Set[str] = {"think", "ask_user"}

    def __init__(
        self,
        query_limit: int = 4,
        action_limit: int = 15,
        meta_limit: int = 3,
    ):
        """Initialize budget with configurable limits.

        Args:
            query_limit: Max query tool calls per request (default 4)
            action_limit: Max action tool calls per session (default 15)
            meta_limit: Max meta tool calls per request (default 3)
        """
        self.query_limit = query_limit
        self.action_limit = action_limit
        self.meta_limit = meta_limit

        self.query_calls = 0
        self.action_calls = 0
        self.meta_calls = 0

        self.awaiting_user_response = False

        # Track when user clarification is required (blocks further queries)
        self.requires_user_clarification = False
        self.clarification_reason: str | None = None

    def get_tool_type(self, tool_name: str) -> str:
        """Classify a tool by its type.

        Args:
            tool_name: Name of the tool

        Returns:
            One of: "meta", "action", "query"
        """
        if tool_name in self.META_TOOLS:
            return "meta"
        elif tool_name in self.ACTION_TOOLS:
            return "action"
        else:
            # Default to query for unknown tools (safer)
            return "query"

    def record_call(self, tool_name: str) -> Dict[str, any]:
        """Record a tool call and return updated budget status.

        Args:
            tool_name: Name of the tool being called

        Returns:
            Current budget status dict
        """
        tool_type = self.get_tool_type(tool_name)

        if tool_type == "meta":
            self.meta_calls += 1
            # Track if we're waiting for user response
            if tool_name == "ask_user":
                self.awaiting_user_response = True
        elif tool_type == "query":
            self.query_calls += 1
        elif tool_type == "action":
            self.action_calls += 1

        return self.get_status()

    def get_status(self) -> Dict[str, Dict[str, int]]:
        """Get current budget status for all types.

        Returns:
            Dict with status for each budget type
        """
        return {
            "query": {
                "used": self.query_calls,
                "limit": self.query_limit,
                "remaining": max(0, self.query_limit - self.query_calls),
            },
            "action": {
                "used": self.action_calls,
                "limit": self.action_limit,
                "remaining": max(0, self.action_limit - self.action_calls),
            },
            "meta": {
                "used": self.meta_calls,
                "limit": self.meta_limit,
                "remaining": max(0, self.meta_limit - self.meta_calls),
            },
        }

    def set_requires_clarification(self, reason: str) -> None:
        """Mark that user clarification is required before proceeding.

        When this is set, further query calls will be blocked until
        the user clarifies via ask_user.
        """
        self.requires_user_clarification = True
        self.clarification_reason = reason

    def is_blocked_for_clarification(self) -> bool:
        """Check if queries are blocked pending user clarification."""
        return self.requires_user_clarification

    def get_injection_message(self) -> Optional[str]:
        """Check if we should inject an internal directive.

        Returns:
            Directive message if needed, None otherwise.
            IMPORTANT: These are internal directives - never expose to user.
        """
        # Clarification required takes priority
        if self.requires_user_clarification:
            return (
                f"[Internal: {self.clarification_reason} "
                "Call ask_user now with options. Do not mention this to user.]"
            )

        query_remaining = self.query_limit - self.query_calls
        meta_remaining = self.meta_limit - self.meta_calls

        # Query limit reached - respond now
        if query_remaining <= 0:
            return (
                "[Internal: Respond now with gathered information. "
                "Do not mention any limits to the user.]"
            )
        elif query_remaining == 1:
            return "[Internal: One more query available, then respond.]"
        elif query_remaining == 2:
            return "[Internal: Consider responding if you have enough information.]"

        # Meta limit reached
        if meta_remaining <= 0:
            return "[Internal: Proceed with response.]"

        return None

    def is_query_exhausted(self) -> bool:
        """Check if query budget is exhausted."""
        return self.query_calls >= self.query_limit

    def is_action_exhausted(self) -> bool:
        """Check if action budget is exhausted."""
        return self.action_calls >= self.action_limit

    def is_meta_exhausted(self) -> bool:
        """Check if meta budget is exhausted."""
        return self.meta_calls >= self.meta_limit

    def on_user_clarification(self, user_response: str) -> str:
        """Handle user response to ask_user - refresh query allowance.

        Args:
            user_response: The user's clarification response

        Returns:
            Internal message (not for user display)
        """
        self.awaiting_user_response = False

        # Restore up to 3 query calls
        self.query_calls = max(0, self.query_calls - 3)

        # Reset clarification requirement
        self.requires_user_clarification = False
        self.clarification_reason = None

        # Truncate response for display
        display_response = user_response[:80]
        if len(user_response) > 80:
            display_response += "..."

        return f"[Internal: User selected: \"{display_response}\". Proceed with their choice.]"

    def on_action_executed(self, action_description: str) -> str:
        """Handle successful action execution.

        Args:
            action_description: Description of the executed action

        Returns:
            Internal confirmation (not for user display)
        """
        # Small query restoration for follow-up
        if self.query_calls > 0:
            self.query_calls -= 1

        return f"[Internal: Completed: {action_description}]"

    def on_new_user_message(self) -> None:
        """Reset budgets for a new user message/request.

        Note: Action budget persists across messages to prevent abuse.
        """
        self.query_calls = 0
        self.meta_calls = 0
        self.awaiting_user_response = False
        self.requires_user_clarification = False
        self.clarification_reason = None
        # action_calls intentionally NOT reset

    def get_budget_summary(self) -> str:
        """Get a human-readable budget summary.

        Returns:
            Formatted string with current budget status
        """
        status = self.get_status()
        return (
            f"Queries: {status['query']['used']}/{status['query']['limit']} used | "
            f"Actions: {status['action']['used']}/{status['action']['limit']} used | "
            f"Meta: {status['meta']['used']}/{status['meta']['limit']} used"
        )
