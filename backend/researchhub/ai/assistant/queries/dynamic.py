"""Dynamic query tool for flexible AI-powered database queries.

Allows the AI to query the database using structured filters while
ensuring access control is always enforced.
"""

import asyncio
import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Type
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from researchhub.ai.assistant.queries.access import get_accessible_project_ids
from researchhub.ai.assistant.tools import QueryTool
from researchhub.models.document import Document
from researchhub.models.project import Blocker, Project, Task
from researchhub.models.user import User

logger = logging.getLogger(__name__)


class DynamicQueryTool(QueryTool):
    """Execute dynamic database queries with structured filters.

    This tool allows the AI to query projects, tasks, blockers, documents,
    and users with flexible filtering. Access control is always enforced
    by filtering to the user's accessible projects.

    Use this tool for ad-hoc queries that don't fit existing specialized tools.
    """

    # Table name to model mapping
    ALLOWED_TABLES: Dict[str, Type] = {
        "projects": Project,
        "tasks": Task,
        "blockers": Blocker,
        "documents": Document,
        "users": User,
    }

    # Safe columns per table (excludes sensitive data)
    SAFE_COLUMNS: Dict[str, List[str]] = {
        "projects": [
            "id", "name", "description", "status", "project_type", "scope",
            "start_date", "target_end_date", "actual_end_date",
            "created_at", "updated_at", "color", "emoji", "tags",
        ],
        "tasks": [
            "id", "title", "status", "priority", "task_type", "due_date",
            "estimated_hours", "actual_hours", "position", "tags",
            "created_at", "updated_at", "completed_at",
            "project_id", "assignee_id", "created_by_id",
        ],
        "blockers": [
            "id", "title", "status", "priority", "blocker_type", "impact_level",
            "due_date", "tags", "created_at", "updated_at", "resolved_at",
            "project_id", "assignee_id", "created_by_id",
        ],
        "documents": [
            "id", "title", "document_type", "status", "version", "word_count",
            "tags", "created_at", "updated_at",
            "project_id", "created_by_id",
        ],
        "users": [
            "id", "display_name", "email", "title", "department",
        ],
    }

    # Relationships to eager load per table
    EAGER_LOAD: Dict[str, List[str]] = {
        "tasks": ["assignee", "project"],
        "blockers": ["assignee", "project"],
        "documents": ["project", "created_by"],
        "projects": [],
        "users": [],
    }

    @property
    def name(self) -> str:
        return "dynamic_query"

    @property
    def description(self) -> str:
        return """Execute a dynamic database query with structured filters.

Use this tool for flexible queries across projects, tasks, blockers, documents, or users.
Access control is automatically enforced - you can only see data from accessible projects.

Available tables: projects, tasks, blockers, documents, users

Common filter patterns:
- status: Filter by status value(s)
- priority: Filter by priority level
- assignee_name: Filter by assignee's name (partial match)
- project_name: Filter by project name (partial match)
- created_by_me: Filter to items created by current user
- assigned_to_me: Filter to items assigned to current user
- due_before/due_after: Filter by due date range
- updated_after: Filter to recently updated items
- search: Search text in title/name fields

Examples:
- "My overdue tasks": table=tasks, assigned_to_me=true, due_before=today, status not done
- "Open blockers in INOCA": table=blockers, project_name=INOCA, status=open|in_progress
- "Recent documents": table=documents, updated_after=7 days ago, order_by=updated_at desc
"""

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "table": {
                    "type": "string",
                    "enum": ["projects", "tasks", "blockers", "documents", "users"],
                    "description": "The table to query",
                },
                "filters": {
                    "type": "object",
                    "description": "Filter conditions to apply",
                    "properties": {
                        "status": {
                            "oneOf": [
                                {"type": "string"},
                                {"type": "array", "items": {"type": "string"}},
                            ],
                            "description": "Filter by status (single value or list)",
                        },
                        "priority": {
                            "oneOf": [
                                {"type": "string"},
                                {"type": "array", "items": {"type": "string"}},
                            ],
                            "description": "Filter by priority (single value or list)",
                        },
                        "project_id": {
                            "type": "string",
                            "description": "Filter by project UUID",
                        },
                        "project_name": {
                            "type": "string",
                            "description": "Filter by project name (partial match)",
                        },
                        "assignee_name": {
                            "type": "string",
                            "description": "Filter by assignee name (partial match)",
                        },
                        "assigned_to_me": {
                            "type": "boolean",
                            "description": "Filter to items assigned to current user",
                        },
                        "created_by_me": {
                            "type": "boolean",
                            "description": "Filter to items created by current user",
                        },
                        "due_before": {
                            "type": "string",
                            "description": "Due date before this (YYYY-MM-DD or 'today')",
                        },
                        "due_after": {
                            "type": "string",
                            "description": "Due date after this (YYYY-MM-DD or 'today')",
                        },
                        "updated_after": {
                            "type": "string",
                            "description": "Updated after this (YYYY-MM-DD or relative like '7 days ago')",
                        },
                        "created_after": {
                            "type": "string",
                            "description": "Created after this (YYYY-MM-DD or relative like '30 days ago')",
                        },
                        "search": {
                            "type": "string",
                            "description": "Search text in title/name (partial match)",
                        },
                        "is_overdue": {
                            "type": "boolean",
                            "description": "Filter to overdue items (due_date < today, not done)",
                        },
                        "is_stalled": {
                            "type": "boolean",
                            "description": "Filter to stalled items (in_progress, no update in 7+ days)",
                        },
                        "exclude_done": {
                            "type": "boolean",
                            "description": "Exclude completed/done items",
                        },
                    },
                },
                "order_by": {
                    "type": "string",
                    "description": "Column to order by (e.g., 'due_date asc', 'updated_at desc')",
                },
                "limit": {
                    "type": "integer",
                    "default": 20,
                    "maximum": 100,
                    "description": "Maximum rows to return (default 20, max 100)",
                },
            },
            "required": ["table"],
        }

    async def execute(
        self,
        input: Dict[str, Any],
        db: AsyncSession,
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Execute the dynamic query with access control."""
        table_name = input.get("table")
        filters = input.get("filters", {})
        order_by = input.get("order_by")
        limit = min(input.get("limit", 20), 100)

        # Validate table
        if table_name not in self.ALLOWED_TABLES:
            return {
                "error": f"Invalid table: {table_name}. Allowed: {list(self.ALLOWED_TABLES.keys())}",
                "results": [],
                "count": 0,
            }

        model = self.ALLOWED_TABLES[table_name]

        # Log the query for audit purposes
        logger.info(
            f"DynamicQuery: user={user_id}, table={table_name}, "
            f"filters={filters}, order_by={order_by}, limit={limit}"
        )

        try:
            # Execute with timeout protection
            result = await asyncio.wait_for(
                self._execute_query(
                    db, model, table_name, filters, order_by, limit, user_id, org_id
                ),
                timeout=5.0,
            )
            return result
        except asyncio.TimeoutError:
            logger.warning(f"DynamicQuery timeout: user={user_id}, table={table_name}")
            return {
                "error": "Query timed out. Try adding more specific filters.",
                "results": [],
                "count": 0,
            }
        except Exception as e:
            logger.error(f"DynamicQuery error: {e}", exc_info=True)
            return {
                "error": f"Query failed: {str(e)}",
                "results": [],
                "count": 0,
            }

    async def _execute_query(
        self,
        db: AsyncSession,
        model: Type,
        table_name: str,
        filters: Dict[str, Any],
        order_by: Optional[str],
        limit: int,
        user_id: UUID,
        org_id: UUID,
    ) -> Dict[str, Any]:
        """Build and execute the query."""
        # Get accessible project IDs (ALWAYS enforced)
        accessible_project_ids = await get_accessible_project_ids(db, user_id)

        if not accessible_project_ids and table_name != "users":
            return {"results": [], "count": 0, "message": "No accessible projects"}

        # Start building query
        query = select(model)

        # Add eager loading for relationships
        eager_loads = self.EAGER_LOAD.get(table_name, [])
        for rel in eager_loads:
            if hasattr(model, rel):
                query = query.options(selectinload(getattr(model, rel)))

        # Build filter conditions
        conditions = await self._build_conditions(
            db, model, table_name, filters, accessible_project_ids, user_id, org_id
        )

        if conditions:
            query = query.where(and_(*conditions))

        # Add ordering
        if order_by:
            query = self._apply_ordering(query, model, order_by)
        else:
            # Default ordering by most recent
            if hasattr(model, "updated_at"):
                query = query.order_by(model.updated_at.desc())
            elif hasattr(model, "created_at"):
                query = query.order_by(model.created_at.desc())

        # Apply limit
        query = query.limit(limit)

        # Execute
        result = await db.execute(query)
        rows = result.scalars().all()

        # Format results
        formatted_results = [
            self._format_row(row, table_name, accessible_project_ids)
            for row in rows
        ]

        return {
            "results": formatted_results,
            "count": len(formatted_results),
            "table": table_name,
            "filters_applied": list(filters.keys()) if filters else [],
        }

    async def _build_conditions(
        self,
        db: AsyncSession,
        model: Type,
        table_name: str,
        filters: Dict[str, Any],
        accessible_project_ids: List[UUID],
        user_id: UUID,
        org_id: UUID,
    ) -> List:
        """Build SQLAlchemy filter conditions from structured filters."""
        conditions = []

        # ALWAYS filter by accessible projects (except for users table)
        if table_name != "users":
            if hasattr(model, "project_id"):
                conditions.append(model.project_id.in_(accessible_project_ids))
            elif table_name == "projects":
                conditions.append(model.id.in_(accessible_project_ids))

        # Status filter
        if "status" in filters:
            status_val = filters["status"]
            if isinstance(status_val, list):
                conditions.append(model.status.in_(status_val))
            else:
                conditions.append(model.status == status_val)

        # Priority filter
        if "priority" in filters and hasattr(model, "priority"):
            priority_val = filters["priority"]
            if isinstance(priority_val, list):
                conditions.append(model.priority.in_(priority_val))
            else:
                conditions.append(model.priority == priority_val)

        # Project ID filter
        if "project_id" in filters and hasattr(model, "project_id"):
            try:
                project_uuid = UUID(filters["project_id"])
                conditions.append(model.project_id == project_uuid)
            except ValueError:
                pass

        # Project name filter (requires join for non-project tables)
        if "project_name" in filters:
            project_name = filters["project_name"]
            if table_name == "projects":
                conditions.append(model.name.ilike(f"%{project_name}%"))
            elif hasattr(model, "project_id"):
                # Find matching project IDs
                project_result = await db.execute(
                    select(Project.id)
                    .where(Project.id.in_(accessible_project_ids))
                    .where(Project.name.ilike(f"%{project_name}%"))
                )
                matching_project_ids = [row[0] for row in project_result.all()]
                if matching_project_ids:
                    conditions.append(model.project_id.in_(matching_project_ids))
                else:
                    # No matching projects - return empty
                    conditions.append(False)

        # Assignee name filter
        if "assignee_name" in filters and hasattr(model, "assignee_id"):
            assignee_name = filters["assignee_name"]
            user_result = await db.execute(
                select(User.id).where(
                    or_(
                        User.display_name.ilike(f"%{assignee_name}%"),
                        User.email.ilike(f"%{assignee_name}%"),
                    )
                )
            )
            matching_user_ids = [row[0] for row in user_result.all()]
            if matching_user_ids:
                conditions.append(model.assignee_id.in_(matching_user_ids))
            else:
                conditions.append(False)

        # Assigned to current user
        if filters.get("assigned_to_me") and hasattr(model, "assignee_id"):
            conditions.append(model.assignee_id == user_id)

        # Created by current user
        if filters.get("created_by_me") and hasattr(model, "created_by_id"):
            conditions.append(model.created_by_id == user_id)

        # Due date filters
        if "due_before" in filters and hasattr(model, "due_date"):
            due_before = self._parse_date(filters["due_before"])
            if due_before:
                conditions.append(model.due_date < due_before)

        if "due_after" in filters and hasattr(model, "due_date"):
            due_after = self._parse_date(filters["due_after"])
            if due_after:
                conditions.append(model.due_date > due_after)

        # Updated after filter
        if "updated_after" in filters and hasattr(model, "updated_at"):
            updated_after = self._parse_date(filters["updated_after"])
            if updated_after:
                conditions.append(model.updated_at > datetime.combine(updated_after, datetime.min.time()))

        # Created after filter
        if "created_after" in filters and hasattr(model, "created_at"):
            created_after = self._parse_date(filters["created_after"])
            if created_after:
                conditions.append(model.created_at > datetime.combine(created_after, datetime.min.time()))

        # Search in title/name
        if "search" in filters:
            search_term = filters["search"]
            if hasattr(model, "title"):
                conditions.append(model.title.ilike(f"%{search_term}%"))
            elif hasattr(model, "name"):
                conditions.append(model.name.ilike(f"%{search_term}%"))

        # Is overdue (due_date < today and not done)
        if filters.get("is_overdue"):
            today = date.today()
            if hasattr(model, "due_date") and hasattr(model, "status"):
                conditions.append(model.due_date < today)
                conditions.append(model.status != "done")
                if table_name == "blockers":
                    conditions.append(model.status.in_(["open", "in_progress"]))

        # Is stalled (in_progress and no update in 7+ days)
        if filters.get("is_stalled"):
            stale_date = datetime.now() - timedelta(days=7)
            if hasattr(model, "updated_at") and hasattr(model, "status"):
                conditions.append(model.status == "in_progress")
                conditions.append(model.updated_at < stale_date)

        # Exclude done/completed items
        if filters.get("exclude_done") and hasattr(model, "status"):
            conditions.append(model.status != "done")
            if table_name == "blockers":
                conditions.append(model.status.notin_(["resolved", "wont_fix"]))

        return conditions

    def _parse_date(self, date_str: str) -> Optional[date]:
        """Parse date string supporting various formats."""
        if not date_str:
            return None

        date_str = date_str.lower().strip()

        # Handle 'today'
        if date_str == "today":
            return date.today()

        # Handle relative dates like '7 days ago'
        if "days ago" in date_str:
            try:
                days = int(date_str.replace("days ago", "").strip())
                return date.today() - timedelta(days=days)
            except ValueError:
                pass

        # Handle ISO format
        try:
            return date.fromisoformat(date_str)
        except ValueError:
            pass

        return None

    def _apply_ordering(self, query, model: Type, order_by: str):
        """Apply ordering to query."""
        parts = order_by.strip().split()
        column_name = parts[0]
        direction = parts[1].lower() if len(parts) > 1 else "asc"

        if hasattr(model, column_name):
            column = getattr(model, column_name)
            if direction == "desc":
                return query.order_by(column.desc())
            else:
                return query.order_by(column.asc())

        return query

    def _format_row(
        self,
        row: Any,
        table_name: str,
        accessible_project_ids: List[UUID],
    ) -> Dict[str, Any]:
        """Format a database row into a safe dictionary."""
        safe_columns = self.SAFE_COLUMNS.get(table_name, [])
        result = {}

        for col in safe_columns:
            if hasattr(row, col):
                value = getattr(row, col)
                # Convert non-serializable types
                if isinstance(value, UUID):
                    value = str(value)
                elif isinstance(value, (date, datetime)):
                    value = value.isoformat()
                elif isinstance(value, list):
                    value = [str(v) if isinstance(v, UUID) else v for v in value]
                result[col] = value

        # Add relationship data if available
        if hasattr(row, "assignee") and row.assignee:
            result["assignee_name"] = row.assignee.display_name
        if hasattr(row, "project") and row.project:
            result["project_name"] = row.project.name
        if hasattr(row, "created_by") and row.created_by:
            result["created_by_name"] = row.created_by.display_name

        return result
