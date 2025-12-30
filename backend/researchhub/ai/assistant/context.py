"""Execution context tracking for the AI Assistant.

Tracks tool call history, detects patterns, and provides context enrichment
for strategic reasoning tools.
"""

from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Set
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.models.user import User


@dataclass
class ToolCall:
    """Record of a single tool call."""

    tool_name: str
    input: Dict[str, Any]
    result_summary: str
    had_results: bool
    entities_found: List[str] = field(default_factory=list)


@dataclass
class DeadEnd:
    """Record of a failed search."""

    tool_name: str
    search_term: str
    reason: str
    fuzzy_matches: List[Dict[str, Any]] = field(default_factory=list)
    conclusion: Optional[str] = None
    confidence: str = "medium"


class ExecutionContext:
    """Tracks execution state to enrich reasoning tools.

    Responsibilities:
    - Track tool call history
    - Detect patterns (empty results, repeated searches)
    - Store entities found during execution
    - Provide context enrichment for `think` tool
    - Fuzzy matching for failed user searches
    """

    def __init__(
        self,
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
        page_context: Optional[Dict[str, Any]] = None,
    ):
        """Initialize execution context.

        Args:
            db: Database session for fuzzy matching queries
            user_id: Current user's ID
            org_id: Current organization's ID
            page_context: Current page context from frontend
        """
        self.db = db
        self.user_id = user_id
        self.org_id = org_id
        self.page_context = page_context or {}

        self.tool_calls: List[ToolCall] = []
        self.dead_ends: List[DeadEnd] = []
        self.patterns: Set[str] = set()
        self.entities_found: Dict[str, List[Dict[str, Any]]] = {
            "users": [],
            "projects": [],
            "tasks": [],
        }
        self.original_goal: Optional[str] = None

    def set_original_goal(self, goal: str) -> None:
        """Set the original user request for context."""
        self.original_goal = goal

    async def record_tool_call(
        self,
        tool_name: str,
        tool_input: Dict[str, Any],
        result: Dict[str, Any],
    ) -> Optional[str]:
        """Record a tool call and analyze for patterns.

        Args:
            tool_name: Name of the tool called
            tool_input: Input parameters
            result: Result from the tool

        Returns:
            Auto-injection message if pattern detected, None otherwise
        """
        had_results = self._has_results(result)
        result_summary = self._summarize_result(result)

        # Create tool call record
        tool_call = ToolCall(
            tool_name=tool_name,
            input=tool_input,
            result_summary=result_summary,
            had_results=had_results,
        )

        # Extract and track entities found
        entities = self._extract_entities(result)
        tool_call.entities_found = entities

        self.tool_calls.append(tool_call)

        # Analyze patterns and generate auto-injection if needed
        injection = None

        # Pattern: Empty result
        if not had_results:
            injection = await self._analyze_empty_result(tool_name, tool_input, result)

        # Pattern: Repeated similar searches
        if self._is_repeated_search(tool_name, tool_input):
            self.patterns.add("repeated_search")
            if not injection:
                search_term = self._get_search_term(tool_input)
                injection = (
                    f"[System: You've searched for similar terms multiple times "
                    f"('{search_term}'). Stop searching and either use ask_user to "
                    f"clarify with the user, or conclude the entity doesn't exist.]"
                )

        # Pattern: Ambiguous results (2-5 matches)
        if self._is_ambiguous_result(result):
            self.patterns.add("ambiguous_result")
            if not injection:
                injection = (
                    "[System: Multiple matches found. Use ask_user to let the user "
                    "choose which one they meant, rather than guessing.]"
                )

        return injection

    def requires_user_clarification(self) -> tuple[bool, str | None]:
        """Check if patterns indicate user clarification is required.

        Returns:
            Tuple of (requires_clarification, reason_message)
        """
        if "ambiguous_result" in self.patterns:
            return True, "Multiple matches found for user's request."

        if "repeated_search" in self.patterns:
            return True, "Repeated searches for similar terms."

        return False, None

    def _has_results(self, result: Dict[str, Any]) -> bool:
        """Check if a result contains actual data."""
        # Check various result formats
        if "error" in result:
            return False
        if isinstance(result.get("results"), list):
            return len(result["results"]) > 0
        if "count" in result:
            return result["count"] > 0
        if result.get("type") == "user_interaction_required":
            return True  # ask_user is a valid "result"
        # For single-entity results
        if "id" in result or "name" in result or "title" in result:
            return True
        return bool(result)

    def _summarize_result(self, result: Dict[str, Any]) -> str:
        """Create a brief summary of a result."""
        if "error" in result:
            return f"Error: {result['error'][:100]}"
        if isinstance(result.get("results"), list):
            count = len(result["results"])
            return f"{count} results"
        if "count" in result:
            return f"{result['count']} results"
        if "name" in result:
            return f"Found: {result['name']}"
        if "title" in result:
            return f"Found: {result['title']}"
        return "Result received"

    def _extract_entities(self, result: Dict[str, Any]) -> List[str]:
        """Extract entity references from a result."""
        entities = []

        results_list = result.get("results", [])
        if not isinstance(results_list, list):
            results_list = [result] if result else []

        for item in results_list:
            if isinstance(item, dict):
                # Track by type
                if "display_name" in item or "email" in item:
                    user_info = {
                        "id": str(item.get("id", "")),
                        "name": item.get("display_name", item.get("email", "")),
                    }
                    self.entities_found["users"].append(user_info)
                    entities.append(f"user:{user_info['name']}")
                elif "project_id" in item or item.get("entity_type") == "project":
                    proj_info = {
                        "id": str(item.get("id", item.get("project_id", ""))),
                        "name": item.get("name", item.get("title", "")),
                    }
                    self.entities_found["projects"].append(proj_info)
                    entities.append(f"project:{proj_info['name']}")
                elif "task" in str(item.get("entity_type", "")).lower() or "assignee_id" in item:
                    task_info = {
                        "id": str(item.get("id", "")),
                        "title": item.get("title", ""),
                    }
                    self.entities_found["tasks"].append(task_info)
                    entities.append(f"task:{task_info['title']}")

        return entities

    async def _analyze_empty_result(
        self,
        tool_name: str,
        tool_input: Dict[str, Any],
        result: Dict[str, Any],
    ) -> Optional[str]:
        """Analyze an empty result and generate appropriate guidance."""
        self.patterns.add("empty_result")

        search_term = self._get_search_term(tool_input)
        if not search_term:
            return None

        dead_end = DeadEnd(
            tool_name=tool_name,
            search_term=search_term,
            reason="no_matches",
        )

        # For user searches, try fuzzy matching
        if tool_name == "get_team_members" and search_term:
            fuzzy_matches = await self._fuzzy_match_users(search_term)

            if fuzzy_matches:
                dead_end.fuzzy_matches = fuzzy_matches
                dead_end.confidence = "medium"

                match_names = [m["display_name"] for m in fuzzy_matches[:3]]
                self.dead_ends.append(dead_end)

                return (
                    f"[System: No exact match for '{search_term}'. "
                    f"Similar users found: {', '.join(match_names)}. "
                    f"Use ask_user to confirm which one, or if none apply.]"
                )
            else:
                dead_end.conclusion = "user_not_in_system"
                dead_end.confidence = "high"
                self.dead_ends.append(dead_end)

                return (
                    f"[System: No match for '{search_term}' and no similar users found. "
                    f"This user likely doesn't exist in the organization. "
                    f"Inform the user that you couldn't find this person.]"
                )

        # For other searches
        self.dead_ends.append(dead_end)

        # Default guidance for empty results - emphasize NOT to fabricate
        default_empty_guidance = (
            f"[System: No results found for '{search_term}'. "
            "Tell the user you couldn't find it. "
            "DO NOT make up or describe content that wasn't in the results.]"
        )

        guidance_map = {
            "search_content": (
                f"[System: No results for '{search_term}'. "
                "Tell the user you couldn't find anything matching that. "
                "DO NOT fabricate content - if it's not in results, it doesn't exist.]"
            ),
            "get_tasks": (
                "[System: No tasks match these filters. "
                "Tell the user no tasks were found. DO NOT invent task content.]"
            ),
            "get_project_details": (
                "[System: Project not found. Tell the user it doesn't exist or they lack access. "
                "DO NOT describe a fictional project.]"
            ),
            "get_task_details": (
                "[System: Task not found. Tell the user it doesn't exist. "
                "DO NOT make up task content.]"
            ),
            "dynamic_query": (
                f"[System: Query returned no results for '{search_term}'. "
                "Tell the user you couldn't find what they're looking for. "
                "DO NOT fabricate or describe content that wasn't returned.]"
            ),
        }

        return guidance_map.get(tool_name, default_empty_guidance)

    def _get_search_term(self, tool_input: Dict[str, Any]) -> Optional[str]:
        """Extract the search term from tool input."""
        for key in ["name", "query", "search", "title", "display_name"]:
            if key in tool_input and tool_input[key]:
                return str(tool_input[key])
        return None

    def _is_repeated_search(self, tool_name: str, tool_input: Dict[str, Any]) -> bool:
        """Detect if we're searching for the same thing repeatedly."""
        search_term = self._get_search_term(tool_input)
        if not search_term:
            return False

        # Look at last 5 calls
        similar_count = 0
        for call in self.tool_calls[-6:-1]:  # Exclude current call
            if call.tool_name == tool_name:
                prev_term = self._get_search_term(call.input)
                if prev_term and self._is_similar(search_term, prev_term):
                    similar_count += 1

        return similar_count >= 2

    def _is_similar(self, term1: str, term2: str) -> bool:
        """Check if two search terms are similar."""
        # Normalize
        t1 = term1.lower().strip()
        t2 = term2.lower().strip()

        # Exact match
        if t1 == t2:
            return True

        # One contains the other
        if t1 in t2 or t2 in t1:
            return True

        # Sequence similarity
        ratio = SequenceMatcher(None, t1, t2).ratio()
        return ratio > 0.7

    def _is_ambiguous_result(self, result: Dict[str, Any]) -> bool:
        """Check if result has multiple plausible matches."""
        results_list = result.get("results", [])
        if isinstance(results_list, list):
            # 2-5 results is ambiguous territory
            return 2 <= len(results_list) <= 5
        return False

    async def _fuzzy_match_users(
        self,
        search_term: str,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """Find users with similar names using fuzzy matching.

        Args:
            search_term: The name to search for
            limit: Maximum matches to return

        Returns:
            List of similar users with similarity scores
        """
        from researchhub.models.organization import OrganizationMember

        # Get all users in the organization
        query = (
            select(User)
            .join(OrganizationMember, OrganizationMember.user_id == User.id)
            .where(OrganizationMember.organization_id == self.org_id)
            .where(User.is_active == True)
        )

        result = await self.db.execute(query)
        users = result.scalars().all()

        # Calculate similarity scores
        matches = []
        search_lower = search_term.lower()

        for user in users:
            name_lower = user.display_name.lower()

            # Calculate similarity
            ratio = SequenceMatcher(None, search_lower, name_lower).ratio()

            # Boost score if search term is contained in name
            if search_lower in name_lower:
                ratio = min(1.0, ratio + 0.2)

            # Only include if reasonably similar
            if ratio > 0.4:
                matches.append({
                    "id": str(user.id),
                    "display_name": user.display_name,
                    "email": user.email,
                    "similarity": round(ratio, 2),
                })

        # Sort by similarity and limit
        matches.sort(key=lambda x: x["similarity"], reverse=True)
        return matches[:limit]

    def get_context_for_think(self, reasoning_about: str) -> Dict[str, Any]:
        """Generate enriched context for the think tool.

        Args:
            reasoning_about: What the LLM is trying to figure out

        Returns:
            Context dict with relevant information
        """
        # Base context always included
        context = {
            "tool_calls_made": len(self.tool_calls),
            "patterns_detected": list(self.patterns),
            "page_context": self.page_context,
        }

        # Recent tool call history
        if self.tool_calls:
            context["recent_calls"] = [
                {
                    "tool": call.tool_name,
                    "result": call.result_summary,
                    "had_results": call.had_results,
                }
                for call in self.tool_calls[-5:]
            ]

        # Dead ends if any
        if self.dead_ends:
            context["dead_ends"] = [
                {
                    "search": de.search_term,
                    "reason": de.reason,
                    "fuzzy_matches": [m["display_name"] for m in de.fuzzy_matches[:3]],
                    "conclusion": de.conclusion,
                }
                for de in self.dead_ends[-3:]
            ]

        # Entities found
        non_empty_entities = {
            k: v for k, v in self.entities_found.items() if v
        }
        if non_empty_entities:
            context["entities_found"] = {
                entity_type: [e.get("name") or e.get("title") for e in entities[:5]]
                for entity_type, entities in non_empty_entities.items()
            }

        # Original goal if set
        if self.original_goal:
            context["original_goal"] = self.original_goal

        # Generate guidance based on patterns
        context["guidance"] = self._generate_guidance(reasoning_about)

        return context

    def _generate_guidance(self, reasoning_about: str) -> str:
        """Generate situational guidance based on current state."""
        reasoning_lower = reasoning_about.lower()

        # If asking about empty results
        if "empty" in reasoning_lower or "no result" in reasoning_lower or "not found" in reasoning_lower:
            if self.dead_ends:
                last_dead_end = self.dead_ends[-1]
                if last_dead_end.conclusion == "user_not_in_system":
                    return f"User '{last_dead_end.search_term}' doesn't exist. Inform the user."
                if last_dead_end.fuzzy_matches:
                    names = [m["display_name"] for m in last_dead_end.fuzzy_matches[:3]]
                    return f"Use ask_user to confirm if they meant one of: {', '.join(names)}"
            return "The entity likely doesn't exist. Either inform the user or use ask_user to clarify."

        # If asking about next steps
        if "next" in reasoning_lower or "should" in reasoning_lower or "approach" in reasoning_lower:
            if "repeated_search" in self.patterns:
                return "Stop searching. Use ask_user or conclude the entity doesn't exist."
            if "ambiguous_result" in self.patterns:
                return "Use ask_user to let the user choose from the matches."
            if len(self.tool_calls) >= 4:
                return "You've made several calls. Consider if you have enough to respond."
            return "Consider what specific information you still need, then query for it."

        # If asking about progress
        if "enough" in reasoning_lower or "progress" in reasoning_lower or "respond" in reasoning_lower:
            if self.entities_found.get("tasks") or self.entities_found.get("projects"):
                return "You have found relevant entities. You likely have enough to respond."
            if len(self.tool_calls) >= 3:
                return "You've gathered information. Consider synthesizing a response."
            return "Assess if the data gathered answers the user's question."

        # Default guidance
        return "Consider what the user needs and the most efficient path to provide it."

    def get_summary(self) -> str:
        """Get a summary of the current execution state."""
        parts = [f"Tool calls: {len(self.tool_calls)}"]

        if self.patterns:
            parts.append(f"Patterns: {', '.join(self.patterns)}")

        if self.dead_ends:
            parts.append(f"Dead ends: {len(self.dead_ends)}")

        entities_summary = []
        for entity_type, entities in self.entities_found.items():
            if entities:
                entities_summary.append(f"{len(entities)} {entity_type}")
        if entities_summary:
            parts.append(f"Found: {', '.join(entities_summary)}")

        return " | ".join(parts)
