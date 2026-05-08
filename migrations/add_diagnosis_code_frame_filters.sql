-- Adds optional frame-targeting filters to health_diagnosis_codes so that
-- a diagnosis code can be scoped to specific frame types and/or subtypes.
--
-- Matching semantics (computed by the worker / any future filter helper):
--
--   frame_type  matches when:
--     cardinality(applies_to_frame_types) = 0          (no constraint)
--     OR f.frame_type = ANY(applies_to_frame_types)    (allowlisted)
--
--   subtype     matches when:
--     (cardinality(applies_to_frame_subtypes) = 0
--      AND NOT match_null_subtype)                     (no constraint, default)
--     OR f.subtype = ANY(applies_to_frame_subtypes)    (allowlisted value)
--     OR (match_null_subtype AND f.subtype IS NULL)    (explicit NULL match)
--
-- Examples:
--   * applies_to_frame_types=[], applies_to_frame_subtypes=[], match_null_subtype=false
--       -> matches all frames                                            (default)
--   * applies_to_frame_types=['State'], rest empty/false
--       -> matches all 'State' frames regardless of subtype
--   * applies_to_frame_subtypes=['relation'], match_null_subtype=false
--       -> matches only frames whose subtype = 'relation'
--   * applies_to_frame_subtypes=['relation'], match_null_subtype=true
--       -> matches frames whose subtype = 'relation' OR is NULL
--   * applies_to_frame_subtypes=[], match_null_subtype=true
--       -> matches only frames whose subtype IS NULL

ALTER TABLE health_diagnosis_codes
  ADD COLUMN IF NOT EXISTS applies_to_frame_types    TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS applies_to_frame_subtypes TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS match_null_subtype        BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_health_diagnosis_codes_frame_types
  ON health_diagnosis_codes USING GIN (applies_to_frame_types);

CREATE INDEX IF NOT EXISTS idx_health_diagnosis_codes_frame_subtypes
  ON health_diagnosis_codes USING GIN (applies_to_frame_subtypes);
