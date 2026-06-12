/**
 * Shared types for the by-remediation pending-changes inbox.
 *
 * The wire shape mirrors the response of
 * `/api/changesets/pending/by-remediation`. Keep in lockstep with that
 * route's types.
 */
import type { ShapedChangeset } from '@/lib/changesets/pending-shape';
import type { IssueChangePlanSummary } from '@/lib/issues/types';

export type ByRemediationChangeset = ShapedChangeset;

export interface HealthCheckSubGroup {
  /** null = no diagnosis code / unlinked — rendered as "Manual / Unlinked". */
  diagnosis_code: string | null;
  diagnosis_label: string | null;
  severity: string | null;
  changesets: ByRemediationChangeset[];
  plans: IssueChangePlanSummary[];
  counts: {
    total: number;
    with_plan: number;
    loose: number;
  };
}

export interface ActionBucket {
  /**
   * Machine key:
   *   - plan-bound: `change_plans.plan_kind`  (e.g. `move_frame_parent`)
   *   - loose:      `<operation>/<entity_type>` (e.g. `update/frame`)
   */
  action_key: string;
  action_label: string;
  health_check_groups: HealthCheckSubGroup[];
  changesets: ByRemediationChangeset[];
  plans: IssueChangePlanSummary[];
  counts: {
    total: number;
    with_plan: number;
    loose: number;
  };
}

/**
 * Subject concept of a change, resolved server-side. Powers the
 * "by concept" and "by concept type" inbox views: every change is filed
 * under the single concept it is *about* (see `subjectConcept.ts`), with
 * its label/archetype already resolved so the client can group without
 * extra fetches.
 */
export interface EnrichedSubject {
  /** Subject concept id, or null when it doesn't exist yet (create/split/ingest). */
  concept_id: string | null;
  /** Stable bucket key: `concept:<id>` for existing, `new:<seed>` for not-yet-created. */
  key: string;
  /** Resolved display label (null only when the concept couldn't be resolved). */
  label: string | null;
  /** Resolved archetype / concept type (null when unset or unresolved). */
  archetype: string | null;
  /** True when the subject is a not-yet-created concept. */
  is_new: boolean;
}

export interface PendingByRemediationResponse {
  buckets: ActionBucket[];
  total_pending_changesets: number;
  /** Subject concept per loose changeset, keyed by changeset id. */
  subjects_by_changeset: Record<string, EnrichedSubject>;
  /** Subject concept per plan, keyed by plan id. */
  subjects_by_plan: Record<string, EnrichedSubject>;
}

export function actionBucketKey(bucket: ActionBucket): string {
  return bucket.action_key;
}

export function healthCheckGroupKey(group: HealthCheckSubGroup): string {
  return group.diagnosis_code ?? '__manual__';
}
