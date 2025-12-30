"""Strategic reasoning tools for the AI Assistant.

These tools enable structured reasoning and user interaction:
- ThinkTool: Pause to reason about approach, diagnose issues, or plan
- AskUserTool: Ask user for clarification with structured choices
"""

from typing import Any, Dict, List, Optional, TYPE_CHECKING
from uuid import UUID

from researchhub.ai.assistant.tools import QueryTool

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from researchhub.ai.assistant.context import ExecutionContext


class ThinkTool(QueryTool):
    """Reasoning checkpoint for planning, reflection, and diagnosis.

    This tool allows the LLM to pause and reason about its approach.
    The system enriches the response with execution context, detected
    patterns, and situational guidance.

    Use cases:
    - Planning how to approach a complex request
    - Diagnosing unexpected results (empty searches, errors)
    - Reflecting on gathered information
    - Deciding if enough information has been gathered to respond
    """

    # Reference to execution context, set by service
    _execution_context: Optional["ExecutionContext"] = None

    @property
    def name(self) -> str:
        return "think"

    @property
    def description(self) -> str:
        return """Pause to reason about your approach. Use this when you need to:

- PLAN: Figure out how to approach a complex, multi-step request
- DIAGNOSE: Understand why results were unexpected (empty searches, errors)
- REFLECT: Reassess your approach given new information
- SYNTHESIZE: Decide if you have enough information to respond

The system will provide relevant context based on your situation, including:
- Your tool call history and patterns detected
- Entities you've found so far
- Guidance for common situations (empty results, ambiguous matches)

This tool does NOT count against your query budget. Use it when genuinely uncertain."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "reasoning_about": {
                    "type": "string",
                    "description": (
                        "What you're trying to figure out. Be specific. "
                        "Examples: 'Why did my user search return empty?', "
                        "'Do I have enough info to answer the user?', "
                        "'How should I approach creating 5 tasks?'"
                    ),
                },
                "current_understanding": {
                    "type": "string",
                    "description": (
                        "Optional: What you know so far and what's still unclear. "
                        "This helps the system provide more targeted guidance."
                    ),
                },
            },
            "required": ["reasoning_about"],
        }

    def set_execution_context(self, context: "ExecutionContext") -> None:
        """Set the execution context for enrichment."""
        self._execution_context = context

    async def execute(
        self,
        input: Dict[str, Any],
        db: "AsyncSession",
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Execute the think tool with context enrichment.

        Args:
            input: Tool input with reasoning_about and optional current_understanding
            db: Database session (not used directly)
            user_id: Current user ID (not used directly)
            org_id: Current organization ID (not used directly)

        Returns:
            Enriched context to help with reasoning
        """
        reasoning_about = input.get("reasoning_about", "")
        current_understanding = input.get("current_understanding", "")

        # Get enriched context if available
        if self._execution_context:
            context = self._execution_context.get_context_for_think(reasoning_about)
        else:
            # Fallback if context not set
            context = {
                "tool_calls_made": 0,
                "patterns_detected": [],
                "guidance": "Consider what the user needs and how to provide it efficiently.",
            }

        # Build response
        response = {
            "type": "reasoning_checkpoint",
            "your_question": reasoning_about,
            "your_understanding": current_understanding,
            "system_context": context,
            "recommendations": self._generate_recommendations(reasoning_about, context),
        }

        return response

    def _generate_recommendations(
        self,
        reasoning_about: str,
        context: Dict[str, Any],
    ) -> List[str]:
        """Generate actionable recommendations based on context."""
        recommendations = []
        patterns = context.get("patterns_detected", [])
        tool_calls = context.get("tool_calls_made", 0)

        # Pattern-based recommendations
        if "empty_result" in patterns:
            dead_ends = context.get("dead_ends", [])
            if dead_ends and dead_ends[-1].get("fuzzy_matches"):
                recommendations.append(
                    "Use ask_user to confirm if the user meant one of the similar matches."
                )
            elif dead_ends and dead_ends[-1].get("conclusion") == "user_not_in_system":
                recommendations.append(
                    "Inform the user that the person they mentioned doesn't exist in the system."
                )
            else:
                recommendations.append(
                    "Consider broader search terms or ask the user for clarification."
                )

        if "repeated_search" in patterns:
            recommendations.append(
                "Stop searching for variations. Either use ask_user or conclude the entity doesn't exist."
            )

        if "ambiguous_result" in patterns:
            recommendations.append(
                "Use ask_user to let the user choose from the multiple matches."
            )

        # Tool call volume recommendations
        if tool_calls >= 5:
            recommendations.append(
                "You've made several tool calls. Consider responding with what you have."
            )
        elif tool_calls >= 3 and not patterns:
            recommendations.append(
                "You have gathered information. Assess if you can answer the user now."
            )

        # Entities found recommendations
        entities = context.get("entities_found", {})
        if entities:
            recommendations.append(
                "You have found relevant entities. Consider using them in your response."
            )

        # Default recommendation
        if not recommendations:
            recommendations.append(
                "Plan your next steps carefully. What specific information do you need?"
            )

        return recommendations


class AskUserTool(QueryTool):
    """Ask the user a clarifying question with optional structured choices.

    Use this tool when you need user input to proceed correctly:
    - Multiple entities match and you need to know which one
    - Required information is missing (which project, what priority)
    - The request is ambiguous and could be interpreted multiple ways
    - You've found similar matches after a failed search

    The user will see your question and can respond. After they respond,
    your query budget will be partially refreshed.
    """

    @property
    def name(self) -> str:
        return "ask_user"

    @property
    def description(self) -> str:
        return """Ask the user a clarifying question when you need more information to proceed correctly.

Use this when:
- Multiple entities match a name (which project/task/person did they mean?)
- Required context is missing (what priority? which project? what due date?)
- The request is ambiguous and could go multiple directions
- You searched for something and found similar but not exact matches

You can optionally provide structured choices to make it easier for the user to respond.
After the user responds, your query budget will be refreshed so you can act on their answer.

This tool does NOT count against your query budget. Use it instead of guessing."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": (
                        "The question to ask the user. Be clear and specific. "
                        "Good: 'Which project should I add this task to: Project A or Project B?' "
                        "Bad: 'Which project?'"
                    ),
                },
                "reason": {
                    "type": "string",
                    "description": (
                        "Brief context for why you're asking. This helps the user understand. "
                        "Example: 'I found 3 tasks with similar names' or "
                        "'I couldn\\'t find anyone named Sarah'"
                    ),
                },
                "options": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {
                                "type": "string",
                                "description": "Display text for this option",
                            },
                            "value": {
                                "type": "string",
                                "description": "Value to use if selected (e.g., entity ID)",
                            },
                            "description": {
                                "type": "string",
                                "description": "Optional extra context about this option",
                            },
                        },
                        "required": ["label", "value"],
                    },
                    "description": (
                        "Optional structured choices. If provided, the user can click "
                        "to select instead of typing. Include an 'Other' or 'None of these' "
                        "option when appropriate."
                    ),
                },
            },
            "required": ["question"],
        }

    async def execute(
        self,
        input: Dict[str, Any],
        db: "AsyncSession",
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Execute the ask_user tool.

        This returns a special result type that signals the service
        to pause and wait for user input.

        Args:
            input: Tool input with question, optional reason and options
            db: Database session (not used)
            user_id: Current user ID (not used)
            org_id: Current organization ID (not used)

        Returns:
            Special result indicating user interaction is required
        """
        question = input.get("question", "")
        reason = input.get("reason")
        options = input.get("options", [])

        # Validate options if provided
        validated_options = []
        for opt in options:
            if isinstance(opt, dict) and "label" in opt and "value" in opt:
                validated_options.append({
                    "label": opt["label"],
                    "value": opt["value"],
                    "description": opt.get("description"),
                })

        return {
            "type": "user_interaction_required",
            "question": question,
            "reason": reason,
            "options": validated_options,
            "instruction": (
                "Waiting for user response. Once they respond, "
                "your query budget will be refreshed and you can proceed."
            ),
        }
