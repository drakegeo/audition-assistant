from typing import Any

from ..llm.client import LLMClient

# Loaded from specs/script-parsing.md — kept here as a module constant so it
# can be found in one place without touching the spec doc at runtime.
_PROMPT_TEMPLATE = """\
You are parsing a play or screenplay into structured data for an at-home rehearsal tool.

Read the script below carefully. Output ONLY valid JSON matching this schema:

{
  "title": "string — your best guess at the script title, or 'Untitled' if none found",
  "characters": [
    {"name": "CANONICAL_NAME"}
  ],
  "lines": [
    {
      "sequence": 1,
      "kind": "scene_header" | "stage_direction" | "dialogue",
      "character": "CANONICAL_NAME" | null,
      "text": "the line content"
    }
  ]
}

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
{extracted_text}
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
    # TODO(phase-1): implement
    # prompt = _PROMPT_TEMPLATE.format(extracted_text=extracted_text)
    # data = await llm.complete_json(prompt, schema=_SCHEMA)
    # _validate(data)
    # return data
    raise NotImplementedError("Phase 1")


def _validate(data: dict[str, Any]) -> None:
    """Post-LLM validation beyond what JSON schema checks."""
    # TODO(phase-1): implement
    # - every dialogue line has a non-null character matching a known character name
    # - sequences are unique and dense (1, 2, ..., N with no gaps)
    # - at least one dialogue line exists
    raise NotImplementedError("Phase 1")
