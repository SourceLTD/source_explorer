-- Enables row level security on all current non-extension tables in the
-- exposed `public` schema.
--
-- Intent:
--   * Satisfy Supabase/PostgREST RLS checks for exposed tables.
--   * Block anon/authenticated API access by default unless explicit policies
--     are added later.
--   * Preserve trusted server-side access through privileged Postgres/service
--     credentials used by the Next.js API, Prisma, and local data scripts.
--
-- This does not use FORCE ROW LEVEL SECURITY, so table owners and roles with
-- BYPASSRLS are not newly constrained. It also skips extension-owned tables.
--
-- Safe to run multiple times.

BEGIN;

DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT
      c.oid,
      format('%I.%I', n.nspname, c.relname) AS qualified_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.objid = c.oid
          AND d.deptype = 'e'
      )
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', table_record.qualified_name);
    RAISE NOTICE 'Enabled RLS on %', table_record.qualified_name;
  END LOOP;
END $$;

COMMIT;

-- Verification query:
-- This should return zero rows for application tables after the migration.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND NOT c.relrowsecurity
  AND NOT EXISTS (
    SELECT 1
    FROM pg_depend d
    JOIN pg_extension e ON e.oid = d.refobjid
    WHERE d.objid = c.oid
      AND d.deptype = 'e'
  )
ORDER BY c.relname;
