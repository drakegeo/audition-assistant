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
- ✅ Firefox STT warning shown
- ✅ Per-user upload quota — 3 scripts lifetime, soft-delete tracking
- ✅ Script library — card view, inline rename, quota progress bar
- Cue mode picker in rehearsal UI (currently hardcoded to `hybrid`)
- Adjustable silence threshold slider
- Voice preview/picker per character
- Friendly error states for mic permission denied, no browser voices
- Basic analytics (Plausible or PostHog free tier)

## Post-MVP (not yet scheduled — `TODO(post-mvp)`)

### Voice upgrade tiers

#### Free tier — Kokoro WASM (browser, open-source)
- Model: `onnx-community/Kokoro-82M-v1.0` via `kokoro-js` npm package
- Runs 100% in the browser via WebAssembly — no server cost
- ~80 MB one-time download, cached by browser
- 8 English voices (American + British, male + female)
- No emotion control — significantly better than Web Speech API but flat delivery
- Status: implemented in Phase 3

#### Premium tier — OpenAI TTS HD (chosen approach)

**Why OpenAI TTS HD:**
- $0.030 / 1k chars — affordable at scale without volume deals
- 57 languages — genuine differentiator vs ScenePartner (English-only)
- Good quality for rehearsal; not ElevenLabs-level but far better than Kokoro for expressiveness
- Simple REST API, no WebSocket pipeline needed
- Call from backend → cache result → serve from Supabase Storage

**Unit economics (per user per month):**
- A 6-page audition side = ~4,500 chars of non-user lines
- First TTS generation: ~$0.14 per scene
- Every repeat run: $0.00 (served from cache)
- Cap: 3 new scripts/month on premium = max ~$0.42/month cost per user
- Charge €10–15/month → ~95% gross margin on voice costs

**Caching strategy (critical):**
- Generate TTS per line on first request → store audio file in Supabase Storage
- Key: `tts/{script_id}/{line_id}/{voice_id}.mp3`
- On subsequent runs, stream directly from Storage — no API call
- Two users rehearsing the same script share the cache (first user pays, all others free)
- Do NOT cap rehearsal session count — unlimited repetitions is the product's value prop

**Usage limits (premium):**
- 3 new script uploads/month (bounds first-generation cost)
- Unlimited rehearsal sessions on any uploaded script
- Unlimited language selection (voice IDs vary per language, same pricing)

**Multi-language notes:**
- TTS quality in major European languages (French, German, Spanish, Italian, Dutch) is solid on OpenAI
- STT (Web Speech API) quality degrades for non-English theatrical speech — cue detection will be less reliable; warn users
- Per-language voice variety is lower than English — fewer distinct character voices available

**Other options considered and why deprioritised:**
- ElevenLabs: ~$0.18/1k chars, best quality, but unit economics only work with enterprise volume discounts ScenePartner likely has. At retail pricing, Pro-tier users would cost more than they pay.
- Cartesia: Good quality, lower latency, but fewer languages and smaller voice library.
- Azure / Google Neural TTS: Cheapest ($0.004–0.016/1k), 100+ languages, but "corporate" sound — not expressive enough for actors.
- Parler TTS + LLM: Best emotional range, but requires a dedicated GPU server ($5–20/mo on Fly.io) and a real-time WebSocket pipeline. Post-MVP if the premium tier proves out.

**STT upgrade (any tier):** Deepgram for word-level accuracy + reliable highlighting.
Free tier ~45 min/month. Replaces Web Speech API STT only.

**Architecture:** Abstract behind a `TTSClient` interface (same pattern as `LLMClient`).
Free users get Kokoro WASM; premium users get OpenAI TTS HD with Supabase Storage cache.

### Voice upgrade — Pipecat integration (consciousness pipeline)

Full real-time pipeline: browser mic → WebSocket → Pipecat → STT + LLM + TTS → browser.
LLM understands scene context and responds in character with appropriate emotion.
Requires separate server (Fly.io or paid Render). Not compatible with free tier.
Build as opt-in premium mode after Cartesia integration is proven.

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
