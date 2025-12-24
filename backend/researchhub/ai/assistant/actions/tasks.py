"""Task action tools for the AI Assistant."""

from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.tools import ActionTool
from researchhub.ai.assistant.schemas import ActionPreview, DiffEntry
from researchhub.models.project import Task
from researchhub.models.user import User


class CreateTaskTool(ActionTool):
    """Create a new task in a project."""

    @property
    def name(self) -> str:
        return "create_task"

    @property
    def description(self) -> str:
        return "Create a new task in a project. Requires user approval before execution."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The project to create the task in",
                },
                "title": {
                    "type": "string",
                    "description": "The task title",
                },
                "description": {
                    "type": "string",
                    "description": "The task description",
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "urgent"],
                    "default": "medium",
                    "description": "Task priority level",
                },
                "status": {
                    "type": "string",
                    "enum": ["idea", "todo", "in_progress", "in_review", "done"],
                    "default": "todo",
                    "description": "Initial task status",
                },
                "assignee_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "User ID to assign the task to",
                },
                "due_date": {
                    "type": "string",
                    "format": "date",
                    "description": "Due date in YYYY-MM-DD format",
                },
            },
            "required": ["project_id", "title"],
        }

    @property
    def entity_type(self) -> str:
        return "task"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of the task creation."""
        # For create, there's no old state
        old_state = None

        # Build new state
        new_state = {
            "title": input["title"],
            "description": input.get("description"),
            "priority": input.get("priority", "medium"),
            "status": input.get("status", "todo"),
            "project_id": input["project_id"],
        }

        # Resolve assignee name if provided
        if input.get("assignee_id"):
            user_result = await db.execute(
                select(User).where(User.id == UUID(input["assignee_id"]))
            )
            user = user_result.scalar_one_or_none()
            new_state["assignee"] = user.display_name if user else "Unknown"
            new_state["assignee_id"] = input["assignee_id"]

        if input.get("due_date"):
            new_state["due_date"] = input["due_date"]

        # Build diff entries
        diff = []
        for field, value in new_state.items():
            if field not in ["project_id", "assignee_id"]:  # Skip IDs in diff
                diff.append(DiffEntry(
                    field=field,
                    old_value=None,
                    new_value=value,
                    change_type="added",
                ))

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type=self.entity_type,
            entity_id=None,
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Create task: {input['title']}",
        )


class UpdateTaskTool(ActionTool):
    """Update an existing task's properties."""

    @property
    def name(self) -> str:
        return "update_task"

    @property
    def description(self) -> str:
        return "Update an existing task's title, description, priority, status, or due date. Requires user approval before execution."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The ID of the task to update",
                },
                "title": {
                    "type": "string",
                    "description": "New task title",
                },
                "description": {
                    "type": "string",
                    "description": "New task description",
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "urgent"],
                    "description": "New priority level",
                },
                "status": {
                    "type": "string",
                    "enum": ["idea", "todo", "in_progress", "in_review", "done"],
                    "description": "New task status",
                },
                "due_date": {
                    "type": "string",
                    "format": "date",
                    "description": "New due date in YYYY-MM-DD format",
                },
            },
            "required": ["task_id"],
        }

    @property
    def entity_type(self) -> str:
        return "task"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of the task update."""
        task_id = UUID(input["task_id"])

        # Get current task state
        query = (
            select(Task)
            .options(selectinload(Task.assignee))
            .where(Task.id == task_id)
        )
        result = await db.execute(query)
        task = result.scalar_one_or_none()

        if not task:
            raise ValueError(f"Task {task_id} not found")

        # Build old state
        old_state = {
            "title": task.title,
            "description": task.description if isinstance(task.description, str) else None,
            "priority": task.priority,
            "status": task.status,
            "due_date": task.due_date.isoformat() if task.due_date else None,
        }

        # Build new state (only changed fields)
        new_state = old_state.copy()
        diff = []

        update_fields = ["title", "description", "priority", "status", "due_date"]
        for field in update_fields:
            if field in input and input[field] is not None:
                old_value = old_state.get(field)
                new_value = input[field]
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
            entity_type=self.entity_type,
            entity_id=task_id,
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Update task: {task.title}",
        )


class CompleteTaskTool(ActionTool):
    """Mark a task as completed."""

    @property
    def name(self) -> str:
        return "complete_task"

    @property
    def description(self) -> str:
        return "Mark a task as done/completed. Requires user approval before execution."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The ID of the task to complete",
                },
            },
            "required": ["task_id"],
        }

    @property
    def entity_type(self) -> str:
        return "task"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of task completion."""
        task_id = UUID(input["task_id"])

        # Get current task state
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
            "completed_at": "now",  # Will be set to actual timestamp on execution
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
            entity_type=self.entity_type,
            entity_id=task_id,
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Complete task: {task.title}",
        )


class AssignTaskTool(ActionTool):
    """Assign or reassign a task to a user."""

    @property
    def name(self) -> str:
        return "assign_task"

    @property
    def description(self) -> str:
        return "Assign or reassign a task to a user. Requires user approval before execution."

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The ID of the task to assign",
                },
                "assignee_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The user ID to assign the task to",
                },
            },
            "required": ["task_id", "assignee_id"],
        }

    @property
    def entity_type(self) -> str:
        return "task"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of task assignment."""
        task_id = UUID(input["task_id"])
        assignee_id = UUID(input["assignee_id"])

        # Get current task state
        query = (
            select(Task)
            .options(selectinload(Task.assignee))
            .where(Task.id == task_id)
        )
        result = await db.execute(query)
        task = result.scalar_one_or_none()

        if not task:
            raise ValueError(f"Task {task_id} not found")

        # Get new assignee
        user_result = await db.execute(
            select(User).where(User.id == assignee_id)
        )
        new_assignee = user_result.scalar_one_or_none()

        if not new_assignee:
            raise ValueError(f"User {assignee_id} not found")

        old_assignee_name = task.assignee.display_name if task.assignee else None
        new_assignee_name = new_assignee.display_name

        old_state = {
            "assignee": old_assignee_name,
            "assignee_id": str(task.assignee_id) if task.assignee_id else None,
        }

        new_state = {
            "assignee": new_assignee_name,
            "assignee_id": str(assignee_id),
        }

        diff = [
            DiffEntry(
                field="assignee",
                old_value=old_assignee_name,
                new_value=new_assignee_name,
                change_type="modified" if old_assignee_name else "added",
            ),
        ]

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type=self.entity_type,
            entity_id=task_id,
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Assign task '{task.title}' to {new_assignee_name}",
        )
