/**
 * Applies the shared `PendingFilter` to the by-remediation inbox's bucket tree.
 *
 * The inbox renders from `bucket.health_check_groups`, so filtering rebuilds
 * each group keeping only changesets that match, recomputes plan lists/counts,
 * and drops empty groups and buckets. Severity/diagnosis come from the
 * containing health-check group; plan summaries provide extra search context
 * for plan-bound changesets.
 */
import type { ActionBucket, ByRemediationChangeset, HealthCheckSubGroup, EnrichedSubject } from './types';
import type { IssueChangePlanSummary } from '@/lib/issues/types';
import {
  type PendingFilter,
  type FilterableChangeset,
  changesetMatchesPendingFilter,
  hasActivePendingFilters,
} from '../filter/pendingFilter';
import type { ChipOption, SelectOption } from '@/components/filters';

type SubjectMap = Record<string, EnrichedSubject>;

/** Resolve the subject concept for a changeset (via its plan, else directly). */
function subjectFor(
  cs: ByRemediationChangeset,
  subjectsByChangeset: SubjectMap,
  subjectsByPlan: SubjectMap,
): EnrichedSubject | undefined {
  return cs.change_plan_id
    ? subjectsByPlan[cs.change_plan_id]
    : subjectsByChangeset[cs.id];
}

function fieldChangeText(cs: ByRemediationChangeset): string {
  return cs.field_changes
    .map((fc) => `${fc.field_name} ${fc.old_display ?? ''} ${fc.new_display ?? ''}`)
    .join(' ');
}

function projectChangeset(
  cs: ByRemediationChangeset,
  group: HealthCheckSubGroup,
  bucket: ActionBucket,
  plan: IssueChangePlanSummary | null,
  subject: EnrichedSubject | undefined,
): FilterableChangeset {
  const planText = plan ? `${plan.summary ?? ''} ${plan.plan_kind}` : '';
  const searchText = [
    cs.entity_type,
    cs.operation,
    cs.llm_job_label ?? '',
    group.diagnosis_label ?? group.diagnosis_code ?? '',
    bucket.action_label,
    planText,
    subject?.label ?? '',
    subject?.archetype ?? '',
    fieldChangeText(cs),
  ]
    .join(' ')
    .toLowerCase();

  return {
    entity_type: cs.entity_type,
    operation: cs.operation,
    source: cs.origin || null,
    jobId: cs.llm_job_id,
    hasPlan: Boolean(cs.change_plan_id),
    createdAt: cs.created_at,
    severity: group.severity,
    diagnosisCode: group.diagnosis_code,
    archetype: subject?.archetype ?? null,
    isNew: subject?.is_new ?? null,
    searchText,
  };
}

function rebuildGroup(
  group: HealthCheckSubGroup,
  bucket: ActionBucket,
  planById: Map<string, IssueChangePlanSummary>,
  filter: PendingFilter,
  subjectsByChangeset: SubjectMap,
  subjectsByPlan: SubjectMap,
): HealthCheckSubGroup | null {
  const keptChangesets = group.changesets.filter((cs) => {
    const plan = cs.change_plan_id ? planById.get(cs.change_plan_id) ?? null : null;
    const subject = subjectFor(cs, subjectsByChangeset, subjectsByPlan);
    return changesetMatchesPendingFilter(projectChangeset(cs, group, bucket, plan, subject), filter);
  });
  if (keptChangesets.length === 0) return null;

  const keptPlanIds = new Set(
    keptChangesets.map((c) => c.change_plan_id).filter((id): id is string => Boolean(id)),
  );
  const keptPlans = group.plans.filter((p) => keptPlanIds.has(p.id));
  const withPlan = keptChangesets.filter((c) => c.change_plan_id).length;

  return {
    ...group,
    changesets: keptChangesets,
    plans: keptPlans,
    counts: {
      total: keptChangesets.length,
      with_plan: withPlan,
      loose: keptChangesets.length - withPlan,
    },
  };
}

export function filterActionBuckets(
  buckets: ActionBucket[],
  filter: PendingFilter,
  subjectsByChangeset: SubjectMap = {},
  subjectsByPlan: SubjectMap = {},
): ActionBucket[] {
  if (!hasActivePendingFilters(filter)) return buckets;

  const result: ActionBucket[] = [];

  for (const bucket of buckets) {
    const planById = new Map(bucket.plans.map((p) => [p.id, p]));

    const groups = bucket.health_check_groups
      .map((g) => rebuildGroup(g, bucket, planById, filter, subjectsByChangeset, subjectsByPlan))
      .filter((g): g is HealthCheckSubGroup => g !== null);

    const keptChangesets = groups.flatMap((g) => g.changesets);
    if (keptChangesets.length === 0) continue;

    const keptPlanIds = new Set(
      keptChangesets.map((c) => c.change_plan_id).filter((id): id is string => Boolean(id)),
    );
    const keptPlans = bucket.plans.filter((p) => keptPlanIds.has(p.id));
    const withPlan = keptChangesets.filter((c) => c.change_plan_id).length;

    result.push({
      ...bucket,
      health_check_groups: groups,
      changesets: keptChangesets,
      plans: keptPlans,
      counts: {
        total: keptChangesets.length,
        with_plan: withPlan,
        loose: keptChangesets.length - withPlan,
      },
    });
  }

  return result;
}

/** Build the facet options for the inbox filter panel from the raw buckets. */
export function buildInboxFilterOptions(
  buckets: ActionBucket[],
  subjectsByChangeset: SubjectMap = {},
  subjectsByPlan: SubjectMap = {},
): {
  entityTypes: ChipOption[];
  operations: ChipOption[];
  jobs: SelectOption[];
  severities: ChipOption[];
  diagnoses: SelectOption[];
  archetypes: ChipOption[];
} {
  const entityTypes = new Set<string>();
  const operations = new Set<string>();
  const severities = new Set<string>();
  const jobs = new Map<string, string | null>();
  const diagnoses = new Map<string, string | null>();
  const archetypes = new Set<string>();

  for (const bucket of buckets) {
    for (const group of bucket.health_check_groups) {
      if (group.severity) severities.add(group.severity);
      if (group.diagnosis_code) diagnoses.set(group.diagnosis_code, group.diagnosis_label);
      for (const cs of group.changesets) {
        entityTypes.add(cs.entity_type);
        operations.add(cs.operation);
        if (cs.llm_job_id) jobs.set(cs.llm_job_id, cs.llm_job_label);
        const subject = subjectFor(cs, subjectsByChangeset, subjectsByPlan);
        if (subject?.archetype) archetypes.add(subject.archetype);
      }
    }
  }

  const severityOrder = ['critical', 'high', 'error', 'medium', 'warning', 'low', 'info'];
  const sortSeverity = (a: string, b: string) => {
    const ia = severityOrder.indexOf(a);
    const ib = severityOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  };

  return {
    entityTypes: Array.from(entityTypes).sort().map((v) => ({ value: v, label: v })),
    operations: Array.from(operations).sort().map((v) => ({ value: v, label: v })),
    severities: Array.from(severities)
      .sort(sortSeverity)
      .map((v) => ({ value: v, label: capitalize(v) })),
    jobs: Array.from(jobs.entries()).map(([id, label]) => ({
      id,
      label: label ?? `Job ${id}`,
      sublabel: id,
    })),
    diagnoses: Array.from(diagnoses.entries()).map(([code, label]) => ({
      id: code,
      label: label ?? code,
      sublabel: code,
    })),
    archetypes: Array.from(archetypes).sort().map((v) => ({ value: v, label: capitalize(v) })),
  };
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
