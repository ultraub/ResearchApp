"""TipTap content utilities.

Functions for working with TipTap rich text JSON format.
"""


def extract_plain_text(content: dict | None) -> str:
    """Extract plain text from TipTap content for search indexing.

    Args:
        content: TipTap JSON content (can be None)

    Returns:
        Plain text extracted from the content, or empty string if None
    """
    if content is None:
        return ""

    def _extract_text(node: dict) -> str:
        text = ""
        if "text" in node:
            text += node["text"] + " "
        if "content" in node:
            for child in node["content"]:
                text += _extract_text(child)
        return text

    return _extract_text(content).strip()


def count_words(content: dict | None) -> int:
    """Count words in TipTap content.

    Args:
        content: TipTap JSON content (can be None)

    Returns:
        Word count, or 0 if None
    """
    if content is None:
        return 0

    text = extract_plain_text(content)
    return len(text.split())
