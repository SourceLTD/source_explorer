-- Add `detach_non_parent_relation` and `detach_parent_relation` to
-- the `health_diagnosis_codes.remediation_strategy` CHECK constraint.
--
-- Why
-- ---
-- Phase 3 of the cascading-remediations rebuild splits the runner-
-- side `detach_relation` strategy into two variants so the planner
-- can dispatch differently based on whether the targeted edge is a
-- `parent_of` row (cascading consequences for inheritance role
-- mappings) or any other relation type (no cascading consequences).
--
-- This migration only widens the constraint; no diagnosis codes are
-- promoted to either new strategy here. The `delete_frame_relation`
-- v1 strategy continues to handle today's catalogue. New checks /
-- catalogue updates can opt into the v2 detach strategies as they
-- land.
--
-- The constraint also already lists `regenerate_role_mappings`,
-- `merge_sense`, `reparent_frame`, etc. (see prior migrations).
--
-- Idempotent: drops the existing constraint by name and re-adds it
-- with the expanded allowlist.

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
        'detach_non_parent_relation',
        'detach_parent_relation',
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
