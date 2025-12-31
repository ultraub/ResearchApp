"""AI Assistant service for context-aware chat with tool calling."""

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any, AsyncIterator, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.ai.assistant.schemas import (
    ActionPreview,
    AssistantChatRequest,
    PageContext,
    SSEEvent,
)
from researchhub.ai.assistant.tools import ActionTool, QueryTool, create_default_registry
from researchhub.ai.assistant.budget import ToolBudget
from researchhub.ai.assistant.context import ExecutionContext
from researchhub.ai.assistant.queries.strategic import ThinkTool, AskUserTool
from researchhub.ai.providers.base import (
    AIMessage,
    AIProvider,
    StreamEvent,
    ToolDefinition,
    ToolResult,
    ToolUse,
)
from researchhub.models.ai import AIConversation, AIPendingAction
from researchhub.models.user import User


class AssistantService:
    """Service for AI-powered assistant with tool calling and action approval."""

    def __init__(
        self,
        provider: AIProvider,
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
        use_dynamic_queries: bool = False,
    ):
        """Initialize the assistant service.

        Args:
            provider: The AI provider (e.g., Claude)
            db: Database session
            user_id: Current user's ID
            org_id: Current organization's ID
            use_dynamic_queries: If True, disables specialized query tools
                (get_projects, get_tasks, etc.) and forces use of dynamic_query.
                Experimental mode for testing dynamic query capabilities.
        """
        self.provider = provider
        self.db = db
        self.user_id = user_id
        self.org_id = org_id
        self.use_dynamic_queries = use_dynamic_queries
        self.tool_registry = create_default_registry(use_dynamic_queries=use_dynamic_queries)

    async def _get_user_info(self) -> Optional[User]:
        """Fetch the current user's information."""
        from sqlalchemy import select

        result = await self.db.execute(
            select(User).where(User.id == self.user_id)
        )
        return result.scalar_one_or_none()

    def _build_system_prompt(
        self,
        page_context: Optional[PageContext],
        user: Optional[User] = None,
        action_history: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    ) -> str:
        """Build a lean system prompt optimized for token efficiency."""
        today = date.today()

        # Compact header with essential context
        parts = [f"Date: {today.isoformat()}"]

        if user:
            parts.append(f"User: {user.display_name} (ID: {self.user_id})")

        # Action history - show what was already done in this session
        if action_history:
            executed = action_history.get("executed", [])
            rejected = action_history.get("rejected", [])
            if executed:
                action_list = ", ".join(a.get("description", a.get("tool_name", "?"))[:40] for a in executed[:5])
                parts.append(f"COMPLETED ACTIONS (user already approved): {action_list}")
            if rejected:
                action_list = ", ".join(a.get("description", a.get("tool_name", "?"))[:40] for a in rejected[:5])
                parts.append(f"REJECTED ACTIONS (don't suggest again): {action_list}")

        header = "\n".join(parts)

        base_prompt = header + """

You are an AI assistant for a knowledge management app. Help users with projects, tasks, documents, and blockers.

## CRITICAL RULES
1. **Never fabricate**: If query returns empty, say "I couldn't find X". Never invent content.
2. **Never expose internals**: Don't mention budgets, tool limits, or internal processes to users.
3. **Be direct**: Query → synthesize → respond. No verbose planning output.
4. **Ask on ambiguity**: Multiple matches? Use ask_user immediately with options.
5. **One action at a time**: Only call ONE action tool per response. Wait for user approval before next action.
6. **No duplicate calls**: Never call the same tool twice in one response.
7. **Check COMPLETED ACTIONS**: If actions are listed above as completed, acknowledge them and continue with any remaining work the user requested.

## Tools
- **Query tools**: get_projects, get_tasks, get_attention_summary, dynamic_query, search_content, semantic_search
- **Action tools** (require approval): create_task, update_task, complete_task, assign_task, add_comment, create_blocker, resolve_blocker

## Quick Reference
- "my tasks" → filter by current user ID
- Stalled = in_progress with no update in 7+ days
- Overdue = past due date, not completed
- Task flow: idea → todo → in_progress → in_review → done
- Blocker flow: open → in_progress → resolved

## Tool Selection
1. Cross-entity or complex filters → dynamic_query
2. Find by keyword → search_content
3. Find by concept → semantic_search
4. Specific details → get_project_details, get_task_details
5. Multiple matches → ask_user (don't keep searching)

## dynamic_query Tables
- projects: name, status, scope, project_type
- tasks: title, status, priority, due_date, assignee_id, project_id
- blockers: title, status, priority, impact_level
- documents: title, status, document_type
- Filters: assigned_to_me, is_overdue, is_stalled, project_name, exclude_done"""

        if self.use_dynamic_queries:
            base_prompt += "\n\n**Mode: dynamic_query preferred for all queries.**"

        if page_context:
            base_prompt += f"\n\nPage context: {page_context.type}"
            if page_context.id:
                base_prompt += f" (ID: {page_context.id})"
            if page_context.name:
                base_prompt += f" - {page_context.name}"

        return base_prompt

    def _get_tool_definitions(self) -> List[ToolDefinition]:
        """Get all tool definitions for the LLM."""
        tools = self.tool_registry.get_all_tools()
        return [
            ToolDefinition(
                name=tool.name,
                description=tool.description,
                input_schema=tool.input_schema,
            )
            for tool in tools
        ]

    async def chat(
        self,
        request: AssistantChatRequest,
    ) -> AsyncIterator[SSEEvent]:
        """Process a chat message and yield SSE events with real-time streaming.

        Uses stream_with_tools to get real-time text streaming, thinking indicators,
        and tool calls as they happen.
        """
        # Get or create conversation to ensure it exists in the database
        conversation_id = await self._get_or_create_conversation(
            request.conversation_id,
            request.page_context,
        )

        # Fetch user info for context
        user = await self._get_user_info()

        # Get action history to prevent re-suggesting executed/rejected actions
        action_history = await self.get_action_history(conversation_id)

        # Build messages
        messages: List[AIMessage] = []

        # Add conversation history if provided
        # Filter out messages with empty content (e.g., from tool-only responses)
        for msg in request.messages:
            if msg.content and msg.content.strip():
                messages.append(AIMessage(
                    role=msg.role,
                    content=msg.content,
                ))

        # Add the current user message
        messages.append(AIMessage(role="user", content=request.message))

        # Get tool definitions
        tools = self._get_tool_definitions()
        system_prompt = self._build_system_prompt(request.page_context, user, action_history)

        # Initialize budget and context tracking
        tool_budget = ToolBudget()

        # Convert page_context to dict for ExecutionContext
        page_context_dict = None
        if request.page_context:
            page_context_dict = {
                "type": request.page_context.type.value if request.page_context.type else None,
                "id": str(request.page_context.id) if request.page_context.id else None,
                "project_id": str(request.page_context.project_id) if request.page_context.project_id else None,
                "name": request.page_context.name,
            }

        execution_context = ExecutionContext(
            db=self.db,
            user_id=self.user_id,
            org_id=self.org_id,
            page_context=page_context_dict,
        )
        execution_context.set_original_goal(request.message)

        # Set execution context on ThinkTool if available
        think_tool = self.tool_registry.get_tool("think")
        if think_tool and isinstance(think_tool, ThinkTool):
            think_tool.set_execution_context(execution_context)

        # Tool results for multi-turn
        tool_results: List[ToolResult] = []
        max_iterations = 8  # Allow more iterations since meta-tools don't count against query budget

        for iteration in range(max_iterations):
            # Collect tool uses and text from the streaming response
            pending_tool_uses: List[ToolUse] = []
            accumulated_text = ""
            has_error = False

            # Stream response from LLM
            async for event in self.provider.stream_with_tools(
                messages=messages,
                tools=tools,
                tool_results=tool_results if tool_results else None,
                system=system_prompt,
                temperature=0.7,
                max_tokens=30000,
            ):
                if event.type == StreamEvent.THINKING:
                    # Emit thinking event for UI to display model reasoning
                    yield SSEEvent(
                        event="thinking",
                        data={"content": event.data.get("content", "")},
                    )

                elif event.type == StreamEvent.TEXT_DELTA:
                    # Emit text delta for real-time text streaming
                    text_chunk = event.data.get("content", "")
                    accumulated_text += text_chunk
                    yield SSEEvent(
                        event="text_delta",
                        data={"content": text_chunk},
                    )

                elif event.type == StreamEvent.TEXT:
                    # Complete text block (fallback for non-streaming providers)
                    text_content = event.data.get("content", "")
                    if text_content and not accumulated_text:
                        accumulated_text = text_content
                        yield SSEEvent(
                            event="text",
                            data={"content": text_content},
                        )

                elif event.type == StreamEvent.TOOL_CALL:
                    # Collect tool call for execution after stream completes
                    tool_use = ToolUse(
                        id=event.data.get("id", ""),
                        name=event.data.get("name", ""),
                        input=event.data.get("input", {}),
                    )
                    pending_tool_uses.append(tool_use)

                    # Emit tool call event for UI
                    yield SSEEvent(
                        event="tool_call",
                        data={
                            "tool": tool_use.name,
                            "input": tool_use.input,
                        },
                    )

                elif event.type == StreamEvent.ERROR:
                    has_error = True
                    yield SSEEvent(
                        event="error",
                        data={"message": event.data.get("message", "Unknown error")},
                    )
                    break

                elif event.type == StreamEvent.DONE:
                    # Stream completed, we'll process tool calls below
                    pass

            # If there was an error, stop processing
            if has_error:
                break

            # Clear tool results for next iteration
            tool_results = []

            # Process any tool calls that were collected
            if pending_tool_uses:
                for tool_use in pending_tool_uses:
                    # Record call with budget tracker
                    tool_budget.record_call(tool_use.name)

                    # Check if queries are blocked for clarification (except ask_user itself)
                    if (tool_budget.is_blocked_for_clarification() and
                        tool_budget.get_tool_type(tool_use.name) == "query" and
                        tool_use.name != "ask_user"):
                        # Block query - user clarification is required first
                        tool_results.append(ToolResult(
                            tool_use_id=tool_use.id,
                            content={
                                "error": f"Query blocked: {tool_budget.clarification_reason} "
                                         "You MUST call ask_user first to let the user choose.",
                                "required_action": "ask_user",
                            },
                            is_error=True,
                        ))
                        continue

                    # Check if query or action budget is exhausted
                    if tool_budget.is_query_exhausted() and tool_budget.get_tool_type(tool_use.name) == "query":
                        # Return a "budget exhausted" result
                        tool_results.append(ToolResult(
                            tool_use_id=tool_use.id,
                            content={"error": "Query budget exhausted. Please respond to the user with the information you have gathered."},
                            is_error=True,
                        ))
                        continue

                    if tool_budget.is_action_exhausted() and tool_budget.get_tool_type(tool_use.name) == "action":
                        tool_results.append(ToolResult(
                            tool_use_id=tool_use.id,
                            content={"error": "Action budget exhausted for this session."},
                            is_error=True,
                        ))
                        continue

                    # Get the tool
                    tool = self.tool_registry.get_tool(tool_use.name)
                    if not tool:
                        # Tool not found
                        tool_results.append(ToolResult(
                            tool_use_id=tool_use.id,
                            content={"error": f"Unknown tool: {tool_use.name}"},
                            is_error=True,
                        ))
                        continue

                    try:
                        if isinstance(tool, QueryTool):
                            # Execute query tools immediately
                            result = await tool.execute(
                                input=tool_use.input,
                                db=self.db,
                                user_id=self.user_id,
                                org_id=self.org_id,
                            )

                            # Record with execution context for pattern detection
                            # (skip meta-tools as they don't need pattern tracking)
                            auto_injection = None
                            if tool_use.name not in ToolBudget.META_TOOLS:
                                auto_injection = await execution_context.record_tool_call(
                                    tool_name=tool_use.name,
                                    tool_input=tool_use.input,
                                    result=result,
                                )

                                # Check if patterns require user clarification
                                # This blocks further queries until ask_user is called
                                requires_clarification, reason = execution_context.requires_user_clarification()
                                if requires_clarification and not tool_budget.is_blocked_for_clarification():
                                    tool_budget.set_requires_clarification(reason)

                            # Handle ask_user specially - emit clarification_needed event and stop
                            if result.get("type") == "user_interaction_required":
                                yield SSEEvent(
                                    event="clarification_needed",
                                    data={
                                        "question": result.get("question"),
                                        "reason": result.get("reason"),
                                        "options": result.get("options", []),
                                    },
                                )
                                # Stop the stream - user needs to respond before we continue
                                # The done event will be emitted below
                                yield SSEEvent(
                                    event="done",
                                    data={"conversation_id": str(conversation_id)},
                                )
                                return
                            else:
                                # Emit tool result event for regular tools
                                yield SSEEvent(
                                    event="tool_result",
                                    data=result,
                                )

                            tool_results.append(ToolResult(
                                tool_use_id=tool_use.id,
                                content=result,
                            ))

                            # Inject auto-injection message if pattern detected
                            if auto_injection:
                                messages.append(AIMessage(
                                    role="user",
                                    content=auto_injection,
                                ))

                        elif isinstance(tool, ActionTool):
                            # Create preview for action tools
                            preview = await tool.create_preview(
                                input=tool_use.input,
                                db=self.db,
                                user_id=self.user_id,
                                org_id=self.org_id,
                            )

                            # Store as pending action
                            pending_action = await self._store_pending_action(
                                conversation_id=conversation_id,
                                preview=preview,
                            )

                            # Emit action preview event
                            yield SSEEvent(
                                event="action_preview",
                                data={
                                    "action_id": str(pending_action.id),
                                    "tool_name": preview.tool_name,
                                    "description": preview.description,
                                    "entity_type": preview.entity_type,
                                    "entity_id": str(preview.entity_id) if preview.entity_id else None,
                                    "old_state": preview.old_state,
                                    "new_state": preview.new_state,
                                    "diff": [
                                        {
                                            "field": d.field,
                                            "old_value": d.old_value,
                                            "new_value": d.new_value,
                                            "change_type": d.change_type,
                                        }
                                        for d in preview.diff
                                    ],
                                    "expires_at": pending_action.expires_at.isoformat(),
                                },
                            )

                            # Build the pending approval result
                            pending_result = {
                                "status": "pending_approval",
                                "action_id": str(pending_action.id),
                                "message": f"Action '{preview.description}' is pending user approval. The user will see a preview of the changes.",
                            }

                            # Emit tool result event so frontend can track it
                            yield SSEEvent(
                                event="tool_result",
                                data=pending_result,
                            )

                            # Tell the LLM the action is pending approval
                            tool_results.append(ToolResult(
                                tool_use_id=tool_use.id,
                                content=pending_result,
                            ))

                            # Stop processing - wait for user approval before continuing
                            # This prevents duplicate action calls from being processed
                            yield SSEEvent(
                                event="done",
                                data={"conversation_id": str(conversation_id)},
                            )
                            return

                    except Exception as e:
                        # Handle tool execution errors
                        tool_results.append(ToolResult(
                            tool_use_id=tool_use.id,
                            content={"error": str(e)},
                            is_error=True,
                        ))

                        yield SSEEvent(
                            event="error",
                            data={"message": f"Tool error: {str(e)}"},
                        )

                # Add assistant response to messages for context (only if there was text)
                # Tool results are passed separately via tool_results parameter
                if accumulated_text:
                    messages.append(AIMessage(
                        role="assistant",
                        content=accumulated_text,
                    ))

                # Check for budget-based warnings and inject prompts
                budget_warning = tool_budget.get_injection_message()
                if budget_warning and not accumulated_text:
                    messages.append(AIMessage(
                        role="user",
                        content=budget_warning,
                    ))
                elif iteration >= 5 and not accumulated_text:
                    # Fallback iteration-based nudge if budget system doesn't trigger
                    messages.append(AIMessage(
                        role="user",
                        content="[System: You have made multiple tool calls. Please synthesize your findings and respond to the user.]",
                    ))

            # If no tool calls were made, we're done
            if not pending_tool_uses:
                break

        # If we exhausted max_iterations without producing text, send a fallback message
        # This can happen if the model keeps calling tools without generating a response
        if iteration == max_iterations - 1 and not accumulated_text:
            fallback_message = """I ran into my processing limit while gathering information. This usually happens when a query requires searching across many items.

**Tips for better results:**
- Be more specific: Instead of "projects with Sarah", try "what projects am I working on?" (I can see your projects directly)
- Ask about one thing at a time: "What are my overdue tasks?" or "Summarize project X"
- Use names I can search: "Find tasks about authentication" rather than broad relationship queries

Would you like to try rephrasing your question?"""
            yield SSEEvent(
                event="text",
                data={"content": fallback_message},
            )

        # Done event
        yield SSEEvent(
            event="done",
            data={"conversation_id": str(conversation_id)},
        )

    async def _get_or_create_conversation(
        self,
        conversation_id: Optional[UUID],
        page_context: Optional[PageContext],
    ) -> UUID:
        """Get an existing conversation or create a new one."""
        from sqlalchemy import select

        if conversation_id:
            # Check if conversation exists
            result = await self.db.execute(
                select(AIConversation).where(AIConversation.id == conversation_id)
            )
            existing = result.scalar_one_or_none()
            if existing:
                return existing.id

        # Create new conversation
        context_type = page_context.type.value if page_context else None
        context_id = page_context.id if page_context else None

        conversation = AIConversation(
            organization_id=self.org_id,
            user_id=self.user_id,
            feature_name="assistant",
            context_type=context_type,
            context_id=context_id,
        )
        self.db.add(conversation)
        await self.db.commit()
        await self.db.refresh(conversation)

        return conversation.id

    def _compute_action_hash(self, tool_input: Dict[str, Any]) -> str:
        """Compute a hash of tool_input for deduplication of CREATE operations.

        This ensures that different actions (e.g., creating 2 different tasks,
        or adding 2 different comments to the same task) are not deduplicated.
        """
        import hashlib

        # Sort keys for consistent hashing
        input_str = json.dumps(tool_input, sort_keys=True, default=str)
        return hashlib.sha256(input_str.encode()).hexdigest()[:16]

    async def _store_pending_action(
        self,
        conversation_id: UUID,
        preview: ActionPreview,
    ) -> AIPendingAction:
        """Store a pending action for approval.

        Includes deduplication to prevent duplicate actions with the same
        tool, entity, and content from being created within the expiration window.

        For CREATE operations (where entity_id is None), we use a hash of the
        tool_input to distinguish between different create requests.
        """
        from sqlalchemy import select, and_

        # Compute hash of tool_input for deduplication
        # This ensures different actions produce different hashes, even on the same entity
        # Examples that should NOT be deduplicated:
        #   - "Create task A" vs "Create task B" (different titles)
        #   - "Update task X priority" vs "Update task X status" (different fields)
        #   - "Add comment A to task" vs "Add comment B to task" (different content)
        # Examples that SHOULD be deduplicated:
        #   - Two identical "Create task A" requests (exact same tool_input)
        content_hash = self._compute_action_hash(preview.tool_input)

        # Build deduplication conditions - always use content_hash
        # This handles all operation types uniformly
        dedup_conditions = [
            AIPendingAction.user_id == self.user_id,
            AIPendingAction.tool_name == preview.tool_name,
            AIPendingAction.content_hash == content_hash,
            AIPendingAction.status == "pending",
            AIPendingAction.expires_at > datetime.now(timezone.utc),
        ]

        existing_query = (
            select(AIPendingAction)
            .where(and_(*dedup_conditions))
            .limit(1)
        )
        result = await self.db.execute(existing_query)
        existing_action = result.scalar_one_or_none()

        if existing_action:
            # Return existing pending action instead of creating duplicate
            return existing_action

        pending_action = AIPendingAction(
            conversation_id=conversation_id,
            tool_name=preview.tool_name,
            tool_input=preview.tool_input,
            description=preview.description,
            content_hash=content_hash,
            entity_type=preview.entity_type,
            entity_id=preview.entity_id,
            old_state=preview.old_state,
            new_state=preview.new_state,
            status="pending",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            user_id=self.user_id,
            organization_id=self.org_id,
        )

        self.db.add(pending_action)
        await self.db.commit()
        await self.db.refresh(pending_action)

        return pending_action

    async def get_pending_actions(
        self,
        conversation_id: Optional[UUID] = None,
    ) -> List[Dict[str, Any]]:
        """Get pending actions for the user, optionally filtered by conversation."""
        from sqlalchemy import select

        query = (
            select(AIPendingAction)
            .where(AIPendingAction.user_id == self.user_id)
            .where(AIPendingAction.status == "pending")
            .where(AIPendingAction.expires_at > datetime.now(timezone.utc))
        )

        if conversation_id:
            query = query.where(AIPendingAction.conversation_id == conversation_id)

        query = query.order_by(AIPendingAction.created_at.desc())

        result = await self.db.execute(query)
        actions = result.scalars().all()

        return [
            {
                "action_id": str(action.id),
                "tool_name": action.tool_name,
                "entity_type": action.entity_type,
                "entity_id": str(action.entity_id) if action.entity_id else None,
                "old_state": action.old_state,
                "new_state": action.new_state,
                "status": action.status,
                "expires_at": action.expires_at.isoformat(),
                "created_at": action.created_at.isoformat(),
            }
            for action in actions
        ]

    async def get_action_history(
        self,
        conversation_id: Optional[UUID] = None,
        limit: int = 20,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Get recently executed and rejected actions for context.

        This helps the AI know:
        - What actions were already approved and executed (don't suggest again)
        - What actions were rejected by the user (don't suggest again)

        NOTE: We intentionally do NOT filter by conversation_id. The AI should
        know about ALL recent actions for this user, even across conversations.
        This prevents duplicate actions when users start new conversations.

        Returns:
            Dict with 'executed' and 'rejected' lists of actions
        """
        from sqlalchemy import select, or_

        # Get actions from the last hour for this user (regardless of conversation)
        cutoff = datetime.now(timezone.utc) - timedelta(hours=1)

        query = (
            select(AIPendingAction)
            .where(AIPendingAction.user_id == self.user_id)
            .where(or_(
                AIPendingAction.status == "executed",
                AIPendingAction.status == "rejected",
            ))
            .where(AIPendingAction.created_at >= cutoff)
            .order_by(AIPendingAction.created_at.desc())
            .limit(limit)
        )

        result = await self.db.execute(query)
        actions = result.scalars().all()

        executed = []
        rejected = []

        for action in actions:
            action_info = {
                "tool_name": action.tool_name,
                "entity_type": action.entity_type,
                "entity_id": str(action.entity_id) if action.entity_id else None,
                "description": action.description,
                "new_state": action.new_state,
            }
            if action.status == "executed":
                executed.append(action_info)
            elif action.status == "rejected":
                rejected.append(action_info)

        return {"executed": executed, "rejected": rejected}
