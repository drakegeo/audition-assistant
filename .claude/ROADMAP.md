# Roadmap

This document defines what is in scope and what is not. **Claude Code: if a feature is not in the current phase, do not build it. Add `TODO(phase-N)` and move on.**

## Phase 0 — Scaffolding (current)

Repo structure exists. No application code yet. Goal: have a runnable skeleton on both backend and frontend.

**Deliverables:**
- `backend/` FastAPI app with `/health` endpoint, deployable to Render
- `tool-frontend/` Next.js app with login/signup pages wired to Supabase, deployable to Vercel
- Supabase project configured (auth provider enabled, Storage bucket created, DB schema applied)
- Environment variable templates (`.env.example`) in both apps
- Both apps run locally with `make dev` (or equivalent)

## Phase 1 — Script ingestion (MVP core, part 1)

User can upload a PDF and see it parsed into characters and lines.

**Deliverables:**
- `POST /scripts` — accept PDF, save to Supabase Storage, return `script_id`
- Background job: extract text from PDF, call LLM with the parsing prompt (see `specs/script-parsing.md`), validate JSON output against schema, persist to DB
- `GET /scripts/{id}` — return parsed script (characters + ordered lines + stage directions)
- `GET /scripts/{id}/status` — ingestion progress (queued / parsing / ready / failed)
- Reject scanned PDFs with a clear error (detect by extracting text and checking length — if <50 words from a multi-page PDF, it's likely scanned)
- Frontend: upload page → polls status → shows parsed result

**Out of scope for this phase:** Voice playback, character selection, rehearsal session, multiple scripts per user.

## Phase 2 — Rehearsal session (MVP core, part 2)

User picks their character and rehearses.

**Deliverables:**
- Character selection UI after parsing completes
- Rehearsal page: scrollable script view, current-line highlight
- TTS playback for non-user lines using Web Speech API
- Per-character voice assignment (pick from available browser voices, deterministic per character)
- Mic capture + STT for user lines
- Cue detection with three modes: `pause`, `match`, `hybrid` (see `specs/voice-loop.md`)
- User can pause / resume / restart from any line
- All session state is client-side; backend doesn't track session progress in v1

**Out of scope:** Saving session progress to the backend, performance metrics, recording playback.

## Phase 3 — Polish for MVP launch

**Deliverables:**
- Browser compatibility check on load (warn Firefox users about STT)
- Voice preview/picker (let user override the auto-assigned voice per character)
- Adjustable playback speed
- Friendly error states for: upload fail, parse fail, mic permission denied, no browser voices available
- Basic analytics (Plausible or PostHog free tier) — uploads, parses, sessions started, sessions completed
- Per-user upload quota (e.g., 5 scripts per day) to cap LLM costs

## Post-MVP (not yet scheduled — `TODO(post-mvp)`)

- **Script library** — multiple scripts per user, switch between them
- **Share-link** — read-only view a coach can open
- **High-quality TTS** — ElevenLabs integration for premium voices
- **OCR support** — handle scanned PDFs via Tesseract or a cloud OCR API
- **Other formats** — `.txt`, `.docx`, paste-from-clipboard
- **Session memory** — save where the user left off, return on next session
- **Performance feedback** — pace, hesitation, line accuracy metrics
- **Recording** — let user record their session and play it back
- **Multiplayer** — two users rehearsing together in real-time (different product, may not happen)
- **Mobile native app** — Capacitor or React Native wrapper
- **Stripe billing** — free tier (5 scripts/month) + paid tier (unlimited)
- **Localization** — non-English scripts; right now the LLM prompt and STT assume English

## What we explicitly will not build

- A general-purpose document Q&A tool (that's your RFP project)
- A recording studio / editing tool
- A talent marketplace
- AI-generated acting feedback (out of scope for ethical and scope reasons)
