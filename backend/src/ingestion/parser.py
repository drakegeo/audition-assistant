from typing import Any

import jsonschema

from ..llm.client import LLMClient

# Sentinel used in the prompt template. Must not appear in any real script text.
_SCRIPT_SENTINEL = "<<<SCRIPT_TEXT>>>"

_PROMPT_TEMPLATE = f"""\
You are parsing a play or screenplay into structured data for an at-home rehearsal tool.

Read the script below carefully. Output ONLY valid JSON matching this schema:

{{
  "title": "string — your best guess at the script title, or 'Untitled' if none found",
  "characters": [
    {{"name": "CANONICAL_NAME"}}
  ],
  "lines": [
    {{
      "sequence": 1,
      "kind": "scene_header | stage_direction | dialogue",
      "character": "CANONICAL_NAME or null",
      "text": "the line content"
    }}
  ]
}}

Rules:

1. CHARACTERS: Identify every speaking character. Use the canonical name as it most often
   appears in the script (e.g., "ADAM", "EVELYN"). Strip role labels like "(O.S.)" or
   "(V.O.)" from the canonical name. Do not include characters who are only mentioned but
   never speak.

2. LINES: Each line is one of three kinds:
   - "scene_header" — a scene marker like "SCENE 1 - The museum." character is null.
   - "stage_direction" — parenthetical action or description. character is null.
   - "dialogue" — spoken text. character is the canonical name.

3. SEQUENCE: Number lines starting at 1, in the order they should be performed/read.
   No gaps.

4. DIALOGUE TEXT: Strip the "CHARACTER:" prefix. Keep the line's natural content
   including punctuation. Preserve in-line stage directions in parentheses unless they
   are clearly a separate beat.

5. EMPTY OR NON-CONTENT TEXT: Skip page numbers, footers, headers, copyright notices,
   cast lists, "AUTHOR'S NOTE", and similar non-performable matter.

6. INTERRUPTIONS: When a script uses "/" to mark interruption, keep the "/" character.

7. STAGE DIRECTIONS INSIDE DIALOGUE: If a parenthetical clearly belongs to a single
   character's delivery, keep it inline. If it's a separate physical action, make it
   its own stage_direction line.

8. Output ONLY the JSON. No commentary, no markdown fences.

SCRIPT BEGINS:
{_SCRIPT_SENTINEL}
SCRIPT ENDS.
"""

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


async def parse_script(extracted_text: str, llm: LLMClient) -> dict[str, Any]:
    """Call the LLM once and return validated parsed-script JSON.

    Raises ValueError on schema or post-validation failures.
    """
    prompt = _PROMPT_TEMPLATE.replace(_SCRIPT_SENTINEL, extracted_text)
    data = await llm.complete_json(prompt, schema=_SCHEMA)
    try:
        jsonschema.validate(data, _SCHEMA)
    except jsonschema.ValidationError as exc:
        raise ValueError(f"Parsed output didn't match expected shape: {exc.message}") from exc
    _validate(data)
    return data


def _validate(data: dict[str, Any]) -> None:
    """Post-LLM checks that JSON schema cannot express."""
    known_names = {c["name"] for c in data["characters"]}

    for line in data["lines"]:
        if line["kind"] == "dialogue":
            char = line.get("character")
            if not char:
                raise ValueError(
                    f"Dialogue line {line['sequence']} has no character assigned."
                )
            if char not in known_names:
                raise ValueError(
                    f"Unknown character {char!r} on line {line['sequence']}."
                )

    sequences = sorted(line["sequence"] for line in data["lines"])
    expected = list(range(1, len(sequences) + 1))
    if sequences != expected:
        raise ValueError("Line sequences are not consecutive starting from 1.")

    if not any(line["kind"] == "dialogue" for line in data["lines"]):
        raise ValueError("No dialogue lines found — this doesn't look like a valid script.")
