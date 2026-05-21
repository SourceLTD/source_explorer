-- Enable RLS on public tables flagged by Supabase database linter (0013).
--
-- These tables were added after the initial RLS rollout and were exposed to
-- PostgREST without row level security. Enabling RLS blocks anon/authenticated
-- API access by default; server-side Prisma/service_role access is unchanged.
--
-- Safe to run multiple times.

BEGIN;

ALTER TABLE public.health_diagnosis_code_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_filler_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filler_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_remediation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_remediation_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_remediation_strategy_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_remediation_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_remediation_schema_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_diagnosis_code_consolidation_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_row_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_check_batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_remediation_batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_graphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.narrative_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instance_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_filler_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instance_fillers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arguments ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verification: should return zero rows.
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
