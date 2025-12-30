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
        """Build the system prompt with page context, user info, and action history."""
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

        # Include action history so AI knows what was already done
        action_context = ""
        if action_history:
            executed = action_history.get("executed", [])
            rejected = action_history.get("rejected", [])

            if executed or rejected:
                action_context = """
## Recently Handled Actions (DO NOT suggest these again)

"""
                if executed:
                    action_context += "**Actions already executed (approved by user):**\n"
                    for action in executed:
                        desc = action.get("description", action.get("tool_name", "Unknown action"))
                        action_context += f"- ✅ {desc}\n"
                    action_context += "\n"

                if rejected:
                    action_context += "**Actions rejected by user (do not suggest again):**\n"
                    for action in rejected:
                        desc = action.get("description", action.get("tool_name", "Unknown action"))
                        action_context += f"- ❌ {desc}\n"
                    action_context += "\n"

                action_context += """IMPORTANT: Do not propose actions that appear in the lists above. If an action was executed, the entity already exists or was already modified. If an action was rejected, the user explicitly declined it.

"""

        base_prompt = date_info + user_info + action_context + """You are a helpful AI assistant for a knowledge management application. You help users manage their projects, tasks, documents, and blockers.

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

5. **Search & Discovery**: Use search_content for keyword-based search across tasks, projects, and documents. Use semantic_search when users describe concepts or topics - it finds semantically related content even without exact keyword matches. Great for exploring connections between ideas.

6. **System Knowledge**: You have access to system documentation via list_system_docs, search_system_docs, and read_system_doc. When users ask about how the system works, its architecture, data models, or features, search and read the system documentation to provide accurate answers.

Available entity types you can work with:
- Projects: Containers for tasks, documents, and blockers
- Tasks: Work items with status, priority, due date, assignee
- Documents: Written content with versioning and review status
- Blockers: Issues preventing work progress
- Journal Entries: Personal notes and project lab notebook entries
- Papers: Research papers in the knowledge library (organization-wide)

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
- Journal entries (personal notes and project lab notebooks)
- Papers (research papers in the knowledge library)
- Semantic search across documents, tasks, journal entries, and papers

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

## Dynamic Query Tool

For flexible queries that don't fit other tools, use `dynamic_query`. It supports structured filters across these tables:

**projects**: id, name, description, status (active/completed/archived/on_hold), project_type, scope, start_date, target_end_date, tags, color, emoji

**tasks**: id, title, status (idea/todo/in_progress/in_review/done), priority (low/medium/high/urgent), due_date, project_id, assignee_id, created_at, updated_at, completed_at

**blockers**: id, title, status (open/in_progress/resolved/wont_fix), priority (1-5), blocker_type, impact_level, due_date, project_id, assignee_id

**documents**: id, title, document_type, status (draft/in_review/approved/published), version, word_count, project_id, created_by_id

**users**: id, display_name, email, title, department (limited fields for privacy)

Common filter patterns for dynamic_query:
- assigned_to_me: true - items assigned to current user
- created_by_me: true - items created by current user
- project_name: "partial name" - filter by project
- assignee_name: "name" - filter by assignee
- is_overdue: true - overdue items
- is_stalled: true - stalled (no update in 7+ days)
- due_before/due_after: date filtering
- exclude_done: true - hide completed items

## Planning Phase (REQUIRED)

Before calling ANY tools, you MUST briefly plan your approach. This is critical for efficiency.

**Step 1: Analyze the Request**
- What is the user actually asking for?
- What specific information would answer their question?

**Step 2: Plan Your Approach (1-2 sentences)**
Think: "To answer this, I need [X]. The most direct way to get it is [tool/approach]."

**Step 3: Choose the Right Tool**
Tool selection heuristics (in order of preference):
- **Relationships between entities** (user↔projects, shared projects, who works on what) → `dynamic_query` on membership tables (project_members, team_members) with filters
- **Cross-entity queries** (tasks across projects, items by multiple criteria) → `dynamic_query` with filters
- **Finding by name/keyword** → `search_content` (searches across all entity types)
- **Finding by concept/topic** → `semantic_search` (finds related content even without exact keyword matches - great for "find documents about X" or exploring connections)
- **Specific entity details** → `get_project_details`, `get_task_details`, etc.
- **Listing with simple filters** → `get_projects`, `get_tasks` with status/assignee filters
- **AVOID**: Iterating through lists with multiple calls. If you find yourself wanting to call the same tool repeatedly for different items, STOP and use `dynamic_query` instead.

**Step 4: Execute with Budget Awareness**
- You have a budget of ~6 tool calls. Most requests need only 1-3.
- After EACH tool call, ask yourself: "Do I have enough to answer the user?" If YES → respond immediately.
- After 2 calls: You likely have enough. Synthesize and respond.
- After 3 calls: You MUST have a good reason to continue.

**Step 5: Respond When Ready**
Don't keep gathering data for completeness. A good answer with available data beats an exhaustive search that times out.

**Example Planning:**
User: "What projects am I on with Sarah?"
Plan: "I need to find projects where both the current user and Sarah are members. I'll query project_members filtered by Sarah's user_id (need to find her ID first), then cross-reference with projects I have access to."
Approach: get_team_members to find Sarah → dynamic_query on project_members with her user_id → respond with shared projects.
Estimated calls: 2

## Strategic Tools

You have access to two special "meta" tools that help you work more effectively:

### `think` - Reasoning Checkpoint
Use this when you need to pause and reason about your approach:
- **Planning**: Figure out how to approach a complex multi-step request
- **Diagnosing**: Understand why results were unexpected (empty searches, errors)
- **Reflecting**: Reassess your approach after gathering new information
- **Synthesizing**: Decide if you have enough information to respond

The system will enrich your thinking with context about your tool call history, patterns detected, and situational guidance. This tool does NOT count against your query budget.

### `ask_user` - User Clarification
Use this instead of guessing when you need user input:
- Multiple entities match a name (which project/task did they mean?)
- Required context is missing (what priority? which project?)
- Search returned similar but not exact matches
- The request is ambiguous

You can provide structured options to make it easy for the user to respond. After the user clarifies, your query budget is refreshed so you can act on their answer.

**When to use these tools:**
- Got empty results? → Use `think` to diagnose, then `ask_user` if needed
- Multiple matches? → Use `ask_user` to let user choose
- Complex request? → Use `think` to plan before starting
- Unsure if you have enough? → Use `think` to assess"""

        # Add dynamic query mode guidance if enabled
        if self.use_dynamic_queries:
            base_prompt += """

## Dynamic Query Mode (Experimental)
You are running in dynamic query mode. Use `dynamic_query` for ALL data retrieval.

Key principles:
1. **One query per data need** - Design a single well-filtered query rather than multiple narrow queries
2. **Combine when possible** - Query multiple tables in one call if you need related data
3. **Filter at query time** - Use filters (assigned_to_me, is_overdue, project_name, etc.) to get relevant results
4. **Never repeat** - If you already queried something, use those results; don't re-query
5. **Respond after querying** - Get the data you need, then synthesize and respond to the user

The dynamic_query tool accepts: tables (array), filters (object), limit (number), and include_relationships (boolean)."""

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

        Returns:
            Dict with 'executed' and 'rejected' lists of actions
        """
        from sqlalchemy import select, or_

        # Get actions from the last hour for this user
        cutoff = datetime.now(timezone.utc) - timedelta(hours=1)

        query = (
            select(AIPendingAction)
            .where(AIPendingAction.user_id == self.user_id)
            .where(or_(
                AIPendingAction.status == "executed",
                AIPendingAction.status == "rejected",
            ))
            .where(AIPendingAction.created_at >= cutoff)
        )

        if conversation_id:
            query = query.where(AIPendingAction.conversation_id == conversation_id)

        query = query.order_by(AIPendingAction.created_at.desc()).limit(limit)

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
