-- Adds health check infrastructure for LLM-driven data audits:
--   * health_check_definitions: configured rule/check types
--   * health_diagnosis_codes: stable diagnosis/error code catalog
--   * health_check_runs: worker batch execution history
--   * health_check_results: append-only per-entity check attempts
--   * health_check_state: current coverage/freshness per check target
--   * health_check_findings: normalized diagnosis findings from results
--
-- Safe to run multiple times (guarded with IF NOT EXISTS where possible).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_type') THEN
    ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'frame_role_mapping';
    ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'role_group';
    ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'role_group_member';
    ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'frame_sense_frame';
    ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'lexical_unit_sense';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_check_run_status') THEN
    CREATE TYPE health_check_run_status AS ENUM (
      'queued',
      'running',
      'completed',
      'failed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_check_result_status') THEN
    CREATE TYPE health_check_result_status AS ENUM (
      'passed',
      'warning',
      'failed',
      'error',
      'skipped'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_finding_status') THEN
    CREATE TYPE health_finding_status AS ENUM (
      'open',
      'resolved',
      'ignored',
      'false_positive'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS health_check_definitions (
  id            BIGSERIAL PRIMARY KEY,
  code          TEXT          NOT NULL UNIQUE,
  label         TEXT          NOT NULL,
  description   TEXT,
  target_types  entity_type[] NOT NULL DEFAULT ARRAY[]::entity_type[],
  rule_version  INTEGER       NOT NULL DEFAULT 1,
  enabled       BOOLEAN       NOT NULL DEFAULT TRUE,
  config        JSONB,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_check_definitions_enabled
  ON health_check_definitions (enabled);

CREATE TABLE IF NOT EXISTS health_diagnosis_codes (
  id                   BIGSERIAL PRIMARY KEY,
  check_definition_id  BIGINT,
  code                 TEXT           NOT NULL UNIQUE,
  label                TEXT           NOT NULL,
  description          TEXT,
  examples             TEXT[]         NOT NULL DEFAULT ARRAY[]::TEXT[],
  severity             issue_priority NOT NULL DEFAULT 'medium',
  category             TEXT,
  enabled              BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_health_diagnosis_codes_check
    FOREIGN KEY (check_definition_id) REFERENCES health_check_definitions(id)
    ON DELETE SET NULL ON UPDATE NO ACTION
);

ALTER TABLE health_diagnosis_codes
  ADD COLUMN IF NOT EXISTS examples TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_health_diagnosis_codes_check
  ON health_diagnosis_codes (check_definition_id);
CREATE INDEX IF NOT EXISTS idx_health_diagnosis_codes_severity
  ON health_diagnosis_codes (severity);

CREATE TABLE IF NOT EXISTS health_check_runs (
  id                   BIGSERIAL PRIMARY KEY,
  check_definition_id  BIGINT,
  label                TEXT,
  status               health_check_run_status NOT NULL DEFAULT 'queued',
  scope                JSONB,
  config               JSONB,
  worker_id            TEXT,
  model                TEXT,
  llm_job_id           BIGINT,
  total_items          INTEGER NOT NULL DEFAULT 0,
  processed_items      INTEGER NOT NULL DEFAULT 0,
  passed_items         INTEGER NOT NULL DEFAULT 0,
  warning_items        INTEGER NOT NULL DEFAULT 0,
  failed_items         INTEGER NOT NULL DEFAULT 0,
  error_items          INTEGER NOT NULL DEFAULT 0,
  input_tokens         INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,
  cost_microunits      BIGINT,
  error                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_health_check_runs_check
    FOREIGN KEY (check_definition_id) REFERENCES health_check_definitions(id)
    ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_health_check_runs_check
  ON health_check_runs (check_definition_id);
CREATE INDEX IF NOT EXISTS idx_health_check_runs_status
  ON health_check_runs (status);
CREATE INDEX IF NOT EXISTS idx_health_check_runs_created_at
  ON health_check_runs (created_at);

CREATE TABLE IF NOT EXISTS health_check_results (
  id                  BIGSERIAL PRIMARY KEY,
  run_id              BIGINT                     NOT NULL,
  check_definition_id BIGINT                     NOT NULL,
  entity_type         entity_type                NOT NULL,
  entity_id           BIGINT                     NOT NULL,
  entity_key          JSONB,
  status              health_check_result_status NOT NULL,
  summary             TEXT,
  reasoning           TEXT,
  confidence          NUMERIC(3, 2),
  target_version      INTEGER,
  target_fingerprint  TEXT,
  request_payload     JSONB,
  response_payload    JSONB,
  metadata            JSONB,
  error               TEXT,
  checked_at          TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_health_check_results_run
    FOREIGN KEY (run_id) REFERENCES health_check_runs(id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_health_check_results_check
    FOREIGN KEY (check_definition_id) REFERENCES health_check_definitions(id)
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_health_check_results_run
  ON health_check_results (run_id);
CREATE INDEX IF NOT EXISTS idx_health_check_results_check
  ON health_check_results (check_definition_id);
CREATE INDEX IF NOT EXISTS idx_health_check_results_entity
  ON health_check_results (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_health_check_results_status
  ON health_check_results (status);
CREATE INDEX IF NOT EXISTS idx_health_check_results_checked_at
  ON health_check_results (checked_at);

CREATE TABLE IF NOT EXISTS health_check_state (
  id                  BIGSERIAL PRIMARY KEY,
  check_definition_id BIGINT NOT NULL,
  entity_type         entity_type NOT NULL,
  entity_id           BIGINT NOT NULL,
  entity_key_hash     TEXT NOT NULL DEFAULT '',
  entity_key          JSONB,
  last_result_id      BIGINT,
  last_status         health_check_result_status,
  last_checked_at     TIMESTAMPTZ,
  target_version      INTEGER,
  target_fingerprint  TEXT,
  open_findings_count INTEGER NOT NULL DEFAULT 0,
  stale               BOOLEAN NOT NULL DEFAULT FALSE,
  next_check_at       TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_health_check_state_check
    FOREIGN KEY (check_definition_id) REFERENCES health_check_definitions(id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT uq_health_check_state_target
    UNIQUE (check_definition_id, entity_type, entity_id, entity_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_health_check_state_entity
  ON health_check_state (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_health_check_state_status
  ON health_check_state (last_status);
CREATE INDEX IF NOT EXISTS idx_health_check_state_stale
  ON health_check_state (stale);
CREATE INDEX IF NOT EXISTS idx_health_check_state_next_check
  ON health_check_state (next_check_at);

CREATE TABLE IF NOT EXISTS health_check_findings (
  id                 BIGSERIAL PRIMARY KEY,
  result_id          BIGINT                NOT NULL,
  diagnosis_code_id  BIGINT                NOT NULL,
  status             health_finding_status NOT NULL DEFAULT 'open',
  severity           issue_priority        NOT NULL DEFAULT 'medium',
  title              TEXT                  NOT NULL,
  message            TEXT,
  evidence           JSONB,
  suggested_fix      JSONB,
  issue_id           BIGINT,
  changeset_id       BIGINT,
  first_seen_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ,
  CONSTRAINT fk_health_check_findings_result
    FOREIGN KEY (result_id) REFERENCES health_check_results(id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT fk_health_check_findings_code
    FOREIGN KEY (diagnosis_code_id) REFERENCES health_diagnosis_codes(id)
    ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT fk_health_check_findings_issue
    FOREIGN KEY (issue_id) REFERENCES issues(id)
    ON DELETE SET NULL ON UPDATE NO ACTION,
  CONSTRAINT fk_health_check_findings_changeset
    FOREIGN KEY (changeset_id) REFERENCES changesets(id)
    ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS idx_health_check_findings_result
  ON health_check_findings (result_id);
CREATE INDEX IF NOT EXISTS idx_health_check_findings_code
  ON health_check_findings (diagnosis_code_id);
CREATE INDEX IF NOT EXISTS idx_health_check_findings_status
  ON health_check_findings (status);
CREATE INDEX IF NOT EXISTS idx_health_check_findings_issue
  ON health_check_findings (issue_id);
CREATE INDEX IF NOT EXISTS idx_health_check_findings_changeset
  ON health_check_findings (changeset_id);

ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS diagnosis_code_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_issues_diagnosis_code'
  ) THEN
    ALTER TABLE issues
      ADD CONSTRAINT fk_issues_diagnosis_code
      FOREIGN KEY (diagnosis_code_id)
      REFERENCES health_diagnosis_codes(id)
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_issues_diagnosis_code
  ON issues (diagnosis_code_id);
