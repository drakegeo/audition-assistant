# Decisions Log

Append-only record of architectural and product choices. **When you make a non-trivial decision, add an entry here.** Format: ADR-NNN, date (YYYY-MM-DD), context, decision, consequences.

---

## ADR-001 — Browser-native Web Speech API for TTS and STT
**Date:** 2026-05-13
**Status:** Accepted

**Context:** The rehearsal experience needs the app to speak non-user lines and listen to user lines. Options ranged from cloud TTS/STT (ElevenLabs, OpenAI, Deepgram) to browser-native (Web Speech API) to hybrid.

**Decision:** Use the Web Speech API in the browser for both TTS and STT in the MVP. No audio bytes ever reach the backend.

**Consequences:**
- ✅ Free at any usage volume. No per-minute costs.
- ✅ No streaming infrastructure on the backend. Backend stays stateless and simple.
- ✅ Lowest possible latency (no network hop for voice).
- ❌ Voice quality is OS/browser-dependent. We'll likely upgrade to ElevenLabs post-MVP.
- ❌ Firefox does not support STT (`SpeechRecognition`). Show a browser-compat warning.
- ❌ STT accuracy with theatrical delivery (whispers, shouts, accents) is mediocre. The "strict match" cue mode needs forgiving fuzzy matching.

---

## ADR-002 — Both cue-detection modes, user-toggleable, plus hybrid
**Date:** 2026-05-13
**Status:** Accepted

**Context:** When does the app know the user finished their line? Pause-based ("they stopped talking for 1.5s") vs. text-match-based ("the words they said match the scripted line") have different failure modes.

**Decision:** Implement three modes in the session state machine: `pause`, `match`, `hybrid`. Hybrid advances on whichever happens first. Default to `hybrid`.

**Consequences:**
- ✅ Costs nothing extra to add hybrid alongside the two requested modes.
- ✅ User can fall back to `pause` for memorized work (where they may improvise wording) or `match` for line-perfect drilling.
- ❌ Adds a small UI surface (mode picker per session).

---

## ADR-003 — Server-side LLM with one provider, called once per script
**Date:** 2026-05-13
**Status:** Accepted

**Context:** Script parsing needs an LLM. Options: user-supplied API keys (multi-provider) vs. server-side single provider.

**Decision:** Backend holds one Anthropic API key, defaults to Claude Haiku 4.5. LLM is called exactly once per script during ingestion; result is cached in Postgres. Code uses an `LLMClient` interface so the provider can be swapped without rewriting call sites.

**Consequences:**
- ✅ Massively simpler UX (no API-key entry screen).
- ✅ Cost is bounded and predictable: ~$0.01–0.05 per script with Haiku.
- ✅ Provider-agnostic interface protects against vendor lock-in.
- ❌ Anthropic outage = no new uploads parse. (Existing scripts still rehearsable.)
- ❌ We carry the LLM cost. Need a per-user upload quota to prevent abuse (Phase 3).

---

## ADR-004 — Render + Vercel + Supabase hosting
**Date:** 2026-05-13
**Status:** Accepted

**Context:** Hosting stack. Alternatives considered: all-Supabase (Edge Functions), Fly.io/Railway for the backend.

**Decision:** Keep the original Render (backend) + Vercel (frontend) + Supabase (auth/DB/storage) stack.

**Consequences:**
- ✅ Free tiers across the board for MVP.
- ✅ Render's cold-start (~30–60s after 15min idle) doesn't hurt rehearsal sessions because the session runs in-browser. Only the first upload after idle is slow.
- ✅ Each piece is the boring, well-supported choice for its job.
- ❌ Three vendors to manage. If any one becomes a bottleneck (likely Render first), we can migrate that piece independently.

---

## ADR-005 — Solo-only MVP scope
**Date:** 2026-05-13
**Status:** Accepted

**Context:** How many scripts per user, sharing, multiplayer — where to draw the MVP line?

**Decision:** Solo only. One user, one script at a time. Uploading a new script replaces the previous one. No library, no share-link, no multiplayer.

**Consequences:**
- ✅ Smallest possible MVP. Faster to ship.
- ❌ Less compelling retention — user uploads a script, rehearses it, has no reason to return until next audition.
- ✅ Migration path is clean: adding "library" is a single table change (drop the unique constraint on `user_id` in `scripts`). Schema is designed for this.
- 🔁 **Likely to change.** Once core works, library is the first post-MVP feature.

---

## ADR-006 — Clean text PDFs only, no OCR
**Date:** 2026-05-13
**Status:** Accepted

**Context:** Audition sides come in many formats: clean PDFs, scanned PDFs, screenshots, plain text emails, .docx files.

**Decision:** Accept only PDFs from which `pypdf` can extract real text. Detect scanned PDFs by checking word count after extraction; reject with a clear error.

**Consequences:**
- ✅ No OCR dependency (Tesseract is heavy; cloud OCR adds cost and a vendor).
- ✅ Most professional audition sides arrive as clean PDFs anyway.
- ❌ Users with scanned sides have to find another source or retype. Acceptable for MVP.
- 🔁 Paste-text endpoint is a 10-line addition we can ship in Phase 3 if user feedback demands it.

---

## ADR-007 — Project name "audition-assistant"
**Date:** 2026-05-13
**Status:** Accepted (updated 2026-05-13 from provisional codename "offbook")

**Context:** Need a name for the repo, package names, and internal references. Public product name TBD.

**Decision:** Project name `audition-assistant`. All folder names, package names, and internal identifiers use this. Public product name is a marketing decision deferred to launch.

**Consequences:**
- ✅ Descriptive, clearly communicates the product's purpose.
- 🔁 Rebrand-able later — code is name-agnostic if we keep config-driven naming.

---

## Template for new entries

```markdown
## ADR-NNN — Short title
**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Superseded by ADR-MMM

**Context:** What problem were we deciding on? What options were considered?

**Decision:** What did we pick?

**Consequences:** What does this make easier? Harder? What did we trade off?
```
