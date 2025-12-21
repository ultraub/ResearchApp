"""Add documents and knowledge tables.

Revision ID: 003_documents_knowledge
Revises: 002_ideas_projects_tasks
Create Date: 2024-01-15 14:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "003_documents_knowledge"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create documents and knowledge management tables."""

    # Document Templates table
    op.create_table(
        "document_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("content", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("document_type", sa.String(100), nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default="false"),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_document_templates_document_type", "document_templates", ["document_type"])
    op.create_index("ix_document_templates_organization_id", "document_templates", ["organization_id"])

    # Documents table
    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("content", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("content_text", sa.Text, nullable=True),
        sa.Column("document_type", sa.String(100), nullable=False, server_default="'general'"),
        sa.Column("status", sa.String(50), nullable=False, server_default="'draft'"),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("word_count", sa.Integer, nullable=True),
        sa.Column("last_edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("document_templates.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "last_edited_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("is_pinned", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("metadata", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_documents_project_id", "documents", ["project_id"])
    op.create_index("ix_documents_status", "documents", ["status"])
    op.create_index("ix_documents_document_type", "documents", ["document_type"])
    op.create_index("ix_documents_created_at", "documents", ["created_at"])

    # Document Versions table
    op.create_table(
        "document_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("content", postgresql.JSONB, nullable=False),
        sa.Column("content_text", sa.Text, nullable=True),
        sa.Column("word_count", sa.Integer, nullable=True),
        sa.Column("change_summary", sa.String(500), nullable=True),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_document_versions_document_id", "document_versions", ["document_id"])
    op.create_index("ix_document_versions_version", "document_versions", ["version"])

    # Document Comments table
    op.create_table(
        "document_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("selection_start", sa.Integer, nullable=True),
        sa.Column("selection_end", sa.Integer, nullable=True),
        sa.Column("selected_text", sa.Text, nullable=True),
        sa.Column("is_resolved", sa.Boolean, nullable=False, server_default="false"),
        sa.Column(
            "parent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("document_comments.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "resolved_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_document_comments_document_id", "document_comments", ["document_id"])
    op.create_index("ix_document_comments_parent_id", "document_comments", ["parent_id"])

    # Papers table
    op.create_table(
        "papers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("doi", sa.String(255), nullable=True, index=True),
        sa.Column("pmid", sa.String(50), nullable=True, index=True),
        sa.Column("arxiv_id", sa.String(50), nullable=True, index=True),
        sa.Column("title", sa.String(1000), nullable=False),
        sa.Column("authors", postgresql.ARRAY(sa.String), nullable=False, server_default="{}"),
        sa.Column("journal", sa.String(500), nullable=True),
        sa.Column("publication_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("abstract", sa.Text, nullable=True),
        sa.Column("pdf_url", sa.String(2000), nullable=True),
        sa.Column("pdf_stored_path", sa.String(500), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("read_status", sa.String(50), nullable=False, server_default="'unread'"),
        sa.Column("rating", sa.Integer, nullable=True),
        sa.Column("citation_count", sa.Integer, nullable=True),
        sa.Column("ai_summary", sa.Text, nullable=True),
        sa.Column("ai_key_findings", postgresql.ARRAY(sa.String), nullable=True),
        sa.Column("ai_methodology", sa.Text, nullable=True),
        sa.Column("ai_limitations", sa.Text, nullable=True),
        sa.Column("search_vector", postgresql.TSVECTOR, nullable=True),
        sa.Column("keywords", postgresql.ARRAY(sa.String), nullable=True),
        sa.Column("metadata", postgresql.JSONB, nullable=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "added_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_papers_organization_id", "papers", ["organization_id"])
    op.create_index("ix_papers_read_status", "papers", ["read_status"])
    op.create_index("ix_papers_search_vector", "papers", ["search_vector"], postgresql_using="gin")

    # Collections table
    op.create_table(
        "collections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("is_shared", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("paper_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_collections_organization_id", "collections", ["organization_id"])

    # Collection Papers junction table
    op.create_table(
        "collection_papers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "collection_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("collections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "paper_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("papers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "added_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("collection_id", "paper_id", name="uq_collection_paper"),
    )
    op.create_index("ix_collection_papers_collection_id", "collection_papers", ["collection_id"])
    op.create_index("ix_collection_papers_paper_id", "collection_papers", ["paper_id"])

    # Paper Highlights table
    op.create_table(
        "paper_highlights",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "paper_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("papers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("color", sa.String(7), nullable=False, server_default="'#FFFF00'"),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("page_number", sa.Integer, nullable=True),
        sa.Column("position_data", postgresql.JSONB, nullable=True),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_paper_highlights_paper_id", "paper_highlights", ["paper_id"])

    # Paper Links table
    op.create_table(
        "paper_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "source_paper_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("papers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "target_paper_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("papers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("link_type", sa.String(50), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column(
            "created_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("source_paper_id", "target_paper_id", "link_type", name="uq_paper_link"),
    )
    op.create_index("ix_paper_links_source_paper_id", "paper_links", ["source_paper_id"])
    op.create_index("ix_paper_links_target_paper_id", "paper_links", ["target_paper_id"])

    # Insert system document templates
    op.execute("""
        INSERT INTO document_templates (id, name, description, content, document_type, category, is_system)
        VALUES
        (
            gen_random_uuid(),
            'Research Protocol',
            'Standard research protocol template with sections for background, objectives, methods, and timeline',
            '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Research Protocol"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "1. Background"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "2. Objectives"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "3. Methods"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "4. Timeline"}]}, {"type": "paragraph"}]}'::jsonb,
            'protocol',
            'Research',
            true
        ),
        (
            gen_random_uuid(),
            'Literature Review',
            'Template for organizing literature review with sections for synthesis and analysis',
            '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Literature Review"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "1. Introduction"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "2. Search Strategy"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "3. Findings"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "4. Synthesis"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "5. Conclusions"}]}, {"type": "paragraph"}]}'::jsonb,
            'literature_review',
            'Research',
            true
        ),
        (
            gen_random_uuid(),
            'Meeting Notes',
            'Template for capturing meeting notes, decisions, and action items',
            '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Meeting Notes"}]}, {"type": "paragraph", "content": [{"type": "text", "marks": [{"type": "bold"}], "text": "Date: "}, {"type": "text", "text": "[Date]"}]}, {"type": "paragraph", "content": [{"type": "text", "marks": [{"type": "bold"}], "text": "Attendees: "}, {"type": "text", "text": "[Names]"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Agenda"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph"}]}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Discussion"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Decisions"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph"}]}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Action Items"}]}, {"type": "taskList", "content": [{"type": "taskItem", "content": [{"type": "paragraph"}]}]}]}'::jsonb,
            'meeting_notes',
            'Administrative',
            true
        ),
        (
            gen_random_uuid(),
            'Grant Proposal',
            'Template for grant proposals with standard NIH/NSF sections',
            '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Grant Proposal"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Specific Aims"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Significance"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Innovation"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Approach"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Timeline and Milestones"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Budget Justification"}]}, {"type": "paragraph"}]}'::jsonb,
            'grant_proposal',
            'Grants',
            true
        ),
        (
            gen_random_uuid(),
            'Progress Report',
            'Template for regular progress reporting on research projects',
            '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Progress Report"}]}, {"type": "paragraph", "content": [{"type": "text", "marks": [{"type": "bold"}], "text": "Reporting Period: "}, {"type": "text", "text": "[Start Date] - [End Date]"}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Summary"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Accomplishments"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph"}]}]}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Challenges"}]}, {"type": "paragraph"}, {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Next Steps"}]}, {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph"}]}]}]}'::jsonb,
            'progress_report',
            'Administrative',
            true
        );
    """)


def downgrade() -> None:
    """Drop documents and knowledge tables."""
    op.drop_table("paper_links")
    op.drop_table("paper_highlights")
    op.drop_table("collection_papers")
    op.drop_table("collections")
    op.drop_table("papers")
    op.drop_table("document_comments")
    op.drop_table("document_versions")
    op.drop_table("documents")
    op.drop_table("document_templates")
