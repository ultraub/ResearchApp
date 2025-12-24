"""Project action tools for the AI Assistant."""

from datetime import date
from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.tools import ActionTool
from researchhub.ai.assistant.schemas import ActionPreview, DiffEntry
from researchhub.models.project import Project
from researchhub.models.organization import Team, TeamMember
from researchhub.models.user import User
from researchhub.services import access_control as ac


class CreateProjectTool(ActionTool):
    """Create a new project."""

    @property
    def name(self) -> str:
        return "create_project"

    @property
    def description(self) -> str:
        return """Create a new project. Requires user approval before execution.

By default, creates a personal project (scope=PERSONAL) unless a team_id is specified.
For team projects, provide the team_id and optionally set scope to TEAM or ORGANIZATION."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The project name",
                },
                "description": {
                    "type": "string",
                    "description": "Project description",
                },
                "project_type": {
                    "type": "string",
                    "enum": ["general", "clinical_study", "data_analysis", "literature_review", "lab_operations"],
                    "default": "general",
                    "description": "Type of project for workflow suggestions",
                },
                "scope": {
                    "type": "string",
                    "enum": ["PERSONAL", "TEAM", "ORGANIZATION"],
                    "default": "PERSONAL",
                    "description": "Project visibility scope",
                },
                "team_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Team ID for TEAM/ORGANIZATION scope projects",
                },
                "parent_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Parent project ID for creating subprojects",
                },
                "start_date": {
                    "type": "string",
                    "format": "date",
                    "description": "Project start date in YYYY-MM-DD format",
                },
                "target_end_date": {
                    "type": "string",
                    "format": "date",
                    "description": "Target end date in YYYY-MM-DD format",
                },
                "color": {
                    "type": "string",
                    "pattern": "^#[0-9A-Fa-f]{6}$",
                    "description": "Hex color for visual identification (e.g. #3B82F6)",
                },
                "emoji": {
                    "type": "string",
                    "description": "Emoji icon for visual identification",
                },
            },
            "required": ["name"],
        }

    @property
    def entity_type(self) -> str:
        return "project"

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of the project creation."""
        # Build new state
        scope = input.get("scope", "PERSONAL")
        new_state = {
            "name": input["name"],
            "description": input.get("description"),
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

        # Build diff entries
        diff = []
        for field, value in new_state.items():
            if field not in ["team_id", "parent_id"] and value is not None:
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
            old_state=None,
            new_state=new_state,
            diff=diff,
            description=f"Create project: {input['name']}",
        )


class UpdateProjectTool(ActionTool):
    """Update an existing project's properties."""

    @property
    def name(self) -> str:
        return "update_project"

    @property
    def description(self) -> str:
        return """Update an existing project's properties: name, description, status, dates, or visual settings.

Use update_project when the user wants to:
- Change the project name or description
- Update the project status (active, completed, on_hold, archived)
- Modify start/end dates
- Change visual settings (color, emoji)"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The project to update",
                },
                "name": {
                    "type": "string",
                    "description": "New project name",
                },
                "description": {
                    "type": "string",
                    "description": "New project description",
                },
                "status": {
                    "type": "string",
                    "enum": ["active", "completed", "on_hold", "archived"],
                    "description": "New project status",
                },
                "project_type": {
                    "type": "string",
                    "enum": ["general", "clinical_study", "data_analysis", "literature_review", "lab_operations"],
                    "description": "Project type",
                },
                "start_date": {
                    "type": "string",
                    "format": "date",
                    "description": "Project start date in YYYY-MM-DD format",
                },
                "target_end_date": {
                    "type": "string",
                    "format": "date",
                    "description": "Target end date in YYYY-MM-DD format",
                },
                "color": {
                    "type": "string",
                    "pattern": "^#[0-9A-Fa-f]{6}$",
                    "description": "Hex color for visual identification",
                },
                "emoji": {
                    "type": "string",
                    "description": "Emoji icon for visual identification",
                },
            },
            "required": ["project_id"],
        }

    @property
    def entity_type(self) -> str:
        return "project"

    async def get_old_state(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
    ) -> Optional[Dict[str, Any]]:
        """Get the current state of the project."""
        result = await db.execute(
            select(Project)
            .where(Project.id == UUID(input["project_id"]))
            .options(selectinload(Project.team))
        )
        project = result.scalar_one_or_none()
        if not project:
            return None

        return {
            "name": project.name,
            "description": project.description,
            "status": project.status,
            "project_type": project.project_type,
            "start_date": str(project.start_date) if project.start_date else None,
            "target_end_date": str(project.target_end_date) if project.target_end_date else None,
            "color": project.color,
            "emoji": project.emoji,
        }

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of the project update."""
        old_state = await self.get_old_state(input, db)
        if old_state is None:
            return ActionPreview(
                tool_name=self.name,
                tool_input=input,
                entity_type=self.entity_type,
                entity_id=input.get("project_id"),
                old_state=None,
                new_state=None,
                diff=[],
                description="Project not found",
            )

        # Calculate new state by applying changes
        new_state = old_state.copy()
        fields_to_update = ["name", "description", "status", "project_type",
                          "start_date", "target_end_date", "color", "emoji"]

        for field in fields_to_update:
            if field in input and input[field] is not None:
                new_state[field] = input[field]

        # Build diff
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
            entity_type=self.entity_type,
            entity_id=input["project_id"],
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Update project: {project_name}",
        )


class ArchiveProjectTool(ActionTool):
    """Archive a project."""

    @property
    def name(self) -> str:
        return "archive_project"

    @property
    def description(self) -> str:
        return """Archive a project. This sets the project status to 'archived' and is_archived to true.

Use this when:
- User wants to archive a project
- Project is no longer active and should be hidden from default views
- User wants to clean up their project list

Archived projects can be restored later."""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "The project to archive",
                },
                "reason": {
                    "type": "string",
                    "description": "Optional reason for archiving",
                },
            },
            "required": ["project_id"],
        }

    @property
    def entity_type(self) -> str:
        return "project"

    async def get_old_state(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
    ) -> Optional[Dict[str, Any]]:
        """Get the current state of the project."""
        result = await db.execute(
            select(Project).where(Project.id == UUID(input["project_id"]))
        )
        project = result.scalar_one_or_none()
        if not project:
            return None

        return {
            "name": project.name,
            "status": project.status,
            "is_archived": project.is_archived,
        }

    async def create_preview(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> ActionPreview:
        """Create a preview of archiving the project."""
        old_state = await self.get_old_state(input, db)
        if old_state is None:
            return ActionPreview(
                tool_name=self.name,
                tool_input=input,
                entity_type=self.entity_type,
                entity_id=input.get("project_id"),
                old_state=None,
                new_state=None,
                diff=[],
                description="Project not found",
            )

        new_state = {
            "name": old_state["name"],
            "status": "archived",
            "is_archived": True,
        }

        diff = [
            DiffEntry(
                field="status",
                old_value=old_state["status"],
                new_value="archived",
                change_type="modified",
            ),
            DiffEntry(
                field="is_archived",
                old_value=old_state["is_archived"],
                new_value=True,
                change_type="modified",
            ),
        ]

        return ActionPreview(
            tool_name=self.name,
            tool_input=input,
            entity_type=self.entity_type,
            entity_id=input["project_id"],
            old_state=old_state,
            new_state=new_state,
            diff=diff,
            description=f"Archive project: {old_state['name']}",
        )
