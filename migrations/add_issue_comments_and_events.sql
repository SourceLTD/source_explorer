-- Adds GitHub-style timeline infrastructure to issues:
--   * issue_comments: user comments on issues
--   * issue_events:   activity events (status changes, changeset links, etc.)
--   * issue_event_type enum
--
-- Safe to run multiple times (guarded with IF NOT EXISTS where possible).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'issue_event_type') THEN
    CREATE TYPE issue_event_type AS ENUM (
      'opened',
      'closed',
      'reopened',
      'status_changed',
      'priority_changed',
      'title_changed',
      'description_changed',
      'labels_changed',
      'assignee_changed',
      'changeset_linked',
      'changeset_unlinked',
      'changeset_committed',
      'changeset_discarded'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS issue_comments (
  id          BIGSERIAL PRIMARY KEY,
  issue_id    BIGINT      NOT NULL,
  author      TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited      BOOLEAN     NOT NULL DEFAULT FALSE,
  deleted     BOOLEAN     NOT NULL DEFAULT FALSE,
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT fk_issue_comments_issue
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_issue_comments_issue      ON issue_comments (issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_comments_created_at ON issue_comments (created_at);

CREATE TABLE IF NOT EXISTS issue_events (
  id          BIGSERIAL PRIMARY KEY,
  issue_id    BIGINT           NOT NULL,
  actor       TEXT             NOT NULL,
  event_type  issue_event_type NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_issue_events_issue
    FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_issue_events_issue      ON issue_events (issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_events_created_at ON issue_events (created_at);
CREATE INDEX IF NOT EXISTS idx_issue_events_type       ON issue_events (event_type);
