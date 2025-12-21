"""Add ideas, projects, and tasks tables.

Revision ID: 002
Revises: 001
Create Date: 2024-01-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create project_templates table first (referenced by projects)
    op.create_table(
        "project_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("template_type", sa.String(100), nullable=False),
        sa.Column("structure", postgresql.JSONB(), nullable=False),
        sa.Column("default_settings", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, default=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, default=True),
        sa.Column("usage_count", sa.Integer(), nullable=False, default=0),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_project_templates_org_id", "project_templates", ["organization_id"])

    # Create projects table
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("visibility", sa.String(50), nullable=False, server_default="team"),
        sa.Column("project_type", sa.String(100), nullable=False, server_default="general"),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("team_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("target_end_date", sa.Date(), nullable=True),
        sa.Column("actual_end_date", sa.Date(), nullable=True),
        sa.Column("settings", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False, default=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["parent_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_projects_team_id", "projects", ["team_id"])
    op.create_index("ix_projects_parent_id", "projects", ["parent_id"])

    # Create project_members table
    op.create_table(
        "project_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="member"),
        sa.Column("notify_on_task_assigned", sa.Boolean(), nullable=False, default=True),
        sa.Column("notify_on_document_update", sa.Boolean(), nullable=False, default=True),
        sa.Column("notify_on_comment", sa.Boolean(), nullable=False, default=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )
    op.create_index("ix_project_members_project_id", "project_members", ["project_id"])
    op.create_index("ix_project_members_user_id", "project_members", ["user_id"])

    # Create tasks table
    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="todo"),
        sa.Column("priority", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("task_type", sa.String(50), nullable=False, server_default="general"),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("assignee_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, default=0),
        sa.Column("estimated_hours", sa.Float(), nullable=True),
        sa.Column("actual_hours", sa.Float(), nullable=True),
        sa.Column("parent_task_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assignee_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["parent_task_id"], ["tasks.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"])
    op.create_index("ix_tasks_assignee_id", "tasks", ["assignee_id"])
    op.create_index("ix_tasks_parent_task_id", "tasks", ["parent_task_id"])

    # Create task_comments table
    op.create_table(
        "task_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("parent_comment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["parent_comment_id"], ["task_comments.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_task_comments_task_id", "task_comments", ["task_id"])

    # Create ideas table
    op.create_table(
        "ideas",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(50), nullable=False, server_default="captured"),
        sa.Column("converted_to_project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("converted_to_task_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(50), nullable=False, server_default="web"),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.Column(
            "ai_suggested_tags",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("ai_suggested_project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, default=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["converted_to_project_id"], ["projects.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["converted_to_task_id"], ["tasks.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["ai_suggested_project_id"], ["projects.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
    )
    op.create_index("ix_ideas_user_id", "ideas", ["user_id"])
    op.create_index("ix_ideas_org_id", "ideas", ["organization_id"])

    # Insert default system templates
    op.execute("""
        INSERT INTO project_templates (id, name, description, template_type, structure, is_system, is_active, usage_count)
        VALUES
        (
            gen_random_uuid(),
            'Clinical Study',
            'Template for clinical research studies with IRB documents, protocols, and data collection',
            'clinical_study',
            '{"default_tasks": [
                {"title": "Draft IRB protocol", "task_type": "writing"},
                {"title": "Create consent forms", "task_type": "writing"},
                {"title": "Design case report forms", "task_type": "data_analysis"},
                {"title": "Set up data collection system", "task_type": "data_analysis"},
                {"title": "Prepare study timeline", "task_type": "general"}
            ], "default_settings": {"review_workflow_enabled": true}}',
            true,
            true,
            0
        ),
        (
            gen_random_uuid(),
            'Data Analysis',
            'Template for data analysis projects with analysis pipeline and reporting',
            'data_analysis',
            '{"default_tasks": [
                {"title": "Define analysis objectives", "task_type": "general"},
                {"title": "Data cleaning and preparation", "task_type": "data_analysis"},
                {"title": "Exploratory data analysis", "task_type": "data_analysis"},
                {"title": "Statistical modeling", "task_type": "data_analysis"},
                {"title": "Create visualizations", "task_type": "data_analysis"},
                {"title": "Write analysis report", "task_type": "writing"}
            ], "default_settings": {}}',
            true,
            true,
            0
        ),
        (
            gen_random_uuid(),
            'Literature Review',
            'Template for systematic literature reviews',
            'literature_review',
            '{"default_tasks": [
                {"title": "Define research question", "task_type": "general"},
                {"title": "Develop search strategy", "task_type": "general"},
                {"title": "Database searches", "task_type": "paper_review"},
                {"title": "Screen titles and abstracts", "task_type": "paper_review"},
                {"title": "Full-text review", "task_type": "paper_review"},
                {"title": "Data extraction", "task_type": "data_analysis"},
                {"title": "Synthesis and writing", "task_type": "writing"}
            ], "default_settings": {}}',
            true,
            true,
            0
        ),
        (
            gen_random_uuid(),
            'Lab Operations',
            'Template for managing laboratory experiments and procedures',
            'lab_operations',
            '{"default_tasks": [
                {"title": "Design experiment protocol", "task_type": "writing"},
                {"title": "Prepare materials and reagents", "task_type": "general"},
                {"title": "Run experiments", "task_type": "general"},
                {"title": "Record results", "task_type": "data_analysis"},
                {"title": "Analyze data", "task_type": "data_analysis"},
                {"title": "Document findings", "task_type": "writing"}
            ], "default_settings": {}}',
            true,
            true,
            0
        )
    """)


def downgrade() -> None:
    op.drop_table("ideas")
    op.drop_table("task_comments")
    op.drop_table("tasks")
    op.drop_table("project_members")
    op.drop_table("projects")
    op.drop_table("project_templates")
