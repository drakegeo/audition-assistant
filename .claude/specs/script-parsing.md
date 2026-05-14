# Script Parsing

How a PDF becomes structured script data. This is the only place the LLM is used.

## Pipeline

```
PDF bytes
  │
  ▼ pypdf
plain text (one big string, page boundaries preserved as \n\n)
  │
  ▼ heuristic check: word count > 50?
  │   no  → return "looks like a scanned PDF" error
  │   yes → continue
  │
  ▼ LLM call (Claude Haiku 4.5) with strict JSON output
parsed JSON  { title, characters, lines }
  │
  ▼ JSON schema validation (jsonschema lib)
  │   fail → mark script status=failed, store error
  │   pass → continue
  │
  ▼ DB writes (characters table, then lines table, in a transaction)
status=ready
```

## Why one LLM call, not per-page

Splitting the script across multiple LLM calls would lose the global context — character continuity across pages, scene boundaries, who's speaking when a `(CONT'D)` appears. Claude Haiku 4.5 handles plays of 50+ pages in a single call comfortably. If we hit context limits later, the right move is to switch to Sonnet, not to split.

## Cost expectation

Measured on "The Shape of Things" (39 pages, 10k words):
- Input: ~20,600 tokens (script text + prompt)
- Output: ~46,000 tokens (structured JSON for 836 lines is very verbose)
- **Total cost: ~$0.20 per full-length script** at Haiku pricing

The original estimate (~6k output tokens) was wrong — the JSON representation of a full play is 6–8× larger than the raw text because of repeated schema keys per line. This is a one-time cost; rehearsal uses Web Speech API (free).

`max_tokens` must be set to 64,000 with the `output-128k-2025-02-19` beta enabled. See `src/llm/anthropic.py`.

## The prompt

```
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

1. CHARACTERS: Identify every speaking character. Use the canonical name as it most often appears in the script (e.g., "ADAM", "EVELYN"). Strip role labels like "(O.S.)" or "(V.O.)" from the canonical name. Do not include characters who are only mentioned but never speak.

2. LINES: Each line is one of three kinds:
   - "scene_header" — a scene marker like "SCENE 1 - The museum." character is null.
   - "stage_direction" — parenthetical action or description like "(He laughs.)" or "A young woman stands near a stretch of velvet rope." character is null.
   - "dialogue" — spoken text. character is the canonical name.

3. SEQUENCE: Number lines starting at 1, in the order they should be performed/read. No gaps.

4. DIALOGUE TEXT: Strip the "CHARACTER:" prefix. Keep the line's natural content including punctuation. Preserve in-line stage directions in parentheses (these stay inline with the dialogue, not as separate stage_direction entries) unless they are clearly a separate beat.

5. EMPTY OR NON-CONTENT TEXT: Skip page numbers, footers, headers, copyright notices, cast lists, "AUTHOR'S NOTE", and similar non-performable matter.

6. INTERRUPTIONS: When a script uses "/" to mark interruption (e.g., "I think.../I mean, no"), keep the "/" character in the text. The frontend renders it.

7. STAGE DIRECTIONS INSIDE DIALOGUE: If a parenthetical clearly belongs to a single character's delivery (e.g., "ADAM: (laughing) That's funny."), keep "(laughing)" inline within the dialogue text. If it's a separate physical action between speeches, make it its own stage_direction line.

8. Output ONLY the JSON. No commentary, no markdown fences.

SCRIPT BEGINS:
{{ extracted_text }}
SCRIPT ENDS.
```

## JSON schema for validation

The LLM output is validated against this schema before being written to the DB. A validation failure marks the script as `failed`.

```json
{
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
        "properties": {
          "name": {"type": "string", "minLength": 1, "maxLength": 100}
        }
      }
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
          "text": {"type": "string", "minLength": 1}
        }
      }
    }
  }
}
```

Additional post-validation checks (not in JSON schema, done in code):
- For every line with `kind == "dialogue"`, `character` is not null and matches one of the character names.
- Sequences are unique and dense (1, 2, 3, ..., N with no gaps).
- At least one dialogue line exists (a script with no dialogue is invalid).

## Calling the LLM

Use the `LLMClient` interface from `src/llm/client.py`. The Anthropic implementation:

```python
# src/llm/anthropic.py
import json
import os
from anthropic import AsyncAnthropic
from .client import LLMClient

class AnthropicClient:
    def __init__(self):
        self._client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    async def complete_json(self, prompt: str, *, schema: dict) -> dict:
        resp = await self._client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=16000,
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.content[0].text.strip()
        # Strip markdown fences defensively in case the model adds them
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        return json.loads(text)
```

The exact model string should be loaded from config (env var `LLM_MODEL`) so we can A/B without redeploying.

## Error handling

| Failure                              | DB status   | parse_error                              | User-visible             |
|--------------------------------------|-------------|------------------------------------------|--------------------------|
| pypdf extraction yields < 50 words   | failed      | "Looks like a scanned PDF. Try a text PDF." | Reject upload at API     |
| LLM returns non-JSON                  | failed      | "Parser returned malformed output. Try again." | Show error, suggest retry |
| LLM JSON fails schema validation     | failed      | "Parsed output didn't match expected shape" | Show error               |
| LLM call fails (network, rate limit) | queued (retry once with backoff), then failed | "Parser is busy. Try again in a minute." | Show error               |
| DB write fails                       | failed      | "Internal error storing parsed script."  | Show generic error       |

Retry policy: LLM calls retry once on `5xx` or `429` with 5s backoff. No retry on `4xx`.

## Quality validation post-MVP

We should track parse quality. Add a `parse_quality` JSONB column on `scripts` in Phase 3 to store metrics:
- Line count
- Character count
- Average words per dialogue line
- % of lines that are stage directions vs dialogue

Lets us spot quality regressions when we change the prompt or model.

## Things you should NOT do

- Don't add multiple LLM calls. One script = one call.
- Don't try to handle scanned PDFs by sending images to the LLM. ADR-006 says no OCR in MVP.
- Don't dump the prompt template inline in code. It lives here, in this spec, and is loaded as a string template at runtime.
- Don't tweak the schema without updating this doc *and* the migration in `data-model.md`.
