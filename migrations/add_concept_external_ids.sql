-- ============================================================================
-- Migration: concept_external_ids for medical vocabulary crosswalks
-- ============================================================================
-- Links Source TBox concepts to external ontology IDs (UMLS, SNOMED, etc.)
-- populated from source-medical curated mappings.
--
-- Run with: psql $DATABASE_URL -f migrations/add_concept_external_ids.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS concept_external_ids (
  id          BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  concept_id  BIGINT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  vocabulary  TEXT NOT NULL,
  external_id TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_concept_external_ids_vocab_id UNIQUE (vocabulary, external_id)
);

CREATE INDEX IF NOT EXISTS idx_concept_external_ids_concept
  ON concept_external_ids(concept_id);

CREATE INDEX IF NOT EXISTS idx_concept_external_ids_vocab
  ON concept_external_ids(vocabulary);

COMMENT ON TABLE concept_external_ids IS 'External vocabulary IDs (UMLS, SNOMED, source-medical, etc.) linked to TBox concepts';
COMMENT ON COLUMN concept_external_ids.vocabulary IS 'e.g. umls_cui, snomed, mondo, source_medical';
COMMENT ON COLUMN concept_external_ids.external_id IS 'ID within that vocabulary';

COMMIT;
