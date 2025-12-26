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
from researchhub.models.collaboration import Comment
from researchhub.models.document import Document
from researchhub.models.journal import JournalEntry
from researchhub.models.organization import Department, Organization, OrganizationMember, Team, TeamMember
from researchhub.models.project import Blocker, Project, ProjectMember, Task, TaskAssignment
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
        "journal_entries": JournalEntry,
        "comments": Comment,
        "teams": Team,
        "organizations": Organization,
        "team_members": TeamMember,
        "organization_members": OrganizationMember,
        "departments": Department,
        "project_members": ProjectMember,
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
        "journal_entries": [
            "id", "title", "content_text", "entry_date", "scope", "entry_type",
            "word_count", "is_archived", "is_pinned", "mood", "tags",
            "created_at", "updated_at",
            "user_id", "project_id", "created_by_id",
        ],
        "comments": [
            "id", "content", "resource_type", "resource_id",
            "parent_id", "thread_id", "is_edited", "is_resolved",
            "created_at", "updated_at", "edited_at", "resolved_at",
            "author_id",
        ],
        "teams": [
            "id", "name", "description", "is_personal",
            "organization_id", "department_id", "owner_id",
            "created_at", "updated_at",
        ],
        "organizations": [
            "id", "name", "slug", "logo_url",
            "created_at", "updated_at",
        ],
        "team_members": [
            "id", "team_id", "user_id", "role",
            "created_at", "updated_at",
        ],
        "organization_members": [
            "id", "organization_id", "user_id", "role",
            "created_at", "updated_at",
        ],
        "departments": [
            "id", "name", "organization_id",
            "created_at", "updated_at",
        ],
        "project_members": [
            "id", "project_id", "user_id", "role", "added_by_id",
            "created_at", "updated_at",
        ],
    }

    @property
    def name(self) -> str:
        return "dynamic_query"

    @property
    def description(self) -> str:
        return """Execute a dynamic database query with structured filters.

Use this tool for flexible queries across projects, tasks, blockers, documents, journal_entries, comments, users, teams, organizations, team_members, organization_members, or departments.
Access control is automatically enforced - you can only see data from accessible projects and your organization.

## Database Schema

### projects
Columns: id, name, description, status, project_type, scope, start_date, target_end_date, actual_end_date, created_at, updated_at, color, emoji, tags
Status values: active, completed, archived, on_hold
Scope values: PERSONAL, TEAM, ORGANIZATION

### tasks
Columns: id, title, status, priority, task_type, due_date, estimated_hours, actual_hours, position, tags, created_at, updated_at, completed_at, project_id, assignee_id, created_by_id
Status values: idea, todo, in_progress, in_review, done
Priority values: low, medium, high, urgent
Relationships: project (Project), assignee (User), created_by (User)

### blockers
Columns: id, title, status, priority, blocker_type, impact_level, due_date, tags, created_at, updated_at, resolved_at, project_id, assignee_id, created_by_id
Status values: open, in_progress, resolved, wont_fix
Relationships: project (Project), assignee (User), created_by (User)

### documents
Columns: id, title, document_type, status, version, word_count, tags, created_at, updated_at, project_id, created_by_id
Relationships: project (Project), created_by (User)

### journal_entries
Columns: id, title, content_text, entry_date, scope, entry_type, word_count, is_archived, is_pinned, mood, tags, created_at, updated_at, user_id, project_id, created_by_id
Scope values: personal, project
Entry type values: observation, experiment, meeting, idea, reflection, protocol
Relationships: user (User), project (Project), created_by (User)

### comments
Columns: id, content, resource_type, resource_id, parent_id, thread_id, is_edited, is_resolved, created_at, updated_at, edited_at, resolved_at, author_id
Resource type values: project, task, document, idea, paper
Relationships: author (User), resolved_by (User)

### users
Columns: id, display_name, email, title, department

### teams
Columns: id, name, description, is_personal, organization_id, department_id, owner_id, created_at, updated_at
Relationships: organization (Organization), department (Department), owner (User)

### organizations
Columns: id, name, slug, logo_url, created_at, updated_at

### team_members
Columns: id, team_id, user_id, role, created_at, updated_at
Role values: owner, lead, member
Relationships: team (Team), user (User)

### organization_members
Columns: id, organization_id, user_id, role, created_at, updated_at
Role values: admin, member
Relationships: organization (Organization), user (User)

### departments
Columns: id, name, organization_id, created_at, updated_at
Relationships: organization (Organization)

### project_members
Columns: id, project_id, user_id, role, added_by_id, created_at, updated_at
Role values: owner, lead, member, viewer
Relationships: project (Project), user (User)
**Use this to find projects shared with specific users** - filter by user_id to find all projects a user is on

## Include Relationships
Use the 'include' parameter to load related data. When included, the full related object is nested in results.
- tasks: include=["project", "assignee", "created_by"]
- blockers: include=["project", "assignee", "created_by"]
- documents: include=["project", "created_by"]
- journal_entries: include=["user", "project", "created_by"]
- comments: include=["author", "resolved_by"]
- teams: include=["organization", "department", "owner"]
- team_members: include=["team", "user"]
- organization_members: include=["organization", "user"]
- departments: include=["organization"]
- project_members: include=["project", "user"]

## Filter Patterns
- status: Filter by status value(s)
- priority: Filter by priority level
- assignee_name: Filter by assignee's name (partial match)
- project_name: Filter by project name (partial match)
- created_by_me / assigned_to_me: Filter to items by/for current user
- due_before / due_after: Filter by due date range
- updated_after / created_after: Filter to recently modified items
- is_overdue: Items with due_date < today and not completed
- is_stalled: Items in_progress with no update in 7+ days
- exclude_done: Exclude completed items
- search: Search text in title/name fields
- resource_type / resource_id: Filter comments by target entity
- team_id: Filter team_members by team
- organization_id: Filter by organization
- user_id: Filter project_members/team_members by user UUID

## Examples
- Tasks with project details: table=tasks, include=["project"], filters={assigned_to_me: true}
- User workload with context: table=tasks, include=["project", "assignee"], filters={status: ["todo", "in_progress"]}
- Open blockers: table=blockers, include=["project"], filters={status: ["open", "in_progress"]}
- Recent journal entries: table=journal_entries, include=["project"], filters={updated_after: "7 days ago"}
- Comments on a task: table=comments, include=["author"], filters={resource_type: "task", resource_id: "<uuid>"}
- All teams in org: table=teams, include=["organization"], filters={}
- Team members: table=team_members, include=["team", "user"], filters={team_id: "<uuid>"}
- Search teams by name: table=teams, filters={search: "research"}
- Projects a user is on: table=project_members, include=["project", "user"], filters={user_id: "<uuid>"}
- Find shared projects: Query project_members for user A, then filter to projects that also have user B
"""

    # Available relationships per table
    AVAILABLE_RELATIONSHIPS: Dict[str, List[str]] = {
        "tasks": ["project", "assignee", "created_by"],
        "blockers": ["project", "assignee", "created_by"],
        "documents": ["project", "created_by"],
        "journal_entries": ["user", "project", "created_by"],
        "comments": ["author", "resolved_by"],
        "projects": [],
        "users": [],
        "teams": ["organization", "department", "owner"],
        "organizations": [],
        "team_members": ["team", "user"],
        "organization_members": ["organization", "user"],
        "departments": ["organization"],
        "project_members": ["project", "user"],
    }

    @property
    def input_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "table": {
                    "type": "string",
                    "enum": ["projects", "tasks", "blockers", "documents", "journal_entries", "comments", "users", "teams", "organizations", "team_members", "organization_members", "departments", "project_members"],
                    "description": "The table to query",
                },
                "include": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Relationships to include in results. Tasks/blockers: project, assignee, created_by. Documents: project, created_by. Journal entries: user, project, created_by. Comments: author, resolved_by. Teams: organization, department, owner. Team members: team, user. Organization members: organization, user. Departments: organization. Project members: project, user.",
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
                        "resource_type": {
                            "type": "string",
                            "description": "For comments: filter by target entity type (project, task, document, idea, paper)",
                        },
                        "resource_id": {
                            "type": "string",
                            "description": "For comments: filter by target entity UUID",
                        },
                        "scope": {
                            "type": "string",
                            "description": "For journal_entries: filter by scope (personal, project)",
                        },
                        "entry_type": {
                            "type": "string",
                            "description": "For journal_entries: filter by entry type (observation, experiment, meeting, idea, reflection, protocol)",
                        },
                        "team_id": {
                            "type": "string",
                            "description": "For team_members: filter by team UUID",
                        },
                        "organization_id": {
                            "type": "string",
                            "description": "Filter by organization UUID",
                        },
                        "role": {
                            "oneOf": [
                                {"type": "string"},
                                {"type": "array", "items": {"type": "string"}},
                            ],
                            "description": "For team_members/organization_members: filter by role (owner, lead, member, admin)",
                        },
                        "is_personal": {
                            "type": "boolean",
                            "description": "For teams: filter personal teams (true) or org teams (false)",
                        },
                        "user_id": {
                            "type": "string",
                            "description": "For project_members/team_members: filter by user UUID",
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
        include = input.get("include", [])
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

        # Validate and filter include relationships
        available_rels = self.AVAILABLE_RELATIONSHIPS.get(table_name, [])
        valid_includes = [rel for rel in include if rel in available_rels]

        # Log the query for audit purposes
        logger.info(
            f"DynamicQuery: user={user_id}, table={table_name}, "
            f"filters={filters}, include={valid_includes}, order_by={order_by}, limit={limit}"
        )

        try:
            # Execute with timeout protection
            result = await asyncio.wait_for(
                self._execute_query(
                    db, model, table_name, filters, valid_includes, order_by, limit, user_id, org_id
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
        include: List[str],
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

        # Add eager loading for requested relationships
        for rel in include:
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

        # Format results with included relationships
        formatted_results = [
            self._format_row(row, table_name, include, accessible_project_ids)
            for row in rows
        ]

        return {
            "results": formatted_results,
            "count": len(formatted_results),
            "table": table_name,
            "filters_applied": list(filters.keys()) if filters else [],
            "relationships_included": include,
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

        # ALWAYS filter by accessible data (access control)
        if table_name == "users":
            pass  # Users table has no access control beyond org membership
        elif table_name == "projects":
            conditions.append(model.id.in_(accessible_project_ids))
        elif table_name == "journal_entries":
            # Personal journals: owned by user, Project journals: in accessible projects
            conditions.append(
                or_(
                    model.user_id == user_id,  # Personal journals owned by user
                    model.project_id.in_(accessible_project_ids),  # Project journals
                )
            )
        elif table_name == "comments":
            # Comments filtered by organization - user must be in the org
            conditions.append(model.organization_id == org_id)
        elif table_name == "teams":
            # Teams the user can access:
            # 1. Teams in user's organization
            # 2. Personal teams owned by the user
            # 3. Teams where the user is a member (via team_members)
            member_team_result = await db.execute(
                select(TeamMember.team_id).where(TeamMember.user_id == user_id)
            )
            member_team_ids = [row[0] for row in member_team_result.all()]

            team_conditions = [
                model.organization_id == org_id,
                and_(model.is_personal == True, model.owner_id == user_id),
            ]
            if member_team_ids:
                team_conditions.append(model.id.in_(member_team_ids))

            conditions.append(or_(*team_conditions))
        elif table_name == "organizations":
            # Only show user's organization
            conditions.append(model.id == org_id)
        elif table_name == "team_members":
            # Get team IDs the user can see:
            # 1. Teams in user's organization
            # 2. Personal teams the user owns
            # 3. Teams where the user is a member
            team_result = await db.execute(
                select(Team.id).where(
                    or_(
                        Team.organization_id == org_id,
                        and_(Team.is_personal == True, Team.owner_id == user_id),
                    )
                )
            )
            visible_team_ids = set(row[0] for row in team_result.all())

            # Also include teams where user is a member
            member_result = await db.execute(
                select(TeamMember.team_id).where(TeamMember.user_id == user_id)
            )
            visible_team_ids.update(row[0] for row in member_result.all())

            if visible_team_ids:
                conditions.append(model.team_id.in_(list(visible_team_ids)))
            else:
                conditions.append(False)  # No visible teams
        elif table_name == "organization_members":
            # Only show members of user's organization
            conditions.append(model.organization_id == org_id)
        elif table_name == "departments":
            # Only show departments in user's organization
            conditions.append(model.organization_id == org_id)
        elif table_name == "project_members":
            # Only show memberships for accessible projects
            conditions.append(model.project_id.in_(accessible_project_ids))
        elif hasattr(model, "project_id"):
            # Standard project-based access control
            conditions.append(model.project_id.in_(accessible_project_ids))

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

        # Assignee name filter (check both assignee_id and task_assignments table)
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
                if table_name == "tasks":
                    # For tasks, check both the direct assignee_id and task_assignments table
                    assigned_via_assignments = select(TaskAssignment.task_id).where(
                        TaskAssignment.user_id.in_(matching_user_ids)
                    )
                    conditions.append(
                        or_(
                            model.assignee_id.in_(matching_user_ids),
                            model.id.in_(assigned_via_assignments),
                        )
                    )
                else:
                    conditions.append(model.assignee_id.in_(matching_user_ids))
            else:
                conditions.append(False)

        # Assigned to current user (check both assignee_id and task_assignments table)
        if filters.get("assigned_to_me") and hasattr(model, "assignee_id"):
            if table_name == "tasks":
                # For tasks, check both the direct assignee_id and task_assignments table
                assigned_via_assignments = select(TaskAssignment.task_id).where(
                    TaskAssignment.user_id == user_id
                )
                conditions.append(
                    or_(
                        model.assignee_id == user_id,
                        model.id.in_(assigned_via_assignments),
                    )
                )
            else:
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

        # Resource type filter (for comments)
        if "resource_type" in filters and hasattr(model, "resource_type"):
            conditions.append(model.resource_type == filters["resource_type"])

        # Resource ID filter (for comments)
        if "resource_id" in filters and hasattr(model, "resource_id"):
            try:
                resource_uuid = UUID(filters["resource_id"])
                conditions.append(model.resource_id == resource_uuid)
            except ValueError:
                pass

        # Scope filter (for journal_entries)
        if "scope" in filters and hasattr(model, "scope"):
            conditions.append(model.scope == filters["scope"])

        # Entry type filter (for journal_entries)
        if "entry_type" in filters and hasattr(model, "entry_type"):
            conditions.append(model.entry_type == filters["entry_type"])

        # Team ID filter (for team_members)
        if "team_id" in filters and hasattr(model, "team_id"):
            try:
                team_uuid = UUID(filters["team_id"])
                conditions.append(model.team_id == team_uuid)
            except ValueError:
                pass

        # Organization ID filter
        if "organization_id" in filters and hasattr(model, "organization_id"):
            try:
                org_uuid = UUID(filters["organization_id"])
                conditions.append(model.organization_id == org_uuid)
            except ValueError:
                pass

        # Role filter (for team_members, organization_members)
        if "role" in filters and hasattr(model, "role"):
            role_val = filters["role"]
            if isinstance(role_val, list):
                conditions.append(model.role.in_(role_val))
            else:
                conditions.append(model.role == role_val)

        # Is personal filter (for teams)
        if "is_personal" in filters and hasattr(model, "is_personal"):
            conditions.append(model.is_personal == filters["is_personal"])

        # User ID filter (for project_members, team_members)
        if "user_id" in filters and hasattr(model, "user_id"):
            try:
                user_uuid = UUID(filters["user_id"])
                conditions.append(model.user_id == user_uuid)
            except ValueError:
                pass

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
        include: List[str],
        accessible_project_ids: List[UUID],
    ) -> Dict[str, Any]:
        """Format a database row into a safe dictionary with nested relationships."""
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

        # Add relationship data ONLY for explicitly included relationships
        # (accessing non-eagerly-loaded relationships triggers lazy load errors in async)
        if "assignee" in include and hasattr(row, "assignee") and row.assignee:
            result["assignee"] = self._format_user(row.assignee)

        if "project" in include and hasattr(row, "project") and row.project:
            result["project"] = self._format_project(row.project)

        if "created_by" in include and hasattr(row, "created_by") and row.created_by:
            result["created_by"] = self._format_user(row.created_by)

        # Author relationship (for comments)
        if "author" in include and hasattr(row, "author") and row.author:
            result["author"] = self._format_user(row.author)

        # Resolved by relationship (for comments)
        if "resolved_by" in include and hasattr(row, "resolved_by") and row.resolved_by:
            result["resolved_by"] = self._format_user(row.resolved_by)

        # User relationship (for journal_entries - the owner of personal journals)
        if "user" in include and hasattr(row, "user") and row.user:
            result["user"] = self._format_user(row.user)

        # Organization relationship (for teams, departments)
        if "organization" in include and hasattr(row, "organization") and row.organization:
            result["organization"] = self._format_organization(row.organization)

        # Department relationship (for teams)
        if "department" in include and hasattr(row, "department") and row.department:
            result["department"] = self._format_department(row.department)

        # Owner relationship (for teams - personal team owner)
        if "owner" in include and hasattr(row, "owner") and row.owner:
            result["owner"] = self._format_user(row.owner)

        # Team relationship (for team_members)
        if "team" in include and hasattr(row, "team") and row.team:
            result["team"] = self._format_team(row.team)

        return result

    def _format_user(self, user: Any) -> Dict[str, Any]:
        """Format a User object into a safe dictionary."""
        safe_columns = self.SAFE_COLUMNS.get("users", [])
        result = {}
        for col in safe_columns:
            if hasattr(user, col):
                value = getattr(user, col)
                if isinstance(value, UUID):
                    value = str(value)
                result[col] = value
        return result

    def _format_project(self, project: Any) -> Dict[str, Any]:
        """Format a Project object into a safe dictionary."""
        safe_columns = self.SAFE_COLUMNS.get("projects", [])
        result = {}
        for col in safe_columns:
            if hasattr(project, col):
                value = getattr(project, col)
                if isinstance(value, UUID):
                    value = str(value)
                elif isinstance(value, (date, datetime)):
                    value = value.isoformat()
                elif isinstance(value, list):
                    value = [str(v) if isinstance(v, UUID) else v for v in value]
                result[col] = value
        return result

    def _format_team(self, team: Any) -> Dict[str, Any]:
        """Format a Team object into a safe dictionary."""
        safe_columns = self.SAFE_COLUMNS.get("teams", [])
        result = {}
        for col in safe_columns:
            if hasattr(team, col):
                value = getattr(team, col)
                if isinstance(value, UUID):
                    value = str(value)
                elif isinstance(value, (date, datetime)):
                    value = value.isoformat()
                result[col] = value
        return result

    def _format_organization(self, org: Any) -> Dict[str, Any]:
        """Format an Organization object into a safe dictionary."""
        safe_columns = self.SAFE_COLUMNS.get("organizations", [])
        result = {}
        for col in safe_columns:
            if hasattr(org, col):
                value = getattr(org, col)
                if isinstance(value, UUID):
                    value = str(value)
                elif isinstance(value, (date, datetime)):
                    value = value.isoformat()
                result[col] = value
        return result

    def _format_department(self, dept: Any) -> Dict[str, Any]:
        """Format a Department object into a safe dictionary."""
        safe_columns = self.SAFE_COLUMNS.get("departments", [])
        result = {}
        for col in safe_columns:
            if hasattr(dept, col):
                value = getattr(dept, col)
                if isinstance(value, UUID):
                    value = str(value)
                elif isinstance(value, (date, datetime)):
                    value = value.isoformat()
                result[col] = value
        return result
