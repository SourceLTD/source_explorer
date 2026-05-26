-- Backfill domain = biomed for concepts linked to MeSH external IDs.
-- Safe to re-run; only updates rows where domain IS NULL.
--
-- Run with: psql $DATABASE_URL -f migrations/backfill_concept_domain_biomed.sql

SET statement_timeout = 0;

UPDATE concepts c
SET domain = 'biomed'::concept_domain_enum
FROM concept_external_ids cei
WHERE cei.concept_id = c.id
  AND cei.vocabulary = 'mesh'
  AND c.domain IS NULL;
