-- Add `reparent_frame` to the `health_diagnosis_codes.remediation_strategy`
-- CHECK constraint.
--
-- Why
-- ---
-- The runner-side migration `0046_reclass_inheritance_remediation_strategies.sql`
-- moved 29 hierarchy `I-*` codes off `delete_frame_relation` /
-- `create_frame_relation` and onto `manual_review` because their seeded
-- prose actually describes a compound delete + reparent ("move") that
-- the v1 single-entity DSL cannot represent atomically.
--
-- The v2 `reparent_frame` strategy lowers to a `change_plans` row of
-- kind `move_frame_parent` (DELETE old `parent_of` + CREATE new
-- `parent_of`) and is what the 29 codes will be promoted to in
-- `0048_promote_inheritance_codes_to_reparent_strategy.sql` (runner
-- repo). This migration must run BEFORE that promotion so the CHECK
-- constraint accepts the new value.
--
-- Idempotent: drops the existing constraint by name, then re-adds it
-- with the expanded allowlist. Re-running is a no-op on a database
-- that already has the new constraint.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'health_diagnosis_codes_remediation_strategy_check'
      AND conrelid = 'health_diagnosis_codes'::regclass
  ) THEN
    ALTER TABLE health_diagnosis_codes
      DROP CONSTRAINT health_diagnosis_codes_remediation_strategy_check;
  END IF;

  ALTER TABLE health_diagnosis_codes
    ADD CONSTRAINT health_diagnosis_codes_remediation_strategy_check
    CHECK (
      remediation_strategy IS NULL OR remediation_strategy IN (
        'update_frame_label',
        'update_frame_definition',
        'update_frame_short_definition',
        'update_frame_type',
        'update_frame_subtype',
        'split_frame',
        'merge_frame',
        'delete_frame',
        'create_frame_role',
        'update_frame_role_label',
        'update_frame_role_description',
        'delete_frame_role',
        'create_role_group',
        'update_role_group',
        'create_role_group_member',
        'delete_role_group_member',
        'create_frame_role_mapping',
        'update_frame_role_mapping',
        'delete_frame_role_mapping',
        'create_frame_relation',
        'update_frame_relation_type',
        'delete_frame_relation',
        'reparent_frame',
        'create_frame_sense',
        'update_frame_sense',
        'delete_frame_sense',
        'move_frame_sense',
        'create_lexical_unit',
        'update_lexical_unit',
        'delete_lexical_unit',
        'create_lexical_unit_sense',
        'update_lexical_unit_sense',
        'delete_lexical_unit_sense',
        'move_lexical_unit_sense',
        'create_issue_only',
        'manual_review'
      )
    );
END $$;
