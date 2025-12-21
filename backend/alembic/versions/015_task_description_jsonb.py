"""change tasks.description from Text to JSONB for rich text

Revision ID: 015
Revises: 014
Create Date: 2025-12-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = '015'
down_revision: Union[str, None] = '014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Convert existing text descriptions to JSONB format
    # This uses PostgreSQL's to_jsonb function to convert text to JSONB
    # For plain text, we wrap it in a TipTap-compatible structure
    op.execute("""
        UPDATE tasks
        SET description = CASE
            WHEN description IS NULL THEN NULL
            WHEN description::text ~ '^\\s*\\{' THEN description::jsonb::text
            ELSE jsonb_build_object(
                'type', 'doc',
                'content', jsonb_build_array(
                    jsonb_build_object(
                        'type', 'paragraph',
                        'content', jsonb_build_array(
                            jsonb_build_object('type', 'text', 'text', description)
                        )
                    )
                )
            )::text
        END
    """)

    # Change column type from Text to JSONB
    op.alter_column(
        'tasks',
        'description',
        type_=JSONB,
        postgresql_using='description::jsonb',
        nullable=True
    )


def downgrade() -> None:
    # Convert JSONB back to plain text by extracting text content
    # This will lose rich text formatting but preserve the text
    op.execute("""
        UPDATE tasks
        SET description = CASE
            WHEN description IS NULL THEN NULL
            ELSE (
                SELECT string_agg(
                    COALESCE(
                        (content_item->>'text'),
                        ''
                    ),
                    E'\n'
                )
                FROM jsonb_array_elements(description->'content') AS content_item
            )
        END::text
    """)

    # Change column type back to Text
    op.alter_column(
        'tasks',
        'description',
        type_=sa.Text,
        postgresql_using='description::text',
        nullable=True
    )
