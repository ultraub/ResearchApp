# AI Assistant

## Overview

The AI Assistant is a context-aware chat interface that can query data and propose actions within the application. It uses LLM tool calling to interact with the system on behalf of users.

## What Can the AI Assistant Do?

### Queries (Instant Results)

The assistant can search and retrieve information across your workspace:

| Capability | Examples |
|------------|----------|
| **Project Information** | "Show me my projects", "What's the status of INOCA?", "List active projects" |
| **Task Management** | "What tasks are assigned to me?", "Show overdue tasks", "What's blocking this project?" |
| **Attention Summary** | "What needs my attention?", "What should I focus on today?" |
| **Team Members** | "Who's on the Clinical Study project?", "Find Sarah's email" |
| **Documents** | "List documents in this project", "Search for onboarding docs" |
| **Blockers** | "Show open blockers", "What's blocking progress?" |
| **Team Activity** | "What has the team been working on?", "Show recent activity" |
| **Workload** | "What's on my plate?", "How busy is Sarah?", "Show my assignments" |
| **Collaborators** | "Who am I working with?", "Who's on this project?" |
| **Flexible Queries** | "Show me tasks created this week", "Find overdue items assigned to me" |

### Actions (Require Your Approval)

The assistant can propose changes, but **you must approve them** before they happen:

| Action | What It Does |
|--------|--------------|
| **Create Task** | Add a new task to a project |
| **Update Task** | Change title, description, priority, due date, or status |
| **Complete Task** | Mark a task as done |
| **Assign Task** | Assign or reassign a task to a team member |
| **Create Blocker** | Log a new blocker issue |
| **Resolve Blocker** | Mark a blocker as resolved |
| **Create Document** | Create a new document in a project |
| **Update Document** | Change document title, status, or content |
| **Link Document** | Link a document to a task as deliverable or reference |
| **Add Comment** | Add a comment to a task or document |
| **Create Project** | Create a new project (personal, team, or organization scope) |
| **Update Project** | Change project name, description, status, dates, or colors |
| **Archive Project** | Archive a project to hide from default views |
| **Create Journal Entry** | Create a personal or project lab notebook entry |
| **Update Journal Entry** | Modify journal entry content, tags, or status |
| **Link Journal Entry** | Link a journal entry to projects, tasks, or documents |

### System Knowledge (RAG)

The assistant can query its own documentation to answer questions:

| Capability | Examples |
|------------|----------|
| **Architecture** | "How does authentication work?", "What's the project access model?" |
| **Data Models** | "What fields does a Task have?", "How are blockers structured?" |
| **Features** | "How do sharing links work?", "What triggers notifications?" |

### How Action Approval Works

1. You ask: "Create a task for reviewing the protocol"
2. Assistant shows you a preview of what will be created
3. You click **Approve** or **Reject**
4. If approved, the action executes
5. Pending actions expire after 1 hour

## Key Definitions

Understanding terms the assistant uses:

| Term | Definition |
|------|------------|
| **Stalled Task** | A task marked "in progress" that hasn't been updated in 7+ days. Indicates work may be stuck. |
| **Overdue Task** | A task with a due date in the past that isn't marked as done. |
| **Upcoming Deadline** | A task due within the next 7 days (configurable). |
| **Open Blocker** | A blocker with status "open" or "in_progress" that's preventing work. |
| **Attention Items** | The count of urgent items = overdue tasks + open blockers + stalled tasks. |

### Task Statuses

```
idea → todo → in_progress → in_review → done
```

- **Idea**: Captured thought, not yet prioritized
- **Todo**: Ready to be worked on
- **In Progress**: Currently being worked on
- **In Review**: Work complete, awaiting review
- **Done**: Completed

### Blocker Statuses

```
open → in_progress → resolved
```

- **Open**: Issue identified, not yet being addressed
- **In Progress**: Someone is working to resolve it
- **Resolved**: Issue has been resolved

### Priority Levels

```
low → medium → high → critical
```

## Tips for Effective Use

1. **Be specific**: "Show tasks assigned to Sarah in the Clinical Study project" works better than "show tasks"
2. **Use context**: When you're on a project page, the assistant knows which project you mean
3. **Ask follow-ups**: "What about overdue ones?" after listing tasks
4. **Review actions**: Always check the preview before approving changes
5. **Ask about definitions**: "What's a stalled task?" - the assistant can explain its terms

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    Frontend                             │
│  ChatBubble → SSE Stream → Action Preview UI           │
└────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│              AssistantService                          │
│  ┌─────────────────────────────────────────────────┐  │
│  │           System Prompt + Context               │  │
│  └─────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐  │
│  │              Tool Registry                       │  │
│  │  ┌─────────────┐    ┌─────────────┐            │  │
│  │  │ Query Tools │    │Action Tools │            │  │
│  │  │ (immediate) │    │ (approval)  │            │  │
│  │  └─────────────┘    └─────────────┘            │  │
│  └─────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│              AI Provider (LLM)                         │
│  Anthropic Claude | Azure OpenAI | Google Gemini      │
└────────────────────────────────────────────────────────┘
```

## Key Components

### AssistantService

Main service class that orchestrates AI interactions.

**Location**: `backend/researchhub/ai/assistant/service.py`

**Responsibilities**:
- Build system prompt with page context
- Manage tool definitions
- Execute chat loop with tool calling
- Store pending actions for approval
- Stream SSE events to frontend

### ToolRegistry

Registry of available query and action tools.

**Location**: `backend/researchhub/ai/assistant/tools.py`

**Tool Types**:
- `QueryTool`: Read-only, executed immediately
- `ActionTool`: Modifies data, requires user approval

## Query Tools

Query tools provide read-only access to system data. They execute immediately when called by the LLM.

### Project & Task Queries

| Tool | Description |
|------|-------------|
| `get_projects` | List accessible projects |
| `get_project_details` | Get project with tasks and stats |
| `get_tasks` | List tasks with filters |
| `get_task_details` | Get task with comments and assignments |
| `get_blockers` | List blockers for a project |

### Document Queries

| Tool | Description |
|------|-------------|
| `get_documents` | List documents with filters |
| `get_document_details` | Get document content and metadata |

### Search & Discovery

| Tool | Description |
|------|-------------|
| `search_content` | Search across entities |
| `get_attention_summary` | Get items needing attention |
| `get_team_members` | List team members |

### Collaboration & Team Awareness

| Tool | Description |
|------|-------------|
| `get_team_activity` | Get recent activity from team members across accessible projects |
| `get_user_workload` | Get a user's current task load and assignments |
| `get_collaborators` | Find people collaborating on shared projects |
| `get_recent_activity` | Get activity feed across all accessible projects |

**`get_team_activity` Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| days | No | Days of activity to retrieve (1-30, default: 7) |
| user_id | No | Filter to a specific user's activity |
| project_id | No | Filter to a specific project |
| activity_types | No | Filter by type: task, document, comment, project, blocker |
| limit | No | Maximum activities to return (default: 25, max: 100) |

**`get_user_workload` Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| user_id | No | User to get workload for (defaults to current user) |
| include_completed | No | Include recently completed tasks (default: false) |

**`get_collaborators` Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| project_id | No | Get collaborators for a specific project |
| user_id | No | Find collaborators of a specific user |

**`get_recent_activity` Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| hours | No | Hours of activity to look back (1-168, default: 24) |
| limit | No | Maximum activities to return (default: 30, max: 100) |
| exclude_own | No | Exclude your own activity (default: false) |

### Dynamic Queries

The `dynamic_query` tool allows flexible database queries with structured filters across multiple tables.

| Tool | Description |
|------|-------------|
| `dynamic_query` | Execute flexible queries with filters across projects, tasks, blockers, documents, users, journal entries, comments, teams, and more |

**Supported Tables**: projects, tasks, blockers, documents, users, journal_entries, comments, teams, organizations, team_members, organization_members, departments, project_members

**Common Filters**:
| Filter | Description |
|--------|-------------|
| status | Filter by status (single value or array) |
| priority | Filter by priority level |
| project_id | Filter by project UUID |
| project_name | Filter by project name (partial match) |
| assignee_name | Filter by assignee name (partial match) |
| assigned_to_me | Filter to items assigned to current user |
| created_by_me | Filter to items created by current user |
| due_before / due_after | Filter by due date range |
| updated_after / created_after | Filter to recently modified items |
| is_overdue | Items with due date in past and not done |
| is_stalled | Items in_progress with no update in 7+ days |
| exclude_done | Exclude completed items |
| search | Search text in title/name fields |

**Include Relationships**: Use the `include` parameter to load related data (e.g., `include: ["project", "assignee"]` for tasks).

### System Documentation (RAG)

The assistant can query the system's own documentation to answer questions about architecture, data models, and features:

| Tool | Description |
|------|-------------|
| `list_system_docs` | List available system documentation files |
| `search_system_docs` | Search documentation by keyword (returns excerpts) |
| `read_system_doc` | Read full content of a specific doc by ID or title |

**System Doc Tool Usage**:
- Used when users ask "how does X work?" or "what is the data model for Y?"
- Queries documents marked with `is_system = true`
- Supports filtering by `document_type` (architecture, data_model, guide)
- Returns excerpts with context around matched keywords

### Query Tool Example

```python
class GetTasksTool(QueryTool):
    @property
    def name(self) -> str:
        return "get_tasks"

    @property
    def description(self) -> str:
        return "Get tasks for a project with optional filters"

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "Project UUID"},
                "status": {"type": "string", "enum": ["todo", "in_progress", "done"]},
                "assignee_id": {"type": "string"},
            },
            "required": ["project_id"],
        }

    async def execute(self, input, db, user_id, org_id) -> dict:
        # Execute query and return results
        tasks = await query_tasks(db, input, user_id)
        return {"tasks": [task.to_dict() for task in tasks]}
```

## Strategic Tools

Strategic tools are meta-level tools that help the assistant reason more effectively and interact with users when needed. Unlike query tools (which fetch data) or action tools (which modify data), strategic tools manage the assistant's reasoning process.

### Think Tool

The `think` tool provides a structured reasoning checkpoint for the assistant.

| Tool | Description |
|------|-------------|
| `think` | Record reasoning, assess situation, and plan next steps |

**Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| thought | Yes | Current reasoning about the situation |
| assessment | Yes | Assessment of progress (on_track, stuck, need_info, or complete) |
| next_step | No | Planned next action if assessment is on_track |
| what_i_need | No | What information is needed if assessment is need_info |
| why_stuck | No | Explanation if assessment is stuck |

**When Used**:
- Before calling query tools (planning)
- After receiving results (evaluation)
- When encountering ambiguity
- To document reasoning chains

**Context Enrichment**: When the assistant thinks, the tool may return contextual hints about available tools, common patterns, or suggestions based on the current situation.

### Ask User Tool

The `ask_user` tool requests clarification from the user when the assistant needs more information to proceed.

| Tool | Description |
|------|-------------|
| `ask_user` | Ask the user a clarifying question with optional structured choices |

**Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| question | Yes | The question to ask the user |
| reason | No | Why this clarification is needed |
| options | No | Array of structured choices for the user |

**Options Structure**:
```json
{
  "label": "Display text for the option",
  "value": "Internal value returned if selected",
  "description": "Optional longer description"
}
```

**When Used**:
- Ambiguous requests with multiple interpretations
- Missing required information (e.g., which project?)
- User preference needed for action details
- Confirming understanding before complex operations

**Flow**:
1. Assistant calls `ask_user` with question and optional choices
2. Backend emits `clarification_needed` SSE event
3. Stream pauses, frontend displays interactive card
4. User selects option or types custom response
5. Response sent as new message, assistant continues

### Tool Budgets

The assistant operates with a budget system that limits tool calls per conversation turn:

| Budget Type | Tools | Per-Turn Limit | Reset Behavior |
|-------------|-------|----------------|----------------|
| Query | All query tools | 15 calls | Resets each turn |
| Action | All action tools | 5 calls | Resets each turn |
| Meta | think, ask_user | 10 calls | Resets each turn |

**Budget Exhaustion**:
- When a budget is exhausted, the assistant is informed and should wrap up
- Query budget exhaustion suggests summarizing findings
- Action budget exhaustion means no more modifications this turn
- User responses to clarifications start a fresh turn with reset budgets

## Action Tools

Action tools propose changes that require user approval before execution.

### Task Actions

| Tool | Description |
|------|-------------|
| `create_task` | Create a new task |
| `update_task` | Update task fields (title, description, priority, due date, status) |
| `complete_task` | Mark task as complete |
| `assign_task` | Assign task to user |

### Blocker Actions

| Tool | Description |
|------|-------------|
| `create_blocker` | Create a new blocker |
| `resolve_blocker` | Resolve a blocker |

### Document Actions

| Tool | Description |
|------|-------------|
| `create_document` | Create a new document in a project |
| `update_document` | Update document title, status, or content |
| `link_document_to_task` | Link document to task as deliverable/reference |

### Comment Actions

| Tool | Description |
|------|-------------|
| `add_comment` | Add comment to task or document |

### Project Actions

| Tool | Description |
|------|-------------|
| `create_project` | Create a new project |
| `update_project` | Update project properties |
| `archive_project` | Archive a project |

**`create_project` Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| name | Yes | The project name |
| description | No | Project description |
| project_type | No | general, clinical_study, data_analysis, literature_review, lab_operations (default: general) |
| scope | No | PERSONAL, TEAM, ORGANIZATION (default: PERSONAL) |
| team_id | No | Team ID for TEAM/ORGANIZATION scope projects |
| parent_id | No | Parent project ID for creating subprojects |
| start_date | No | Project start date (YYYY-MM-DD) |
| target_end_date | No | Target end date (YYYY-MM-DD) |
| color | No | Hex color for visual identification (e.g., #3B82F6) |
| emoji | No | Emoji icon for visual identification |

**`update_project` Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| project_id | Yes | The project to update |
| name | No | New project name |
| description | No | New project description |
| status | No | active, completed, on_hold, archived |
| project_type | No | Project type |
| start_date | No | Project start date (YYYY-MM-DD) |
| target_end_date | No | Target end date (YYYY-MM-DD) |
| color | No | Hex color |
| emoji | No | Emoji icon |

**`archive_project` Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| project_id | Yes | The project to archive |
| reason | No | Optional reason for archiving |

### Journal Entry Actions

| Tool | Description |
|------|-------------|
| `create_journal_entry` | Create a personal or project journal entry |
| `update_journal_entry` | Update an existing journal entry |
| `link_journal_entry` | Link a journal entry to projects, tasks, or documents |

**`create_journal_entry` Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| content_text | Yes | The journal entry content as plain text |
| title | No | Entry title (recommended) |
| entry_date | No | Date of the entry (YYYY-MM-DD, defaults to today) |
| scope | No | personal, project (default: personal) |
| project_id | No | Project ID (required if scope=project) |
| entry_type | No | observation, experiment, meeting, idea, reflection, protocol (default: observation) |
| tags | No | Tags for organizing the entry |
| mood | No | Optional mood/status indicator |

**`update_journal_entry` Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| entry_id | Yes | The journal entry to update |
| title | No | New entry title |
| content_text | No | New entry content |
| entry_date | No | New entry date (YYYY-MM-DD) |
| entry_type | No | New entry type |
| tags | No | New tags |
| mood | No | New mood/status |
| is_pinned | No | Whether to pin the entry |
| is_archived | No | Whether to archive the entry |

**`link_journal_entry` Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| entry_id | Yes | The journal entry to link from |
| entity_type | Yes | project, task, or document |
| entity_id | Yes | ID of the entity to link to |
| link_type | No | reference, result, follow_up, related (default: reference) |
| notes | No | Optional notes about the link |

### Document Action Details

**`create_document` Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| project_id | Yes | Project to create document in |
| title | Yes | Document title |
| document_type | No | general, protocol, report (default: general) |
| content | No | Initial content (markdown) |
| status | No | draft, in_review, approved, published (default: draft) |

**`update_document` Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| document_id | Yes | Document to update |
| title | No | New title |
| status | No | New status |
| content | No | New content (replaces existing) |

**`link_document_to_task` Parameters**:
| Parameter | Required | Description |
|-----------|----------|-------------|
| document_id | Yes | Document to link |
| task_id | Yes | Task to link to |
| link_type | No | deliverable, reference, related (default: related) |

### Action Approval Flow

```
1. LLM calls action tool
2. ActionTool.create_preview() generates preview
3. AIPendingAction record created (expires in 1 hour)
4. Frontend displays action preview UI
5. User approves or rejects
6. If approved: ActionTool.execute() runs
7. Result sent back to LLM for continuation
```

### ActionPreview Structure

```python
@dataclass
class ActionPreview:
    tool_name: str           # Action tool name
    description: str         # Human description
    entity_type: str         # task, blocker, etc.
    entity_id: UUID | None   # Target entity
    tool_input: dict         # Tool input params
    old_state: dict | None   # Current state
    new_state: dict          # Proposed state
    diff: list[FieldDiff]    # Field-level changes
```

### Action Tool Example

```python
class CreateTaskTool(ActionTool):
    @property
    def entity_type(self) -> str:
        return "task"

    async def create_preview(self, input, db, user_id, org_id) -> ActionPreview:
        return ActionPreview(
            tool_name=self.name,
            description=f"Create task: {input['title']}",
            entity_type="task",
            entity_id=None,
            tool_input=input,
            old_state=None,
            new_state=input,
            diff=[
                FieldDiff(field="title", new_value=input["title"], change_type="add"),
            ],
        )

    async def execute(self, input, db, user_id, org_id) -> dict:
        task = Task(**input, created_by_id=user_id)
        db.add(task)
        await db.commit()
        return {"task_id": str(task.id), "success": True}
```

## Page Context

The assistant receives page context to provide relevant suggestions.

**PageContext Fields**:
```python
class PageContext:
    type: str           # project, task, document, dashboard
    id: UUID | None     # Entity ID
    project_id: UUID | None
    name: str | None    # Entity name
```

**System Prompt Usage**:
```
Current Page Context:
- Type: project
- Entity ID: abc123...
- Project ID: abc123...
- Name: Clinical Study Alpha

Use this context to provide relevant suggestions and defaults for actions.
```

## SSE Events

The chat endpoint returns Server-Sent Events:

| Event | Data | Description |
|-------|------|-------------|
| `text` | `{ content: string }` | Text content from LLM |
| `text_delta` | `{ content: string }` | Streaming text chunk |
| `thinking` | `{ content: string }` | Model reasoning (Gemini 3+) |
| `tool_call` | `{ tool: string, input: object }` | Tool being called |
| `tool_result` | `{ ... }` | Query tool result |
| `action_preview` | ActionPreview | Pending action for approval |
| `clarification_needed` | `{ question, reason?, options[] }` | Assistant needs user input |
| `error` | `{ message: string }` | Error occurred |
| `done` | `{ conversation_id: string }` | Stream complete |

### Clarification Flow

When the assistant needs user input to proceed:

1. Assistant calls `ask_user` tool with question and optional choices
2. Backend emits `clarification_needed` event and stops the stream
3. Frontend displays an interactive card with the question/options
4. User responds (clicks option or types answer)
5. Response sent as new message, assistant continues with fresh context

## AI Providers

### Provider Interface

```python
class AIProvider(ABC):
    async def complete_with_tools(
        self,
        messages: List[AIMessage],
        tools: List[ToolDefinition],
        tool_results: List[ToolResult] | None,
        system: str | None,
        temperature: float,
        max_tokens: int,
    ) -> AIResponse
```

### Supported Providers

| Provider | Config | Default Model |
|----------|--------|---------------|
| Anthropic | `ANTHROPIC_API_KEY` | claude-3-5-sonnet-20241022 |
| Azure OpenAI | `AZURE_OPENAI_*` | gpt-4 |
| Google Gemini | `GEMINI_API_KEY` | gemini-3-flash-preview |

### Provider Selection

```python
AI_PRIMARY_PROVIDER=anthropic|azure_openai|gemini
```

## PHI Detection

The AI service includes PHI detection to prevent sensitive data exposure.

**Location**: `backend/researchhub/ai/phi_detector.py`

**Detected Patterns**:
- SSN patterns
- Phone numbers
- Email addresses
- Medical record numbers
- Credit card numbers
- Dates of birth

## Configuration

### Environment Variables

```bash
# AI Feature Flag
FEATURE_AI_ENABLED=true

# Provider Selection
AI_PRIMARY_PROVIDER=gemini

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://...
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=gpt-4

# Google Gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3-flash-preview

# Rate Limiting
RATE_LIMIT_AI_REQUESTS_PER_MINUTE=20
```

## Frontend Integration

### Chat Bubble Component

**Location**: `frontend/src/components/ai/chat-bubble/`

**Features**:
- Floating chat interface
- SSE stream handling
- Markdown rendering
- Action preview cards
- Approve/reject buttons

### useChatBubble Hook

**Location**: `frontend/src/hooks/useChatBubble.ts`

**Provides**:
- Message state management
- SSE connection handling
- Action approval/rejection
- Conversation history

### usePageContext Hook

**Location**: `frontend/src/hooks/usePageContext.ts`

**Returns current page context for assistant requests.**

## Pending Actions

### Database Model

```python
class AIPendingAction(BaseModel):
    conversation_id: UUID
    tool_name: str
    tool_input: dict        # JSONB
    entity_type: str
    entity_id: UUID | None
    old_state: dict | None  # JSONB
    new_state: dict         # JSONB
    status: str             # pending, approved, rejected, expired
    expires_at: DateTime    # 1 hour from creation
    user_id: UUID
    organization_id: UUID
```

### Approval Endpoints

```
GET  /assistant/actions           # List pending actions
POST /assistant/actions/{id}/approve
POST /assistant/actions/{id}/reject
```

## Auto-Review Integration

The AI can also power automated document reviews:

**Location**: `backend/researchhub/services/auto_review.py`

**Triggers**:
- Document creation
- Document update
- Task status change to "in_review"

**Configuration**: Per-organization via `AutoReviewConfig` model.

## Extending the Assistant

### Adding a Query Tool

1. Create class in `ai/assistant/queries/`
2. Inherit from `QueryTool`
3. Implement `name`, `description`, `input_schema`, `execute`
4. Register in `create_default_registry()`

### Adding an Action Tool

1. Create class in `ai/assistant/actions/`
2. Inherit from `ActionTool`
3. Implement `entity_type`, `create_preview`, `execute`
4. Register in `create_default_registry()`

### Adding a Provider

1. Create class in `ai/providers/`
2. Inherit from `AIProvider`
3. Implement `complete_with_tools`
4. Add to provider factory in `ai/providers/__init__.py`
