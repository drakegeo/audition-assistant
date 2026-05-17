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

### Voice upgrade tiers ← ACTIVE WORK (2026-05-16)

**Current state:** Free tier runs Web Speech API (browser, robotic). Kokoro code exists but is broken — HuggingFace gated the model. Kokoro is English-only anyway and does not solve the multilingual requirement.

**Target languages:** English (US + GB), Greek, Turkish, Dutch, Spanish, Portuguese.

---

#### Free tier — Edge TTS (server-side, unofficial Microsoft neural)

**Decision (2026-05-16):** Replace broken Kokoro + Web Speech with Edge TTS as the improved free baseline.

**Why Edge TTS:**
- Same neural voices as Azure Cognitive Services (literally the same engine — Microsoft Edge browser's read-aloud backend)
- All 6 target languages confirmed working: en-US, en-GB, el-GR, tr-TR, nl-NL, es-ES, pt-PT
- $0 forever — no API key, no signup
- Server-side Python (`edge-tts` package installed in backend venv)
- Audio cached in Supabase Storage → generated once per (line, voice), served forever after

**Risk:** Unofficial, no ToS guarantee, could be rate-limited or broken by Microsoft without notice. Acceptable for free tier — premium users get the reliable paid path.

**Voices confirmed available (2026-05-16):**
- en-US: AvaNeural (F), AndrewNeural (M), EmmaNeural (F), BrianNeural (M), JennyNeural (F), GuyNeural (M) + more
- en-GB: LibbyNeural (F), SoniaNeural (F), RyanNeural (M), ThomasNeural (M)
- el-GR: AthinaNeural (F), NestorasNeural (M)
- tr-TR: EmelNeural (F), AhmetNeural (M)
- nl-NL: ColetteNeural (F), FennaNeural (F), MaartenNeural (M)
- es-ES: XimenaNeural (F), ElviraNeural (F), AlvaroNeural (M)
- pt-PT: RaquelNeural (F), DuarteNeural (M)

**Audio samples generated:** `data/audio_samples/` — 14 MP3s (female + male per language). Listen before finalising voice selection UI.

**Status:** `edge-tts` installed in backend. Test samples verified. Implementation next.

---

#### Premium tier — Google Cloud Neural2

**Decision (2026-05-16):** Google Cloud Neural2 for premium users. Replaces earlier OpenAI TTS HD plan.

**Why Google Cloud Neural2 over alternatives:**
- Official, reliable, SLA-backed
- Neural2 quality matches or exceeds Azure for all target languages
- All 6 target languages supported with native neural speakers
- Free tier: 1M WaveNet chars/month (covers ~20 active users before any cost)
- Paid: ~$16/1M chars Neural2 — same price as Azure, far cheaper than OpenAI TTS HD ($30/1M)
- No Azure Portal pain — GCP is significantly easier to navigate
- ElevenLabs rejected: best English quality but weak Greek/Turkish, 11× more expensive

**Unit economics (per user, 3 scripts × 20 pages, with caching):**
- TTS one-time generation: ~48,000 chars → $0.77 (shared across all users of same script)
- TTS every replay: $0 (Supabase cached MP3)
- STT: Web Speech API → $0 (upgrade to paid STT only if accuracy complaints come in)
- Storage: ~26 MB per user → fits in Supabase free tier for first ~38 users
- **Effective cost per premium user: ~$1.50/month (STT = $0, TTS amortised to near $0 via cache)**
- Charge €15/month → ~90% gross margin

**Caching strategy (same for both tiers):**
- Backend endpoint: `POST /tts/generate` — given `(line_id, voice_id)`
- Check `audio_cache` table → if hit, return Supabase Storage URL immediately
- If miss: call TTS API → store MP3 at `tts/{script_id}/{line_id}/{voice_id}.mp3` → write cache row → return URL
- Frontend plays from URL via `<audio>` element (replaces Web Speech API for premium)
- Cache key includes voice_id — different voice = different cache entry
- Do NOT cap rehearsal sessions — unlimited replay is the core value prop

**DB schema addition needed:**
```sql
create table audio_cache (
  id uuid primary key default gen_random_uuid(),
  line_id uuid references lines(id) on delete cascade,
  voice_id text not null,
  storage_path text not null,
  created_at timestamptz default now(),
  unique (line_id, voice_id)
);
```

**P&L at 100 premium users:**
- Revenue: 100 × €15 = ~$1,500/month
- TTS (Google Neural2, high cache hit rate): ~$15/month
- STT: $0
- Storage + egress: $25/month (Supabase Pro)
- Infrastructure: ~$25/month
- **Total cost: ~$65/month → ~96% gross margin**

**Status:** Not yet built. Build after free tier (Edge TTS) is live and tested in app.

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
