# Roadmap

This document defines what is in scope and what is not. **Claude Code: if a feature is not in the current phase, do not build it. Add `TODO(phase-N)` and move on.**

## Phase 0 — Scaffolding ✓ complete

Repo structure exists. No application code yet. Goal: have a runnable skeleton on both backend and frontend.

**Deliverables:**
- `backend/` FastAPI app with `/health` endpoint, deployable to Render
- `tool-frontend/` Next.js app with login/signup pages wired to Supabase, deployable to Vercel
- Supabase project configured (auth provider enabled, Storage bucket created, DB schema applied)
- Environment variable templates (`.env.example`) in both apps
- Both apps run locally with `make dev` (or equivalent)

## Phase 1 — Script ingestion (MVP core, part 1) ✓ complete

Backend fully implemented and tested (21 tests passing). Frontend upload UI still pending — will be built as part of Phase 2 frontend work.

**Completed:**
- `POST /scripts` — PDF validation (magic bytes, 10 MB cap), Supabase Storage upload, one-script-at-a-time rule, background parse enqueue
- Background worker: pypdf extraction → Groq/Anthropic LLM call → jsonschema validation → DB write; 2-attempt retry; graceful failure recording
- `GET /scripts/current` — full script with characters + lines
- `GET /scripts/{id}/status` — lightweight poll
- `DELETE /scripts/{id}` — ownership-checked delete
- Scanned PDF rejection (<50 extractable words)
- Dual LLM provider: Groq (default, free) or Anthropic, swapped via `LLM_PROVIDER` env var

**Remaining (frontend — build in Phase 2):**
- Upload page → polls status → shows parsed result

## Phase 2 — Rehearsal session (MVP core, part 2) ✓ complete

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

## Phase 3 — Polish for MVP launch ← current

**Order of work:**
1. ✅ **Local end-to-end verification** — done.
2. ✅ **Deploy** — backend on Render, frontend on Vercel. Both live.
3. **Verify live flow** — sign up on production → upload PDF → parse → rehearse. Fix anything broken.
4. **Polish** — the items below.

**Deliverables:**
- ✅ Firefox STT warning already shown (basic) — improve UI, offer manual-advance mode
- Cue mode picker in rehearsal UI (currently hardcoded to `hybrid`)
- Adjustable silence threshold slider (pause/hybrid mode)
- Voice preview/picker per character (let user override auto-assigned voice)
- Friendly error states for: mic permission denied, no browser voices, parse fail shown in UI
- Per-user upload quota — implement `_check_quota` (Phase-3 stub already in place)
- Basic analytics (Plausible or PostHog free tier)

## Post-MVP (not yet scheduled — `TODO(post-mvp)`)

### Human-sounding voice — HIGH PRIORITY post-MVP

The Web Speech API TTS is mechanical and robotic. This is the most noticeable quality
gap vs a real scene partner. Options in order of effort:

| Option | Quality | Cost | Effort |
|--------|---------|------|--------|
| Cartesia Sonic | Excellent | ~$0.065/1k chars | Low — REST API, drop-in |
| ElevenLabs | Best | ~$0.18/1k chars | Low — REST API |
| Kokoro / XTTS (self-hosted) | Very good | Free (needs GPU) | High |
| Pipecat pipeline (see below) | Best + real-time | Varies | High |

**Recommended first step:** swap Web Speech API TTS for Cartesia or ElevenLabs for
character lines. Keep Web Speech API for scene headers / stage directions (free).
Abstract behind a `TTSClient` interface (same pattern as `LLMClient`) so the provider
is swappable with one env var change.

**STT upgrade:** move from Web Speech API to Deepgram for word-level accuracy and
reliable word highlighting. Deepgram free tier handles ~45 min/month.

### Voice upgrade — Pipecat integration

Replace or augment Web Speech API with a Pipecat-based voice pipeline for:
- **Accurate word-level STT** — Deepgram or Whisper instead of Web Speech API
- **Expressive TTS** — Kokoro / Cartesia / ElevenLabs instead of browser voices
- **Character "consciousness"** — LLM-driven delivery with emotion, pacing, personality

Architectural impact: rehearsal session moves from fully browser-side to a real-time
WebSocket session through the backend. Render free tier won't handle this — requires
Fly.io or a dedicated instance. Design as an opt-in premium mode with a `VoiceClient`
interface that abstracts over Web Speech API (free) vs Pipecat (paid/premium).

Free self-hosted stack: Deepgram free tier (STT) + XTTS/Kokoro (TTS, needs GPU) + Groq (LLM).
Paid but easy stack: Deepgram + Cartesia + Groq.

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
