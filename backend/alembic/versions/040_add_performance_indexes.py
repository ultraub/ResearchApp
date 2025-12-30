"""Add performance indexes for slow queries.

Revision ID: 040
Revises: 039
Create Date: 2024-12-30

Adds composite indexes to optimize common query patterns:
- tasks: (project_id, parent_task_id, status) for kanban views
- tasks: (project_id, status) for status filtering
- blockers: (project_id, status) for active blockers
- reviews: (project_id, status) for review summary
"""

from alembic import op


# revision identifiers
revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Composite index for kanban view query (most impactful)
    # Covers: WHERE project_id = X AND parent_task_id IS NULL ORDER BY position
    op.create_index(
        "ix_tasks_project_parent_status",
        "tasks",
        ["project_id", "parent_task_id", "status"],
    )

    # Index for task status queries
    op.create_index(
        "ix_tasks_project_status",
        "tasks",
        ["project_id", "status"],
    )

    # Index for active blockers query
    op.create_index(
        "ix_blockers_project_status",
        "blockers",
        ["project_id", "status"],
    )

    # Index for review summary query
    op.create_index(
        "ix_reviews_project_status",
        "reviews",
        ["project_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_reviews_project_status", table_name="reviews")
    op.drop_index("ix_blockers_project_status", table_name="blockers")
    op.drop_index("ix_tasks_project_status", table_name="tasks")
    op.drop_index("ix_tasks_project_parent_status", table_name="tasks")
