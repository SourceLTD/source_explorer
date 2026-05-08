-- Hardens objects reported by Supabase's database security advisor.
--
-- Covers:
--   * Function Search Path Mutable warnings for app-owned public/util routines.
--   * Public execution of SECURITY DEFINER RPC functions.
--   * Direct API access to the lemma_lookup materialized view.
--   * An overly broad authenticated write policy on lexical_unit_types.
--   * pg_jsonschema being installed in the exposed public schema.
--
-- This keeps trusted server-side usage working by preserving service_role
-- execution on the semantic-search RPC used by the Next.js API route.
--
-- Safe to run multiple times.

BEGIN;

-- Needed so unqualified extension types like `vector` in function signatures
-- resolve while this migration alters existing routines.
SET LOCAL search_path = public, util, extensions, pg_catalog;

-- Set stable search paths on app-owned functions/procedures in exposed schemas.
-- Extension-owned routines are skipped because their lifecycle is managed by
-- the extension.
DO $$
DECLARE
  routine_record record;
  routine_signature text;
  stable_search_path text;
BEGIN
  FOR routine_record IN
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS routine_name,
      p.prokind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'util')
      AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.objid = p.oid
          AND d.deptype = 'e'
      )
    ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  LOOP
    routine_signature := format(
      '%I.%I(%s)',
      routine_record.schema_name,
      routine_record.routine_name,
      pg_get_function_identity_arguments(routine_record.oid)
    );

    stable_search_path := CASE routine_record.schema_name
      WHEN 'util' THEN 'util, public, extensions, vault, net, pgmq, pg_catalog'
      ELSE 'public, extensions, pg_catalog'
    END;

    IF routine_record.prokind = 'p' THEN
      EXECUTE format('ALTER PROCEDURE %s SET search_path = %s', routine_signature, stable_search_path);
    ELSE
      EXECUTE format('ALTER FUNCTION %s SET search_path = %s', routine_signature, stable_search_path);
    END IF;

    RAISE NOTICE 'Set search_path on %', routine_signature;
  END LOOP;
END $$;

-- These SECURITY DEFINER functions should not be callable through public
-- PostgREST/RPC roles. Server-side code uses service_role instead.
REVOKE ALL ON FUNCTION public.frame_embedding_input(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.frame_embedding_input(bigint)
  TO service_role;

REVOKE ALL ON FUNCTION public.search_frames_semantic(extensions.vector, double precision, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_frames_semantic(extensions.vector, double precision, integer)
  TO service_role;

-- Materialized views cannot use RLS, so do not expose this one directly via
-- Supabase Data APIs.
REVOKE ALL ON TABLE public.lemma_lookup
  FROM PUBLIC, anon, authenticated;

-- Keep the read policy, but remove unrestricted authenticated writes.
DROP POLICY IF EXISTS lexical_unit_types_write
  ON public.lexical_unit_types;

-- pg_jsonschema is not relocatable via ALTER EXTENSION SET SCHEMA. Reinstall it
-- into extensions while preserving dependent CHECK constraints in the same
-- transaction.
CREATE TEMP TABLE pg_jsonschema_dependent_constraints ON COMMIT DROP AS
SELECT
  c.oid AS constraint_oid,
  format('%I.%I', tn.nspname, t.relname) AS table_name,
  c.conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace tn ON tn.oid = t.relnamespace
WHERE EXISTS (
  SELECT 1
  FROM pg_depend dep
  WHERE dep.objid = c.oid
    AND dep.refobjid IN (
      SELECT ext_dep.objid
      FROM pg_depend ext_dep
      WHERE ext_dep.refobjid = (
        SELECT oid FROM pg_extension WHERE extname = 'pg_jsonschema'
      )
        AND ext_dep.deptype = 'e'
    )
);

DO $$
DECLARE
  constraint_record record;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_jsonschema'
      AND n.nspname = 'public'
  ) THEN
    FOR constraint_record IN
      SELECT * FROM pg_jsonschema_dependent_constraints
      ORDER BY constraint_oid
    LOOP
      EXECUTE format(
        'ALTER TABLE %s DROP CONSTRAINT %I',
        constraint_record.table_name,
        constraint_record.constraint_name
      );
    END LOOP;

    DROP EXTENSION pg_jsonschema;
    CREATE EXTENSION pg_jsonschema WITH SCHEMA extensions;

    FOR constraint_record IN
      SELECT * FROM pg_jsonschema_dependent_constraints
      ORDER BY constraint_oid
    LOOP
      EXECUTE format(
        'ALTER TABLE %s ADD CONSTRAINT %I %s',
        constraint_record.table_name,
        constraint_record.constraint_name,
        constraint_record.constraint_definition
      );
    END LOOP;
  END IF;
END $$;

COMMIT;

-- Verification queries:
-- 1. App-owned routines in public/util should have a configured search_path.
SELECT
  n.nspname AS schema_name,
  p.proname AS routine_name,
  pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'util')
  AND p.prokind IN ('f', 'p')
  AND p.proconfig IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM pg_depend d
    JOIN pg_extension e ON e.oid = d.refobjid
    WHERE d.objid = p.oid
      AND d.deptype = 'e'
  )
ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid);

-- 2. These should all be false.
SELECT
  role_name,
  has_function_privilege(role_name, 'public.frame_embedding_input(bigint)', 'EXECUTE') AS can_execute_frame_embedding_input,
  has_function_privilege(role_name, 'public.search_frames_semantic(extensions.vector, double precision, integer)', 'EXECUTE') AS can_execute_search_frames_semantic
FROM (VALUES ('anon'), ('authenticated')) AS roles(role_name);
