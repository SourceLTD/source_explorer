-- Add precomputed descendant_count to frames table.
-- This column stores the total number of frames reachable below this frame
-- in the parent_of DAG. It is refreshed via the function below after any
-- bulk operation that modifies frame_relations.

-- (a) Add the column
ALTER TABLE frames ADD COLUMN IF NOT EXISTS descendant_count INTEGER NOT NULL DEFAULT 0;

-- (b) Create a refresh function (uses UNION for DAG-safe dedup / cycle termination)
CREATE OR REPLACE FUNCTION refresh_frame_descendant_counts() RETURNS void AS $$
BEGIN
  WITH RECURSIVE subtree(root_id, frame_id) AS (
    SELECT id AS root_id, id AS frame_id
    FROM frames WHERE deleted = false
    UNION
    SELECT s.root_id, fr.target_id
    FROM frame_relations fr
    JOIN subtree s ON fr.source_id = s.frame_id
    WHERE fr.type = 'parent_of'
  )
  UPDATE frames f
  SET descendant_count = subq.cnt
  FROM (
    SELECT root_id, COUNT(DISTINCT frame_id) - 1 AS cnt
    FROM subtree
    GROUP BY root_id
  ) subq
  WHERE f.id = subq.root_id;
END;
$$ LANGUAGE plpgsql;

-- (c) Initial population
SELECT refresh_frame_descendant_counts();
