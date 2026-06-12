/**
 * Client-side regrouping of the pending-changes inbox by *subject
 * concept* instead of by action type.
 *
 * The server response is grouped by action type. For the "by concept"
 * and "by concept type" views we re-bucket the same changesets + plans
 * by the concept each change is about, using the server-resolved
 * `subjects_by_changeset` / `subjects_by_plan` maps (so no per-card
 * fetch is needed).
 *
 * The output reuses the `ActionBucket` shape verbatim, so the existing
 * inbox rail/header/body render it unchanged. Each subject bucket holds
 * a single health-check group (diagnosis-less), matching how the server
 * shapes the manual/unlinked case.
 *
 * Grouping rules (see `subjectConcept.ts` for the subject derivation):
 *   - A loose changeset is filed under its own subject.
 *   - A plan-bound changeset is filed under its PLAN's subject, so a
 *     multi-concept plan (merge/split/reparent) stays in one bucket
 *     rather than scattering across the concepts it touches.
 */
import type { IssueChangePlanSummary } from '@/lib/issues/types';
import type {
  ActionBucket,
  ByRemediationChangeset,
  EnrichedSubject,
  HealthCheckSubGroup,
} from './types';

export type SubjectGroupMode = 'concept' | 'concept_type';

const UNATTACHED_KEY = '__unattached__';
const NO_TYPE_KEY = 'type:__none__';

/** Subject used when a change has no resolvable subject concept. */
const UNATTACHED_SUBJECT: EnrichedSubject = {
  concept_id: null,
  key: UNATTACHED_KEY,
  label: null,
  archetype: null,
  is_new: false,
};

interface SubjectBucketDraft {
  key: string;
  label: string;
  /** Sorts pseudo-buckets (unattached / no-type) to the bottom. */
  trailing: boolean;
  changesets: ByRemediationChangeset[];
  planIds: Set<string>;
}

function countOf(changesets: ByRemediationChangeset[]) {
  const withPlan = changesets.filter((c) => c.change_plan_id).length;
  return {
    total: changesets.length,
    with_plan: withPlan,
    loose: changesets.length - withPlan,
  };
}

/** Bucket key + display label for a subject under the chosen mode. */
function bucketIdentity(
  subj: EnrichedSubject,
  mode: SubjectGroupMode,
): { key: string; label: string; trailing: boolean } {
  if (mode === 'concept_type') {
    const archetype = subj.archetype;
    return archetype
      ? { key: `type:${archetype}`, label: archetype, trailing: false }
      : { key: NO_TYPE_KEY, label: 'No type', trailing: true };
  }
  // mode === 'concept'
  if (subj.key === UNATTACHED_KEY) {
    return { key: UNATTACHED_KEY, label: 'Unattached', trailing: true };
  }
  const label =
    subj.label ??
    (subj.concept_id ? `Concept #${subj.concept_id}` : subj.is_new ? 'New concept' : 'Unknown concept');
  return { key: subj.key, label, trailing: false };
}

export function regroupBySubject(
  changesets: ByRemediationChangeset[],
  plans: IssueChangePlanSummary[],
  subjectsByChangeset: Record<string, EnrichedSubject>,
  subjectsByPlan: Record<string, EnrichedSubject>,
  mode: SubjectGroupMode,
): ActionBucket[] {
  const planById = new Map(plans.map((p) => [p.id, p]));
  const drafts = new Map<string, SubjectBucketDraft>();

  const draftFor = (subj: EnrichedSubject): SubjectBucketDraft => {
    const { key, label, trailing } = bucketIdentity(subj, mode);
    let draft = drafts.get(key);
    if (!draft) {
      draft = { key, label, trailing, changesets: [], planIds: new Set() };
      drafts.set(key, draft);
    }
    return draft;
  };

  // Every changeset (loose or plan-bound) lands in exactly one bucket.
  for (const cs of changesets) {
    const subj = cs.change_plan_id
      ? subjectsByPlan[cs.change_plan_id] ?? UNATTACHED_SUBJECT
      : subjectsByChangeset[cs.id] ?? UNATTACHED_SUBJECT;
    const draft = draftFor(subj);
    draft.changesets.push(cs);
    if (cs.change_plan_id) draft.planIds.add(cs.change_plan_id);
  }

  // Register plans whose subject bucket may not have been created by a
  // changeset (defensive — surfaced plans normally carry changesets).
  for (const plan of plans) {
    const subj = subjectsByPlan[plan.id] ?? UNATTACHED_SUBJECT;
    draftFor(subj).planIds.add(plan.id);
  }

  const buckets: ActionBucket[] = [];
  for (const draft of drafts.values()) {
    const plansForBucket = Array.from(draft.planIds)
      .map((id) => planById.get(id))
      .filter((p): p is IssueChangePlanSummary => p != null);

    const counts = countOf(draft.changesets);

    const group: HealthCheckSubGroup = {
      diagnosis_code: null,
      diagnosis_label: null,
      severity: null,
      changesets: draft.changesets,
      plans: plansForBucket,
      counts,
    };

    buckets.push({
      action_key: draft.key,
      action_label: draft.label,
      health_check_groups: [group],
      changesets: draft.changesets,
      plans: plansForBucket,
      counts,
    });
  }

  // Most-pending first; pseudo-buckets (unattached / no-type) always last.
  buckets.sort((a, b) => {
    const aTrail = drafts.get(a.action_key)?.trailing ? 1 : 0;
    const bTrail = drafts.get(b.action_key)?.trailing ? 1 : 0;
    if (aTrail !== bTrail) return aTrail - bTrail;
    if (b.counts.total !== a.counts.total) return b.counts.total - a.counts.total;
    return a.action_label.localeCompare(b.action_label);
  });

  return buckets;
}
