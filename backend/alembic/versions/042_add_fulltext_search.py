"""Add PostgreSQL Full-Text Search columns and indexes for hybrid search

Revision ID: 042
Revises: 041
Create Date: 2024-12-30

Changes:
- Add tsvector columns to documents, tasks, projects, journal_entries, and papers
- Create GIN indexes for efficient full-text search
- Add triggers to auto-update tsvector on insert/update
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "042"
down_revision = "041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add tsvector columns for full-text search

    # Documents: title + content_text
    op.add_column(
        'documents',
        sa.Column('search_vector', sa.dialects.postgresql.TSVECTOR, nullable=True)
    )

    # Tasks: title + description_text (we'll populate from title only since description is JSONB)
    op.add_column(
        'tasks',
        sa.Column('search_vector', sa.dialects.postgresql.TSVECTOR, nullable=True)
    )
    op.add_column(
        'tasks',
        sa.Column('description_text', sa.Text, nullable=True)
    )

    # Projects: name + description
    op.add_column(
        'projects',
        sa.Column('search_vector', sa.dialects.postgresql.TSVECTOR, nullable=True)
    )

    # Journal entries: title + content_text
    op.add_column(
        'journal_entries',
        sa.Column('search_vector', sa.dialects.postgresql.TSVECTOR, nullable=True)
    )

    # Papers: title + abstract
    op.add_column(
        'papers',
        sa.Column('search_vector', sa.dialects.postgresql.TSVECTOR, nullable=True)
    )

    # Create GIN indexes for efficient full-text search
    op.execute("""
        CREATE INDEX ix_documents_search_vector
        ON documents
        USING GIN (search_vector)
    """)

    op.execute("""
        CREATE INDEX ix_tasks_search_vector
        ON tasks
        USING GIN (search_vector)
    """)

    op.execute("""
        CREATE INDEX ix_projects_search_vector
        ON projects
        USING GIN (search_vector)
    """)

    op.execute("""
        CREATE INDEX ix_journal_entries_search_vector
        ON journal_entries
        USING GIN (search_vector)
    """)

    op.execute("""
        CREATE INDEX ix_papers_search_vector
        ON papers
        USING GIN (search_vector)
    """)

    # Create triggers to auto-update search vectors

    # Documents trigger
    op.execute("""
        CREATE OR REPLACE FUNCTION documents_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(NEW.content_text, '')), 'B');
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER documents_search_vector_trigger
        BEFORE INSERT OR UPDATE OF title, content_text
        ON documents
        FOR EACH ROW
        EXECUTE FUNCTION documents_search_vector_update();
    """)

    # Tasks trigger
    op.execute("""
        CREATE OR REPLACE FUNCTION tasks_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(NEW.description_text, '')), 'B');
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER tasks_search_vector_trigger
        BEFORE INSERT OR UPDATE OF title, description_text
        ON tasks
        FOR EACH ROW
        EXECUTE FUNCTION tasks_search_vector_update();
    """)

    # Projects trigger
    op.execute("""
        CREATE OR REPLACE FUNCTION projects_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER projects_search_vector_trigger
        BEFORE INSERT OR UPDATE OF name, description
        ON projects
        FOR EACH ROW
        EXECUTE FUNCTION projects_search_vector_update();
    """)

    # Journal entries trigger
    op.execute("""
        CREATE OR REPLACE FUNCTION journal_entries_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(NEW.content_text, '')), 'B');
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER journal_entries_search_vector_trigger
        BEFORE INSERT OR UPDATE OF title, content_text
        ON journal_entries
        FOR EACH ROW
        EXECUTE FUNCTION journal_entries_search_vector_update();
    """)

    # Papers trigger
    op.execute("""
        CREATE OR REPLACE FUNCTION papers_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
                setweight(to_tsvector('english', COALESCE(NEW.abstract, '')), 'B');
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER papers_search_vector_trigger
        BEFORE INSERT OR UPDATE OF title, abstract
        ON papers
        FOR EACH ROW
        EXECUTE FUNCTION papers_search_vector_update();
    """)

    # Populate existing rows with search vectors
    op.execute("""
        UPDATE documents
        SET search_vector =
            setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(content_text, '')), 'B')
    """)

    op.execute("""
        UPDATE tasks
        SET search_vector =
            setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(description_text, '')), 'B')
    """)

    op.execute("""
        UPDATE projects
        SET search_vector =
            setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(description, '')), 'B')
    """)

    op.execute("""
        UPDATE journal_entries
        SET search_vector =
            setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(content_text, '')), 'B')
    """)

    op.execute("""
        UPDATE papers
        SET search_vector =
            setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
            setweight(to_tsvector('english', COALESCE(abstract, '')), 'B')
    """)


def downgrade() -> None:
    # Drop triggers
    op.execute("DROP TRIGGER IF EXISTS documents_search_vector_trigger ON documents")
    op.execute("DROP TRIGGER IF EXISTS tasks_search_vector_trigger ON tasks")
    op.execute("DROP TRIGGER IF EXISTS projects_search_vector_trigger ON projects")
    op.execute("DROP TRIGGER IF EXISTS journal_entries_search_vector_trigger ON journal_entries")
    op.execute("DROP TRIGGER IF EXISTS papers_search_vector_trigger ON papers")

    # Drop functions
    op.execute("DROP FUNCTION IF EXISTS documents_search_vector_update()")
    op.execute("DROP FUNCTION IF EXISTS tasks_search_vector_update()")
    op.execute("DROP FUNCTION IF EXISTS projects_search_vector_update()")
    op.execute("DROP FUNCTION IF EXISTS journal_entries_search_vector_update()")
    op.execute("DROP FUNCTION IF EXISTS papers_search_vector_update()")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS ix_documents_search_vector")
    op.execute("DROP INDEX IF EXISTS ix_tasks_search_vector")
    op.execute("DROP INDEX IF EXISTS ix_projects_search_vector")
    op.execute("DROP INDEX IF EXISTS ix_journal_entries_search_vector")
    op.execute("DROP INDEX IF EXISTS ix_papers_search_vector")

    # Drop columns
    op.drop_column('documents', 'search_vector')
    op.drop_column('tasks', 'search_vector')
    op.drop_column('tasks', 'description_text')
    op.drop_column('projects', 'search_vector')
    op.drop_column('journal_entries', 'search_vector')
    op.drop_column('papers', 'search_vector')
