-- Nullable domain tag on TBox concepts (e.g. biomed for MeSH imports).
--
-- Run with: psql $DATABASE_URL -f migrations/add_concept_domain.sql
-- Backfill (optional, may take several minutes on large MeSH cohorts):
--   psql $DATABASE_URL -f migrations/backfill_concept_domain_biomed.sql

BEGIN;

DO $$
BEGIN
  CREATE TYPE concept_domain_enum AS ENUM ('biomed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS domain concept_domain_enum;

COMMENT ON COLUMN concepts.domain IS 'Optional domain scope (e.g. biomed for MeSH-imported concepts)';

COMMIT;
