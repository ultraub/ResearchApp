"""Recurring task service for managing automatic task creation rules."""

from datetime import date, datetime, timezone, timedelta
from typing import Sequence
from uuid import UUID

import structlog
from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.models.project import Task, RecurringTaskRule, TaskAssignment

logger = structlog.get_logger()


class RecurringTaskService:
    """Service for managing recurring task rules and task generation."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # Rule CRUD Operations
    # =========================================================================

    async def create_rule(
        self,
        project_id: UUID,
        title: str,
        recurrence_type: str,
        start_date: date,
        created_by_id: UUID | None = None,
        description: str | None = None,
        task_type: str = "general",
        priority: str = "medium",
        tags: list[str] | None = None,
        estimated_hours: float | None = None,
        default_assignee_ids: list[UUID] | None = None,
        recurrence_config: dict | None = None,
        end_date: date | None = None,
        due_date_offset_days: int | None = None,
        is_active: bool = True,
    ) -> RecurringTaskRule:
        """Create a new recurring task rule."""
        # Calculate first occurrence
        next_occurrence = self._calculate_next_occurrence(
            recurrence_type=recurrence_type,
            recurrence_config=recurrence_config or {},
            start_date=start_date,
            from_date=date.today(),
        )

        rule = RecurringTaskRule(
            project_id=project_id,
            title=title,
            description=description,
            task_type=task_type,
            priority=priority,
            tags=tags or [],
            estimated_hours=estimated_hours,
            created_by_id=created_by_id,
            default_assignee_ids=[str(uid) for uid in (default_assignee_ids or [])],
            recurrence_type=recurrence_type,
            recurrence_config=recurrence_config or {},
            start_date=start_date,
            end_date=end_date,
            due_date_offset_days=due_date_offset_days,
            next_occurrence=next_occurrence,
            is_active=is_active,
        )
        self.db.add(rule)
        await self.db.commit()
        await self.db.refresh(rule)

        logger.info(
            "recurring_rule_created",
            rule_id=str(rule.id),
            project_id=str(project_id),
            recurrence_type=recurrence_type,
            next_occurrence=str(next_occurrence) if next_occurrence else None,
        )

        return rule

    async def get_rule(self, rule_id: UUID) -> RecurringTaskRule | None:
        """Get a recurring task rule by ID."""
        result = await self.db.execute(
            select(RecurringTaskRule).where(RecurringTaskRule.id == rule_id)
        )
        return result.scalar_one_or_none()

    async def get_project_rules(
        self,
        project_id: UUID,
        active_only: bool = True,
    ) -> Sequence[RecurringTaskRule]:
        """Get all recurring task rules for a project."""
        query = select(RecurringTaskRule).where(
            RecurringTaskRule.project_id == project_id
        )

        if active_only:
            query = query.where(RecurringTaskRule.is_active == True)

        query = query.order_by(RecurringTaskRule.created_at.desc())

        result = await self.db.execute(query)
        return result.scalars().all()

    async def update_rule(
        self,
        rule_id: UUID,
        title: str | None = None,
        description: str | None = None,
        task_type: str | None = None,
        priority: str | None = None,
        tags: list[str] | None = None,
        estimated_hours: float | None = None,
        default_assignee_ids: list[UUID] | None = None,
        recurrence_type: str | None = None,
        recurrence_config: dict | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        due_date_offset_days: int | None = None,
        is_active: bool | None = None,
    ) -> RecurringTaskRule | None:
        """Update a recurring task rule."""
        rule = await self.get_rule(rule_id)
        if not rule:
            return None

        if title is not None:
            rule.title = title
        if description is not None:
            rule.description = description
        if task_type is not None:
            rule.task_type = task_type
        if priority is not None:
            rule.priority = priority
        if tags is not None:
            rule.tags = tags
        if estimated_hours is not None:
            rule.estimated_hours = estimated_hours
        if default_assignee_ids is not None:
            rule.default_assignee_ids = [str(uid) for uid in default_assignee_ids]
        if recurrence_type is not None:
            rule.recurrence_type = recurrence_type
        if recurrence_config is not None:
            rule.recurrence_config = recurrence_config
        if start_date is not None:
            rule.start_date = start_date
        if end_date is not None:
            rule.end_date = end_date
        if due_date_offset_days is not None:
            rule.due_date_offset_days = due_date_offset_days
        if is_active is not None:
            rule.is_active = is_active

        # Recalculate next occurrence if recurrence changed
        if any([recurrence_type, recurrence_config, start_date, is_active]):
            rule.next_occurrence = self._calculate_next_occurrence(
                recurrence_type=rule.recurrence_type,
                recurrence_config=rule.recurrence_config,
                start_date=rule.start_date,
                from_date=date.today(),
                end_date=rule.end_date,
            )

        await self.db.commit()
        await self.db.refresh(rule)

        logger.info("recurring_rule_updated", rule_id=str(rule_id))
        return rule

    async def delete_rule(self, rule_id: UUID) -> bool:
        """Delete a recurring task rule."""
        result = await self.db.execute(
            delete(RecurringTaskRule).where(RecurringTaskRule.id == rule_id)
        )
        await self.db.commit()

        deleted = result.rowcount > 0
        if deleted:
            logger.info("recurring_rule_deleted", rule_id=str(rule_id))

        return deleted

    # =========================================================================
    # Task Generation
    # =========================================================================

    async def trigger_rule(
        self,
        rule_id: UUID,
        created_by_id: UUID | None = None,
    ) -> Task | None:
        """Manually trigger a recurring task rule to create a task now."""
        rule = await self.get_rule(rule_id)
        if not rule or not rule.is_active:
            return None

        return await self._create_task_from_rule(rule, created_by_id)

    async def process_due_rules(self) -> list[Task]:
        """Process all rules that are due for task creation. Called by Celery."""
        today = date.today()

        # Find all active rules with next_occurrence <= today
        result = await self.db.execute(
            select(RecurringTaskRule).where(
                and_(
                    RecurringTaskRule.is_active == True,
                    RecurringTaskRule.next_occurrence <= today,
                    # Ensure we haven't passed the end date
                    (RecurringTaskRule.end_date.is_(None)) | (RecurringTaskRule.end_date >= today),
                )
            )
        )
        rules = result.scalars().all()

        created_tasks = []
        for rule in rules:
            try:
                task = await self._create_task_from_rule(rule)
                if task:
                    created_tasks.append(task)

                # Update next occurrence
                rule.next_occurrence = self._calculate_next_occurrence(
                    recurrence_type=rule.recurrence_type,
                    recurrence_config=rule.recurrence_config,
                    start_date=rule.start_date,
                    from_date=today + timedelta(days=1),
                    end_date=rule.end_date,
                )
                rule.last_created_at = datetime.now(timezone.utc)

                # Deactivate if past end date
                if rule.end_date and rule.next_occurrence and rule.next_occurrence > rule.end_date:
                    rule.is_active = False
                    rule.next_occurrence = None

            except Exception as e:
                logger.error(
                    "recurring_task_creation_failed",
                    rule_id=str(rule.id),
                    error=str(e),
                )
                continue

        await self.db.commit()

        logger.info(
            "recurring_rules_processed",
            rules_processed=len(rules),
            tasks_created=len(created_tasks),
        )

        return created_tasks

    async def _create_task_from_rule(
        self,
        rule: RecurringTaskRule,
        created_by_id: UUID | None = None,
    ) -> Task:
        """Create a task from a recurring rule template."""
        # Calculate due date
        due_date = None
        if rule.due_date_offset_days:
            due_date = date.today() + timedelta(days=rule.due_date_offset_days)

        # Get max position for todo status
        from sqlalchemy import func
        max_pos_result = await self.db.execute(
            select(func.max(Task.position)).where(
                Task.project_id == rule.project_id,
                Task.status == "todo",
            )
        )
        max_position = max_pos_result.scalar() or 0

        # Create the task
        task = Task(
            title=rule.title,
            description=rule.description,
            project_id=rule.project_id,
            task_type=rule.task_type,
            priority=rule.priority,
            tags=rule.tags,
            estimated_hours=rule.estimated_hours,
            created_by_id=created_by_id or rule.created_by_id,
            due_date=due_date,
            status="todo",
            position=max_position + 1,
        )
        self.db.add(task)
        await self.db.flush()  # Get task ID

        # Create assignments for default assignees
        if rule.default_assignee_ids:
            for assignee_id in rule.default_assignee_ids:
                assignment = TaskAssignment(
                    task_id=task.id,
                    user_id=UUID(assignee_id),
                    assigned_by_id=created_by_id or rule.created_by_id,
                    role="assignee",
                    status="assigned",
                )
                self.db.add(assignment)

        await self.db.commit()
        await self.db.refresh(task)

        logger.info(
            "recurring_task_created",
            task_id=str(task.id),
            rule_id=str(rule.id),
            project_id=str(rule.project_id),
        )

        return task

    # =========================================================================
    # Recurrence Calculation
    # =========================================================================

    def _calculate_next_occurrence(
        self,
        recurrence_type: str,
        recurrence_config: dict,
        start_date: date,
        from_date: date,
        end_date: date | None = None,
    ) -> date | None:
        """Calculate the next occurrence date based on recurrence rules."""
        if end_date and from_date > end_date:
            return None

        # Start from the later of start_date or from_date
        current = max(start_date, from_date)

        if recurrence_type == "daily":
            next_date = current
        elif recurrence_type == "weekly":
            # Get days of week (0=Monday, 6=Sunday)
            days_of_week = recurrence_config.get("days_of_week", [0])  # Default Monday
            next_date = self._next_weekday(current, days_of_week)
        elif recurrence_type == "biweekly":
            # Every 2 weeks on specified days
            days_of_week = recurrence_config.get("days_of_week", [0])
            week_start = recurrence_config.get("week_start", start_date.isocalendar()[1])
            current_week = current.isocalendar()[1]
            weeks_diff = current_week - week_start
            if weeks_diff % 2 == 0:
                next_date = self._next_weekday(current, days_of_week)
            else:
                # Skip to next week
                next_week = current + timedelta(days=(7 - current.weekday()))
                next_date = self._next_weekday(next_week, days_of_week)
        elif recurrence_type == "monthly":
            day_of_month = recurrence_config.get("day_of_month", 1)
            next_date = self._next_monthly(current, day_of_month)
        elif recurrence_type == "quarterly":
            day_of_month = recurrence_config.get("day_of_month", 1)
            next_date = self._next_quarterly(current, day_of_month)
        elif recurrence_type == "yearly":
            month = recurrence_config.get("month", 1)
            day = recurrence_config.get("day", 1)
            next_date = self._next_yearly(current, month, day)
        else:
            # Custom - use interval_days
            interval = recurrence_config.get("interval_days", 1)
            days_since_start = (current - start_date).days
            next_interval = ((days_since_start // interval) + 1) * interval
            next_date = start_date + timedelta(days=next_interval)

        if end_date and next_date > end_date:
            return None

        return next_date

    def _next_weekday(self, from_date: date, days_of_week: list[int]) -> date:
        """Find the next occurrence on specified days of week."""
        days_of_week = sorted(days_of_week)
        current_dow = from_date.weekday()

        for dow in days_of_week:
            if dow >= current_dow:
                return from_date + timedelta(days=(dow - current_dow))

        # Wrap to next week
        return from_date + timedelta(days=(7 - current_dow + days_of_week[0]))

    def _next_monthly(self, from_date: date, day_of_month: int) -> date:
        """Find the next occurrence on a specific day of month."""
        # Try current month
        try:
            candidate = from_date.replace(day=min(day_of_month, 28))
            if candidate >= from_date:
                return candidate
        except ValueError:
            pass

        # Move to next month
        if from_date.month == 12:
            next_month = from_date.replace(year=from_date.year + 1, month=1, day=1)
        else:
            next_month = from_date.replace(month=from_date.month + 1, day=1)

        try:
            return next_month.replace(day=min(day_of_month, 28))
        except ValueError:
            return next_month

    def _next_quarterly(self, from_date: date, day_of_month: int) -> date:
        """Find the next quarterly occurrence."""
        quarter_months = [1, 4, 7, 10]
        current_month = from_date.month

        for qm in quarter_months:
            if qm >= current_month:
                try:
                    candidate = from_date.replace(month=qm, day=min(day_of_month, 28))
                    if candidate >= from_date:
                        return candidate
                except ValueError:
                    pass

        # Next year Q1
        return from_date.replace(year=from_date.year + 1, month=1, day=min(day_of_month, 28))

    def _next_yearly(self, from_date: date, month: int, day: int) -> date:
        """Find the next yearly occurrence."""
        try:
            candidate = from_date.replace(month=month, day=min(day, 28))
            if candidate >= from_date:
                return candidate
        except ValueError:
            pass

        return from_date.replace(year=from_date.year + 1, month=month, day=min(day, 28))
