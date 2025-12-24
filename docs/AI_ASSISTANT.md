# AI Assistant

## Overview

The AI Assistant is a context-aware chat interface that can query data and propose actions within the application. It uses LLM tool calling to interact with the system on behalf of users.

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

| Tool | Description |
|------|-------------|
| `get_projects` | List accessible projects |
| `get_project_details` | Get project with tasks and stats |
| `get_tasks` | List tasks with filters |
| `get_task_details` | Get task with comments and assignments |
| `get_blockers` | List blockers for a project |
| `get_documents` | List documents with filters |
| `get_document_details` | Get document content and metadata |
| `search_content` | Search across entities |
| `get_attention_summary` | Get items needing attention |
| `get_team_members` | List team members |

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

## Action Tools

Action tools propose changes that require user approval before execution.

| Tool | Description |
|------|-------------|
| `create_task` | Create a new task |
| `update_task` | Update task fields |
| `complete_task` | Mark task as complete |
| `assign_task` | Assign task to user |
| `create_blocker` | Create a new blocker |
| `resolve_blocker` | Resolve a blocker |
| `add_comment` | Add comment to task |

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
| `tool_call` | `{ tool: string, input: object }` | Tool being called |
| `tool_result` | `{ ... }` | Query tool result |
| `action_preview` | ActionPreview | Pending action for approval |
| `error` | `{ message: string }` | Error occurred |
| `done` | `{ conversation_id: string }` | Stream complete |

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
| Google Gemini | `GEMINI_API_KEY` | gemini-2.5-flash |

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
GEMINI_MODEL=gemini-2.5-flash

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
