"""Unified action tools for the AI Assistant.

Consolidates multiple action tools into fewer, more versatile tools
with entity_type parameters. This reduces tool count while maintaining
functionality, improving LLM tool selection accuracy.

Research shows optimal performance at 15-20 tools (LongFuncEval 2025).
"""

from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.tools import ActionTool
from researchhub.ai.assistant.schemas import ActionPreview, DiffEntry
from researchhub.models.project import Project, Task, Blocker
from researchhub.models.document import Document
from researchhub.models.organization import Team
from researchhub.models.user import User


class UnifiedCreateTool(ActionTool):
    """Create any entity type with a single tool.

    Replaces: create_task, create_blocker, create_document, create_project, add_comment
    """

    @property
    def name(self) -> str:
        return "create"

    @property
    def description(self) -> str:
        return """Create a new entity (task, blocker, document, project, or comment).

Use this tool to create:
- **task**: A work item in a project. Requires project_id and title.
- **blocker**: An impediment blocking work. Requires project_id and title.
- **document**: A document in a project. Requires project_id and title.
- **project**: A new project. Requires name.
- **comment**: A comment on a task. Requires parent_id (task ID) and content.

Examples:
- Create task: entity_type="task", project_id="...", title="Review PR"
- Create blocker: entity_type="blocker", project_id="...", title="Waiting for API access"
- Create comment: entity_type="comment", parent_id="task-id", content="Started work on this"
"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "entity_type": {
                    "type": "string",
                    "enum": ["task", "blocker", "document", "project", "comment"],
                    "description": "Type of entity to create",
                },
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Project ID (required for task, blocker, document)",
                },
                "parent_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Parent ID - task ID for comments, parent project for subprojects",
                },
                "title": {
                    "type": "string",
                    "description": "Title (for task, blocker, document) or name (for project)",
                },
                "name": {
                    "type": "string",
                    "description": "Project name (alias for title when entity_type=project)",
                },
                "content": {
                    "type": "string",
                    "description": "Content text (for document or comment) or description",
                },
                "description": {
                    "type": "string",
                    "description": "Description text (alternative to content)",
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "urgent", "critical"],
                    "description": "Priority level",
                },
                "status": {
                    "type": "string",
                    "description": "Initial status (varies by entity type)",
                },
                "assignee_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "User ID to assign to",
                },
                "due_date": {
                    "type": "string",
                    "format": "date",
                    "description": "Due/target date in YYYY-MM-DD format",
                },
                # Blocker-specific
                "blocker_type": {
                    "type": "string",
                    "enum": ["technical", "resource", "dependency", "external", "process", "other"],
                    "description": "Type of blocker (for blocker entity)",
                },
                "impact_level": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "critical"],
                    "description": "Impact level (for blocker entity)",
                },
                # Document-specific
                "document_type": {
                    "type": "string",
                    "enum": ["general", "protocol", "report"],
                    "description": "Type of document (for document entity)",
                },
                # Project-specific
                "project_type": {
                    "type": "string",
                    "enum": ["general", "clinical_study", "data_analysis", "literature_review", "lab_operations"],
                    "description": "Type of project (for project entity)",
                },
                "scope": {
                    "type": "string",
                    "enum": ["PERSONAL", "TEAM", "ORGANIZATION"],
                    "description": "Project visibility scope (for project entity)",
                },
                "team_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Team ID for team/org projects",
                },
            },
            "required": ["entity_type"],
        }

    @property
    def entity_type(self) -> str:
        return "entity"  # Will be refined based on input

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview based on entity type."""
        entity_type = input.get("entity_type")

        if entity_type == "task":
            return await self._preview_create_task(input, db, user_id, org_id)
        elif entity_type == "blocker":
            return await self._preview_create_blocker(input, db, user_id, org_id)
        elif entity_type == "document":
            return await self._preview_create_document(input, db, user_id, org_id)
        elif entity_type == "project":
            return await self._preview_create_project(input, db, user_id, org_id)
        elif entity_type == "comment":
            return await self._preview_create_comment(input, db, user_id, org_id)
        else:
            raise ValueError(f"Unknown entity type: {entity_type}")

    async def _preview_create_task(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Preview task creation."""
        if "project_id" not in input:
            raise ValueError("project_id is required to create a task")
        title = input.get("title") or input.get("name")
        if not title:
            raise ValueError("title is required to create a task")

        new_state = {
            "title": title,
            "description": input.get("description") or input.get("content"),
            "priority": input.get("priority", "medium"),
            "status": input.get("status", "todo"),
            "project_id": input["project_id"],
        }

        # Resolve assignee
        if input.get("assignee_id"):
            user_result = await db.execute(
                select(User).where(User.id == UUID(input["assignee_id"]))
            )
            user = user_result.scalar_one_or_none()
            new_state["assignee"] = user.display_name if user else "Unknown"

        if input.get("due_date"):
            new_state["due_date"] = input["due_date"]

        diff = []
        for field, value in new_state.items():
            if field not in ["project_id"] and value is not None:
                diff.append(DiffEntry(
                    field=field,
                    old_value=None,
                    new_value=value,
                    change_type="added",
                ))

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type="task",
            entity_id=None,
            old_state=None,
            new_state=new_state,
            diff=diff,
            description=f"Create task: {title}",
        )

    async def _preview_create_blocker(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Preview blocker creation."""
        if "project_id" not in input:
            raise ValueError("project_id is required to create a blocker")
        title = input.get("title") or input.get("name")
        if not title:
            raise ValueError("title is required to create a blocker")

        # Map priority string to int if needed
        priority = input.get("priority", 3)
        if isinstance(priority, str):
            priority_map = {"low": 1, "medium": 3, "high": 4, "urgent": 5, "critical": 5}
            priority = priority_map.get(priority, 3)

        new_state = {
            "title": title,
            "description": input.get("description") or input.get("content"),
            "blocker_type": input.get("blocker_type", "other"),
            "priority": priority,
            "impact_level": input.get("impact_level", "medium"),
            "status": "open",
            "project_id": input["project_id"],
        }

        if input.get("assignee_id"):
            user_result = await db.execute(
                select(User).where(User.id == UUID(input["assignee_id"]))
            )
            user = user_result.scalar_one_or_none()
            new_state["assignee"] = user.display_name if user else "Unknown"

        if input.get("due_date"):
            new_state["due_date"] = input["due_date"]

        diff = []
        for field, value in new_state.items():
            if field not in ["project_id"] and value is not None:
                diff.append(DiffEntry(
                    field=field,
                    old_value=None,
                    new_value=value,
                    change_type="added",
                ))

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type="blocker",
            entity_id=None,
            old_state=None,
            new_state=new_state,
            diff=diff,
            description=f"Create blocker: {title}",
        )

    async def _preview_create_document(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Preview document creation."""
        if "project_id" not in input:
            raise ValueError("project_id is required to create a document")
        title = input.get("title") or input.get("name")
        if not title:
            raise ValueError("title is required to create a document")

        new_state = {
            "title": title,
            "document_type": input.get("document_type", "general"),
            "status": input.get("status", "draft"),
            "project_id": input["project_id"],
        }

        content = input.get("content") or input.get("description")
        if content:
            new_state["content_preview"] = content[:200] + "..." if len(content) > 200 else content

        diff = []
        for field, value in new_state.items():
            if field != "project_id" and value is not None:
                diff.append(DiffEntry(
                    field=field,
                    old_value=None,
                    new_value=value,
                    change_type="added",
                ))

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type="document",
            entity_id=None,
            old_state=None,
            new_state=new_state,
            diff=diff,
            description=f"Create document: {title}",
        )

    async def _preview_create_project(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Preview project creation."""
        name = input.get("name") or input.get("title")
        if not name:
            raise ValueError("name is required to create a project")

        scope = input.get("scope", "PERSONAL")
        new_state = {
            "name": name,
            "description": input.get("description") or input.get("content"),
            "project_type": input.get("project_type", "general"),
            "scope": scope,
            "status": "active",
        }

        # Handle team resolution
        if scope == "PERSONAL":
            new_state["scope_display"] = "Personal project"
        else:
            if input.get("team_id"):
                team_result = await db.execute(
                    select(Team).where(Team.id == UUID(input["team_id"]))
                )
                team = team_result.scalar_one_or_none()
                if team:
                    new_state["team"] = team.name
                    new_state["scope_display"] = f"Team project ({team.name})"
            else:
                new_state["scope_display"] = f"{scope} project"

        # Add optional fields
        if input.get("parent_id"):
            parent_result = await db.execute(
                select(Project).where(Project.id == UUID(input["parent_id"]))
            )
            parent = parent_result.scalar_one_or_none()
            if parent:
                new_state["parent"] = parent.name

        for field in ["start_date", "target_end_date", "color", "emoji"]:
            if input.get(field):
                new_state[field] = input[field]

        if input.get("due_date"):
            new_state["target_end_date"] = input["due_date"]

        diff = []
        for field, value in new_state.items():
            if value is not None:
                diff.append(DiffEntry(
                    field=field,
                    old_value=None,
                    new_value=value,
                    change_type="added",
                ))

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type="project",
            entity_id=None,
            old_state=None,
            new_state=new_state,
            diff=diff,
            description=f"Create project: {name}",
        )

    async def _preview_create_comment(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Preview comment creation."""
        parent_id = input.get("parent_id")
        if not parent_id:
            raise ValueError("parent_id (task ID) is required to create a comment")
        content = input.get("content") or input.get("description")
        if not content:
            raise ValueError("content is required to create a comment")

        # Validate task exists
        task_result = await db.execute(
            select(Task).where(Task.id == UUID(parent_id))
        )
        task = task_result.scalar_one_or_none()
        if not task:
            raise ValueError(f"Task {parent_id} not found")

        content_preview = content[:300] + "..." if len(content) > 300 else content

        new_state = {
            "target_type": "task",
            "target": task.title,
            "content": content_preview,
        }

        diff = [
            DiffEntry(
                field="comment",
                old_value=None,
                new_value=content_preview,
                change_type="added",
            ),
        ]

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type="comment",
            entity_id=None,
            old_state=None,
            new_state=new_state,
            diff=diff,
            description=f"Add comment to task: {task.title}",
        )


class UnifiedUpdateTool(ActionTool):
    """Update any entity type with a single tool.

    Replaces: update_task, update_document, update_project
    """

    @property
    def name(self) -> str:
        return "update"

    @property
    def description(self) -> str:
        return """Update an existing entity (task, document, or project).

Use this tool to modify:
- **task**: Change title, description, status, priority, or due_date
- **document**: Change title, status, or content
- **project**: Change name, description, status, or dates

Examples:
- Update task status: entity_type="task", id="...", changes={"status": "in_progress"}
- Change priority: entity_type="task", id="...", changes={"priority": "high"}
- Update document: entity_type="document", id="...", changes={"title": "New Title"}

Note: For assigning tasks, use the assign_task tool. For completing tasks/blockers, use the complete tool.
"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "entity_type": {
                    "type": "string",
                    "enum": ["task", "document", "project"],
                    "description": "Type of entity to update",
                },
                "id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "ID of the entity to update",
                },
                "changes": {
                    "type": "object",
                    "description": "Fields to update. Keys vary by entity type.",
                    "properties": {
                        "title": {"type": "string"},
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "content": {"type": "string"},
                        "status": {"type": "string"},
                        "priority": {"type": "string"},
                        "due_date": {"type": "string", "format": "date"},
                        "start_date": {"type": "string", "format": "date"},
                        "target_end_date": {"type": "string", "format": "date"},
                        "color": {"type": "string"},
                        "emoji": {"type": "string"},
                    },
                },
            },
            "required": ["entity_type", "id", "changes"],
        }

    @property
    def entity_type(self) -> str:
        return "entity"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview based on entity type."""
        entity_type = input.get("entity_type")

        if entity_type == "task":
            return await self._preview_update_task(input, db, user_id, org_id)
        elif entity_type == "document":
            return await self._preview_update_document(input, db, user_id, org_id)
        elif entity_type == "project":
            return await self._preview_update_project(input, db, user_id, org_id)
        else:
            raise ValueError(f"Unknown entity type for update: {entity_type}")

    async def _preview_update_task(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Preview task update."""
        task_id = UUID(input["id"])
        changes = input.get("changes", {})

        query = (
            select(Task)
            .options(selectinload(Task.assignee))
            .where(Task.id == task_id)
        )
        result = await db.execute(query)
        task = result.scalar_one_or_none()

        if not task:
            raise ValueError(f"Task {task_id} not found")

        # Extract text from JSONB description if present
        description_text = None
        if task.description:
            if isinstance(task.description, dict):
                try:
                    content = task.description.get("content", [])
                    if content and len(content) > 0:
                        paragraph = content[0]
                        if paragraph.get("content"):
                            description_text = paragraph["content"][0].get("text", "")
                except (KeyError, IndexError, TypeError):
                    description_text = None
            elif isinstance(task.description, str):
                description_text = task.description

        old_state = {
            "title": task.title,
            "description": description_text,
            "priority": task.priority,
            "status": task.status,
            "due_date": task.due_date.isoformat() if task.due_date else None,
        }

        new_state = old_state.copy()
        diff = []

        # Map 'name' to 'title' for consistency
        if "name" in changes and "title" not in changes:
            changes["title"] = changes.pop("name")

        update_fields = ["title", "description", "priority", "status", "due_date"]
        for field in update_fields:
            if field in changes and changes[field] is not None:
                old_value = old_state.get(field)
                new_value = changes[field]
                if old_value != new_value:
                    new_state[field] = new_value
                    diff.append(DiffEntry(
                        field=field,
                        old_value=old_value,
                        new_value=new_value,
                        change_type="modified",
                    ))

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type="task",
            entity_id=task_id,
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Update task: {task.title}",
        )

    async def _preview_update_document(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Preview document update."""
        document_id = UUID(input["id"])
        changes = input.get("changes", {})

        query = select(Document).where(Document.id == document_id)
        result = await db.execute(query)
        doc = result.scalar_one_or_none()

        if not doc:
            raise ValueError(f"Document {document_id} not found")

        old_state = {
            "title": doc.title,
            "status": doc.status,
        }
        if doc.content_text:
            old_state["content_preview"] = doc.content_text[:200] + "..." if len(doc.content_text) > 200 else doc.content_text

        new_state = old_state.copy()
        diff = []

        # Map 'name' to 'title' for consistency
        if "name" in changes and "title" not in changes:
            changes["title"] = changes.pop("name")

        if "title" in changes and changes["title"] is not None:
            if old_state["title"] != changes["title"]:
                new_state["title"] = changes["title"]
                diff.append(DiffEntry(
                    field="title",
                    old_value=old_state["title"],
                    new_value=changes["title"],
                    change_type="modified",
                ))

        if "status" in changes and changes["status"] is not None:
            if old_state["status"] != changes["status"]:
                new_state["status"] = changes["status"]
                diff.append(DiffEntry(
                    field="status",
                    old_value=old_state["status"],
                    new_value=changes["status"],
                    change_type="modified",
                ))

        if "content" in changes and changes["content"] is not None:
            content = changes["content"]
            new_preview = content[:200] + "..." if len(content) > 200 else content
            new_state["content_preview"] = new_preview
            diff.append(DiffEntry(
                field="content",
                old_value=old_state.get("content_preview"),
                new_value=new_preview,
                change_type="modified",
            ))

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type="document",
            entity_id=document_id,
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Update document: {doc.title}",
        )

    async def _preview_update_project(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Preview project update."""
        project_id = UUID(input["id"])
        changes = input.get("changes", {})

        result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.team))
        )
        project = result.scalar_one_or_none()

        if not project:
            raise ValueError(f"Project {project_id} not found")

        old_state = {
            "name": project.name,
            "description": project.description,
            "status": project.status,
            "project_type": project.project_type,
            "start_date": str(project.start_date) if project.start_date else None,
            "target_end_date": str(project.target_end_date) if project.target_end_date else None,
            "color": project.color,
            "emoji": project.emoji,
        }

        new_state = old_state.copy()

        # Map 'title' to 'name' for projects
        if "title" in changes and "name" not in changes:
            changes["name"] = changes.pop("title")

        fields_to_update = ["name", "description", "status", "project_type",
                          "start_date", "target_end_date", "color", "emoji"]

        for field in fields_to_update:
            if field in changes and changes[field] is not None:
                new_state[field] = changes[field]

        diff = []
        for field in fields_to_update:
            old_val = old_state.get(field)
            new_val = new_state.get(field)
            if old_val != new_val:
                diff.append(DiffEntry(
                    field=field,
                    old_value=old_val,
                    new_value=new_val,
                    change_type="modified",
                ))

        project_name = new_state.get("name", "Unknown")
        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type="project",
            entity_id=project_id,
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Update project: {project_name}",
        )


class CompleteTool(ActionTool):
    """Mark a task or blocker as complete/resolved.

    Replaces: complete_task, resolve_blocker
    """

    @property
    def name(self) -> str:
        return "complete"

    @property
    def description(self) -> str:
        return """Mark a task or blocker as complete/resolved.

Use this tool to:
- **task**: Mark as done (status → "done", sets completed_at)
- **blocker**: Mark as resolved (status → "resolved", sets resolved_at)

Examples:
- Complete task: entity_type="task", id="task-uuid"
- Resolve blocker: entity_type="blocker", id="blocker-uuid", resolution_notes="Fixed by upgrading API"
"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "entity_type": {
                    "type": "string",
                    "enum": ["task", "blocker"],
                    "description": "Type of entity to complete/resolve",
                },
                "id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "ID of the entity to complete",
                },
                "resolution_notes": {
                    "type": "string",
                    "description": "Notes on how the blocker was resolved (for blockers only)",
                },
            },
            "required": ["entity_type", "id"],
        }

    @property
    def entity_type(self) -> str:
        return "entity"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview based on entity type."""
        entity_type = input.get("entity_type")

        if entity_type == "task":
            return await self._preview_complete_task(input, db, user_id, org_id)
        elif entity_type == "blocker":
            return await self._preview_resolve_blocker(input, db, user_id, org_id)
        else:
            raise ValueError(f"Unknown entity type for complete: {entity_type}")

    async def _preview_complete_task(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Preview task completion."""
        task_id = UUID(input["id"])

        query = select(Task).where(Task.id == task_id)
        result = await db.execute(query)
        task = result.scalar_one_or_none()

        if not task:
            raise ValueError(f"Task {task_id} not found")

        old_state = {
            "status": task.status,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        }

        new_state = {
            "status": "done",
            "completed_at": "now",
        }

        diff = [
            DiffEntry(
                field="status",
                old_value=task.status,
                new_value="done",
                change_type="modified",
            ),
        ]

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type="task",
            entity_id=task_id,
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Complete task: {task.title}",
        )

    async def _preview_resolve_blocker(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Preview blocker resolution."""
        blocker_id = UUID(input["id"])

        query = (
            select(Blocker)
            .options(selectinload(Blocker.assignee))
            .where(Blocker.id == blocker_id)
        )
        result = await db.execute(query)
        blocker = result.scalar_one_or_none()

        if not blocker:
            raise ValueError(f"Blocker {blocker_id} not found")

        old_state = {
            "status": blocker.status,
            "resolution_notes": blocker.resolution_notes,
            "resolved_at": blocker.resolved_at.isoformat() if blocker.resolved_at else None,
        }

        new_state = {
            "status": "resolved",
            "resolution_notes": input.get("resolution_notes"),
            "resolved_at": "now",
        }

        diff = [
            DiffEntry(
                field="status",
                old_value=blocker.status,
                new_value="resolved",
                change_type="modified",
            ),
        ]

        if input.get("resolution_notes"):
            diff.append(DiffEntry(
                field="resolution_notes",
                old_value=blocker.resolution_notes,
                new_value=input["resolution_notes"],
                change_type="added" if not blocker.resolution_notes else "modified",
            ))

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type="blocker",
            entity_id=blocker_id,
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Resolve blocker: {blocker.title}",
        )
