-- Plan-level alternatives: let N whole change_plans coexist as alternatives
-- of one logical change (same finding + entity), so a reviewer can compare
-- alternative plans and select one to commit (sibling plans + their
-- changesets are discarded at commit time).
--
-- Companion to source-health-check-runner/migrations/0081_plan_alternatives.sql.
-- Mirrored in prisma/schema.prisma. Idempotent.

-- 1. New column on change_plans: which alternative group this plan belongs to.
ALTER TABLE change_plans
  ADD COLUMN IF NOT EXISTS alternative_group_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_change_plans_alternative_group'
      AND table_name = 'change_plans'
  ) THEN
    ALTER TABLE change_plans
      ADD CONSTRAINT fk_change_plans_alternative_group
        FOREIGN KEY (alternative_group_id)
        REFERENCES change_alternatives(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_change_plans_alternative_group
  ON change_plans (alternative_group_id)
  WHERE alternative_group_id IS NOT NULL;

-- 2. New column on change_alternatives: the selected winning plan.
ALTER TABLE change_alternatives
  ADD COLUMN IF NOT EXISTS selected_plan_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_change_alternatives_selected_plan'
      AND table_name = 'change_alternatives'
  ) THEN
    ALTER TABLE change_alternatives
      ADD CONSTRAINT fk_change_alternatives_selected_plan
        FOREIGN KEY (selected_plan_id)
        REFERENCES change_plans(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_change_alternatives_selected_plan
  ON change_alternatives (selected_plan_id)
  WHERE selected_plan_id IS NOT NULL;

-- 3. Backfill: mirror existing single-plan groups into the new relationship.
UPDATE change_plans cp
  SET alternative_group_id = ca.id
  FROM change_alternatives ca
  WHERE ca.change_plan_id = cp.id
    AND cp.alternative_group_id IS NULL;

UPDATE change_alternatives ca
  SET selected_plan_id = ca.change_plan_id
  WHERE ca.change_plan_id IS NOT NULL
    AND ca.selected_plan_id IS NULL;
