# API Endpoints

The complete REST contract for the backend. Frontend types in `tool-frontend/src/types/` must mirror these exactly.

All endpoints except `/health` require `Authorization: Bearer <jwt>`. The JWT comes from Supabase Auth and is verified server-side.

Base URL: `https://audition-assistant-api.onrender.com` in production, `http://localhost:8000` locally.

## `GET /health`

No auth. Returns `200 OK` with `{"status": "ok"}`. Used by Render's health check and uptime monitors.

## `POST /scripts`

Upload a PDF and trigger parsing.

**Request:**
- `Content-Type: multipart/form-data`
- Field `file`: a PDF file. Max 10 MB.

**Behavior:**
1. Verify JWT, extract `user_id`.
2. Check per-user upload quota for the day (e.g., 5/day in MVP). Reject with `429` if exceeded.
3. Validate the file is a PDF (magic bytes, not just MIME type from the client).
4. Generate `script_id` (uuid).
5. **Soft-delete the user's existing script** (set `status='deleted'` or hard-delete — MVP can hard-delete since there's only one). This enforces the "solo, one script" rule.
6. Save PDF to Supabase Storage at `{user_id}/{script_id}.pdf`.
7. Insert row in `scripts` with `status='queued'`.
8. Enqueue background parse task.
9. Return `201 Created` with `{"script_id": "<uuid>", "status": "queued"}`.

**Errors:**
- `400` — invalid PDF, file too big, or text extraction yields under 50 words (likely scanned).
- `401` — missing or invalid JWT.
- `429` — quota exceeded. Body: `{"error": "quota_exceeded", "detail": "5 uploads per day"}`.

## `GET /scripts/current`

Get the user's currently-active script (if any). In MVP this is "the one script you have," matching the solo-only scope.

**Response 200:**
```json
{
  "id": "uuid",
  "title": "The Shape of Things",
  "status": "ready",
  "created_at": "2026-05-13T10:00:00Z",
  "parsed_at": "2026-05-13T10:00:42Z",
  "characters": [
    {"id": "uuid", "name": "ADAM", "line_count": 187, "display_order": 0},
    {"id": "uuid", "name": "EVELYN", "line_count": 175, "display_order": 1},
    {"id": "uuid", "name": "JENNY", "line_count": 22, "display_order": 2},
    {"id": "uuid", "name": "PHILLIP", "line_count": 71, "display_order": 3}
  ],
  "lines": [
    {"id": "uuid", "sequence": 1, "kind": "scene_header", "character_id": null, "text": "SCENE 1 - The museum. Silence. Darkness."},
    {"id": "uuid", "sequence": 2, "kind": "stage_direction", "character_id": null, "text": "A young woman stands near a stretch of velvet rope..."},
    {"id": "uuid", "sequence": 3, "kind": "dialogue", "character_id": "<adam-uuid>", "text": "...you stepped over the line. Miss."},
    ...
  ]
}
```

**Response 404** if the user has no script.

**Behavior notes:**
- Returns the full script in one response. For a 100-page play this might be 200–500 KB JSON. Acceptable for MVP; consider pagination only if it becomes a problem.
- Don't return `lines` if `status != 'ready'`. Return characters as empty array too.

## `GET /scripts/{script_id}/status`

Lightweight status poll used by the frontend while waiting for parsing.

**Response 200:**
```json
{
  "script_id": "uuid",
  "status": "queued | parsing | ready | failed",
  "parse_error": "Optional error message if failed",
  "progress_hint": "Parsing characters... (optional, may be null)"
}
```

**Behavior:** This endpoint is cheap and is expected to be polled every 1–2 seconds during parsing. No DB joins, just a status fetch.

## `DELETE /scripts/{script_id}`

Delete the user's script. Used when the user wants to upload a different one.

**Behavior:**
1. Verify the script belongs to the authenticated user.
2. Delete from Storage.
3. Delete from DB (cascades to `characters` and `lines`).
4. Return `204 No Content`.

**Errors:**
- `404` if the script doesn't exist or belongs to another user (return 404, not 403 — don't leak existence).

## `POST /auth/verify`

Optional convenience endpoint. Verifies the JWT and returns the user's info. Useful for frontend AuthGuard sanity-check.

**Response 200:**
```json
{"user_id": "uuid", "email": "user@example.com"}
```

## What we are NOT building in MVP

These are deliberate omissions. If the frontend or another session asks for them, point at this doc.

- `GET /scripts` (list) — only "current" in solo-only MVP.
- `POST /scripts/{id}/reparse` — re-run parsing. Add when parsing failures are common enough to need user-facing retry.
- `POST /sessions` and session tracking — sessions are client-side only in MVP.
- `POST /feedback` — out of scope.
- WebSocket endpoints — no real-time backend channel needed.

## Error response convention

Every non-2xx response uses this body shape:

```json
{
  "error": "machine_code",
  "detail": "Human-readable explanation"
}
```

Machine codes are short, snake_case, and stable. The frontend uses them for branching; the detail is for users.

## CORS

The backend allows the Vercel frontend origin (`https://audition-assistant.vercel.app`) and `http://localhost:3000` for development. Configured via `ALLOWED_ORIGINS` env var (comma-separated). Credentials are not used (we send Bearer tokens, not cookies).

## Rate limiting (Phase 3)

Per-user upload limit: 5 PDFs per 24h. Per-IP request limit: 60/min on all endpoints. Implementation: in-process counter for MVP, Redis when we add a second backend instance.
