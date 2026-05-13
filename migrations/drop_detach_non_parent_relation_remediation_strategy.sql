-- Drop `detach_non_parent_relation` from the
-- `health_diagnosis_codes.remediation_strategy` CHECK constraint.
--
-- Why
-- ---
-- The runner-side `detach_non_parent_relation` strategy (plus the
-- umbrella `detach_relation` strategy) was removed once the
-- catalogue stopped routing diagnoses through it. The DB constraint
-- on this catalogue never even listed `attach_relation` or
-- `detach_relation` (those plan kinds were runner-side-only) so the
-- only legacy strategy left to drop is
-- `detach_non_parent_relation`.
--
-- This migration assumes no `health_diagnosis_codes` row currently
-- references `detach_non_parent_relation` (verify before applying:
-- `SELECT count(*) FROM health_diagnosis_codes
--    WHERE remediation_strategy = 'detach_non_parent_relation';`).
-- If any such rows exist, retarget them to `detach_parent_relation`
-- (the supported replacement) or another appropriate strategy
-- before running this migration.
--
-- Idempotent: drops the existing constraint by name and re-adds it
-- with the narrowed allowlist.

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
        'split_pos_alternation',
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
