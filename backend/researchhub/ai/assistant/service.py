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
    ):
        self.provider = provider
        self.db = db
        self.user_id = user_id
        self.org_id = org_id
        self.tool_registry = create_default_registry()

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
    ) -> str:
        """Build the system prompt with page context and user info."""
        # Include current date so the LLM knows what "today" means for overdue/upcoming calculations
        today = date.today()
        date_info = f"""Current Date: {today.strftime('%A, %B %d, %Y')} ({today.isoformat()})

"""
        # Include user context so the AI knows who it's talking to
        user_info = ""
        if user:
            user_info = f"""Current User: {user.display_name}
User ID: {str(self.user_id)}
Email: {user.email}"""
            if user.title:
                user_info += f"\nTitle: {user.title}"
            if user.department:
                user_info += f"\nDepartment: {user.department}"
            user_info += """

When the user says "my tasks", "my projects", or refers to themselves, use this user's ID to filter results.

"""

        base_prompt = date_info + user_info + """You are a helpful AI assistant for a knowledge management application. You help users manage their projects, tasks, documents, and blockers.

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
- Blockers: Issues preventing work progress

## Finding Entities by Name
When users mention entities by name (projects, tasks, people, documents):
1. Use search_content or list tools (get_projects, get_tasks, get_team_members) to find matches
2. If exactly one match → proceed with that entity's ID
3. If multiple matches → ask user to clarify conversationally: "I found 3 tasks with 'login' in the name. Which one did you mean: Login Flow (in INOCA), Login Bug Fix (in Auth), or Login Tests (in QA)?"
4. If no matches → let user know and suggest alternatives or ask for more details

## When to Ask Clarifying Questions
Ask for clarification when:
- The request is ambiguous: "update the task" → "Which task would you like me to update?"
- Multiple entities match a name or description
- Required context is missing: "create a task" → "Which project should I add this task to?"
- The user's intent is unclear or could be interpreted multiple ways

Be conversational and helpful when asking - don't just list options robotically. Use your understanding of the context to ask smart follow-up questions.

## Handling User References
- "my tasks" → tasks assigned to the current user
- "this project" or "the project" → use page context if available, otherwise ask
- "Sarah's blockers" → find Sarah first via get_team_members, then query blockers
- "the INOCA project" → search for INOCA, confirm if multiple matches

## Questions About Your Capabilities
When users ask what you can do, how you work, or about definitions you use, answer directly from this knowledge - don't search system docs for these:

**What you can query:**
- Projects (list, details, by name or ID)
- Tasks (by project, status, assignee, priority, due date)
- Blockers (by project, status, priority)
- Documents (by project, type, status)
- Team members (by name, project, or team)
- Attention summary (overdue, upcoming, blockers, stalled work)

**Actions you can propose** (all require user approval):
- Create tasks, blockers, documents
- Update task status, priority, due date, description
- Complete tasks, resolve blockers
- Assign tasks to team members
- Add comments to tasks

## When to Use Comments vs Updates

**Use COMMENTS (add_comment) for:**
- Recording progress notes: "Completed the first draft, waiting for review"
- Adding context or background information
- Asking questions or requesting clarification
- Noting decisions made or discussions had
- Logging status updates without changing actual status
- Providing feedback or suggestions
- Mentioning important information that doesn't fit in task properties

**Use UPDATES (update_task) for:**
- Changing the task status (e.g., todo → in_progress)
- Adjusting priority level
- Modifying due dates
- Updating the title or description
- Making any change to the task's properties

**Decision guide:**
- If the user says "note that...", "FYI...", "add a note...", "record that..." → use add_comment
- If the user says "mark as...", "change to...", "set the priority...", "update the status..." → use update_task
- When providing a status update WITH context, consider BOTH: update the status AND add a comment explaining why
- For complex updates, adding a comment helps maintain a clear history of what changed and why

**Examples:**
- "Note that we're waiting on the client" → add_comment to the task
- "Mark this task as in progress" → update_task to change status
- "I finished the research, mark it done" → update_task to complete, AND optionally add_comment with details
- "The deadline needs to move to next Friday because of the holiday" → update_task for due date, AND add_comment explaining the reason

**Key definitions:**
- **Stalled task**: A task marked "in progress" that hasn't been updated in 7+ days
- **Overdue task**: A task with a due date in the past that isn't completed
- **Upcoming deadline**: A task due within the next 7 days (configurable)
- **Open blocker**: A blocker with status "open" or "in_progress"
- **Attention items**: Overdue tasks + open blockers + stalled tasks (excludes upcoming deadlines from the urgent count)

**Task statuses**: idea → todo → in_progress → in_review → done
**Blocker statuses**: open → in_progress → resolved
**Priorities**: low, medium, high, critical

## Tool Usage Efficiency
- Most requests need only 1-3 tool calls. Avoid excessive querying.
- After gathering relevant information, immediately synthesize and respond to the user.
- Don't keep gathering data if you already have enough to provide a helpful answer.
- Prefer giving a good answer with available data over exhaustive data collection.
- If you've already queried similar information, use what you have rather than re-querying.
- Always aim to respond within 2-4 tool calls for typical requests."""

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
        # Get or create conversation to ensure it exists in the database
        conversation_id = await self._get_or_create_conversation(
            request.conversation_id,
            request.page_context,
        )

        # Fetch user info for context
        user = await self._get_user_info()

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
        system_prompt = self._build_system_prompt(request.page_context, user)

        # Tool results for multi-turn
        tool_results: List[ToolResult] = []
        max_iterations = 6  # Reduced from 10 to encourage efficient responses
        warning_iteration = 3  # Start nudging toward synthesis
        force_iteration = 4  # Strongly encourage response

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

                # Add assistant response to messages for context (only if there was text)
                # Tool results are passed separately via tool_results parameter
                if accumulated_text:
                    messages.append(AIMessage(
                        role="assistant",
                        content=accumulated_text,
                    ))

                # Inject synthesis prompts when approaching iteration limit
                # This encourages the model to respond rather than keep querying
                if iteration >= force_iteration and not accumulated_text:
                    # Final warning - strongly encourage response
                    messages.append(AIMessage(
                        role="user",
                        content="[System: You have made multiple tool calls. Please provide your response to the user now based on the information you have gathered. Do not make additional tool calls - synthesize what you have and respond helpfully.]",
                    ))
                elif iteration >= warning_iteration and not accumulated_text:
                    # Gentle nudge toward synthesis
                    messages.append(AIMessage(
                        role="user",
                        content="[System: You have gathered information. Please synthesize your findings and respond to the user. Only make additional tool calls if absolutely necessary to answer their question.]",
                    ))

            # If no tool calls were made, we're done
            if not pending_tool_uses:
                break

        # If we exhausted max_iterations without producing text, send a fallback message
        # This can happen if the model keeps calling tools without generating a response
        if iteration == max_iterations - 1 and not accumulated_text:
            fallback_message = "I gathered quite a bit of information but ran into my processing limit before I could summarize it all. Could you try asking a more specific question? For example, instead of 'tell me everything about my work', try 'what are my overdue tasks?' or 'summarize project X'."
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
