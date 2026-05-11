-- Add `split_pos_alternation` to the
-- `health_diagnosis_codes.remediation_strategy` CHECK constraint.
--
-- Why
-- ---
-- Phase 7 of the cascading-remediations rebuild introduces a
-- constrained variant of `split_frame` that enforces an
-- alternation-grouping invariant on the LLM's per-result
-- `sense_ids` partition. Each new frame in a `split_pos_alternation`
-- plan must contain only senses sharing one
-- `(causative, inchoative, perspectival)` triple — exactly the
-- shape required to resolve a B8 `DISTINCT_ERROR` verdict.
--
-- This migration only widens the constraint; the runner-side
-- migration `0053_promote_pos_alternation_codes.sql` separately
-- promotes a small set of catalogue codes (FS-040 / FS-041 / FS-064
-- families) to the new strategy.
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
