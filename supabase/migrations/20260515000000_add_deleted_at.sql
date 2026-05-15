-- Soft-delete support + free plan quota tracking.
-- Run in Supabase SQL Editor.
--
-- Why: hard-deleting scripts made it impossible to count lifetime uploads
-- for quota enforcement. Soft-delete preserves the row for counting while
-- hiding it from normal queries.

ALTER TABLE scripts ADD COLUMN deleted_at timestamptz;
