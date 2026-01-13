-- Migration: Add ai_revisions table for inline AI revision suggestions
-- Run this on your Supabase/PostgreSQL database

-- Create the ai_revision_status enum
DO $$ BEGIN
    CREATE TYPE ai_revision_status AS ENUM ('pending', 'accepted', 'rejected', 'partial');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create the ai_revisions table
CREATE TABLE IF NOT EXISTS ai_revisions (
    id BIGSERIAL PRIMARY KEY,
    changeset_id BIGINT NOT NULL REFERENCES changesets(id) ON DELETE CASCADE,
    comment_id BIGINT UNIQUE REFERENCES change_comments(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL,
    modifications JSONB,
    justification TEXT,
    confidence NUMERIC(3,2),
    status ai_revision_status NOT NULL DEFAULT 'pending',
    accepted_fields JSONB DEFAULT '[]'::jsonb,
    rejected_fields JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_revisions_changeset ON ai_revisions(changeset_id);
CREATE INDEX IF NOT EXISTS idx_ai_revisions_status ON ai_revisions(status);

-- Add comment explaining the table
COMMENT ON TABLE ai_revisions IS 'Stores AI-suggested revisions to changesets, linked to comments in the chat interface';
COMMENT ON COLUMN ai_revisions.action IS 'The AI recommended action: approve, reject, modify, or keep_as_is';
COMMENT ON COLUMN ai_revisions.modifications IS 'Array of {field, old_value, new_value} objects for proposed changes';
COMMENT ON COLUMN ai_revisions.status IS 'Current status: pending (awaiting user decision), accepted, rejected, or partial (some fields accepted)';
COMMENT ON COLUMN ai_revisions.accepted_fields IS 'Array of field names the user accepted';
COMMENT ON COLUMN ai_revisions.rejected_fields IS 'Array of field names the user rejected';
