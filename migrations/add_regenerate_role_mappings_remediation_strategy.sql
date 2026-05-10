-- Add `regenerate_role_mappings` to the
-- `health_diagnosis_codes.remediation_strategy` CHECK constraint.
--
-- Why
-- ---
-- Phase 2 of the cascading-remediations rebuild introduces a new
-- LLM-batch strategy that takes a (parent, child) edge whose
-- inheritance role mappings have been wiped out (or were never
-- created), runs the existing B6 prompt to map parent roles onto
-- child roles, and writes one `frame_role_mappings` INSERT plan.
--
-- The new check `FRAME_INHERITANCE_MISSING_ROLE_MAPPINGS` (in the
-- runner repo, migration 0054) emits findings against this
-- strategy.
--
-- This migration must run BEFORE the runner migration 0054 promotes
-- the new diagnosis code to `regenerate_role_mappings`.
--
-- Idempotent: drops the existing constraint by name, then re-adds
-- it with the expanded allowlist. Re-running is a no-op on a
-- database that already has the new constraint.

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
        'regenerate_role_mappings',
        'create_frame_relation',
        'update_frame_relation_type',
        'delete_frame_relation',
        'reparent_frame',
        'create_frame_sense',
        'update_frame_sense',
        'delete_frame_sense',
        'move_frame_sense',
        'merge_sense',
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
