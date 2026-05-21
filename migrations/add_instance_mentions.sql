-- ============================================================================
-- Migration: Add instance_mentions + extend source_texts for document provenance
-- ============================================================================
-- Supports tracking exact document locations where instances were found.
--
-- Locators use UTF-16 code unit offsets (matching JavaScript String semantics).
-- Block locators reference (sectionIndex, paragraphIndex, start, end) into
-- the document_index stored on source_texts.
--
-- Run with: psql $DATABASE_URL -f migrations/add_instance_mentions.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Extend source_texts with provenance columns
-- ============================================================================

ALTER TABLE source_texts
  ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'text/plain',
  ADD COLUMN IF NOT EXISTS artifact_uri TEXT,
  ADD COLUMN IF NOT EXISTS document_index JSONB;

COMMENT ON COLUMN source_texts.content_type IS 'MIME type: application/pdf, text/html, text/plain';
COMMENT ON COLUMN source_texts.artifact_uri IS 'S3 path to full NormalizedDocument JSON (article.json)';
COMMENT ON COLUMN source_texts.document_index IS 'Block map with global UTF-16 offsets for locator resolution';

-- ============================================================================
-- 2. Create instance_mentions table
-- ============================================================================

CREATE TABLE IF NOT EXISTS instance_mentions (
  id         BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  instance_id BIGINT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  locator    JSONB NOT NULL,
  mention_text TEXT,
  confidence REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_instance_mentions_locator_type
    CHECK (locator->>'type' IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_instance_mentions_instance
  ON instance_mentions(instance_id);

CREATE INDEX IF NOT EXISTS idx_instance_mentions_locator_type
  ON instance_mentions ((locator->>'type'));

COMMENT ON TABLE instance_mentions IS 'Exact document locations where an instance entity was mentioned';
COMMENT ON COLUMN instance_mentions.locator IS 'Structured locator: {type:"block", sectionIndex, paragraphIndex?, start, end, page?}';
COMMENT ON COLUMN instance_mentions.mention_text IS 'Denormalized text slice for display/audit';

COMMIT;
