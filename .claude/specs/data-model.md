# Data Model

The source of truth for the Postgres schema in Supabase. Update this file **before** running a migration. The schema is small on purpose.

## Tables

### `scripts`

One row per uploaded script. In MVP, the unique constraint on `user_id` enforces "one script at a time" — uploading a new script for an existing user should be a soft-delete + insert, not a violation.

| Column          | Type        | Notes                                                              |
|-----------------|-------------|--------------------------------------------------------------------|
| `id`            | uuid        | PK, default `gen_random_uuid()`                                    |
| `user_id`       | uuid        | FK to `auth.users(id)`, `ON DELETE CASCADE`                        |
| `title`         | text        | Filename without extension, or extracted from PDF metadata          |
| `status`        | text        | `queued` \| `parsing` \| `ready` \| `failed`                       |
| `parse_error`   | text        | Nullable. Filled when `status='failed'`.                           |
| `storage_path`  | text        | Path in Supabase Storage: `{user_id}/{script_id}.pdf`              |
| `created_at`    | timestamptz | default `now()`                                                    |
| `parsed_at`     | timestamptz | Nullable. Set when status moves to `ready`.                        |

**Indexes:** `(user_id)` for the "get my current script" query.

**RLS policy:** A user can SELECT, INSERT, UPDATE, DELETE their own rows only.

```sql
CREATE POLICY "users access own scripts"
ON scripts FOR ALL
USING (auth.uid() = user_id);
```

### `characters`

One row per character per script. Populated by the parse worker.

| Column        | Type   | Notes                                                          |
|---------------|--------|----------------------------------------------------------------|
| `id`          | uuid   | PK                                                             |
| `script_id`   | uuid   | FK to `scripts(id)`, `ON DELETE CASCADE`                       |
| `name`        | text   | Canonical name as it appears in the script (e.g., "ADAM")     |
| `line_count`  | int    | Denormalized count of lines this character has                 |
| `display_order` | int  | Order to display in the picker (most lines first, ties alphabetical) |

**Indexes:** `(script_id)`.

**RLS:** A user can SELECT characters of their own scripts only. (Achieved by joining on `scripts.user_id`.)

```sql
CREATE POLICY "users access own characters"
ON characters FOR SELECT
USING (
  script_id IN (SELECT id FROM scripts WHERE user_id = auth.uid())
);
```

### `lines`

One row per spoken line OR stage direction in the script, in playback order.

| Column         | Type   | Notes                                                                    |
|----------------|--------|--------------------------------------------------------------------------|
| `id`           | uuid   | PK                                                                       |
| `script_id`    | uuid   | FK to `scripts(id)`, `ON DELETE CASCADE`                                 |
| `sequence`     | int    | Playback order. Unique per `(script_id, sequence)`.                      |
| `character_id` | uuid   | FK to `characters(id)`. NULL for stage directions or scene headers.      |
| `kind`         | text   | `dialogue` \| `stage_direction` \| `scene_header`                        |
| `text`         | text   | The line content. Cleaned: no leading "CHARACTER:" prefix.               |

**Indexes:** `(script_id, sequence)` — primary access pattern is "give me all lines in order."

**RLS:** Same as `characters` — access via the parent script.

## Why this shape

- **Lines are denormalized into a single table** rather than split per character. The primary read pattern is "give me everything in order," which a single table serves natively.
- **Stage directions and scene headers are first-class rows** with `character_id IS NULL`. The rehearsal UI can choose to display them, skip them, or speak them in a narrator voice — that's a frontend concern.
- **`sequence` is an explicit integer** rather than relying on insertion order. Makes ordering deterministic and supports future edits (insert a line at position 12.5 → renumber later).
- **`status` lives on `scripts`** rather than a separate jobs table. There's only ever one parse job per script, and the script's lifecycle and the job's lifecycle are the same.

## Migration history

Track every schema change here. The next change appends a new entry.

The runnable SQL lives in `supabase/migrations/`. Paste the whole file into
the Supabase SQL Editor (Dashboard → SQL Editor → New query).

### 2026-05-13 — initial schema

File: `supabase/migrations/20260513000000_initial_schema.sql`

```sql
-- Run in Supabase SQL editor as part of Phase 0 scaffolding

CREATE TABLE scripts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  status        text NOT NULL DEFAULT 'queued',
  parse_error   text,
  storage_path  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  parsed_at     timestamptz,
  CHECK (status IN ('queued', 'parsing', 'ready', 'failed'))
);
CREATE INDEX scripts_user_id_idx ON scripts(user_id);

CREATE TABLE characters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id       uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  name            text NOT NULL,
  line_count      int NOT NULL DEFAULT 0,
  display_order   int NOT NULL DEFAULT 0
);
CREATE INDEX characters_script_id_idx ON characters(script_id);

CREATE TABLE lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id     uuid NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  sequence      int NOT NULL,
  character_id  uuid REFERENCES characters(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  text          text NOT NULL,
  UNIQUE (script_id, sequence),
  CHECK (kind IN ('dialogue', 'stage_direction', 'scene_header'))
);
CREATE INDEX lines_script_id_sequence_idx ON lines(script_id, sequence);

ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users access own scripts"
ON scripts FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users access own characters"
ON characters FOR SELECT
USING (script_id IN (SELECT id FROM scripts WHERE user_id = auth.uid()));

CREATE POLICY "users access own lines"
ON lines FOR SELECT
USING (script_id IN (SELECT id FROM scripts WHERE user_id = auth.uid()));
```

## Storage bucket

Bucket name: `user-scripts`. Private (not public). RLS policy:

```sql
CREATE POLICY "users access own script files"
ON storage.objects FOR ALL
USING (
  bucket_id = 'user-scripts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

Paths follow the pattern `{user_id}/{script_id}.pdf`.

## TODO(post-mvp): sound cues as a 4th line kind

Scripts often contain audio events ("Phone rings", "Thunder", "Music swells") that are
not physical stage directions and not character dialogue. Currently they land in the DB
as `stage_direction`, which is semantically imprecise.

When ready to support them (e.g., for audio playback or distinct UI treatment):

1. **Migration** — drop and re-add the CHECK constraint on `lines.kind`:
   ```sql
   ALTER TABLE lines DROP CONSTRAINT lines_kind_check;
   ALTER TABLE lines ADD CONSTRAINT lines_kind_check
     CHECK (kind IN ('dialogue', 'stage_direction', 'scene_header', 'sound_cue'));
   ```

2. **Parsing prompt** — add to `specs/script-parsing.md` rule 2:
   - `"sound_cue"` — an audio event like "Phone rings", "Thunder", "Music swells".
     `character` is null. Distinct from `stage_direction`, which describes physical action.

3. **Frontend** — filter `kind === 'sound_cue'` to trigger playback or render differently.

No new tables. No changes to `characters` or `scripts`. The `lines` table already holds
everything; this is purely a semantic reclassification inside the existing shape.

---

## Notes for the post-MVP library feature

When we go from "one script per user" to "library":
1. Add an `is_active` boolean to `scripts` (or simply drop any unique constraints — we never added one, so this is already fine).
2. Frontend changes from "show the user's script" to "show the list of scripts."
3. No schema migration is needed because we designed for it. This is intentional.
