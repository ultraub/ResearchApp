"""Sync system documentation from filesystem to database.

This script reads markdown files from the docs/ directory and stores them
as system documents in the database. These documents are:
- Hidden from regular users
- Accessible only to the AI assistant for answering questions

Usage:
    python -m researchhub.scripts.sync_system_docs

Options:
    --docs-dir PATH    Path to docs directory (default: ../../docs relative to backend)
    --dry-run          Show what would be synced without making changes
    --force            Force update even if content hasn't changed
"""

import argparse
import asyncio
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from researchhub.db.session import async_session_factory
from researchhub.models.document import Document


def get_file_hash(content: str) -> str:
    """Get MD5 hash of content for change detection."""
    return hashlib.md5(content.encode()).hexdigest()


def extract_doc_type(filename: str) -> str:
    """Extract document type from filename."""
    name = filename.lower().replace('.md', '').replace('_', ' ')

    if 'architecture' in name:
        return 'architecture'
    elif 'model' in name or 'schema' in name:
        return 'data_model'
    elif 'api' in name:
        return 'api'
    elif 'guide' in name or 'how' in name:
        return 'guide'
    elif 'readme' in name:
        return 'readme'
    else:
        return 'general'


def extract_title(content: str, filename: str) -> str:
    """Extract title from markdown content or filename."""
    lines = content.strip().split('\n')

    # Look for first H1 heading
    for line in lines[:10]:
        if line.startswith('# '):
            return line[2:].strip()

    # Fall back to filename
    return filename.replace('.md', '').replace('_', ' ').title()


def count_words(text: str) -> int:
    """Count words in text."""
    return len(text.split())


async def sync_docs(
    docs_dir: Path,
    dry_run: bool = False,
    force: bool = False,
) -> None:
    """Sync documentation files to database."""

    if not docs_dir.exists():
        print(f"Error: Docs directory not found: {docs_dir}")
        sys.exit(1)

    # Find all markdown files
    md_files = list(docs_dir.glob('**/*.md'))

    if not md_files:
        print(f"No markdown files found in {docs_dir}")
        return

    print(f"Found {len(md_files)} markdown files in {docs_dir}")

    async with async_session_factory() as db:
        # Get existing system docs
        result = await db.execute(
            select(Document).where(Document.is_system == True)
        )
        existing_docs = {doc.title: doc for doc in result.scalars().all()}

        created = 0
        updated = 0
        skipped = 0

        for md_file in md_files:
            content = md_file.read_text(encoding='utf-8')
            title = extract_title(content, md_file.name)
            content_hash = get_file_hash(content)

            # Check if doc exists
            existing = existing_docs.get(title)

            if existing:
                # Check if content changed
                existing_hash = existing.extra_data.get('content_hash', '')

                if existing_hash == content_hash and not force:
                    print(f"  Skip (unchanged): {title}")
                    skipped += 1
                    continue

                if dry_run:
                    print(f"  Would update: {title}")
                else:
                    # Update existing doc
                    existing.content_text = content
                    existing.document_type = extract_doc_type(md_file.name)
                    existing.word_count = count_words(content)
                    existing.extra_data = {
                        'content_hash': content_hash,
                        'source_file': str(md_file.relative_to(docs_dir)),
                        'synced_at': datetime.now(timezone.utc).isoformat(),
                    }
                    existing.updated_at = datetime.now(timezone.utc)
                    print(f"  Updated: {title}")

                updated += 1
            else:
                if dry_run:
                    print(f"  Would create: {title}")
                else:
                    # Create new doc
                    doc = Document(
                        title=title,
                        content={},  # Empty TipTap content
                        content_text=content,
                        document_type=extract_doc_type(md_file.name),
                        status='published',
                        is_system=True,
                        word_count=count_words(content),
                        tags=['system', 'documentation'],
                        extra_data={
                            'content_hash': content_hash,
                            'source_file': str(md_file.relative_to(docs_dir)),
                            'synced_at': datetime.now(timezone.utc).isoformat(),
                        },
                    )
                    db.add(doc)
                    print(f"  Created: {title}")

                created += 1

        if not dry_run:
            await db.commit()

        print(f"\nSummary:")
        print(f"  Created: {created}")
        print(f"  Updated: {updated}")
        print(f"  Skipped: {skipped}")

        if dry_run:
            print("\n(Dry run - no changes made)")


def main():
    parser = argparse.ArgumentParser(
        description='Sync system documentation from filesystem to database'
    )
    parser.add_argument(
        '--docs-dir',
        type=Path,
        default=None,
        help='Path to docs directory (default: auto-detect from project root)',
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be synced without making changes',
    )
    parser.add_argument(
        '--force',
        action='store_true',
        help='Force update even if content has not changed',
    )

    args = parser.parse_args()

    # Determine docs directory
    if args.docs_dir:
        docs_dir = args.docs_dir
    else:
        # Try to find docs relative to this script
        script_dir = Path(__file__).parent
        project_root = script_dir.parent.parent.parent  # backend/researchhub/scripts -> project root
        docs_dir = project_root / 'docs'

        if not docs_dir.exists():
            # Try alternate location
            docs_dir = script_dir.parent.parent / 'docs'

    print(f"Syncing docs from: {docs_dir.absolute()}")

    asyncio.run(sync_docs(docs_dir, args.dry_run, args.force))


if __name__ == '__main__':
    main()
