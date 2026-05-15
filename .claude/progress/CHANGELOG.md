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

## 2026-05-15 — Deployed to Render + Vercel; production live

- Backend deployed to Render (Python web service, `render.yaml` auto-detected).
  `GET /health` returns `{"status":"ok"}` on live URL.
- Frontend deployed to Vercel (Next.js, root dir `tool-frontend`).
  Live at `https://audition-assistant.vercel.app`.
- Fixed Vercel build error: wrapped `useSearchParams()` in `<Suspense>` in
  `src/app/auth/callback/page.tsx` (Next.js 15 requirement).
- Fixed GitHub account mismatch that blocked Vercel deployment.
- Supabase configured for production:
  - Site URL updated to Vercel URL
  - Redirect URLs: added `https://audition-assistant.vercel.app/auth/callback`
    and `http://localhost:3000/auth/callback`
- Render `ALLOWED_ORIGINS` set to Vercel URL + `http://localhost:3000`.

**Next:** verify full flow on live URLs (sign up → upload → parse → rehearse),
then move to Phase 3 polish items.

---

## 2026-05-15 — In-line word highlighting + scene list

- **Word highlighting in the line:** Removed separate transcript bar. Words the user speaks now highlight blue (`<mark>`) directly inside their dialogue line as STT recognises them. Uses set-based token matching (normalise → lowercase, strip punctuation). Clears on line advance.
- **Scene list:** "Scenes ▾" button in controls bar opens a dropdown panel listing all `scene_header` lines. Clicking a scene scrolls the script to it. Panel closes on selection or on the × button. Works before and during rehearsal.
- **LineItem refactor:** Added `transcript` prop; word highlighting only active when `isCurrent && isUserLine && transcript !== ""`.
- TypeScript: 0 errors. 21 backend tests passing.

---

## 2026-05-14 — Transcript display, compact JSON parser, loading improvements

- **Transcript display:** `RehearsalView` now shows a live transcript strip (blue bar below controls) while in LISTENING state. Words appear as STT recognises them, cleared when the user advances. Answers user's "mark the words I say" request.
- **Compact JSON format:** Rewrote `src/ingestion/parser.py` to output compact array lines `[seq, "d"|"s"|"h", char, text]` instead of verbose objects. Reduces output tokens ~30–40% (from ~46k to ~28–32k estimated for a 39-page play). `_expand()` converts to full format before DB write. Both `_COMPACT_SCHEMA` and `_SCHEMA` kept — compact for LLM validation, full for `_validate()` and tests.
- **Loading bar with elapsed time:** `UploadPanel` now shows the `progress_hint` message from the status API + a live elapsed-time counter (e.g. "1m 23s elapsed"). Progress hint computed from status in the endpoint — no DB column needed.
- **CORS fix:** Added `http://127.0.0.1:3000` to default allowed origins. `allow_headers=["*"]`. Debugged origin mismatch: browser was sending `Origin: http://10.231.27.24:3000` (network IP, not localhost). Fix: use `http://localhost:3000`.
- **Returning user flow:** `UploadPanel` now checks for existing script on mount — returns users land on character picker directly, no re-upload needed. "Upload a different script" link available.
- 21 tests passing. TypeScript: 0 errors.

**Next step:** upload PDF through web app and confirm full rehearsal flow works end-to-end with new compact parser. Then deploy to Render + Vercel.

---

## 2026-05-14 — Local debugging complete; backend ready for end-to-end web test

- Fixed `load_dotenv()` missing from `src/api/main.py` — backend wasn't reading `.env` at all, causing every auth call to fail with `KeyError: 'SUPABASE_URL'`.
- Added `python-dotenv>=1.0.0` as explicit dependency in `pyproject.toml`.
- Added auth callback route `src/app/auth/callback/page.tsx` — handles Supabase email confirmation `?code=` redirect and exchanges it for a session. Updated signup page to pass `emailRedirectTo`.
- Discovered real LLM output token requirement: "The Shape of Things" (39 pages) needs **45,950 output tokens** — 6× the assumed ~6k. Default `max_tokens=16000` was always truncating mid-JSON.
- Updated `src/llm/anthropic.py` to use streaming + `output-128k-2025-02-19` beta with `max_tokens=64000`. Cost per 39-page script: ~$0.20 (one-time; rehearsal loop is free Web Speech API).
- Updated `src/llm/groq.py` to use streaming. Groq free tier (~6k–12k TPM) is too small for full scripts; needs paid tier or short scripts.
- Wrote `data/parse_experiment.py` — standalone script to test PDF parsing locally without the web app. Confirmed successful parse: 836 lines, 4 characters, JSON valid.
- `LOG_LEVEL` changed to `INFO` in `backend/.env` to reduce multipart debug noise.
- 21 tests still passing after all changes.

**Next step:** upload PDF through the web app (`http://localhost:3000/upload`), wait ~2–3 min for streaming parse, pick character, rehearse. If clean → deploy to Render + Vercel.

---

## 2026-05-14 — Local testing plan confirmed; Phase 3 sequenced

- Strategy locked: verify the full flow locally before any deployment.
- Local checklist: fill `backend/.env` + `tool-frontend/.env.local` → `make dev-backend` + `make dev-frontend` → sign up at `/signup` → upload PDF → parse → pick character → rehearse.
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` already set in `.env.local.example`.
- After local verification passes: deploy backend to Render (set env vars in dashboard), then frontend to Vercel (set `NEXT_PUBLIC_API_BASE_URL` to the Render URL + Supabase keys).
- Phase 3 polish items (cue mode picker, voice picker, quota, analytics) follow after live deployment is confirmed.

---

## 2026-05-14 — Phase 2 complete: frontend + voice loop

- **Infrastructure:** `src/types/script.ts` (types matching backend schemas), `src/lib/supabase.ts`, `src/lib/api.ts` (typed API calls, `ApiError` class), `src/types/speech.d.ts` (Web Speech API declarations).
- **Auth:** Login + signup pages (Supabase email/password), `AuthGuard` component, home page redirects on session state.
- **Upload flow:** `UploadPanel` (file select → POST → status poll every 2s → character picker); upload page + client wrapper.
- **Voice library** (all in `src/lib/voice/`):
  - `support.ts` — `detectVoiceSupport`, `loadVoices` (voiceschanged workaround), `assignVoices` (English-first, deterministic by index).
  - `tts.ts` — `speakLine` with sentence-boundary chunking (Chrome onend bug workaround), `durationEstimateMs`.
  - `stt.ts` — `createSTT` with `continuous=true` + auto-restart on silence (Chrome), Safari `webkitSpeechRecognition` fallback.
  - `cue.ts` — `createCueDetector` for all three modes (pause / match / hybrid); token-set similarity.
  - `session.ts` — typed `reduce` state machine (idle → speaking ↔ listening, paused, error) per `specs/voice-loop.md`.
- **Rehearsal page:** `RehearsalView` (useReducer + effects for TTS/STT, timeout fallbacks, 30s skip prompt, script scroll), rehearse/[scriptId]/page.tsx (loads script, Firefox STT warning, cue mode selector). Keyboard shortcuts: Space = pause/resume, R = restart line, → = skip.
- TypeScript strict mode: 0 errors.

**Next session should (Phase 3 — Polish):**
1. Browser compat check on load (Firefox STT warning — partially done; improve UI).
2. Voice preview/picker (let user override auto-assigned voice per character).
3. Adjustable playback speed + silence threshold sliders.
4. Friendly error states for upload fail, parse fail, mic permission denied.
5. Cue mode picker in rehearsal UI (currently hardcoded to hybrid).
6. Deploy: configure Render (backend) + Vercel (frontend) env vars and verify end-to-end.

---

## 2026-05-14 — Phase 1 complete: script ingestion pipeline

- `src/supabase_client.py` — shared lazy Supabase service-role client.
- `src/ingestion/pdf_extractor.py` — pypdf text extraction; raises ValueError for scanned PDFs (<50 words).
- `src/ingestion/parser.py` — LLM call via `_PROMPT_TEMPLATE` (safe `.replace()` interpolation, not `.format()`); jsonschema validation; post-validation checks (unknown characters, non-consecutive sequences, no dialogue).
- `src/ingestion/worker.py` — full background task: queued→parsing→ready|failed; LLM retry (2 attempts, 5s backoff); graceful handling if script was deleted mid-parse.
- `src/storage/pdf_storage.py` — upload/download/delete via Supabase Storage using `asyncio.to_thread`.
- `src/storage/db.py` — all DB operations (create, status update, get, delete, full write with character sort by line count); parallel char+line fetch via `asyncio.gather`.
- `src/api/scripts.py` — all four endpoints implemented: POST /scripts (magic bytes check, 10 MB cap, one-script-at-a-time delete, enqueue worker), GET /scripts/current, GET /scripts/{id}/status, DELETE /scripts/{id}.
- Tests: 21 passing (auth × 4, health × 1, ingestion × 6, scripts API × 10).

**Next session should (Phase 1 frontend + Phase 2 rehearsal):**
1. Adopt the **frontend engineer** role.
2. Build `tool-frontend/` auth pages (login, signup) wired to Supabase.
3. Build upload page → polls `GET /scripts/{id}/status` → shows parsed result.
4. Build character selection UI.
5. Begin Phase 2: rehearsal page with voice loop state machine.

---

## 2026-05-13 — Groq added as default LLM provider; Phase 1 ready to start

- Added `src/llm/groq.py` — `GroqClient` using `AsyncGroq`, default model `llama-3.3-70b-versatile` (128k context, free tier).
- Added `src/llm/factory.py` — `get_llm_client()` reads `LLM_PROVIDER` env var and returns the right client (`anthropic` or `groq`). Uses Python `match` statement.
- Added `groq>=0.12.0` to `pyproject.toml`; synced (`groq==1.2.0` installed).
- Updated `render.yaml`, `.env.example`, `ARCHITECTURE.md`, `DECISIONS.md` (ADR-003) to reflect dual-provider setup. Groq is the default.
- Clarified: PDF is uploaded via frontend → stored in Supabase Storage via backend. Voice (TTS/STT) uses Web Speech API — free, browser-native, mechanical (not ElevenLabs). ElevenLabs is post-MVP.

---

## 2026-05-13 — Phase 0 complete

- Supabase migration run successfully (`20260513000000_initial_schema.sql`): `scripts`, `characters`, `lines` tables live with RLS; `user-scripts` Storage bucket created.
- `GET /health` verified working locally.
- Phase 0 is done. Phase 1 (script ingestion) is next.

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
