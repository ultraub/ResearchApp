"""Add pgvector extension and embedding columns for semantic search

Revision ID: 039
Revises: 038
Create Date: 2024-12-30

Changes:
- Enable pgvector extension for vector similarity search
- Add embedding columns to documents, tasks, journal_entries, and papers tables
- Add embedding_model and embedded_at columns for tracking
- Create HNSW indexes for efficient similarity search
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None

# Embedding dimensions - matches text-embedding-3-small default
EMBEDDING_DIMENSIONS = 1536


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # Add embedding columns to documents table
    op.add_column(
        'documents',
        sa.Column('embedding', Vector(EMBEDDING_DIMENSIONS), nullable=True)
    )
    op.add_column(
        'documents',
        sa.Column('embedding_model', sa.String(100), nullable=True)
    )
    op.add_column(
        'documents',
        sa.Column('embedded_at', sa.DateTime(timezone=True), nullable=True)
    )

    # Add embedding columns to tasks table
    op.add_column(
        'tasks',
        sa.Column('embedding', Vector(EMBEDDING_DIMENSIONS), nullable=True)
    )
    op.add_column(
        'tasks',
        sa.Column('embedding_model', sa.String(100), nullable=True)
    )
    op.add_column(
        'tasks',
        sa.Column('embedded_at', sa.DateTime(timezone=True), nullable=True)
    )

    # Add embedding columns to journal_entries table
    op.add_column(
        'journal_entries',
        sa.Column('embedding', Vector(EMBEDDING_DIMENSIONS), nullable=True)
    )
    op.add_column(
        'journal_entries',
        sa.Column('embedding_model', sa.String(100), nullable=True)
    )
    op.add_column(
        'journal_entries',
        sa.Column('embedded_at', sa.DateTime(timezone=True), nullable=True)
    )

    # Add embedding columns to papers table
    op.add_column(
        'papers',
        sa.Column('embedding', Vector(EMBEDDING_DIMENSIONS), nullable=True)
    )
    op.add_column(
        'papers',
        sa.Column('embedding_model', sa.String(100), nullable=True)
    )
    op.add_column(
        'papers',
        sa.Column('embedded_at', sa.DateTime(timezone=True), nullable=True)
    )

    # Create HNSW indexes for efficient vector similarity search
    # HNSW provides good performance for approximate nearest neighbor search
    # m=16: number of bi-directional links created for each element
    # ef_construction=64: size of dynamic candidate list for index construction
    op.execute("""
        CREATE INDEX ix_documents_embedding_hnsw
        ON documents
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

    op.execute("""
        CREATE INDEX ix_tasks_embedding_hnsw
        ON tasks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

    op.execute("""
        CREATE INDEX ix_journal_entries_embedding_hnsw
        ON journal_entries
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

    op.execute("""
        CREATE INDEX ix_papers_embedding_hnsw
        ON papers
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS ix_documents_embedding_hnsw")
    op.execute("DROP INDEX IF EXISTS ix_tasks_embedding_hnsw")
    op.execute("DROP INDEX IF EXISTS ix_journal_entries_embedding_hnsw")
    op.execute("DROP INDEX IF EXISTS ix_papers_embedding_hnsw")

    # Remove columns from papers
    op.drop_column('papers', 'embedded_at')
    op.drop_column('papers', 'embedding_model')
    op.drop_column('papers', 'embedding')

    # Remove columns from journal_entries
    op.drop_column('journal_entries', 'embedded_at')
    op.drop_column('journal_entries', 'embedding_model')
    op.drop_column('journal_entries', 'embedding')

    # Remove columns from tasks
    op.drop_column('tasks', 'embedded_at')
    op.drop_column('tasks', 'embedding_model')
    op.drop_column('tasks', 'embedding')

    # Remove columns from documents
    op.drop_column('documents', 'embedded_at')
    op.drop_column('documents', 'embedding_model')
    op.drop_column('documents', 'embedding')

    # Note: We don't drop the vector extension as other tables might use it
    # op.execute("DROP EXTENSION IF EXISTS vector")
