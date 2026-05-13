-- ============================================================
-- audition-assistant — initial schema
-- Run once in Supabase SQL Editor (copy-paste the whole file).
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

CREATE TABLE scripts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  status        text        NOT NULL DEFAULT 'queued',
  parse_error   text,
  storage_path  text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  parsed_at     timestamptz,
  CHECK (status IN ('queued', 'parsing', 'ready', 'failed'))
);
CREATE INDEX scripts_user_id_idx ON scripts(user_id);

CREATE TABLE characters (
  id            uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id     uuid  NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  name          text  NOT NULL,
  line_count    int   NOT NULL DEFAULT 0,
  display_order int   NOT NULL DEFAULT 0
);
CREATE INDEX characters_script_id_idx ON characters(script_id);

CREATE TABLE lines (
  id            uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id     uuid  NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  sequence      int   NOT NULL,
  character_id  uuid  REFERENCES characters(id) ON DELETE CASCADE,
  kind          text  NOT NULL,
  text          text  NOT NULL,
  UNIQUE (script_id, sequence),
  CHECK (kind IN ('dialogue', 'stage_direction', 'scene_header'))
);
CREATE INDEX lines_script_id_sequence_idx ON lines(script_id, sequence);

-- ── Row-level security ───────────────────────────────────────

ALTER TABLE scripts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE lines      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users access own scripts"
ON scripts FOR ALL
USING (auth.uid() = user_id);

CREATE POLICY "users access own characters"
ON characters FOR SELECT
USING (script_id IN (SELECT id FROM scripts WHERE user_id = auth.uid()));

CREATE POLICY "users access own lines"
ON lines FOR SELECT
USING (script_id IN (SELECT id FROM scripts WHERE user_id = auth.uid()));

-- ── Storage bucket ───────────────────────────────────────────
-- Creates the private bucket for raw PDF uploads.

INSERT INTO storage.buckets (id, name, public)
VALUES ('user-scripts', 'user-scripts', false);

CREATE POLICY "users access own script files"
ON storage.objects FOR ALL
USING (
  bucket_id = 'user-scripts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
