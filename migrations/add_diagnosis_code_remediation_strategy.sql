-- Add controlled remediation strategy metadata to diagnosis codes.
--
-- `remediation_strategy` is a stable machine key using DB entity language:
-- <operation>_<db_entity>[_field_or_target].
-- `remediation_notes` is optional human guidance for local nuance.
--
-- These fields describe the intended repair category only. They do not execute
-- changes and are not inherited from health_diagnosis_code_groups.

ALTER TABLE health_diagnosis_codes
  ADD COLUMN IF NOT EXISTS remediation_strategy TEXT,
  ADD COLUMN IF NOT EXISTS remediation_notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'health_diagnosis_codes_remediation_strategy_check'
      AND conrelid = 'health_diagnosis_codes'::regclass
  ) THEN
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
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_health_diagnosis_codes_remediation_strategy
  ON health_diagnosis_codes (remediation_strategy);
