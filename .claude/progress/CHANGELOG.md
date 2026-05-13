# Changelog

Append-only log of meaningful work. Each session ends with adding entries here. Most recent at the top.

Format:
```
## YYYY-MM-DD — short summary
- What was built / changed / decided
- Files touched (brief)
- Open follow-ups (next session should know)
```

---

## 2026-05-13 — Phase 0 backend scaffold; rename to audition-assistant

- Renamed project from "offbook" to "audition-assistant" throughout all `.claude/` docs, role files, specs, and README.
- Created `backend/` FastAPI skeleton:
  - `src/api/main.py` — app factory, CORS, router registration
  - `src/api/health.py` — `GET /health` (fully implemented, no auth)
  - `src/api/scripts.py` — all four script endpoints stubbed (501); `_check_quota` stub with `TODO(phase-3)` per spec
  - `src/auth/supabase_auth.py` — `get_current_user_id` dependency (lazy Supabase client via `lru_cache`)
  - `src/llm/client.py` — `LLMClient` Protocol interface
  - `src/llm/anthropic.py` — `AnthropicClient` implementation (ready for Phase 1)
  - `src/ingestion/` — `pdf_extractor`, `parser`, `worker` stubs with Phase 1 TODOs
  - `src/storage/` — `pdf_storage`, `db` stubs with Phase 1 TODOs
  - `src/models/schemas.py` — Pydantic models matching `specs/api-endpoints.md`
  - `pyproject.toml` (uv), `.python-version`, `render.yaml`, `start.sh`, `.env.example`
  - `tests/test_health.py` — passing health-check test
- Created `tool-frontend/` skeleton:
  - `package.json`, `tsconfig.json`, `next.config.ts`, `.env.local.example`
  - `src/app/layout.tsx`, `src/app/page.tsx` (placeholder)
  - Empty directories for `components/`, `lib/voice/`, `types/`
- Created root `Makefile` (targets: `install-backend`, `dev-backend`, `test-backend`, `install-frontend`, `dev-frontend`)
- Created root `.gitignore`
- Updated `ARCHITECTURE.md`: `requirements.txt` → `pyproject.toml`; updated production URLs
- Updated `DECISIONS.md` ADR-007: codename updated from "offbook" to "audition-assistant"

**Next session should (Phase 1 — Script ingestion):**
1. Adopt the **backend engineer** role.
2. Create the Supabase project's Storage bucket (`user-scripts`) and run the DB migration from `specs/data-model.md`.
3. Implement `src/ingestion/pdf_extractor.py` (pypdf text extraction + scanned-PDF detection).
4. Implement `src/ingestion/parser.py` (LLM call + jsonschema validation + post-checks).
5. Implement `src/ingestion/worker.py` (full background task: Storage download → extract → parse → DB write).
6. Implement `src/storage/pdf_storage.py` and `src/storage/db.py`.
7. Wire up `POST /scripts` (PDF validation, magic bytes check, Storage upload, `create_script_row`, enqueue worker).
8. Implement `GET /scripts/current` and `GET /scripts/{id}/status`.
9. Add end-to-end test with a fixture PDF and mocked `LLMClient`.
10. Append here when done.

---

## 2026-05-13 — `.claude/` folder scaffolded

- Initial project orientation written (`README.md`, `ROADMAP.md`, `ARCHITECTURE.md`).
- Locked-in decisions logged in `DECISIONS.md` (ADR-001 through ADR-007): Web Speech API, hybrid cue detection, server-side single-LLM-provider, Render+Vercel+Supabase, solo-only MVP, no OCR, codename "offbook".
- Roles written: backend engineer, frontend engineer, voice engineer, reviewer.
- Specs written: data model, API endpoints, script parsing prompt, voice loop state machine.
- Conventions written: code style, security.
- No application code yet. `backend/` and `tool-frontend/` directories are not created.

**Next session should:**
1. Adopt the **backend engineer** role.
2. Scaffold `backend/` per `ARCHITECTURE.md`: FastAPI app skeleton, `/health` endpoint, auth dependency stub, `LLMClient` interface, `requirements.txt`, `render.yaml`, `start.sh`, `.env.example`.
3. Create the Supabase project; run the migration from `specs/data-model.md`.
4. Verify the backend deploys to Render with just the `/health` endpoint working.
5. Append a new entry here when done.
