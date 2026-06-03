"""
Feature C: Localized Legal Terminology Context Injector

Scans retrieved document chunks for Marathi/MahaRERA legal terms.
If found, dynamically injects their definitions into the LLM system prompt
to improve cross-lingual reasoning and prevent misinterpretation.
"""
import json
import re
from pathlib import Path
from typing import List

_GLOSSARY_PATH = Path(__file__).parent.parent / "data" / "legal_glossary.json"
_glossary: dict[str, str] = {}


def _load_glossary() -> dict[str, str]:
    global _glossary
    if not _glossary:
        with open(_GLOSSARY_PATH, "r", encoding="utf-8") as f:
            _glossary = json.load(f)
    return _glossary


def scan_and_inject(chunks_text: List[str]) -> tuple[str, List[str]]:
    """
    Scans a list of chunk texts for known legal/Marathi terms.

    Returns:
        (injected_prompt_block, list_of_detected_terms)
        - injected_prompt_block: A formatted string to prepend to the system prompt.
        - list_of_detected_terms: The term keys that were matched.
    """
    glossary = _load_glossary()
    combined_text = "\n".join(chunks_text)
    detected_terms: dict[str, str] = {}

    for term, definition in glossary.items():
        # Case-insensitive whole-word (or phrase) match
        pattern = re.compile(re.escape(term), re.IGNORECASE)
        if pattern.search(combined_text):
            detected_terms[term] = definition

    if not detected_terms:
        return "", []

    lines = [
        "## Localized Legal Context (Maharashtra Land Law)",
        "The following domain-specific terms appear in the retrieved document passages.",
        "Use these precise definitions when interpreting the document — do NOT guess at their meaning:\n",
    ]
    for term, definition in detected_terms.items():
        lines.append(f'- **"{term}"**: {definition}')

    prompt_block = "\n".join(lines)
    return prompt_block, list(detected_terms.keys())
