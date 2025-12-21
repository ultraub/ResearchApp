"""Custom field service for managing project-level field definitions and task values."""

from typing import Any, Sequence
from uuid import UUID

import structlog
from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.models.project import ProjectCustomField, TaskCustomFieldValue, Task

logger = structlog.get_logger()


class CustomFieldService:
    """Service for managing custom fields and their values."""

    VALID_FIELD_TYPES = {
        "text",
        "number",
        "date",
        "select",
        "multi_select",
        "user",
        "checkbox",
        "url",
    }

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # Field Definition CRUD
    # =========================================================================

    async def create_field(
        self,
        project_id: UUID,
        name: str,
        display_name: str,
        field_type: str,
        description: str | None = None,
        field_config: dict | None = None,
        applies_to: list[str] | None = None,
        is_required: bool = False,
        position: int | None = None,
        created_by_id: UUID | None = None,
    ) -> ProjectCustomField:
        """Create a new custom field definition for a project."""
        if field_type not in self.VALID_FIELD_TYPES:
            raise ValueError(f"Invalid field type: {field_type}")

        # Validate field_config based on field_type
        config = field_config or {}
        if field_type in ("select", "multi_select") and "options" not in config:
            config["options"] = []

        # Get max position if not specified
        if position is None:
            from sqlalchemy import func
            max_pos_result = await self.db.execute(
                select(func.max(ProjectCustomField.position)).where(
                    ProjectCustomField.project_id == project_id
                )
            )
            max_position = max_pos_result.scalar() or 0
            position = max_position + 1

        field = ProjectCustomField(
            project_id=project_id,
            name=name,
            display_name=display_name,
            description=description,
            field_type=field_type,
            field_config=config,
            applies_to=applies_to or ["task"],
            is_required=is_required,
            position=position,
            created_by_id=created_by_id,
        )
        self.db.add(field)
        await self.db.commit()
        await self.db.refresh(field)

        logger.info(
            "custom_field_created",
            field_id=str(field.id),
            project_id=str(project_id),
            field_type=field_type,
        )

        return field

    async def get_field(self, field_id: UUID) -> ProjectCustomField | None:
        """Get a custom field by ID."""
        result = await self.db.execute(
            select(ProjectCustomField).where(ProjectCustomField.id == field_id)
        )
        return result.scalar_one_or_none()

    async def get_project_fields(
        self,
        project_id: UUID,
        active_only: bool = True,
        applies_to: str | None = None,
    ) -> Sequence[ProjectCustomField]:
        """Get all custom fields for a project."""
        query = select(ProjectCustomField).where(
            ProjectCustomField.project_id == project_id
        )

        if active_only:
            query = query.where(ProjectCustomField.is_active == True)

        if applies_to:
            # Filter by applies_to containing the entity type
            query = query.where(
                ProjectCustomField.applies_to.contains([applies_to])
            )

        query = query.order_by(ProjectCustomField.position)

        result = await self.db.execute(query)
        return result.scalars().all()

    async def update_field(
        self,
        field_id: UUID,
        display_name: str | None = None,
        description: str | None = None,
        field_config: dict | None = None,
        applies_to: list[str] | None = None,
        is_required: bool | None = None,
        is_active: bool | None = None,
        position: int | None = None,
    ) -> ProjectCustomField | None:
        """Update a custom field definition."""
        field = await self.get_field(field_id)
        if not field:
            return None

        if display_name is not None:
            field.display_name = display_name
        if description is not None:
            field.description = description
        if field_config is not None:
            field.field_config = field_config
        if applies_to is not None:
            field.applies_to = applies_to
        if is_required is not None:
            field.is_required = is_required
        if is_active is not None:
            field.is_active = is_active
        if position is not None:
            field.position = position

        await self.db.commit()
        await self.db.refresh(field)

        logger.info("custom_field_updated", field_id=str(field_id))
        return field

    async def delete_field(self, field_id: UUID) -> bool:
        """Delete a custom field and all its values."""
        # Delete values first (should cascade, but being explicit)
        await self.db.execute(
            delete(TaskCustomFieldValue).where(TaskCustomFieldValue.field_id == field_id)
        )

        result = await self.db.execute(
            delete(ProjectCustomField).where(ProjectCustomField.id == field_id)
        )
        await self.db.commit()

        deleted = result.rowcount > 0
        if deleted:
            logger.info("custom_field_deleted", field_id=str(field_id))

        return deleted

    async def reorder_fields(
        self,
        project_id: UUID,
        field_order: list[UUID],
    ) -> Sequence[ProjectCustomField]:
        """Reorder custom fields for a project."""
        for position, field_id in enumerate(field_order, start=1):
            await self.db.execute(
                select(ProjectCustomField)
                .where(
                    and_(
                        ProjectCustomField.id == field_id,
                        ProjectCustomField.project_id == project_id,
                    )
                )
                .execution_options(synchronize_session="fetch")
            )
            result = await self.db.execute(
                select(ProjectCustomField).where(ProjectCustomField.id == field_id)
            )
            field = result.scalar_one_or_none()
            if field and field.project_id == project_id:
                field.position = position

        await self.db.commit()
        return await self.get_project_fields(project_id, active_only=False)

    # =========================================================================
    # Field Value CRUD
    # =========================================================================

    async def set_task_field_value(
        self,
        task_id: UUID,
        field_id: UUID,
        value: Any,
    ) -> TaskCustomFieldValue:
        """Set or update a custom field value for a task."""
        # Check if value already exists
        result = await self.db.execute(
            select(TaskCustomFieldValue).where(
                and_(
                    TaskCustomFieldValue.task_id == task_id,
                    TaskCustomFieldValue.field_id == field_id,
                )
            )
        )
        existing = result.scalar_one_or_none()

        # Wrap value in dict for JSONB storage
        value_dict = {"value": value}

        if existing:
            existing.value = value_dict
            await self.db.commit()
            await self.db.refresh(existing)
            return existing

        field_value = TaskCustomFieldValue(
            task_id=task_id,
            field_id=field_id,
            value=value_dict,
        )
        self.db.add(field_value)
        await self.db.commit()
        await self.db.refresh(field_value)

        logger.info(
            "custom_field_value_set",
            task_id=str(task_id),
            field_id=str(field_id),
        )

        return field_value

    async def set_task_field_values(
        self,
        task_id: UUID,
        field_values: dict[UUID, Any],
    ) -> list[TaskCustomFieldValue]:
        """Set multiple custom field values for a task."""
        results = []
        for field_id, value in field_values.items():
            result = await self.set_task_field_value(task_id, field_id, value)
            results.append(result)
        return results

    async def get_task_field_values(
        self,
        task_id: UUID,
    ) -> Sequence[TaskCustomFieldValue]:
        """Get all custom field values for a task."""
        result = await self.db.execute(
            select(TaskCustomFieldValue)
            .options(selectinload(TaskCustomFieldValue.field))
            .where(TaskCustomFieldValue.task_id == task_id)
        )
        return result.scalars().all()

    async def get_task_field_value(
        self,
        task_id: UUID,
        field_id: UUID,
    ) -> TaskCustomFieldValue | None:
        """Get a specific custom field value for a task."""
        result = await self.db.execute(
            select(TaskCustomFieldValue).where(
                and_(
                    TaskCustomFieldValue.task_id == task_id,
                    TaskCustomFieldValue.field_id == field_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def delete_task_field_value(
        self,
        task_id: UUID,
        field_id: UUID,
    ) -> bool:
        """Delete a custom field value for a task."""
        result = await self.db.execute(
            delete(TaskCustomFieldValue).where(
                and_(
                    TaskCustomFieldValue.task_id == task_id,
                    TaskCustomFieldValue.field_id == field_id,
                )
            )
        )
        await self.db.commit()

        deleted = result.rowcount > 0
        if deleted:
            logger.info(
                "custom_field_value_deleted",
                task_id=str(task_id),
                field_id=str(field_id),
            )

        return deleted

    async def clear_task_field_values(self, task_id: UUID) -> int:
        """Clear all custom field values for a task."""
        result = await self.db.execute(
            delete(TaskCustomFieldValue).where(TaskCustomFieldValue.task_id == task_id)
        )
        await self.db.commit()

        count = result.rowcount
        if count > 0:
            logger.info(
                "custom_field_values_cleared",
                task_id=str(task_id),
                count=count,
            )

        return count

    # =========================================================================
    # Validation
    # =========================================================================

    def validate_value(
        self,
        field: ProjectCustomField,
        value: Any,
    ) -> tuple[bool, str | None]:
        """Validate a value against a field definition."""
        if value is None:
            if field.is_required:
                return False, f"Field '{field.display_name}' is required"
            return True, None

        config = field.field_config

        if field.field_type == "text":
            if not isinstance(value, str):
                return False, "Value must be a string"
            if config.get("max_length") and len(value) > config["max_length"]:
                return False, f"Value exceeds maximum length of {config['max_length']}"

        elif field.field_type == "number":
            if not isinstance(value, (int, float)):
                return False, "Value must be a number"
            if config.get("min") is not None and value < config["min"]:
                return False, f"Value must be at least {config['min']}"
            if config.get("max") is not None and value > config["max"]:
                return False, f"Value must be at most {config['max']}"

        elif field.field_type == "select":
            options = config.get("options", [])
            if value not in options:
                return False, f"Value must be one of: {', '.join(options)}"

        elif field.field_type == "multi_select":
            options = config.get("options", [])
            if not isinstance(value, list):
                return False, "Value must be a list"
            invalid = [v for v in value if v not in options]
            if invalid:
                return False, f"Invalid options: {', '.join(invalid)}"

        elif field.field_type == "checkbox":
            if not isinstance(value, bool):
                return False, "Value must be a boolean"

        elif field.field_type == "url":
            if not isinstance(value, str):
                return False, "Value must be a string"
            if not value.startswith(("http://", "https://")):
                return False, "Value must be a valid URL"

        elif field.field_type == "date":
            # Expecting ISO date string
            if not isinstance(value, str):
                return False, "Value must be a date string (YYYY-MM-DD)"

        elif field.field_type == "user":
            # Expecting UUID string
            if not isinstance(value, str):
                return False, "Value must be a user ID string"

        return True, None
