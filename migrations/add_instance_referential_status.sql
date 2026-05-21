-- ============================================================================
-- Migration: Add referential_status to instances
-- ============================================================================
-- Distinguishes whether an instance represents a specific (token-level),
-- generic (type-level, e.g. "books" in "Ben enjoys reading books"), or
-- hypothetical reference.
--
-- Run with: psql $DATABASE_URL -f migrations/add_instance_referential_status.sql
-- ============================================================================

BEGIN;

-- 1. Create the enum type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referential_status') THEN
    CREATE TYPE referential_status AS ENUM ('specific', 'generic', 'hypothetical');
  END IF;
END
$$;

-- 2. Add the column (all existing instances default to 'specific')
ALTER TABLE instances
  ADD COLUMN IF NOT EXISTS referential_status referential_status NOT NULL DEFAULT 'specific';

COMMENT ON COLUMN instances.referential_status IS
  'Whether this instance is a specific token-level reference, a generic type-level reference, or hypothetical';

COMMIT;
