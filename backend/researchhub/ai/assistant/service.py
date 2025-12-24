"""AI Assistant service for context-aware chat with tool calling."""

import json
from datetime import datetime, timedelta, timezone
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
from researchhub.ai.providers.base import (
    AIMessage,
    AIProvider,
    StreamEvent,
    ToolDefinition,
    ToolResult,
    ToolUse,
)
from researchhub.models.ai import AIPendingAction


class AssistantService:
    """Service for AI-powered assistant with tool calling and action approval."""

    def __init__(
        self,
        provider: AIProvider,
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ):
        self.provider = provider
        self.db = db
        self.user_id = user_id
        self.org_id = org_id
        self.tool_registry = create_default_registry()

    def _build_system_prompt(self, page_context: Optional[PageContext]) -> str:
        """Build the system prompt with page context."""
        base_prompt = """You are a helpful AI assistant for a knowledge management application. You help users manage their projects, tasks, documents, and blockers.

You have access to tools that let you:
1. Query data (projects, tasks, documents, blockers, team members)
2. Propose actions (create, update, complete, assign) - these require user approval

Key behaviors:
- Be concise and helpful
- Use markdown formatting for better readability (tables, bullet points, code blocks)
- When users ask about their work, use query tools to get accurate information
- When users want to make changes, propose actions and explain what will happen
- Always present action previews clearly with what will change
- If unsure, ask clarifying questions

Common use cases you excel at:
1. **Prioritization & Focus**: Use get_attention_summary to identify what needs attention (overdue tasks, upcoming deadlines, open blockers, stalled work). Help users decide what to focus on based on urgency, importance, and dependencies.

2. **Project Summaries**: Use get_project_details to provide status overviews - task completion rates, blockers, upcoming milestones. Identify projects that may be falling behind or need attention.

3. **Finding Neglected Areas**: Look for stalled tasks (no updates in 7+ days), old blockers, projects with low activity. Proactively surface these when users ask about their work.

4. **Strategic Guidance**: When asked "what should I work on?", analyze the full picture - consider deadlines, priorities, blocked dependencies, and suggest a prioritized list with reasoning.

5. **Search & Discovery**: Use search_content to find tasks, projects, or documents related to a topic. Help users locate specific work items.

6. **System Knowledge**: You have access to system documentation via list_system_docs, search_system_docs, and read_system_doc. When users ask about how the system works, its architecture, data models, or features, search and read the system documentation to provide accurate answers.

Available entity types you can work with:
- Projects: Containers for tasks, documents, and blockers
- Tasks: Work items with status, priority, due date, assignee
- Documents: Written content with versioning and review status
- Blockers: Issues preventing work progress"""

        if page_context:
            context_info = f"""

Current Page Context:
- Type: {page_context.type}"""
            if page_context.id:
                context_info += f"\n- Entity ID: {page_context.id}"
            if page_context.project_id:
                context_info += f"\n- Project ID: {page_context.project_id}"
            if page_context.name:
                context_info += f"\n- Name: {page_context.name}"

            context_info += """

Use this context to provide relevant suggestions and defaults for actions."""
            base_prompt += context_info

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
        conversation_id = request.conversation_id or uuid4()

        # Build messages
        messages: List[AIMessage] = []

        # Add conversation history if provided
        for msg in request.messages:
            messages.append(AIMessage(
                role=msg.role,
                content=msg.content,
            ))

        # Add the current user message
        messages.append(AIMessage(role="user", content=request.message))

        # Get tool definitions
        tools = self._get_tool_definitions()
        system_prompt = self._build_system_prompt(request.page_context)

        # Tool results for multi-turn
        tool_results: List[ToolResult] = []
        max_iterations = 10  # Prevent infinite loops

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

                            # Emit tool result event
                            yield SSEEvent(
                                event="tool_result",
                                data=result,
                            )

                            tool_results.append(ToolResult(
                                tool_use_id=tool_use.id,
                                content=result,
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

                            # Tell the LLM the action is pending approval
                            tool_results.append(ToolResult(
                                tool_use_id=tool_use.id,
                                content={
                                    "status": "pending_approval",
                                    "action_id": str(pending_action.id),
                                    "message": f"Action '{preview.description}' is pending user approval. The user will see a preview of the changes.",
                                },
                            ))

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

                # Add assistant response with tool uses to messages for context
                messages.append(AIMessage(
                    role="assistant",
                    content=accumulated_text,
                ))

            # If no tool calls were made, we're done
            if not pending_tool_uses:
                break

        # Done event
        yield SSEEvent(
            event="done",
            data={"conversation_id": str(conversation_id)},
        )

    async def _store_pending_action(
        self,
        conversation_id: UUID,
        preview: ActionPreview,
    ) -> AIPendingAction:
        """Store a pending action for approval."""
        pending_action = AIPendingAction(
            conversation_id=conversation_id,
            tool_name=preview.tool_name,
            tool_input=preview.tool_input,
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
