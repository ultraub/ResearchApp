"""Add embedding columns to projects table for semantic search

Revision ID: 041
Revises: 040
Create Date: 2024-12-30

Changes:
- Add embedding, embedding_model, and embedded_at columns to projects table
- Create HNSW index for efficient similarity search
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


# revision identifiers, used by Alembic.
revision = "041"
down_revision = "040"
branch_labels = None
depends_on = None

# Embedding dimensions - matches text-embedding-3-small default
EMBEDDING_DIMENSIONS = 1536


def upgrade() -> None:
    # Add embedding columns to projects table
    op.add_column(
        'projects',
        sa.Column('embedding', Vector(EMBEDDING_DIMENSIONS), nullable=True)
    )
    op.add_column(
        'projects',
        sa.Column('embedding_model', sa.String(100), nullable=True)
    )
    op.add_column(
        'projects',
        sa.Column('embedded_at', sa.DateTime(timezone=True), nullable=True)
    )

    # Create HNSW index for efficient vector similarity search
    op.execute("""
        CREATE INDEX ix_projects_embedding_hnsw
        ON projects
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)


def downgrade() -> None:
    # Drop index
    op.execute("DROP INDEX IF EXISTS ix_projects_embedding_hnsw")

    # Remove columns
    op.drop_column('projects', 'embedded_at')
    op.drop_column('projects', 'embedding_model')
    op.drop_column('projects', 'embedding')
