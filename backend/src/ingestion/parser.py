from typing import Any

import jsonschema

from ..llm.client import LLMClient

_SCRIPT_SENTINEL = "<<<SCRIPT_TEXT>>>"

# Compact format: each line is [sequence, kind_code, character_or_null, text]
# kind codes: "d"=dialogue  "s"=stage_direction  "h"=scene_header
# Reduces output tokens ~40% vs verbose key-per-field objects.
_PROMPT_TEMPLATE = f"""\
You are parsing a play or screenplay into structured data for an at-home rehearsal tool.

Read the script below carefully. Output ONLY valid JSON matching this schema:

{{
  "title": "string — best guess at the script title, or 'Untitled'",
  "characters": [{{"name": "CANONICAL_NAME"}}],
  "lines": [
    [sequence_integer, kind_code, character_or_null, "text"]
  ]
}}

kind_code is exactly one of:
  "h" — scene header (e.g. "SCENE 1 - The museum."). character is null.
  "s" — stage direction or parenthetical action. character is null.
  "d" — dialogue (spoken text). character is the canonical character name.

Rules:

1. CHARACTERS: Every speaking character, canonical name as it most often appears
   (e.g. "ADAM"). Strip "(O.S.)"/"(V.O.)" labels. Omit characters who never speak.

2. SEQUENCE: Start at 1, increment by 1, no gaps, in performance order.

3. DIALOGUE TEXT: Strip the "CHARACTER:" prefix. Keep punctuation and inline
   parentheticals unless the parenthetical is clearly a separate beat.

4. SKIP: page numbers, footers, copyright notices, cast lists, author notes.

5. INTERRUPTIONS: Keep "/" characters that mark overlapping speech.

6. Output ONLY the JSON. No markdown fences, no commentary.

SCRIPT BEGINS:
{_SCRIPT_SENTINEL}
SCRIPT ENDS.
"""

# Minimal schema — just validates the compact array structure.
# Full key-level validation happens after expansion in _validate().
_COMPACT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["title", "characters", "lines"],
    "properties": {
        "title": {"type": "string", "minLength": 1, "maxLength": 200},
        "characters": {
            "type": "array",
            "minItems": 1,
            "maxItems": 50,
            "items": {
                "type": "object",
                "required": ["name"],
                "properties": {"name": {"type": "string", "minLength": 1, "maxLength": 100}},
            },
        },
        "lines": {
            "type": "array",
            "minItems": 1,
            "items": {"type": "array", "minItems": 4, "maxItems": 4},
        },
    },
}

# Full schema used after expansion (kept for _validate and tests).
_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["title", "characters", "lines"],
    "properties": {
        "title": {"type": "string", "minLength": 1, "maxLength": 200},
        "characters": {
            "type": "array",
            "minItems": 1,
            "maxItems": 50,
            "items": {
                "type": "object",
                "required": ["name"],
                "properties": {"name": {"type": "string", "minLength": 1, "maxLength": 100}},
            },
        },
        "lines": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["sequence", "kind", "text"],
                "properties": {
                    "sequence": {"type": "integer", "minimum": 1},
                    "kind": {"enum": ["scene_header", "stage_direction", "dialogue"]},
                    "character": {"type": ["string", "null"]},
                    "text": {"type": "string", "minLength": 1},
                },
            },
        },
    },
}

_KIND_MAP = {"d": "dialogue", "s": "stage_direction", "h": "scene_header"}


def _expand(compact: dict[str, Any]) -> dict[str, Any]:
    """Convert compact array lines to full dict format for DB writes."""
    try:
        lines = [
            {
                "sequence": row[0],
                "kind": _KIND_MAP[row[1]],
                "character": row[2],
                "text": row[3],
            }
            for row in compact["lines"]
        ]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError(f"Compact line format error: {exc}") from exc
    return {**compact, "lines": lines}


async def parse_script(extracted_text: str, llm: LLMClient) -> dict[str, Any]:
    """Call the LLM once and return validated full-format parsed-script JSON.

    Raises ValueError on schema or post-validation failures.
    """
    prompt = _PROMPT_TEMPLATE.replace(_SCRIPT_SENTINEL, extracted_text)
    data = await llm.complete_json(prompt, schema=_COMPACT_SCHEMA)

    try:
        jsonschema.validate(data, _COMPACT_SCHEMA)
    except jsonschema.ValidationError as exc:
        raise ValueError(f"Compact output didn't match expected shape: {exc.message}") from exc

    data = _expand(data)

    try:
        jsonschema.validate(data, _SCHEMA)
    except jsonschema.ValidationError as exc:
        raise ValueError(f"Expanded output failed validation: {exc.message}") from exc

    _validate(data)
    return data


def _validate(data: dict[str, Any]) -> None:
    """Post-expansion checks that JSON schema cannot express."""
    known_names = {c["name"] for c in data["characters"]}

    for line in data["lines"]:
        if line["kind"] == "dialogue":
            char = line.get("character")
            if not char:
                raise ValueError(f"Dialogue line {line['sequence']} has no character assigned.")
            if char not in known_names:
                raise ValueError(f"Unknown character {char!r} on line {line['sequence']}.")

    sequences = sorted(line["sequence"] for line in data["lines"])
    if sequences != list(range(1, len(sequences) + 1)):
        raise ValueError("Line sequences are not consecutive starting from 1.")

    if not any(line["kind"] == "dialogue" for line in data["lines"]):
        raise ValueError("No dialogue lines found — this doesn't look like a valid script.")
