-- Decouple frame label from frame code.
--
-- Before this migration, labels and codes were identical (both UPPER_SNAKE_CASE)
-- because the trigger blindly set code = label.
--
-- After this migration:
--   label — human-readable, sentence case:  "Cosmic scale"
--   code  — stable machine identifier:       "COSMIC_SCALE"
--
-- Changes:
--   1. Update frames_set_code() to derive code as UPPER_SNAKE_CASE from label
--      (uppercase + replace whitespace runs with underscores).
--   2. Backfill all existing frames: replace underscores with spaces in label,
--      then sentence-case it.  The trigger fires during the UPDATE and derives
--      the correct UPPER_SNAKE_CASE code automatically.
--
-- Safe to re-run: the trigger replacement is idempotent; the label UPDATE is a
-- no-op for any row already in sentence-case form.

BEGIN;

-- Extend the statement timeout for this session to accommodate the bulk UPDATE.
SET LOCAL statement_timeout = '300s';

-- 1. Update the trigger function ------------------------------------------

CREATE OR REPLACE FUNCTION public.frames_set_code()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.label IS DISTINCT FROM COALESCE(OLD.label, NEW.label)
  THEN
    -- Derive code: uppercase + collapse whitespace runs to underscores.
    NEW.code := UPPER(REGEXP_REPLACE(TRIM(NEW.label), '\s+', '_', 'g'));
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Backfill existing frame labels to sentence case ----------------------
--
-- Transformation: replace underscores with spaces, then capitalise only the
-- first character and lowercase the rest.
--
-- Examples:
--   COSMIC_SCALE  →  label "Cosmic scale",  code "COSMIC_SCALE"
--   AARDVARK      →  label "Aardvark",       code "AARDVARK"
--   A_LA_CARTE    →  label "A la carte",     code "A_LA_CARTE"
--   .22_CALIBER   →  label ".22 caliber",    code ".22_CALIBER"
--
-- Disable noisy per-row triggers for the duration of this bulk UPDATE:
--   frames_row_history        — would write 90k history rows for a cosmetic rename
--   embed_frames_on_update    — would queue 90k re-embedding jobs
--   clear_frame_embedding_on_update — companion to the above
-- trg_frames_set_code is intentionally left enabled so it derives code from
-- the new sentence-case label automatically.

ALTER TABLE frames DISABLE TRIGGER frames_row_history;
ALTER TABLE frames DISABLE TRIGGER embed_frames_on_update;
ALTER TABLE frames DISABLE TRIGGER clear_frame_embedding_on_update;

UPDATE frames
SET label = (
  UPPER(SUBSTRING(REPLACE(label, '_', ' '), 1, 1))
  || LOWER(SUBSTRING(REPLACE(label, '_', ' '), 2))
)
WHERE label IS DISTINCT FROM (
  UPPER(SUBSTRING(REPLACE(label, '_', ' '), 1, 1))
  || LOWER(SUBSTRING(REPLACE(label, '_', ' '), 2))
);

ALTER TABLE frames ENABLE TRIGGER frames_row_history;
ALTER TABLE frames ENABLE TRIGGER embed_frames_on_update;
ALTER TABLE frames ENABLE TRIGGER clear_frame_embedding_on_update;

COMMIT;
