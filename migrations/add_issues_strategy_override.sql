-- Add `issues.strategy_override TEXT NULL` so reviewers (and the
-- create-issues sweep) can route an individual issue through a
-- different remediation strategy than the one its diagnosis code
-- defaults to. Reads short-circuit through the planner's
-- `COALESCE(i.strategy_override, dc.remediation_strategy)`; NULL keeps
-- the diagnosis-code default.
--
-- Why
-- ---
-- Phase 3 of the cascading-remediations rebuild needs a way to turn
-- one diagnosis code into different strategies depending on entity-
-- specific context. Concretely: a `detach_parent_relation` code on a
-- frame with exactly one parent must auto-promote to `reparent_frame`
-- (deleting the only parent_of edge orphans the child). The sweep
-- inspects the parent count at issue-creation time, sets
-- `strategy_override = 'reparent_frame'`, and the planner then
-- transparently routes the same issue to a different strategy
-- handler.
--
-- The CHECK constraint mirrors `health_diagnosis_codes_remediation_strategy_check`
-- so an override can only resolve to a strategy the planner knows
-- how to dispatch. Keeping it as a separate constraint name lets us
-- evolve the two allowlists independently if needed.
--
-- Idempotent: drops the column / constraint if they already exist
-- before re-adding. Re-running on an already-migrated DB is a no-op.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'issues'
      AND column_name = 'strategy_override'
  ) THEN
    ALTER TABLE issues ADD COLUMN strategy_override TEXT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'issues_strategy_override_check'
      AND conrelid = 'issues'::regclass
  ) THEN
    ALTER TABLE issues DROP CONSTRAINT issues_strategy_override_check;
  END IF;

  ALTER TABLE issues
    ADD CONSTRAINT issues_strategy_override_check
    CHECK (
      strategy_override IS NULL OR strategy_override IN (
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

COMMENT ON COLUMN issues.strategy_override IS
  'Per-issue override of the diagnosis code default remediation_strategy. NULL means "use the diagnosis code default". The planner reads COALESCE(strategy_override, remediation_strategy).';
