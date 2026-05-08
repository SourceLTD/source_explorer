/**
 * Shared TypeScript types for the health check system.
 *
 * Mirrors the Prisma enums and models, expressed as plain string literal
 * unions / interfaces so they can be safely imported from the client.
 */

import type { IssuePriority } from '@/lib/issues/types';

/**
 * How a health check definition is executed.
 *
 * - `llm_batch`     — handled by the source-llm worker as a batched LLM job.
 *                     Runs typically have `model` and `llm_job_id` populated.
 * - `programmatic`  — handled by an in-process / scripted worker that runs
 *                     deterministic rules over the data. Runs have
 *                     `model = NULL` and `llm_job_id = NULL`. Per-result
 *                     metadata typically includes `check_kind: "programmatic"`.
 */
export type HealthCheckExecutionKind = 'llm_batch' | 'programmatic';

export const HEALTH_CHECK_EXECUTION_KINDS: HealthCheckExecutionKind[] = [
  'llm_batch',
  'programmatic',
];

export const HEALTH_CHECK_EXECUTION_KIND_LABELS: Record<HealthCheckExecutionKind, string> = {
  llm_batch: 'LLM batch',
  programmatic: 'Programmatic',
};

export const HEALTH_CHECK_EXECUTION_KIND_STYLES: Record<HealthCheckExecutionKind, string> = {
  llm_batch: 'bg-violet-100 text-violet-800 border-violet-200',
  programmatic: 'bg-cyan-100 text-cyan-800 border-cyan-200',
};

export type HealthCheckRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type HealthCheckResultStatus =
  | 'passed'
  | 'warning'
  | 'failed'
  | 'error'
  | 'skipped';

export type HealthFindingStatus =
  | 'open'
  | 'resolved'
  | 'ignored'
  | 'false_positive';

/**
 * Subset of `entity_type` values that health checks operate on. Kept as a
 * union of string literals so it can be used freely on the client.
 */
export type HealthCheckEntityType =
  | 'frame'
  | 'frame_role'
  | 'frame_role_mapping'
  | 'role'
  | 'role_group'
  | 'role_group_member'
  | 'frame_relation'
  | 'frame_sense'
  | 'frame_sense_frame'
  | 'lexical_unit'
  | 'lexical_unit_sense';

export const HEALTH_CHECK_RUN_STATUSES: HealthCheckRunStatus[] = [
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
];

export const HEALTH_CHECK_RESULT_STATUSES: HealthCheckResultStatus[] = [
  'passed',
  'warning',
  'failed',
  'error',
  'skipped',
];

export const HEALTH_FINDING_STATUSES: HealthFindingStatus[] = [
  'open',
  'resolved',
  'ignored',
  'false_positive',
];

export const HEALTH_CHECK_ENTITY_TYPES: HealthCheckEntityType[] = [
  'frame',
  'frame_role',
  'frame_role_mapping',
  'role',
  'role_group',
  'role_group_member',
  'frame_relation',
  'frame_sense',
  'frame_sense_frame',
  'lexical_unit',
  'lexical_unit_sense',
];

/**
 * Mirrors the Postgres `frame_type_enum` enum (frames.frame_type column).
 *
 * Kept in sync with the Prisma `frame_type_enum` so it can be imported
 * freely by client components without dragging in `@prisma/client`.
 */
export type FrameType = 'Event' | 'State' | 'Entity' | 'Measure';

export const FRAME_TYPES: FrameType[] = ['Event', 'State', 'Entity', 'Measure'];

/**
 * Mirrors the Postgres `frame_subtype_enum` enum (frames.subtype column).
 */
export type FrameSubtype = 'communication' | 'relation';

export const FRAME_SUBTYPES: FrameSubtype[] = ['communication', 'relation'];

/**
 * Controlled remediation categories for diagnosis codes. Keys deliberately use
 * DB entity language: <operation>_<db_entity>[_field_or_target].
 *
 * These are descriptive routing hints only. They do not execute changes and
 * are not inherited from diagnosis-code groups.
 */
export type HealthRemediationStrategy =
  | 'update_frame_label'
  | 'update_frame_definition'
  | 'update_frame_short_definition'
  | 'update_frame_type'
  | 'update_frame_subtype'
  | 'split_frame'
  | 'merge_frame'
  | 'delete_frame'
  | 'create_frame_role'
  | 'update_frame_role_label'
  | 'update_frame_role_description'
  | 'delete_frame_role'
  | 'create_role_group'
  | 'update_role_group'
  | 'create_role_group_member'
  | 'delete_role_group_member'
  | 'create_frame_role_mapping'
  | 'update_frame_role_mapping'
  | 'delete_frame_role_mapping'
  | 'create_frame_relation'
  | 'update_frame_relation_type'
  | 'delete_frame_relation'
  | 'reparent_frame'
  | 'create_frame_sense'
  | 'update_frame_sense'
  | 'delete_frame_sense'
  | 'move_frame_sense'
  | 'create_lexical_unit'
  | 'update_lexical_unit'
  | 'delete_lexical_unit'
  | 'create_lexical_unit_sense'
  | 'update_lexical_unit_sense'
  | 'delete_lexical_unit_sense'
  | 'move_lexical_unit_sense'
  | 'create_issue_only'
  | 'manual_review';

export const HEALTH_REMEDIATION_STRATEGIES: HealthRemediationStrategy[] = [
  'update_frame_label',
  'update_frame_definition',
  'update_frame_short_definition',
  'update_frame_type',
  'update_frame_subtype',
  'split_frame',
  'merge_frame',
  'delete_frame',
  'create_frame_role',
  'update_frame_role_label',
  'update_frame_role_description',
  'delete_frame_role',
  'create_role_group',
  'update_role_group',
  'create_role_group_member',
  'delete_role_group_member',
  'create_frame_role_mapping',
  'update_frame_role_mapping',
  'delete_frame_role_mapping',
  'create_frame_relation',
  'update_frame_relation_type',
  'delete_frame_relation',
  'reparent_frame',
  'create_frame_sense',
  'update_frame_sense',
  'delete_frame_sense',
  'move_frame_sense',
  'create_lexical_unit',
  'update_lexical_unit',
  'delete_lexical_unit',
  'create_lexical_unit_sense',
  'update_lexical_unit_sense',
  'delete_lexical_unit_sense',
  'move_lexical_unit_sense',
  'create_issue_only',
  'manual_review',
];

export const HEALTH_REMEDIATION_STRATEGY_LABELS: Record<HealthRemediationStrategy, string> = {
  update_frame_label: 'Update frame label',
  update_frame_definition: 'Update frame definition',
  update_frame_short_definition: 'Update frame short definition',
  update_frame_type: 'Update frame type',
  update_frame_subtype: 'Update frame subtype',
  split_frame: 'Split frame',
  merge_frame: 'Merge frame',
  delete_frame: 'Delete frame',
  create_frame_role: 'Create frame role',
  update_frame_role_label: 'Update frame role label',
  update_frame_role_description: 'Update frame role description',
  delete_frame_role: 'Delete frame role',
  create_role_group: 'Create role group',
  update_role_group: 'Update role group',
  create_role_group_member: 'Create role group member',
  delete_role_group_member: 'Delete role group member',
  create_frame_role_mapping: 'Create frame role mapping',
  update_frame_role_mapping: 'Update frame role mapping',
  delete_frame_role_mapping: 'Delete frame role mapping',
  create_frame_relation: 'Create frame relation',
  update_frame_relation_type: 'Update frame relation type',
  delete_frame_relation: 'Delete frame relation',
  reparent_frame: 'Reparent frame',
  create_frame_sense: 'Create frame sense',
  update_frame_sense: 'Update frame sense',
  delete_frame_sense: 'Delete frame sense',
  move_frame_sense: 'Move frame sense',
  create_lexical_unit: 'Create lexical unit',
  update_lexical_unit: 'Update lexical unit',
  delete_lexical_unit: 'Delete lexical unit',
  create_lexical_unit_sense: 'Create lexical unit sense',
  update_lexical_unit_sense: 'Update lexical unit sense',
  delete_lexical_unit_sense: 'Delete lexical unit sense',
  move_lexical_unit_sense: 'Move lexical unit sense',
  create_issue_only: 'Create issue only',
  manual_review: 'Manual review',
};

export interface HealthCheckDefinition {
  id: string;
  code: string;
  label: string;
  description: string | null;
  target_types: HealthCheckEntityType[];
  rule_version: number;
  enabled: boolean;
  /**
   * Distinguishes LLM-driven checks from programmatic (deterministic) ones.
   * Affects how runs are produced (worker type) and which UI affordances
   * make sense (e.g. token/cost columns are only meaningful for `llm_batch`).
   */
  execution_kind: HealthCheckExecutionKind;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/**
 * A diagnosis-code grouping. Pure conceptual/UI clustering of codes that
 * are variants of the same underlying issue (e.g. `FS-001-S` /
 * `FS-001-SR` / `FS-001-EN` all belong to the `fs_001` group).
 *
 * Groups have NO leader code: no member is "primary" or "neutral".
 * Display the group's own `label` (and `description` when present) for
 * the family heading. A group may currently contain 2+ codes; rendering
 * code should also handle the 1-member edge case uniformly.
 */
export interface HealthDiagnosisCodeGroup {
  id: string;
  /** Machine slug, e.g. `fs_001`, `dr_032`. Unique. */
  key: string;
  /** Human-readable family heading, e.g. "Wrong Frame Sense". */
  label: string;
  description: string | null;
  created_at: string;
}

export interface HealthDiagnosisCode {
  id: string;
  check_definition_id: string | null;
  code: string;
  label: string;
  quick_summary: string | null;
  description: string | null;
  examples: string[];
  severity: IssuePriority;
  category: string | null;
  enabled: boolean;
  /**
   * Optional allowlist of `frames.frame_type` values this code applies to.
   * Empty = no constraint (matches any frame_type, including NULL).
   */
  applies_to_frame_types: FrameType[];
  /**
   * Optional allowlist of `frames.subtype` values this code applies to.
   * Combined with `match_null_subtype` (see below). Empty + flag=false
   * means "no constraint"; non-empty + flag=true means "listed values OR NULL".
   */
  applies_to_frame_subtypes: FrameSubtype[];
  /**
   * When true, frames whose `subtype IS NULL` also match — even when
   * `applies_to_frame_subtypes` is empty (in which case ONLY NULL matches).
   */
  match_null_subtype: boolean;
  /**
   * Optional controlled repair category. Uses stable DB-entity language
   * (e.g. `update_frame_role_description`) for filtering/automation.
   */
  remediation_strategy: HealthRemediationStrategy | null;
  /** Optional human guidance for local nuance. */
  remediation_notes: string | null;
  /**
   * Optional grouping pointer (`health_diagnosis_code_groups.id`).
   * `null` for codes that aren't part of any group — render those as
   * standalone codes; do NOT synthesize a fake "neutral" code or
   * fallback group. About 1 in 5 codes are standalone.
   */
  group_id: string | null;
  /**
   * Resolved group, when the API has joined to `health_diagnosis_code_groups`.
   * `null` when the code is standalone or when the join wasn't requested.
   */
  group: HealthDiagnosisCodeGroup | null;
  created_at: string;
}

export interface HealthCheckRunSummary {
  id: string;
  check_definition_id: string | null;
  check_definition_code: string | null;
  check_definition_label: string | null;
  /**
   * Mirrors `health_check_definitions.execution_kind` for the parent
   * definition (or `null` when the definition has been deleted). Use this
   * to decide whether LLM-only columns (model, tokens, cost) are
   * meaningful for the run.
   */
  check_definition_execution_kind: HealthCheckExecutionKind | null;
  label: string | null;
  status: HealthCheckRunStatus;
  worker_id: string | null;
  /** Always null for programmatic runs. */
  model: string | null;
  /** Always null for programmatic runs. */
  llm_job_id: string | null;
  total_items: number;
  processed_items: number;
  passed_items: number;
  warning_items: number;
  failed_items: number;
  error_items: number;
  input_tokens: number;
  output_tokens: number;
  cost_microunits: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export const HEALTH_CHECK_RUN_STATUS_LABELS: Record<HealthCheckRunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const HEALTH_CHECK_RUN_STATUS_STYLES: Record<HealthCheckRunStatus, string> = {
  queued: 'bg-gray-100 text-gray-700 border-gray-200',
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-amber-100 text-amber-800 border-amber-200',
};

export const HEALTH_CHECK_RESULT_STATUS_LABELS: Record<HealthCheckResultStatus, string> = {
  passed: 'Passed',
  warning: 'Warning',
  failed: 'Failed',
  error: 'Error',
  skipped: 'Skipped',
};

export const HEALTH_CHECK_RESULT_STATUS_STYLES: Record<HealthCheckResultStatus, string> = {
  passed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  error: 'bg-rose-100 text-rose-800 border-rose-200',
  skipped: 'bg-gray-100 text-gray-700 border-gray-200',
};
