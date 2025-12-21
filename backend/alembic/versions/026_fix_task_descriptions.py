"""fix task descriptions that were incorrectly stored as strings instead of JSONB

When converting ideas to tasks, the description was stored as a plain string
instead of TipTap JSONB format. This migration converts those broken strings
to proper TipTap JSON format.

Revision ID: 026
Revises: 025
Create Date: 2025-12-20

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '026'
down_revision: Union[str, None] = '025'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Find tasks where description is a string (malformed) and convert to TipTap JSON
    # PostgreSQL will have stored the string as a JSON string, so we check if it's a string type
    # and convert it to the proper TipTap format
    connection = op.get_bind()

    # Find all tasks where description is a JSON string (not an object)
    # In PostgreSQL JSONB, a plain string like "hello" is stored as '"hello"'
    # We can detect this by checking if the jsonb value is a string using jsonb_typeof
    result = connection.execute(sa.text("""
        SELECT id, description::text as desc_text
        FROM tasks
        WHERE description IS NOT NULL
        AND jsonb_typeof(description) = 'string'
    """))

    rows = result.fetchall()

    for row in rows:
        task_id = row[0]
        # The description is stored as a JSON string, so it's wrapped in quotes
        # We need to extract the actual string content
        desc_text = row[1]
        if desc_text and desc_text.startswith('"') and desc_text.endswith('"'):
            # Remove the JSON string quotes and unescape
            content = desc_text[1:-1].replace('\\"', '"').replace('\\n', '\n')
        else:
            content = desc_text

        # Convert to TipTap JSON format
        tiptap_json = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": content}] if content else []
                }
            ]
        }

        # Update the task with proper JSONB format using raw JSON string
        # Use CAST() syntax instead of :: to avoid asyncpg parameter conflict
        connection.execute(
            sa.text("UPDATE tasks SET description = CAST(:desc AS jsonb) WHERE id = :id"),
            {"desc": json.dumps(tiptap_json), "id": str(task_id)}
        )

    if rows:
        print(f"Fixed {len(rows)} task(s) with malformed description")


def downgrade() -> None:
    # Can't really downgrade this - the data was broken before
    pass
