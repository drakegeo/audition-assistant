# Architecture

## High-level flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User's Browser                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │   Next.js    │───▶│  Web Speech  │    │   Microphone +       │   │
│  │  (Vercel)    │    │  API (TTS)   │    │   Speakers           │   │
│  └──────┬───────┘    └──────────────┘    └──────────────────────┘   │
└─────────┼───────────────────────────────────────────────────────────┘
          │ HTTPS + Bearer JWT
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       FastAPI Backend (Render)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │
│  │ /scripts │  │ /scripts │  │ /health  │  │   Background     │    │
│  │  POST    │  │  GET     │  │          │  │   parse worker   │    │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └─────────┬────────┘    │
└───────┼─────────────┼──────────────────────────────────┼────────────┘
        │             │                                  │
        ▼             ▼                                  ▼
   ┌────────────┐  ┌─────────────┐              ┌──────────────┐
   │  Supabase  │  │  Supabase   │              │   Anthropic  │
   │  Storage   │  │  Postgres   │              │   API        │
   │ (raw PDFs) │  │ (parsed     │              │ (Haiku 4.5)  │
   │            │  │  scripts)   │              │              │
   └────────────┘  └─────────────┘              └──────────────┘
```

## Key architectural choices

### The browser does the heavy real-time work

The rehearsal loop — TTS playback, microphone capture, STT, cue detection, line advancement — runs entirely in the browser. The backend is uninvolved during a session.

**Why:** Web Speech API is free, has no latency to a server, and removes a huge class of streaming/scaling problems. The trade-off is voice quality and browser compatibility (see `specs/voice-loop.md`).

**Consequence:** The backend can be a simple stateless FastAPI service. No WebSockets needed in MVP. No audio handling. No streaming.

### The LLM is called exactly once per script

When a script is uploaded, a background task extracts the text, calls Claude Haiku 4.5 with a structured-output prompt, validates the JSON, and writes it to Postgres. After that, the script is just rows in a database — the LLM is never called again for that script.

**Why:** Bounds cost, makes the user-facing app deterministic and fast, and means we can swap the LLM provider later without affecting the runtime experience.

### Backend is provider-agnostic for the LLM

A thin `LLMClient` interface (see `specs/script-parsing.md`) lets us swap between Claude, OpenAI, Groq, etc. with a config change. The default is Claude Haiku 4.5 because it's cheap, fast, and excellent at structured extraction.

### Auth and storage are Supabase, code is FastAPI

Supabase handles auth (email/password, JWT issuance), file storage (raw PDFs), and the database (parsed scripts). FastAPI verifies the JWT on every request and reads/writes Supabase via the service-role key (server-side only).

## Repo layout

```
audition-assistant/
├── .claude/                     ← This folder. Source of truth for how to build.
├── backend/                     ← FastAPI app, deployed to Render
│   ├── src/
│   │   ├── api/
│   │   │   ├── main.py          ← FastAPI entrypoint, route registration, CORS
│   │   │   ├── scripts.py       ← Script upload + retrieval endpoints
│   │   │   └── health.py        ← /health
│   │   ├── auth/
│   │   │   └── supabase_auth.py ← JWT verification dependency
│   │   ├── ingestion/
│   │   │   ├── pdf_extractor.py ← PDF → plain text (pypdf)
│   │   │   ├── parser.py        ← Plain text → structured JSON via LLM
│   │   │   └── worker.py        ← Background task orchestration
│   │   ├── llm/
│   │   │   ├── client.py        ← LLMClient interface
│   │   │   └── anthropic.py     ← Claude implementation
│   │   ├── storage/
│   │   │   ├── pdf_storage.py   ← Supabase Storage wrapper
│   │   │   └── db.py            ← Supabase Postgres wrapper
│   │   └── models/
│   │       └── schemas.py       ← Pydantic request/response models
│   ├── tests/
│   ├── pyproject.toml
│   ├── render.yaml
│   ├── start.sh
│   └── .env.example
├── tool-frontend/               ← Next.js app, deployed to Vercel
│   ├── src/
│   │   ├── app/
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   ├── upload/page.tsx
│   │   │   └── rehearse/[scriptId]/page.tsx
│   │   ├── components/
│   │   │   ├── AuthGuard.tsx
│   │   │   ├── UploadPanel.tsx
│   │   │   ├── CharacterPicker.tsx
│   │   │   └── RehearsalView.tsx
│   │   ├── lib/
│   │   │   ├── supabase.ts
│   │   │   ├── api.ts            ← Backend API calls
│   │   │   └── voice/
│   │   │       ├── tts.ts        ← Web Speech TTS wrapper
│   │   │       ├── stt.ts        ← Web Speech STT wrapper
│   │   │       ├── cue.ts        ← Cue detection (pause/match/hybrid)
│   │   │       └── session.ts    ← Rehearsal state machine
│   │   └── types/
│   │       └── script.ts         ← Shared types matching backend schemas
│   ├── package.json
│   └── .env.local.example
└── website/                     ← Empty for now, marketing site later
    └── .gitkeep
```

## Data flow walkthrough — script upload

1. User picks a PDF in `tool-frontend/upload`.
2. Frontend POSTs to `backend/scripts` with the PDF bytes and Bearer JWT.
3. Backend verifies JWT, saves the PDF to Supabase Storage at `user-scripts/{user_id}/{script_id}.pdf`, creates a row in `scripts` with `status='queued'`, returns `script_id`.
4. A background task (FastAPI `BackgroundTasks` in MVP; can move to a real queue later) picks up the work: downloads PDF from Storage, extracts text via pypdf, calls the LLM with the parsing prompt, validates the JSON response against the script schema, and writes characters + lines rows to the DB. Updates `status` to `ready` or `failed`.
5. Frontend polls `GET /scripts/{id}/status`. When `ready`, fetches `GET /scripts/{id}` for the parsed result and proceeds to character selection.

## Data flow walkthrough — rehearsal session

1. User selects their character on the frontend.
2. Frontend fetches the full parsed script (already cached from step 5 above).
3. Frontend assigns a browser voice to each non-user character (deterministic hash of character name → voice index, see `specs/voice-loop.md`).
4. Frontend enters the rehearsal state machine:
   - If current line belongs to a non-user character → TTS speak it, await `onend`, advance.
   - If current line belongs to the user → start STT, await cue (pause/match/hybrid depending on session setting), advance.
5. Loop until end of script.
6. **No backend involvement.** The script is in memory in the browser tab.

## Environment variables

### Backend (Render)

```
SUPABASE_URL                  ← from Supabase project settings
SUPABASE_SERVICE_ROLE_KEY     ← server-side only, never expose
ANTHROPIC_API_KEY             ← server-side LLM access
ALLOWED_ORIGINS               ← comma-separated, e.g. https://audition-assistant.vercel.app
LOG_LEVEL                     ← INFO by default
```

### Frontend (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   ← anon key only, not service role
NEXT_PUBLIC_API_BASE_URL        ← Render backend URL
```

## What we explicitly do NOT have

- **No vector store / Qdrant.** Not relevant for structured script data.
- **No WebSockets.** No real-time backend-to-frontend channel needed in MVP.
- **No Redis / Celery.** FastAPI `BackgroundTasks` is enough for one parsing job at a time.
- **No CDN for audio.** All audio is generated in-browser.
- **No payment processor.** Free product in MVP.
