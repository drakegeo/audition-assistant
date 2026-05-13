# Code Style

Short conventions. Where these conflict with framework defaults (FastAPI, Next.js, Supabase SDK), follow the framework.

## General

- **Names describe intent, not implementation.** `parseScript` (what it does), not `runLLMOnPDF` (how it works).
- **Boolean names are predicates.** `isReady`, `hasError`, `canSkip` — not `ready`, `error`, `skip`.
- **No abbreviations except universally-known ones** (`id`, `url`, `db`, `pdf`). Spell out the rest.
- **Magic numbers get a named constant.** `const PARSE_TIMEOUT_MS = 30_000` not `setTimeout(..., 30000)`.
- **Early returns over nested ifs.** Reduce indentation; flatten happy paths.
- **One concern per file.** If a file imports across two unrelated domains, split it.

## Python (backend)

- Python 3.11+. Use `match` statements where they're genuinely clearer.
- Type hints on every function signature. `mypy --strict` is the bar; loosen with `# type: ignore[reason]` only with a justification.
- `async def` for I/O-bound functions (DB, HTTP, file). Sync for pure compute.
- `pydantic.BaseModel` for everything crossing a boundary (request, response, DB row when shape matters).
- Docstrings on public functions (anything imported from another module). Single sentence is fine.
- Format with `ruff format`. Lint with `ruff check`.

## TypeScript (frontend)

- Strict mode on. No `any`. Use `unknown` and narrow.
- Functional components only. Hooks for state.
- Named exports preferred. Default exports only for Next.js page components (where the framework requires it).
- One component per file. File name matches component name (`UploadPanel.tsx` exports `UploadPanel`).
- Types and interfaces in `src/types/`, not co-located with components, when shared across files. Co-located only if used in one file.
- `async/await`, not `.then()`.
- Format with Prettier. Lint with ESLint (Next.js default config).

## Imports

- Absolute imports preferred when the path would otherwise be `../../../`.
- Group: stdlib/framework, third-party, local. Blank line between groups.
- No unused imports. The linter enforces.

## Comments

- Code first, comments second. If you're tempted to comment, first try renaming.
- Comments explain *why*, not *what*. "This is a workaround for Chrome bug X" is good. "// loop through users" is noise.
- `TODO` comments include scope tag and ideally a reason: `// TODO(post-mvp): per-character voice picker UI`. Bare `TODO` is rejected in review.

## Logging

### Backend

Use the stdlib `logging` module. Configure once at app startup.

```python
import logging
logger = logging.getLogger(__name__)

# At call sites:
logger.info("script_parsed", extra={"script_id": script_id, "char_count": n})
logger.error("parse_failed", extra={"script_id": script_id}, exc_info=True)
```

Levels:
- `DEBUG` — verbose internals, off in production
- `INFO` — significant events (script uploaded, script parsed, user signed up)
- `WARNING` — recoverable issues (LLM retry, slow parse)
- `ERROR` — failures (parse failed, auth verification crashed)

Never log the JWT, the service role key, or full PDF contents.

### Frontend

For MVP, a thin `logger.ts` that wraps `console.*` and is gated on `?debug=1`. No external logging service yet.

## Error handling

### Backend

- Raise `HTTPException` with a clear status and `{"error": code, "detail": msg}` body.
- Catch broad `Exception` only at request boundaries; let it bubble inside business logic.
- Background tasks: catch and record to the DB (`scripts.parse_error`). Never let a background task crash silently.

### Frontend

- API calls go through `lib/api.ts` which throws typed `ApiError`.
- Components handle errors with explicit states (`{ status: 'error', message }`), not by swallowing.
- Never render `error.message` raw to the user — it can leak server details. Map machine codes to friendly text.

## File and folder naming

- **Backend:** `snake_case.py`. Folders are short lowercase nouns (`api`, `auth`, `ingestion`, `llm`).
- **Frontend:** `PascalCase.tsx` for components, `camelCase.ts` for utilities. Folders are lowercase nouns.
- Test files: `test_<module>.py` (backend), `<module>.test.ts` (frontend).

## What we don't enforce

- Line length: aim for readable, no hard cap.
- Comment density: code clarity matters more than coverage.
- "Functional vs OO": use whichever fits the problem.
