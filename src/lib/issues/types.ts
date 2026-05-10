export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical';

export const ISSUE_STATUSES: IssueStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
export const ISSUE_PRIORITIES: IssuePriority[] = ['low', 'medium', 'high', 'critical'];

export interface IssueDiagnosisCodeSummary {
  id: string;
  code: string;
  label: string;
  severity: IssuePriority;
  category: string | null;
  check_definition_id: string | null;
}

export interface Issue {
  id: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  labels: string[];
  created_by: string;
  assignee: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  diagnosis_code_id: string | null;
  diagnosis_code?: IssueDiagnosisCodeSummary | null;
  changesets_count?: number;
  /**
   * Number of currently-open health-check findings linked to this
   * issue. Replaces the legacy "- N rows affected" suffix that used to
   * be appended to the title at issue-creation time. Manually-created
   * issues with no linked findings will be 0.
   */
  open_findings_count?: number;
  /**
   * Phase 3 of the cascading-remediations rebuild: when set, the
   * planner uses this strategy instead of the diagnosis-code default
   * (`COALESCE(strategy_override, remediation_strategy)`). The
   * create-issues sweep auto-promotes certain codes (e.g.
   * `detach_parent_relation` -> `reparent_frame` when the child has
   * only one parent); reviewers can also flip it manually via the
   * issue PATCH endpoint. NULL means "use the diagnosis-code
   * default".
   */
  strategy_override?: string | null;
}

export interface IssueChangesetSummary {
  id: string;
  entity_type: string;
  entity_id: string | null;
  operation: string;
  status: string;
  created_by: string;
  created_at: string;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  /**
   * v2: when set, this changeset belongs to an N-step `change_plans`
   * row. The issue UI hides such changesets from the "loose changesets"
   * list and renders them inside the parent `PlanCard` instead.
   */
  change_plan_id?: string | null;
}

/**
 * v2: known plan kinds. Strings match the runner-side enum (see
 * `change_plans.plan_kind` in the runner schema). The previous
 * `composite` escape hatch was removed in the cascading-remediations
 * rewrite; the remaining kinds are exhaustive.
 */
export type ChangePlanKind =
  | 'split_frame'
  | 'merge_frame'
  /**
   * v2 Phase 1: collapse two `frame_senses` rows on the same frame
   * into one. Lowers to a single changeset with `operation='merge'`
   * (added by `add_merge_to_change_operation.sql`); the explorer's
   * `commitMergeInTx` runs the link-table repointing + winner-defn
   * UPDATE + loser DELETE inside the outer plan transaction.
   */
  | 'merge_sense'
  | 'move_frame_sense'
  /**
   * v2: a frame reparent in the inheritance DAG. Lowers to one
   * `frame_relation` DELETE (current `parent_of`) plus one
   * `frame_relation` CREATE (new `parent_of`). Backs the
   * `reparent_frame` strategy that owns the 29 hierarchy `I-*` codes
   * promoted in runner migration `0048`.
   */
  | 'move_frame_parent'
  | 'attach_relation'
  | 'detach_relation'
  /**
   * v2 Phase 2 (cascading remediations, eventual-consistency model):
   * regenerate `frame_role_mappings` rows for one (parent, child)
   * inheritance edge. Lowers to N `frame_role_mapping` CREATE
   * changesets, one per parent role with a non-null child_role_label.
   * Picked up by the `regenerate_role_mappings` strategy in response
   * to findings of the new
   * `FRAME_INHERITANCE_MISSING_ROLE_MAPPINGS` programmatic check.
   */
  | 'regenerate_role_mappings';

/** v2: lifecycle status mirrored from runner schema. */
export type ChangePlanStatus = 'pending' | 'committed' | 'discarded' | 'failed';

/**
 * Per-changeset summary embedded in a plan. Lighter than the
 * top-level `IssueChangesetSummary` because the plan card only needs
 * to render the operation + entity reference, not the full snapshots.
 */
export interface IssueChangePlanChangesetSummary {
  id: string;
  entity_type: string;
  entity_id: string | null;
  operation: string;
  status: string;
}

/**
 * v2: a `change_plans` row attached to an issue. The runner writes one
 * of these whenever a structural remediation strategy proposes more
 * than one changeset that must be approved/rejected as a unit (split,
 * merge, move, multi-edge attach/detach).
 *
 * `conflict_report` is populated when a commit attempt failed
 * partway through; it lists which sub-changeset failed and why so the
 * UI can render a detailed retry/discard prompt.
 */
export interface IssueChangePlanSummary {
  id: string;
  plan_kind: ChangePlanKind | string;
  summary: string | null;
  status: ChangePlanStatus | string;
  created_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  committed_at: string | null;
  conflict_report: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  changesets: IssueChangePlanChangesetSummary[];
}

/**
 * Tiny denormalised handle used to label a frame in a finding card —
 * just enough to render "Direction reversal · F-123" without a
 * follow-up fetch. `code` is the human-facing identifier (may be null
 * for frames that haven't been assigned one).
 */
export interface IssueFindingFrameRef {
  id: string;
  label: string;
  code: string | null;
}

/**
 * Per-finding context describing the entity the health check ran against.
 * The shape is discriminated on `kind`:
 *   - `frame_relation`: a parent_of edge, surfaced as parent → child
 *   - `frame`: a single frame, surfaced as a one-line label
 * `null` means we couldn't resolve the entity (e.g. it was deleted, or
 * the entity_type isn't one we know how to summarise yet).
 */
export type IssueFindingEntityContext =
  | {
      kind: 'frame_relation';
      relation_type: string;
      parent: IssueFindingFrameRef;
      child: IssueFindingFrameRef;
    }
  | {
      kind: 'frame';
      frame: IssueFindingFrameRef;
    };

export interface IssueHealthCheckFindingSummary {
  id: string;
  status: string;
  severity: IssuePriority;
  title: string;
  message: string | null;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  diagnosis_code: IssueDiagnosisCodeSummary;
  result: {
    run_id: string;
    entity_type: string;
    entity_id: string;
    entity_key: Record<string, unknown> | null;
    status: string;
    checked_at: string;
  };
  /**
   * Resolved summary of the audited entity (parent + child for
   * frame_relation findings, label for frame findings). Optional /
   * nullable so older clients keep working and so the UI can fall back
   * to the raw `entity_type:entity_id` reference when we can't load
   * the entity (e.g. it was deleted).
   */
  entity_context?: IssueFindingEntityContext | null;
}

export interface IssueWithChangesets
  extends Omit<Issue, 'changesets_count' | 'open_findings_count'> {
  changesets: IssueChangesetSummary[];
  /**
   * v2: N-step plans grouped on this issue. Empty when the issue has
   * no structural remediation proposals; v1 single-edit changesets
   * remain in `changesets` and never appear here.
   */
  change_plans?: IssueChangePlanSummary[];
  health_check_findings?: IssueHealthCheckFindingSummary[];
  diagnosis_code?: IssueDiagnosisCodeSummary | null;
}

export type IssueEventType =
  | 'opened'
  | 'closed'
  | 'reopened'
  | 'status_changed'
  | 'priority_changed'
  | 'title_changed'
  | 'description_changed'
  | 'labels_changed'
  | 'assignee_changed'
  | 'changeset_linked'
  | 'changeset_unlinked'
  | 'changeset_committed'
  | 'changeset_discarded';

export interface IssueComment {
  id: string;
  issue_id: string;
  author: string;
  content: string;
  created_at: string;
  updated_at: string;
  edited: boolean;
  deleted: boolean;
}

export interface IssueEvent {
  id: string;
  issue_id: string;
  actor: string;
  event_type: IssueEventType;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** A single timeline entry — either a comment or an activity event. */
export type IssueTimelineEntry =
  | ({ kind: 'comment' } & IssueComment)
  | ({ kind: 'event' } & IssueEvent);

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const ISSUE_STATUS_STYLES: Record<IssueStatus, string> = {
  open: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  resolved: 'bg-purple-100 text-purple-800 border-purple-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
};

export const ISSUE_PRIORITY_STYLES: Record<IssuePriority, string> = {
  low: 'bg-gray-100 text-gray-700 border-gray-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
};
