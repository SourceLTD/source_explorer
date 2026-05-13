-- Replace the legacy `regenerate_role_mappings` and
-- `create_frame_role_mapping` strategy values on
-- `health_diagnosis_codes.remediation_strategy` with the merged
-- `upsert_role_mappings` strategy. Pairs with the runner-side
-- merger that collapses both legacy strategies into a single 1..N
-- handler whose per-entry shape supports the three-way XOR
-- (`child_role_label` string | null | `is_absorbed: true`).
--
-- Why
-- ---
-- The legacy `create_frame_role_mapping` strategy emitted one
-- frame_role_mappings INSERT per call (with the is_absorbed XOR);
-- the legacy `regenerate_role_mappings` strategy emitted N (one per
-- parent role) without is_absorbed support. Both have been
-- subsumed by `upsert_role_mappings`, which emits 1..N entries with
-- a per-entry three-way resolution.
--
-- Affected diagnosis codes (every row currently pointing at either
-- legacy strategy is retargeted to `upsert_role_mappings`):
--   - FRAME_INHERITANCE_MISSING_ROLE_MAPPINGS (edge-level; was
--     routed to `regenerate_role_mappings` by runner migration 0054).
--   - DR-049, DR-052 (FRAME_STRUCTURE_LOGICAL_RULES; non-root frame
--     with no inherited mappings; was routed to
--     `create_frame_role_mapping`).
--   - DR-067 family + DR-067-ECM (FRAME_DEF_ROLES_MAPPING_AUDIT;
--     missing parent role mapping; was routed to
--     `create_frame_role_mapping`).
--
-- Pairs with:
--   - source-health-check-runner/migrations/0064_merge_to_upsert_role_mappings_plan_kind.sql
--     (replaces `regenerate_role_mappings` with
--      `upsert_role_mappings` on `change_plans.plan_kind`).
--   - source-health-check-runner/src/remediation/strategies/upsert-role-mappings.ts
--   - source-health-check-runner/prompts/remediation/upsert_role_mappings/
--
-- Idempotent-ish: DROP constraint (if present), UPDATE rows, ADD
-- constraint. Safe to re-run: second pass UPDATE touches 0 rows;
-- DROP + ADD still succeed.

BEGIN;

-- 1. Drop the CHECK constraint first so row-level UPDATE to the new
--    strategy value cannot violate the old allowlist (which never
--    listed `upsert_role_mappings`).
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
END $$;

-- 2. Retarget every historical diagnosis code that referenced either
--    legacy strategy.
UPDATE health_diagnosis_codes
   SET remediation_strategy = 'upsert_role_mappings'
 WHERE remediation_strategy IN (
         'create_frame_role_mapping',
         'regenerate_role_mappings'
       );

-- 3. Re-add the CHECK constraint (merged strategy only; legacy values
--    dropped from the allowlist).
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
      'update_frame_role_mapping',
      'delete_frame_role_mapping',
      'upsert_role_mappings',
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

COMMIT;
