-- Standardize `frame_senses.pos` onto the existing `part_of_speech` enum.
--
-- Why
-- ---
-- Until now `frame_senses.pos` was `text NOT NULL` with no constraint,
-- and the data drifted into a hybrid convention:
--   n  : 84,949 rows   (WordNet short form)
--   v  : 15,222 rows   (WordNet short form)
--   adj: 21,120 rows   (three-letter abbrev, NOT WordNet's `a`)
--   adv:  8,673 rows   (three-letter abbrev, NOT WordNet's `r`)
-- Meanwhile `lexical_units.pos` is already the Postgres enum
-- `part_of_speech` (`verb | noun | adjective | adverb`), and the
-- runner's `create_frame_sense` prompt + `ALLOWED_POS` validator + the
-- `FRAME_SENSE_STRUCTURE_LOGICAL_RULES.config.pos_required_by_frame_type`
-- config use a third vocabulary (`v|n|a|r|p|d|c`).
--
-- This three-way mismatch produces real bugs today:
--   - 57 open FS-001-S findings flagged "missing required POS sense
--     coverage: a, s" against State frames that already have an `adj`
--     sense, because the check config expects `['a','s','n']` but the
--     data uses `adj`.
--   - The `create_frame_sense` strategy, the moment it commits, will
--     start writing single-letter `a`/`r` rows into `frame_senses.pos`,
--     introducing a fifth/sixth value the rest of the system does not
--     recognise (FS-002 same-POS-collision dedup would then miss
--     `a` ↔ `adj` collisions, etc.).
--
-- Strategy: rewrite the four existing values to their long forms in
-- one transaction, fail loudly if any other value snuck in, then
-- convert the column type to `part_of_speech`. The runner's
-- ALLOWED_POS, the FS-001 config, the `create_frame_sense` prompt, and
-- the Prisma schema are updated in companion changes so all four
-- surfaces agree on the same four-value vocabulary.
--
-- The `frame_senses_row_history` trigger is muted only for the bulk
-- rewrite so we get one audit entry per row (the type change itself)
-- instead of two (rewrite + cast). The ALTER COLUMN ... TYPE is a
-- USING-cast over text whose values now exactly match every
-- `part_of_speech` enum label, so the cast is data-preserving and the
-- trigger fires once per row with old_row/new_row carrying the
-- canonical long forms.

BEGIN;

ALTER TABLE frame_senses DISABLE TRIGGER frame_senses_row_history;

UPDATE frame_senses SET pos = 'noun'      WHERE pos = 'n';
UPDATE frame_senses SET pos = 'verb'      WHERE pos = 'v';
UPDATE frame_senses SET pos = 'adjective' WHERE pos = 'adj';
UPDATE frame_senses SET pos = 'adverb'    WHERE pos = 'adv';

DO $$
DECLARE
  bad TEXT;
BEGIN
  SELECT pos INTO bad
    FROM frame_senses
    WHERE pos NOT IN ('verb', 'noun', 'adjective', 'adverb')
    LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'standardize_frame_senses_pos: unexpected frame_senses.pos value: %', bad;
  END IF;
END
$$;

ALTER TABLE frame_senses
  ALTER COLUMN pos TYPE part_of_speech
  USING pos::part_of_speech;

ALTER TABLE frame_senses ENABLE TRIGGER frame_senses_row_history;

COMMIT;

-- Rollback (manual, if needed):
--   BEGIN;
--   ALTER TABLE frame_senses DISABLE TRIGGER frame_senses_row_history;
--   ALTER TABLE frame_senses
--     ALTER COLUMN pos TYPE text USING pos::text;
--   UPDATE frame_senses SET pos = 'n'   WHERE pos = 'noun';
--   UPDATE frame_senses SET pos = 'v'   WHERE pos = 'verb';
--   UPDATE frame_senses SET pos = 'adj' WHERE pos = 'adjective';
--   UPDATE frame_senses SET pos = 'adv' WHERE pos = 'adverb';
--   ALTER TABLE frame_senses ENABLE TRIGGER frame_senses_row_history;
--   COMMIT;
