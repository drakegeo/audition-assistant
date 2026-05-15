# Audition Assistant — Claude Code Instructions

> **You are working on `audition-assistant`, an at-home audition rehearsal tool.** This folder is your operating manual. Read it before doing anything.

## What this app does

A user uploads a play or screenplay PDF. The app parses it into structured data (characters, lines, stage directions). The user picks the character they want to play. The browser then reads the OTHER characters' lines aloud with distinct voices, pauses on the user's lines, listens via the microphone, and advances when the user is done — like having a scene partner who never gets tired.

The product reference is [ScenePartner](https://scenepartner.ai). We are not copying it; we are competing with it. Differentiation comes later. For now, focus on building a clean MVP.

## Read this folder in this order

1. **This file** — orientation
2. **`ROADMAP.md`** — what we're building right now vs. later
3. **`ARCHITECTURE.md`** — how the system fits together
4. **`DECISIONS.md`** — locked-in choices and their rationale
5. **`specs/`** — concrete contracts (data model, API, parsing prompt, voice loop state machine)
6. **`conventions/`** — how we write code in this repo
7. **`roles/`** — adopt the role matching the task before starting work
8. **`progress/CHANGELOG.md`** — what's been built; append to it when you finish work

## Current status

**Phase: 3 — Polish.** App live on Render + Vercel. Next: verify full flow on production URLs, then polish (cue mode picker, voice quality, quota, analytics).

## Hard rules

These rules apply to every session. Violating them means the work is wrong.

1. **MVP scope is locked.** Solo user, one script at a time, clean text PDFs only. Do not build a script library, share-links, multiplayer, OCR, or offline mode. If the user asks for one of these, point them to `ROADMAP.md` and add a `TODO(post-mvp)` comment — do not implement.
2. **No Qdrant. No vector store.** Scripts are structured data in Postgres, not embeddings. RAG is not part of this product.
3. **The voice loop runs in the browser.** No audio bytes are sent to the backend. The backend never sees a microphone stream.
4. **The LLM is called once per script, during ingestion.** Not on every query, not during the rehearsal session. Parse → cache structured JSON in Postgres → done.
5. **Every protected endpoint verifies the Supabase JWT.** No exceptions except `/health`.
6. **PDFs never persist on local disk.** Render's filesystem is ephemeral. Use Supabase Storage.
7. **Before writing code, update the relevant spec doc if your approach diverges from it.** Specs are the source of truth; code follows.
8. **After finishing a meaningful chunk of work, append to `progress/CHANGELOG.md` and (if a decision was made) `DECISIONS.md`.**

## How to start a session

```
1. Read .claude/README.md (this file)
2. Read .claude/progress/CHANGELOG.md — see where the last session left off
3. Read the role file matching today's task (roles/backend-engineer.md, etc.)
4. Read the spec files relevant to the task
5. Do the work
6. Append to CHANGELOG.md
```

## Tech stack at a glance

- **Backend:** FastAPI on Render, Python 3.11+
- **Frontend:** Next.js (App Router) + TypeScript on Vercel
- **Auth + DB + Storage:** Supabase
- **LLM:** Claude Haiku 4.5 server-side (provider-agnostic interface)
- **Voice:** Web Speech API in the browser (TTS + STT, no backend involvement)
- **PDF parsing:** `pypdf` for text extraction

Full details in `ARCHITECTURE.md`.
