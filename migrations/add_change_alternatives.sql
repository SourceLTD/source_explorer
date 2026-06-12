-- Universal alternatives system: a logical "change" owns N coexisting
-- candidate changesets ("alternatives").
--
-- Before this migration, revising a change discarded/superseded the parent
-- (a strictly linear chain; one live changeset per entity at a time). The
-- alternatives model lets both UI revision (source-explorer) and automated
-- remediation (this runner) append coexisting candidate changesets to one
-- logical change group. A reviewer selects one alternative and commits it;
-- the non-selected siblings are discarded at commit time.
--
-- Idempotent. Mirror in `source-explorer/prisma/schema.prisma` after deploy.

-- 1. The grouping table. `selected_changeset_id` FK is added after the table
--    exists so we can reference changesets cleanly.
CREATE TABLE IF NOT EXISTS change_alternatives (
  id                    BIGSERIAL PRIMARY KEY,
  -- Entity this change targets. NULL for plan-scoped groups.
  entity_type           entity_type,
  entity_id             BIGINT,
  -- Set for plan-scoped alternative groups (alternatives are whole plans).
  change_plan_id        BIGINT,
  -- Health check finding that triggered this change (when remediation-sourced).
  finding_id            BIGINT,
  status                changeset_status NOT NULL DEFAULT 'pending',
  -- The alternative the reviewer has selected as the winner (NULL until chosen).
  selected_changeset_id BIGINT,
  created_by            TEXT             NOT NULL,
  created_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_alternatives_entity
  ON change_alternatives (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_change_alternatives_status
  ON change_alternatives (status);
CREATE INDEX IF NOT EXISTS idx_change_alternatives_plan
  ON change_alternatives (change_plan_id)
  WHERE change_plan_id IS NOT NULL;

-- 2. New columns on changesets.
ALTER TABLE changesets
  ADD COLUMN IF NOT EXISTS alternative_group_id BIGINT;

ALTER TABLE changesets
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_changesets_alternative_group'
      AND table_name = 'changesets'
  ) THEN
    ALTER TABLE changesets
      ADD CONSTRAINT fk_changesets_alternative_group
        FOREIGN KEY (alternative_group_id)
        REFERENCES change_alternatives(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_changesets_alternative_group
  ON changesets (alternative_group_id)
  WHERE alternative_group_id IS NOT NULL;

-- 3. Selected-changeset FK on change_alternatives -> changesets.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_change_alternatives_selected'
      AND table_name = 'change_alternatives'
  ) THEN
    ALTER TABLE change_alternatives
      ADD CONSTRAINT fk_change_alternatives_selected
        FOREIGN KEY (selected_changeset_id)
        REFERENCES changesets(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 4. Backfill: collapse existing revision chains into one alternative group
--    each, then wrap any remaining ungrouped pending changeset into its own
--    singleton group.
--
--    A revision chain is a set of changesets connected via
--    revision_parent_id / superseded_by_id. We pick the chain root (the
--    changeset whose revision_parent_id IS NULL) as the group anchor, create
--    one group per root that has children, and assign the whole chain to it.
--    The live (non-discarded) tail becomes the selected alternative.

DO $$
DECLARE
  root RECORD;
  new_group_id BIGINT;
  selected_id BIGINT;
BEGIN
  -- One group per revision-chain root that actually has a chain
  -- (i.e. a root that has at least one child via revision_parent_id).
  FOR root IN
    SELECT DISTINCT r.id, r.entity_type, r.entity_id, r.finding_id,
                    r.change_plan_id, r.created_by
    FROM changesets r
    WHERE r.revision_parent_id IS NULL
      AND r.alternative_group_id IS NULL
      AND EXISTS (
        SELECT 1 FROM changesets c WHERE c.revision_parent_id = r.id
      )
  LOOP
    INSERT INTO change_alternatives
      (entity_type, entity_id, change_plan_id, finding_id, status, created_by)
    VALUES
      (root.entity_type, root.entity_id, root.change_plan_id, root.finding_id,
       'pending'::changeset_status, root.created_by)
    RETURNING id INTO new_group_id;

    -- Walk the whole chain from this root and attach every member. We use a
    -- recursive CTE over the revision_parent_id edge.
    WITH RECURSIVE chain AS (
      SELECT id FROM changesets WHERE id = root.id
      UNION ALL
      SELECT c.id FROM changesets c
      JOIN chain ch ON c.revision_parent_id = ch.id
    )
    UPDATE changesets
      SET alternative_group_id = new_group_id,
          origin = CASE WHEN created_by = 'system' THEN 'remediation' ELSE 'revision' END
      WHERE id IN (SELECT id FROM chain);

    -- The live tail (a non-discarded member) becomes the selected alternative.
    SELECT id INTO selected_id
      FROM changesets
      WHERE alternative_group_id = new_group_id
        AND status <> 'discarded'::changeset_status
      ORDER BY revision_number DESC, id DESC
      LIMIT 1;

    IF selected_id IS NOT NULL THEN
      UPDATE change_alternatives
        SET selected_changeset_id = selected_id
        WHERE id = new_group_id;
    END IF;
  END LOOP;

  -- Wrap any remaining pending changeset that is not yet in a group into a
  -- singleton group (selected = itself). Skip plan-member changesets; those
  -- get plan-scoped groups below.
  FOR root IN
    SELECT id, entity_type, entity_id, finding_id, change_plan_id, created_by
    FROM changesets
    WHERE alternative_group_id IS NULL
      AND status = 'pending'::changeset_status
      AND change_plan_id IS NULL
  LOOP
    INSERT INTO change_alternatives
      (entity_type, entity_id, change_plan_id, finding_id, status,
       selected_changeset_id, created_by)
    VALUES
      (root.entity_type, root.entity_id, NULL, root.finding_id,
       'pending'::changeset_status, root.id, root.created_by)
    RETURNING id INTO new_group_id;

    UPDATE changesets
      SET alternative_group_id = new_group_id,
          origin = CASE WHEN created_by = 'system' THEN 'remediation' ELSE 'manual' END
      WHERE id = root.id;
  END LOOP;

  -- Plan-scoped groups: one alternative group per pending change_plan, with
  -- all of the plan's pending changesets attached and the plan auto-selected
  -- (single alternative = the plan itself).
  FOR root IN
    SELECT cp.id AS plan_id, cp.finding_id, cp.created_by
    FROM change_plans cp
    WHERE cp.status = 'pending'::change_plan_status
      AND EXISTS (
        SELECT 1 FROM changesets c
        WHERE c.change_plan_id = cp.id
          AND c.alternative_group_id IS NULL
      )
  LOOP
    INSERT INTO change_alternatives
      (entity_type, entity_id, change_plan_id, finding_id, status, created_by)
    VALUES
      (NULL, NULL, root.plan_id, root.finding_id,
       'pending'::changeset_status, root.created_by)
    RETURNING id INTO new_group_id;

    UPDATE changesets
      SET alternative_group_id = new_group_id,
          origin = CASE WHEN created_by = 'system' THEN 'remediation' ELSE 'manual' END
      WHERE change_plan_id = root.plan_id
        AND alternative_group_id IS NULL;
  END LOOP;
END$$;

-- Bump the schema version singleton so the runner's boot guard knows the
-- alternatives tables are in place.
INSERT INTO health_remediation_schema_version (id, version)
VALUES (1, 3)
ON CONFLICT (id) DO UPDATE
  SET version = GREATEST(health_remediation_schema_version.version, EXCLUDED.version),
      applied_at = NOW();
