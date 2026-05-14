# audition-assistant

An at-home audition rehearsal tool. Upload a script PDF, pick your character, and rehearse with a voice partner.

**Status:** Phase 2 — backend ingestion complete (21 tests passing). Building frontend: auth, upload UI, character picker, voice loop.

## For humans

- Product roadmap: [`.claude/ROADMAP.md`](.claude/ROADMAP.md)
- System overview: [`.claude/ARCHITECTURE.md`](.claude/ARCHITECTURE.md)
- Why we made each choice: [`.claude/DECISIONS.md`](.claude/DECISIONS.md)
- What's been built: [`.claude/progress/CHANGELOG.md`](.claude/progress/CHANGELOG.md)

## For Claude Code

Start by reading [`.claude/README.md`](.claude/README.md). It explains how to operate in this repo.

## Local dev

```
# Backend (terminal 1)
make install-backend
cp backend/.env.example backend/.env   # fill in your Supabase + Anthropic keys
make dev-backend                        # http://localhost:8000/health

# Frontend (terminal 2)
make install-frontend
cp tool-frontend/.env.local.example tool-frontend/.env.local
make dev-frontend                       # http://localhost:3000
```

## Repo layout

```
backend/         FastAPI on Render
tool-frontend/   Next.js on Vercel
website/         Marketing site, empty for now
.claude/         How to build this — read first
```
