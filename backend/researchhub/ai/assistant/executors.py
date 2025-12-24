"""Action executors for the AI Assistant."""

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.models.project import Blocker, Task, TaskComment, TaskDocument
from researchhub.models.document import Document, DocumentComment
from researchhub.models.ai import AIPendingAction
from researchhub.ai.assistant.queries.access import get_accessible_project_ids


class ActionExecutor:
    """Executes approved actions from the AI Assistant."""

    def __init__(self, db: AsyncSession, user_id: UUID, org_id: UUID):
        self.db = db
        self.user_id = user_id
        self.org_id = org_id
        self._accessible_project_ids: Optional[list] = None

    async def _get_accessible_project_ids(self) -> list:
        """Get and cache accessible project IDs for the user."""
        if self._accessible_project_ids is None:
            self._accessible_project_ids = await get_accessible_project_ids(
                self.db, self.user_id
            )
        return self._accessible_project_ids

    async def _verify_project_access(self, project_id: UUID) -> bool:
        """Verify user has access to a project."""
        accessible_ids = await self._get_accessible_project_ids()
        return project_id in accessible_ids

    async def execute_action(self, pending_action: AIPendingAction) -> Dict[str, Any]:
        """Execute an approved pending action."""
        tool_name = pending_action.tool_name
        tool_input = pending_action.tool_input

        # Route to appropriate executor
        executor_map = {
            "create_task": self._execute_create_task,
            "update_task": self._execute_update_task,
            "complete_task": self._execute_complete_task,
            "assign_task": self._execute_assign_task,
            "create_blocker": self._execute_create_blocker,
            "resolve_blocker": self._execute_resolve_blocker,
            "create_document": self._execute_create_document,
            "update_document": self._execute_update_document,
            "link_document_to_task": self._execute_link_document_to_task,
            "add_comment": self._execute_add_comment,
        }

        executor = executor_map.get(tool_name)
        if not executor:
            raise ValueError(f"Unknown action type: {tool_name}")

        result = await executor(tool_input)

        # Update pending action status
        pending_action.status = "executed"
        pending_action.executed_at = datetime.now(timezone.utc)
        await self.db.commit()

        return result

    async def _execute_create_task(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute task creation."""
        from datetime import date as date_type

        # Verify access to the project
        project_id = UUID(input["project_id"])
        if not await self._verify_project_access(project_id):
            return {"success": False, "error": "Access denied to project"}

        # Convert string description to TipTap/ProseMirror JSONB format
        description = None
        if input.get("description"):
            description_text = input["description"]
            description = {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": description_text}]
                    }
                ]
            }

        task = Task(
            project_id=UUID(input["project_id"]),
            title=input["title"],
            description=description,
            priority=input.get("priority", "medium"),
            status=input.get("status", "todo"),
            created_by_id=self.user_id,
        )

        if input.get("assignee_id"):
            task.assignee_id = UUID(input["assignee_id"])

        if input.get("due_date"):
            task.due_date = date_type.fromisoformat(input["due_date"])

        self.db.add(task)
        await self.db.commit()
        await self.db.refresh(task)

        return {
            "success": True,
            "entity_type": "task",
            "entity_id": str(task.id),
            "message": f"Task '{task.title}' created successfully",
        }

    async def _execute_update_task(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute task update."""
        from datetime import date as date_type

        task_id = UUID(input["task_id"])
        result = await self.db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()

        if not task:
            return {"success": False, "error": "Task not found"}

        # Verify access to the task's project
        if not await self._verify_project_access(task.project_id):
            return {"success": False, "error": "Access denied to task's project"}

        # Handle simple fields
        simple_fields = ["title", "priority", "status"]
        for field in simple_fields:
            if field in input and input[field] is not None:
                setattr(task, field, input[field])

        # Handle description separately - convert to JSONB format
        if "description" in input and input["description"] is not None:
            description_text = input["description"]
            task.description = {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": description_text}]
                    }
                ]
            }

        if "due_date" in input and input["due_date"] is not None:
            task.due_date = date_type.fromisoformat(input["due_date"])

        await self.db.commit()

        return {
            "success": True,
            "entity_type": "task",
            "entity_id": str(task.id),
            "message": f"Task '{task.title}' updated successfully",
        }

    async def _execute_complete_task(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute task completion."""
        task_id = UUID(input["task_id"])
        result = await self.db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()

        if not task:
            return {"success": False, "error": "Task not found"}

        # Verify access to the task's project
        if not await self._verify_project_access(task.project_id):
            return {"success": False, "error": "Access denied to task's project"}

        task.status = "done"
        task.completed_at = datetime.now(timezone.utc)
        await self.db.commit()

        return {
            "success": True,
            "entity_type": "task",
            "entity_id": str(task.id),
            "message": f"Task '{task.title}' marked as completed",
        }

    async def _execute_assign_task(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute task assignment."""
        task_id = UUID(input["task_id"])
        assignee_id = UUID(input["assignee_id"])

        result = await self.db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()

        if not task:
            return {"success": False, "error": "Task not found"}

        # Verify access to the task's project
        if not await self._verify_project_access(task.project_id):
            return {"success": False, "error": "Access denied to task's project"}

        task.assignee_id = assignee_id
        await self.db.commit()

        return {
            "success": True,
            "entity_type": "task",
            "entity_id": str(task.id),
            "message": f"Task '{task.title}' assigned successfully",
        }

    async def _execute_create_blocker(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute blocker creation."""
        from datetime import date as date_type

        # Verify access to the project
        project_id = UUID(input["project_id"])
        if not await self._verify_project_access(project_id):
            return {"success": False, "error": "Access denied to project"}

        # Convert string description to TipTap/ProseMirror JSONB format
        description = None
        if input.get("description"):
            description_text = input["description"]
            description = {
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": description_text}]
                    }
                ]
            }

        blocker = Blocker(
            project_id=UUID(input["project_id"]),
            title=input["title"],
            description=description,
            blocker_type=input.get("blocker_type", "other"),
            priority=input.get("priority", 3),
            impact_level=input.get("impact_level", "medium"),
            status="open",
            created_by_id=self.user_id,
        )

        if input.get("assignee_id"):
            blocker.assignee_id = UUID(input["assignee_id"])

        if input.get("due_date"):
            blocker.due_date = date_type.fromisoformat(input["due_date"])

        self.db.add(blocker)
        await self.db.commit()
        await self.db.refresh(blocker)

        return {
            "success": True,
            "entity_type": "blocker",
            "entity_id": str(blocker.id),
            "message": f"Blocker '{blocker.title}' created successfully",
        }

    async def _execute_resolve_blocker(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute blocker resolution."""
        blocker_id = UUID(input["blocker_id"])
        result = await self.db.execute(select(Blocker).where(Blocker.id == blocker_id))
        blocker = result.scalar_one_or_none()

        if not blocker:
            return {"success": False, "error": "Blocker not found"}

        # Verify access to the blocker's project
        if not await self._verify_project_access(blocker.project_id):
            return {"success": False, "error": "Access denied to blocker's project"}

        blocker.status = "resolved"
        blocker.resolved_at = datetime.now(timezone.utc)
        blocker.resolved_by_id = self.user_id

        if input.get("resolution_notes"):
            blocker.resolution_notes = input["resolution_notes"]

        await self.db.commit()

        return {
            "success": True,
            "entity_type": "blocker",
            "entity_id": str(blocker.id),
            "message": f"Blocker '{blocker.title}' resolved successfully",
        }

    async def _execute_create_document(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute document creation."""
        # Verify access to the project
        project_id = UUID(input["project_id"])
        if not await self._verify_project_access(project_id):
            return {"success": False, "error": "Access denied to project"}

        document = Document(
            project_id=project_id,
            title=input["title"],
            document_type=input.get("document_type", "general"),
            status=input.get("status", "draft"),
            created_by_id=self.user_id,
        )

        if input.get("content"):
            # Store as prosemirror content structure
            document.content = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": input["content"]}]}]}
            document.content_text = input["content"]
            document.word_count = len(input["content"].split())

        self.db.add(document)
        await self.db.commit()
        await self.db.refresh(document)

        return {
            "success": True,
            "entity_type": "document",
            "entity_id": str(document.id),
            "message": f"Document '{document.title}' created successfully",
        }

    async def _execute_update_document(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute document update."""
        document_id = UUID(input["document_id"])
        result = await self.db.execute(select(Document).where(Document.id == document_id))
        document = result.scalar_one_or_none()

        if not document:
            return {"success": False, "error": "Document not found"}

        # Verify access to the document's project
        if not await self._verify_project_access(document.project_id):
            return {"success": False, "error": "Access denied to document's project"}

        if "title" in input and input["title"] is not None:
            document.title = input["title"]

        if "status" in input and input["status"] is not None:
            document.status = input["status"]

        if "content" in input and input["content"] is not None:
            document.content = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": input["content"]}]}]}
            document.content_text = input["content"]
            document.word_count = len(input["content"].split())
            document.version = (document.version or 0) + 1

        await self.db.commit()

        return {
            "success": True,
            "entity_type": "document",
            "entity_id": str(document.id),
            "message": f"Document '{document.title}' updated successfully",
        }

    async def _execute_link_document_to_task(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute document-task linking."""
        document_id = UUID(input["document_id"])
        task_id = UUID(input["task_id"])
        link_type = input.get("link_type", "related")

        # Verify both entities exist
        doc_result = await self.db.execute(select(Document).where(Document.id == document_id))
        document = doc_result.scalar_one_or_none()

        task_result = await self.db.execute(select(Task).where(Task.id == task_id))
        task = task_result.scalar_one_or_none()

        if not document:
            return {"success": False, "error": "Document not found"}
        if not task:
            return {"success": False, "error": "Task not found"}

        # Verify access to both projects (document and task should be in accessible projects)
        if not await self._verify_project_access(document.project_id):
            return {"success": False, "error": "Access denied to document's project"}
        if not await self._verify_project_access(task.project_id):
            return {"success": False, "error": "Access denied to task's project"}

        # Check if link already exists
        existing_link = await self.db.execute(
            select(TaskDocument).where(
                TaskDocument.task_id == task_id,
                TaskDocument.document_id == document_id,
            )
        )
        if existing_link.scalar_one_or_none():
            return {"success": False, "error": "Document is already linked to this task"}

        # Create the TaskDocument link
        task_document = TaskDocument(
            task_id=task_id,
            document_id=document_id,
            link_type=link_type,
            created_by_id=self.user_id,
        )
        self.db.add(task_document)
        await self.db.commit()
        await self.db.refresh(task_document)

        return {
            "success": True,
            "entity_type": "document_link",
            "entity_id": str(task_document.id),
            "message": f"Document '{document.title}' linked to task '{task.title}' as {link_type}",
        }

    async def _execute_add_comment(self, input: Dict[str, Any]) -> Dict[str, Any]:
        """Execute comment addition."""
        target_type = input["entity_type"]
        target_id = UUID(input["entity_id"])
        content = input["content"]

        if target_type == "task":
            # Verify task exists and user has access to its project
            task_result = await self.db.execute(select(Task).where(Task.id == target_id))
            task = task_result.scalar_one_or_none()
            if not task:
                return {"success": False, "error": "Task not found"}
            if not await self._verify_project_access(task.project_id):
                return {"success": False, "error": "Access denied to task's project"}

            comment = TaskComment(
                task_id=target_id,
                user_id=self.user_id,
                content=content,
            )
            self.db.add(comment)
            await self.db.commit()
            await self.db.refresh(comment)

            return {
                "success": True,
                "entity_type": "comment",
                "entity_id": str(comment.id),
                "message": "Comment added to task successfully",
            }
        elif target_type == "document":
            # Verify document exists and user has access to its project
            doc_result = await self.db.execute(select(Document).where(Document.id == target_id))
            document = doc_result.scalar_one_or_none()
            if not document:
                return {"success": False, "error": "Document not found"}
            if not await self._verify_project_access(document.project_id):
                return {"success": False, "error": "Access denied to document's project"}

            comment = DocumentComment(
                document_id=target_id,
                created_by_id=self.user_id,
                content=content,
            )
            self.db.add(comment)
            await self.db.commit()
            await self.db.refresh(comment)

            return {
                "success": True,
                "entity_type": "comment",
                "entity_id": str(comment.id),
                "message": "Comment added to document successfully",
            }
        else:
            return {"success": False, "error": f"Unknown entity type: {target_type}"}


async def approve_action(
    db: AsyncSession,
    action_id: UUID,
    user_id: UUID,
    org_id: UUID,
) -> Dict[str, Any]:
    """Approve and execute a pending action."""
    # Get the pending action
    result = await db.execute(
        select(AIPendingAction).where(AIPendingAction.id == action_id)
    )
    pending_action = result.scalar_one_or_none()

    if not pending_action:
        return {"success": False, "error": "Action not found"}

    if pending_action.status != "pending":
        return {"success": False, "error": f"Action is already {pending_action.status}"}

    if pending_action.expires_at < datetime.now(timezone.utc):
        pending_action.status = "expired"
        await db.commit()
        return {"success": False, "error": "Action has expired"}

    # Update approval timestamp
    pending_action.approved_at = datetime.now(timezone.utc)
    pending_action.approved_by_id = user_id

    # Execute the action
    executor = ActionExecutor(db, user_id, org_id)
    return await executor.execute_action(pending_action)


async def reject_action(
    db: AsyncSession,
    action_id: UUID,
    user_id: UUID,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Reject a pending action."""
    result = await db.execute(
        select(AIPendingAction).where(AIPendingAction.id == action_id)
    )
    pending_action = result.scalar_one_or_none()

    if not pending_action:
        return {"success": False, "error": "Action not found"}

    if pending_action.status != "pending":
        return {"success": False, "error": f"Action is already {pending_action.status}"}

    pending_action.status = "rejected"
    await db.commit()

    return {
        "success": True,
        "message": "Action rejected",
        "action_id": str(action_id),
    }
