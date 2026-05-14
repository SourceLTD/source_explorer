-- Migration: Add revision chain columns to changesets
--
-- Enables a linked-list of revisions where each changeset can point to its
-- parent revision and be superseded by a newer version. The user's natural
-- language prompt is stored so revision history can be replayed.

ALTER TABLE changesets
  ADD COLUMN IF NOT EXISTS revision_parent_id BIGINT REFERENCES changesets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_number INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revision_prompt TEXT,
  ADD COLUMN IF NOT EXISTS superseded_by_id BIGINT REFERENCES changesets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_changesets_revision_parent
  ON changesets(revision_parent_id) WHERE revision_parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_changesets_superseded_by
  ON changesets(superseded_by_id) WHERE superseded_by_id IS NOT NULL;

COMMENT ON COLUMN changesets.revision_parent_id IS 'Points to the changeset this revision was derived from';
COMMENT ON COLUMN changesets.revision_number IS 'Monotonically increasing revision number within a chain (1 = original)';
COMMENT ON COLUMN changesets.revision_prompt IS 'The user''s natural language feedback that triggered this revision';
COMMENT ON COLUMN changesets.superseded_by_id IS 'Points to the next revision that supersedes this changeset';
