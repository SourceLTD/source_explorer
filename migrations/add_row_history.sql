-- Adds an append-only row-history layer for committed data changes.
--
-- Design:
--   * entity_row_history: single generic append-only table with JSONB snapshots.
--   * log_entity_row_history(): reusable AFTER row trigger function that
--       - reads actor + changeset context from per-transaction GUCs
--         (app.user_id, app.changeset_id, app.skip_row_history)
--       - strips heavy, non-business columns (embeddings, tsvectors) from
--         stored snapshots
--       - ignores no-op UPDATEs that only touched updated_at
--       - supports simple `id` keys (default) and composite keys via
--         per-trigger arguments
--   * Triggers attached to core mutable domain tables only. Workflow /
--     already-append-only tables (changesets, field_changes, audit_log,
--     issue_events, health_check_*, llm_jobs*) are intentionally skipped.
--
-- This complements the existing application-level review workflow
-- (changesets + field_changes + audit_log). It does not replace it.
--
-- Safe to run multiple times (guarded with IF NOT EXISTS where possible and
-- CREATE OR REPLACE for function/trigger redefinition).

BEGIN;

-- ============================================================================
-- 1. Append-only history table
-- ============================================================================

CREATE TABLE IF NOT EXISTS entity_row_history (
  id            BIGSERIAL   PRIMARY KEY,
  table_name    TEXT        NOT NULL,
  entity_type   entity_type,
  entity_id     BIGINT,
  entity_key    JSONB,
  operation     change_operation NOT NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  changed_by    TEXT,
  changeset_id  BIGINT,
  old_row       JSONB,
  new_row       JSONB
);

COMMENT ON TABLE entity_row_history IS
  'Append-only history of committed row mutations on tracked domain tables. '
  'Populated by database triggers; not a workflow/review log. '
  'Intent: rows should never be UPDATEd or DELETEd; migrations or retention '
  'jobs may prune/partition.';

-- Indexes tuned for "history of one entity", "history of one table", and
-- global time-range scans.
CREATE INDEX IF NOT EXISTS idx_entity_row_history_table_entity_time
  ON entity_row_history (table_name, entity_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_entity_row_history_type_entity_time
  ON entity_row_history (entity_type, entity_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_entity_row_history_changed_at
  ON entity_row_history (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_entity_row_history_changeset
  ON entity_row_history (changeset_id);

CREATE INDEX IF NOT EXISTS idx_entity_row_history_changed_by
  ON entity_row_history (changed_by);

CREATE INDEX IF NOT EXISTS idx_entity_row_history_entity_key
  ON entity_row_history USING GIN (entity_key);

-- ============================================================================
-- 2. Reusable trigger function
-- ============================================================================
--
-- Trigger arguments:
--   TG_ARGV[0] = entity_type value (string), or '' / missing to leave NULL
--   TG_ARGV[1] = key mode: 'id' (default) or 'composite'
--   TG_ARGV[2] = when composite, comma-separated list of column names to copy
--                into entity_key (e.g. 'frame_sense_id,frame_id')
--
-- Session GUCs (set per transaction with SET LOCAL):
--   app.user_id           - text actor id (e.g. clerk user id). Optional.
--   app.changeset_id      - bigint changeset id that originated the mutation.
--                           Optional.
--   app.skip_row_history  - 'on' / 'true' / '1' to suppress writes for
--                           controlled bulk maintenance operations.

CREATE OR REPLACE FUNCTION log_entity_row_history()
RETURNS trigger AS $$
DECLARE
  v_user_id          text;
  v_changeset_id     bigint;
  v_skip             text;
  v_entity_type_raw  text;
  v_entity_type      entity_type;
  v_id_mode          text;
  v_key_list         text;
  v_key_cols         text[];
  v_key              text;
  v_old_row          jsonb;
  v_new_row          jsonb;
  v_old_cmp          jsonb;
  v_new_cmp          jsonb;
  v_entity_id        bigint;
  v_entity_key       jsonb;
  v_op               change_operation;
  v_source           jsonb;
  v_col              text;
  v_strip_cols CONSTANT text[] := ARRAY[
    'embedding',
    'embedding_1536',
    'gloss_tsv',
    'examples_tsv'
  ];
  v_ignore_cols CONSTANT text[] := ARRAY[
    'updated_at',
    -- `version` is incremented by pre-existing `trg_*_version` BEFORE UPDATE
    -- triggers on every UPDATE, so it is not a meaningful "the user changed
    -- something" signal on its own. Strip it from the comparison only; the
    -- bumped value is still preserved in the stored snapshot.
    'version'
  ];
BEGIN
  v_skip := current_setting('app.skip_row_history', true);
  IF v_skip IN ('on', 'true', '1', 'yes') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_user_id := nullif(current_setting('app.user_id', true), '');
  BEGIN
    v_changeset_id := nullif(current_setting('app.changeset_id', true), '')::bigint;
  EXCEPTION WHEN others THEN
    v_changeset_id := NULL;
  END;

  v_entity_type_raw := NULLIF(TG_ARGV[0], '');
  IF v_entity_type_raw IS NOT NULL THEN
    v_entity_type := v_entity_type_raw::entity_type;
  END IF;

  v_id_mode := COALESCE(NULLIF(TG_ARGV[1], ''), 'id');

  -- Build curated JSONB snapshots. Heavy / unsupported columns are removed
  -- both from comparison and from stored payloads.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_row := to_jsonb(OLD);
    FOREACH v_col IN ARRAY v_strip_cols LOOP
      v_old_row := v_old_row - v_col;
    END LOOP;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_row := to_jsonb(NEW);
    FOREACH v_col IN ARRAY v_strip_cols LOOP
      v_new_row := v_new_row - v_col;
    END LOOP;
  END IF;

  -- Skip no-op UPDATEs (only noisy columns like updated_at changed).
  IF TG_OP = 'UPDATE' THEN
    v_old_cmp := v_old_row;
    v_new_cmp := v_new_row;
    FOREACH v_col IN ARRAY v_ignore_cols LOOP
      v_old_cmp := v_old_cmp - v_col;
      v_new_cmp := v_new_cmp - v_col;
    END LOOP;
    IF v_old_cmp IS NOT DISTINCT FROM v_new_cmp THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  IF v_id_mode = 'id' THEN
    v_entity_id := COALESCE(
      (v_new_row ->> 'id')::bigint,
      (v_old_row ->> 'id')::bigint
    );
    v_entity_key := NULL;
  ELSIF v_id_mode = 'composite' THEN
    v_entity_id := NULL;
    v_key_list := COALESCE(TG_ARGV[2], '');
    v_key_cols := string_to_array(v_key_list, ',');
    v_source := COALESCE(v_new_row, v_old_row);
    v_entity_key := '{}'::jsonb;
    FOREACH v_key IN ARRAY v_key_cols LOOP
      v_key := trim(v_key);
      IF v_key <> '' THEN
        v_entity_key := v_entity_key
          || jsonb_build_object(v_key, v_source -> v_key);
      END IF;
    END LOOP;
  ELSE
    RAISE EXCEPTION
      'log_entity_row_history: unknown key mode %, expected ''id'' or ''composite''',
      v_id_mode;
  END IF;

  v_op := CASE TG_OP
    WHEN 'INSERT' THEN 'create'::change_operation
    WHEN 'UPDATE' THEN 'update'::change_operation
    WHEN 'DELETE' THEN 'delete'::change_operation
  END;

  INSERT INTO entity_row_history (
    table_name,
    entity_type,
    entity_id,
    entity_key,
    operation,
    changed_at,
    changed_by,
    changeset_id,
    old_row,
    new_row
  ) VALUES (
    TG_TABLE_NAME,
    v_entity_type,
    v_entity_id,
    v_entity_key,
    v_op,
    clock_timestamp(),
    v_user_id,
    v_changeset_id,
    v_old_row,
    v_new_row
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_entity_row_history() IS
  'AFTER row trigger: writes append-only snapshots to entity_row_history. '
  'Configured per-table via TG_ARGV. Reads actor/changeset context from '
  'app.user_id, app.changeset_id. Honors app.skip_row_history for bulk jobs.';

-- ============================================================================
-- 3. Attach triggers to core mutable domain tables
-- ============================================================================
--
-- Each trigger is dropped and recreated so re-running the migration picks up
-- updated argument lists or function bodies.

-- frames
DROP TRIGGER IF EXISTS frames_row_history ON frames;
CREATE TRIGGER frames_row_history
  AFTER INSERT OR UPDATE OR DELETE ON frames
  FOR EACH ROW
  EXECUTE FUNCTION log_entity_row_history('frame', 'id');

-- frame_roles
DROP TRIGGER IF EXISTS frame_roles_row_history ON frame_roles;
CREATE TRIGGER frame_roles_row_history
  AFTER INSERT OR UPDATE OR DELETE ON frame_roles
  FOR EACH ROW
  EXECUTE FUNCTION log_entity_row_history('frame_role', 'id');

-- role_groups
DROP TRIGGER IF EXISTS role_groups_row_history ON role_groups;
CREATE TRIGGER role_groups_row_history
  AFTER INSERT OR UPDATE OR DELETE ON role_groups
  FOR EACH ROW
  EXECUTE FUNCTION log_entity_row_history('role_group', 'id');

-- role_group_members (has its own bigint id despite composite unique)
DROP TRIGGER IF EXISTS role_group_members_row_history ON role_group_members;
CREATE TRIGGER role_group_members_row_history
  AFTER INSERT OR UPDATE OR DELETE ON role_group_members
  FOR EACH ROW
  EXECUTE FUNCTION log_entity_row_history('role_group_member', 'id');

-- lexical_units
DROP TRIGGER IF EXISTS lexical_units_row_history ON lexical_units;
CREATE TRIGGER lexical_units_row_history
  AFTER INSERT OR UPDATE OR DELETE ON lexical_units
  FOR EACH ROW
  EXECUTE FUNCTION log_entity_row_history('lexical_unit', 'id');

-- lexical_unit_relations
DROP TRIGGER IF EXISTS lexical_unit_relations_row_history ON lexical_unit_relations;
CREATE TRIGGER lexical_unit_relations_row_history
  AFTER INSERT OR UPDATE OR DELETE ON lexical_unit_relations
  FOR EACH ROW
  EXECUTE FUNCTION log_entity_row_history('lexical_unit_relation', 'id');

-- frame_senses
DROP TRIGGER IF EXISTS frame_senses_row_history ON frame_senses;
CREATE TRIGGER frame_senses_row_history
  AFTER INSERT OR UPDATE OR DELETE ON frame_senses
  FOR EACH ROW
  EXECUTE FUNCTION log_entity_row_history('frame_sense', 'id');

-- frame_sense_frames (composite PK: frame_sense_id + frame_id)
DROP TRIGGER IF EXISTS frame_sense_frames_row_history ON frame_sense_frames;
CREATE TRIGGER frame_sense_frames_row_history
  AFTER INSERT OR UPDATE OR DELETE ON frame_sense_frames
  FOR EACH ROW
  EXECUTE FUNCTION log_entity_row_history(
    'frame_sense_frame',
    'composite',
    'frame_sense_id,frame_id'
  );

-- lexical_unit_senses (composite PK: lexical_unit_id + frame_sense_id)
DROP TRIGGER IF EXISTS lexical_unit_senses_row_history ON lexical_unit_senses;
CREATE TRIGGER lexical_unit_senses_row_history
  AFTER INSERT OR UPDATE OR DELETE ON lexical_unit_senses
  FOR EACH ROW
  EXECUTE FUNCTION log_entity_row_history(
    'lexical_unit_sense',
    'composite',
    'lexical_unit_id,frame_sense_id'
  );

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run manually)
-- ============================================================================
-- 1. History table exists
--    SELECT COUNT(*) FROM information_schema.tables
--    WHERE table_name = 'entity_row_history';
--
-- 2. Triggers are attached
--    SELECT event_object_table, trigger_name
--    FROM information_schema.triggers
--    WHERE trigger_name LIKE '%_row_history'
--    ORDER BY event_object_table;
--
-- 3. Simple end-to-end check inside a transaction:
--      BEGIN;
--      SET LOCAL app.user_id = 'verify-user';
--      SET LOCAL app.changeset_id = '0';
--      UPDATE frames SET updated_at = updated_at WHERE id = <some_id>;
--      -- should NOT produce a history row (no-op)
--      UPDATE frames SET label = label || '' WHERE id = <some_id>;
--      -- still no-op (label is identical)
--      UPDATE frames SET definition = COALESCE(definition,'') || ' ' WHERE id = <some_id>;
--      -- should produce exactly one history row
--      SELECT id, operation, changed_by, changeset_id
--      FROM entity_row_history
--      WHERE table_name = 'frames' AND entity_id = <some_id>
--      ORDER BY changed_at DESC LIMIT 3;
--      ROLLBACK;
--
-- 4. Heavy columns are absent:
--      SELECT new_row ? 'embedding', new_row ? 'gloss_tsv'
--      FROM entity_row_history WHERE table_name = 'lexical_units' LIMIT 1;
--      -- both should be false
