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

export interface PendingByRemediationResponse {
  buckets: ActionBucket[];
  total_pending_changesets: number;
}

export function actionBucketKey(bucket: ActionBucket): string {
  return bucket.action_key;
}

export function healthCheckGroupKey(group: HealthCheckSubGroup): string {
  return group.diagnosis_code ?? '__manual__';
}
