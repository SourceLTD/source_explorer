/**
 * Plan-level commit (v2): commit every changeset that belongs to a
 * `change_plans` row in dependency order, treating the whole plan as one
 * unit of work.
 *
 * Atomicity (read carefully):
 *
 * v1 of `commitPlan` is sequential, NOT a single SQL transaction. Each
 * underlying `commitChangeset` opens its own `prisma.$transaction`, so a
 * failure on changeset #3 does not roll back changeset #1 or #2. The
 * plan's `conflict_report` records exactly which child succeeded so
 * operators can re-run the remaining children with `commitChangeset`
 * directly.
 *
 * The "true atomic" implementation (single outer `prisma.$transaction`
 * with tx-aware variants of every per-operation commit helper) is
 * tracked as a follow-up in the architecture plan. Until then, plans
 * are only safe for kinds that are individually idempotent at the row
 * level (`split_frame` first writes the new frame, then attaches roles -
 * a partial commit is recoverable). v2 structural strategies must
 * declare themselves `singletx_required: false` to opt in.
 *
 * Conflict reporting:
 *
 * Every failure produces a structured `conflict_report` JSON column on
 * `change_plans` so the API can render it without a follow-up round trip.
 * Shape:
 *
 *   {
 *     status: 'partial' | 'failed',
 *     attempted: 5,
 *     committed: 2,
 *     failed_at_changeset: "<changeset_id>",
 *     errors: CommitError[]
 *   }
 */

import { prisma } from '@/lib/prisma';

import { commitChangeset } from './commit';
import type { CommitError, CommitResult } from './types';

export type ChangePlanStatus = 'pending' | 'committed' | 'discarded';

export interface PlanConflictReport {
  status: 'partial' | 'failed';
  attempted: number;
  committed: number;
  failed_at_changeset: string | null;
  errors: Array<{
    changeset_id: string;
    entity_type: string;
    entity_id: string | null;
    error: string;
  }>;
}

export interface CommitPlanResult {
  planId: bigint;
  success: boolean;
  attempted: number;
  committed: number;
  errors: CommitError[];
  conflictReport: PlanConflictReport | null;
}

export class PlanNotFoundError extends Error {
  constructor(planId: bigint) {
    super(`change plan not found: ${planId.toString()}`);
    this.name = 'PlanNotFoundError';
  }
}

export class PlanNotPendingError extends Error {
  readonly status: ChangePlanStatus;
  constructor(planId: bigint, status: ChangePlanStatus) {
    super(`change plan ${planId.toString()} is ${status}, not pending`);
    this.name = 'PlanNotPendingError';
    this.status = status;
  }
}

/**
 * Commits every pending changeset in `planId` in `(entity_type, id)`
 * order, marks the plan committed when all succeed, and writes a
 * structured `conflict_report` when any fail.
 *
 * Calling on a plan that's already `committed` or `discarded` throws
 * `PlanNotPendingError`. Calling on a plan that does not exist throws
 * `PlanNotFoundError`. Both are safe to surface to API callers.
 */
export async function commitPlan(
  planId: bigint,
  committedBy: string,
): Promise<CommitPlanResult> {
  const plan = await prisma.change_plans.findUnique({
    where: { id: planId },
    include: {
      changesets: {
        // Deterministic dependency order:
        //   1. entity_type ASC keeps related rows together (e.g. all
        //      frame_relation children of a `move` plan come first).
        //   2. id ASC means writes happen in the order the runner /
        //      reviewer staged them. The plan-writer inserts in
        //      operation order (DELETE before CREATE for `move`-kind
        //      reparent), so this preserves the intended sequence
        //      without an explicit `commit_order_hint` column.
        //   3. For frame_relation reparent specifically, this gives
        //      DELETE-old-edge -> CREATE-new-edge, mirroring
        //      `stageFrameRelationReparent`'s ordering. Reversing the
        //      order would briefly leave the source frame parent-less,
        //      which `commitChangeset` for a CREATE frame_relation
        //      handles fine, but the DAG visualisation expects the
        //      DELETE to land first.
        orderBy: [{ entity_type: 'asc' }, { id: 'asc' }],
        select: { id: true, status: true, entity_type: true },
      },
    },
  });
  if (!plan) throw new PlanNotFoundError(planId);
  if (plan.status !== 'pending') {
    throw new PlanNotPendingError(planId, plan.status as ChangePlanStatus);
  }
  const orderedChangesets = plan.changesets;

  const errors: CommitError[] = [];
  let committed = 0;
  let failedAt: bigint | null = null;

  for (const cs of orderedChangesets) {
    if (cs.status !== 'pending') {
      // Treat already-committed members as success-no-op; the order is
      // deterministic so re-runs converge.
      if (cs.status === 'committed') {
        committed += 1;
        continue;
      }
      // discarded inside a plan is a refusal: the plan is no longer coherent.
      errors.push({
        changeset_id: cs.id,
        entity_type: cs.entity_type as CommitError['entity_type'],
        entity_id: null,
        error: `linked changeset ${cs.id.toString()} is ${cs.status}`,
      });
      failedAt = cs.id;
      break;
    }

    const result: CommitResult = await commitChangeset(cs.id, committedBy);
    if (!result.success) {
      errors.push(...result.errors);
      failedAt = cs.id;
      break;
    }
    committed += 1;
  }

  const success = errors.length === 0 && committed === orderedChangesets.length;
  const conflictReport: PlanConflictReport | null = success
    ? null
    : {
        status: committed > 0 ? 'partial' : 'failed',
        attempted: orderedChangesets.length,
        committed,
        failed_at_changeset: failedAt === null ? null : failedAt.toString(),
        errors: errors.map((e) => ({
          changeset_id: e.changeset_id.toString(),
          entity_type: e.entity_type,
          entity_id: e.entity_id === null ? null : e.entity_id.toString(),
          error: e.error,
        })),
      };

  if (success) {
    await prisma.change_plans.update({
      where: { id: planId },
      data: {
        status: 'committed',
        reviewed_by: committedBy,
        reviewed_at: new Date(),
        committed_at: new Date(),
        conflict_report: undefined,
      },
    });
  } else {
    await prisma.change_plans.update({
      where: { id: planId },
      data: {
        // Plan stays `pending` so reviewers can decide whether to retry
        // or discard. Only the `conflict_report` is written.
        conflict_report: conflictReport === null ? undefined : (conflictReport as unknown as object),
      },
    });
  }

  return {
    planId,
    success,
    attempted: orderedChangesets.length,
    committed,
    errors,
    conflictReport,
  };
}

/**
 * Convenience helper for the `DELETE /api/change-plans/[id]` endpoint.
 * Marks the plan AND every linked pending changeset as `discarded` in
 * one transaction, plus discards the per-field-change rows so the
 * pending list immediately reflects the plan's removal.
 */
export async function discardPlan(planId: bigint, discardedBy: string): Promise<{
  planId: bigint;
  discardedChangesets: number;
}> {
  const plan = await prisma.change_plans.findUnique({
    where: { id: planId },
    include: { changesets: { select: { id: true, status: true } } },
  });
  if (!plan) throw new PlanNotFoundError(planId);
  if (plan.status !== 'pending') {
    // Already terminal; idempotent no-op.
    return { planId, discardedChangesets: 0 };
  }

  let discardedChangesets = 0;
  await prisma.$transaction(async (tx) => {
    for (const cs of plan.changesets) {
      if (cs.status !== 'pending') continue;
      await tx.changesets.update({
        where: { id: cs.id },
        data: {
          status: 'discarded',
          reviewed_by: discardedBy,
          reviewed_at: new Date(),
        },
      });
      await tx.field_changes.updateMany({
        where: { changeset_id: cs.id, status: 'pending' },
        data: {
          status: 'rejected',
          rejected_by: discardedBy,
          rejected_at: new Date(),
        },
      });
      discardedChangesets += 1;
    }
    await tx.change_plans.update({
      where: { id: planId },
      data: {
        status: 'discarded',
        reviewed_by: discardedBy,
        reviewed_at: new Date(),
      },
    });
  });

  return { planId, discardedChangesets };
}
