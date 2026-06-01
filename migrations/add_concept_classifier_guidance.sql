-- Add a `classifier_guidance` column on concepts so we can keep classifier-
-- facing rubrics separate from conventional definitions.
--
-- L1 Event hubs (direct children of the Event archetype root) currently store
-- long "Use this bucket for events..." style guidance in `definition`. We
-- copy that text into the new column for those hubs only. `definition` is
-- left unchanged so behavior does not change.

ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS classifier_guidance text;

WITH event_root AS (
  SELECT id
  FROM concepts
  WHERE archetype = 'Event'
    AND label = 'Event'
    AND subtype IS NULL
    AND deleted = false
    AND NOT EXISTS (
      SELECT 1 FROM concept_relations cr
      WHERE cr.child_id = concepts.id AND cr.type = 'parent_of'
    )
),
event_l1 AS (
  SELECT c.id
  FROM concepts c
  JOIN concept_relations cr
    ON cr.child_id = c.id AND cr.type = 'parent_of'
  WHERE cr.parent_id = (SELECT id FROM event_root)
    AND c.deleted = false
)
UPDATE concepts
SET classifier_guidance = definition
WHERE id IN (SELECT id FROM event_l1)
  AND definition IS NOT NULL
  AND classifier_guidance IS NULL;
