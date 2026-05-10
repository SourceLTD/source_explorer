/**
 * Plan-level commit (v2): commit every changeset that belongs to a
 * `change_plans` row in dependency order, treating the whole plan as
 * one atomic unit of work.
 *
 * Atomicity:
 *
 * The whole plan executes inside a single `prisma.$transaction`. If any
 * child changeset fails (validation error, version conflict, FK
 * violation, etc.), the transaction rolls back and NO partial state is
 * left behind on `frames`, `frame_relations`, `frame_senses`, etc. The
 * `change_plans` row is then updated OUTSIDE the rolled-back tx with a
 * `conflict_report` JSON column so the UI can render the failure
 * without a follow-up round trip.
 *
 * On success the plan, every child changeset, and every audit-log row
 * commit together. The `change_plans` row's `committed_at` is set in
 * the same transaction so observers always see "all-or-nothing".
 *
 * Limitations:
 *
 *   - lexical_unit DELETE is not allowed inside a plan (it stages
 *     hyponym-reassignment changesets that must outlive any rollback).
 *     `commitChangesetInTx` throws if it sees one.
 *   - The version-conflict pre-check inside the tx uses `findUnique`,
 *     not `SELECT ... FOR UPDATE`. The actual UPDATE statements still
 *     guard with `WHERE version=N` (optimistic locking), so a stale
 *     read between the check and the write surfaces as a 0-row update,
 *     which we surface as a conflict and roll back.
 *
 * Conflict report shape (mirrors v1 exactly so the UI doesn't need
 * branching):
 *
 *   {
 *     status: 'failed',
 *     attempted: 5,
 *     committed: 0,           // always 0 now (atomic)
 *     failed_at_changeset: "<changeset_id>",
 *     errors: CommitError[]
 *   }
 *
 * `status: 'partial'` is no longer reachable in normal operation. We
 * preserve the type for backward compatibility with rows written
 * before this refactor.
 */

import { prisma } from '@/lib/prisma';

import { commitChangesetInTx } from './commit';
import type { CommitError } from './types';

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
 * order inside a single `prisma.$transaction`. On success, every child
 * changeset, every audit-log row, and the parent `change_plans` row
 * commit together. On any failure, the entire transaction rolls back
 * and a `conflict_report` is written to the (still pending) plan row
 * in a follow-up write.
 *
 * Calling on a plan that's already `committed` or `discarded` throws
 * `PlanNotPendingError`. Calling on a plan that does not exist throws
 * `PlanNotFoundError`. Both are safe to surface to API callers.
 */
export async function commitPlan(
  planId: bigint,
  committedBy: string,
): Promise<CommitPlanResult> {
  // Pre-fetch the plan + its changesets OUTSIDE the tx. Prisma's
  // interactive transactions can't read+write from the same client at
  // the same row count without acquiring locks too eagerly; this
  // pre-read is cheap and only used to validate the plan exists and is
  // in the right state. The actual writes re-fetch inside the tx.
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
  const attempted = orderedChangesets.length;

  // Atomic path: open ONE transaction and commit every child plus the
  // plan itself inside it. Any throw rolls everything back.
  //
  // Timeout: Prisma's default interactive-tx timeout is 5s. A
  // merge_sense plan touching a wide LU/contrast graph can already
  // exceed that on a busy DB; split/merge plans with N>5 children
  // routinely will. 30s covers realistic remediation plans without
  // letting a runaway hold locks for an unbounded duration. maxWait
  // (time to acquire the connection) is bumped proportionally so
  // transactions don't spuriously time out under contention.
  let txError: { failedAt: bigint | null; errors: CommitError[] } | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      for (const cs of orderedChangesets) {
        if (cs.status === 'committed') {
          // Idempotent re-run: a previously-committed child is fine,
          // but it must not have been committed by an earlier partial
          // commit attempt — which can no longer happen with this
          // function, but legacy data may exist.
          continue;
        }
        if (cs.status !== 'pending') {
          // discarded inside a plan is a refusal: the plan is no longer
          // coherent. Throw to roll back any prior writes in the tx.
          throw new PlanChildNotPendingError(cs.id, cs.status, cs.entity_type);
        }

        // commitChangesetInTx contractually throws on failure. Wrap the
        // call so the thrown error is attributed back to THIS specific
        // child changeset (otherwise the outer catch sees a bare Error
        // with no changeset context).
        try {
          const result = await commitChangesetInTx(tx, cs.id, committedBy);
          if (!result.success) {
            throw new PlanChildCommitError(cs.id, result.errors);
          }
        } catch (err) {
          if (
            err instanceof PlanChildCommitError ||
            err instanceof PlanChildNotPendingError
          ) {
            throw err;
          }
          throw new PlanChildCommitError(cs.id, [
            {
              changeset_id: cs.id,
              entity_type: cs.entity_type as CommitError['entity_type'],
              entity_id: null,
              error: err instanceof Error ? err.message : String(err),
            },
          ]);
        }
      }

      // Mark the plan committed inside the same tx so observers see
      // all-or-nothing.
      await tx.change_plans.update({
        where: { id: planId },
        data: {
          status: 'committed',
          reviewed_by: committedBy,
          reviewed_at: new Date(),
          committed_at: new Date(),
          conflict_report: undefined,
        },
      });
    }, {
      timeout: 30_000,
      maxWait: 10_000,
    });
  } catch (err) {
    // Convert into the same shape as the old per-changeset failure mode
    // so callers / UI don't have to learn a new shape.
    if (err instanceof PlanChildCommitError) {
      txError = { failedAt: err.changesetId, errors: err.errors };
    } else if (err instanceof PlanChildNotPendingError) {
      txError = {
        failedAt: err.changesetId,
        errors: [
          {
            changeset_id: err.changesetId,
            entity_type: err.entityType as CommitError['entity_type'],
            entity_id: null,
            error: `linked changeset ${err.changesetId.toString()} is ${err.childStatus}`,
          },
        ],
      };
    } else {
      txError = {
        failedAt: null,
        errors: [
          {
            changeset_id: 0n,
            entity_type: 'frame',
            entity_id: null,
            error: err instanceof Error ? err.message : 'Unknown plan-commit error',
          },
        ],
      };
    }
  }

  if (txError === null) {
    return {
      planId,
      success: true,
      attempted,
      committed: attempted,
      errors: [],
      conflictReport: null,
    };
  }

  // Failure path: write the conflict report on the still-pending plan
  // in a fresh transaction so the UI can render it. The plan's child
  // changesets are still pending (the tx rolled back the
  // status='committed' updates inside commitChangesetInTx).
  const conflictReport: PlanConflictReport = {
    status: 'failed',
    attempted,
    // Always 0 now: atomic rollback means no child stayed committed.
    committed: 0,
    failed_at_changeset: txError.failedAt === null ? null : txError.failedAt.toString(),
    errors: txError.errors.map((e) => ({
      changeset_id: e.changeset_id.toString(),
      entity_type: e.entity_type,
      entity_id: e.entity_id === null ? null : e.entity_id.toString(),
      error: e.error,
    })),
  };

  await prisma.change_plans.update({
    where: { id: planId },
    data: {
      conflict_report: conflictReport as unknown as object,
    },
  });

  return {
    planId,
    success: false,
    attempted,
    committed: 0,
    errors: txError.errors,
    conflictReport,
  };
}

/**
 * Internal sentinel: thrown when `commitChangesetInTx` returns a
 * non-success `CommitResult` so we can roll back the outer transaction
 * with the original error context preserved.
 */
class PlanChildCommitError extends Error {
  readonly changesetId: bigint;
  readonly errors: CommitError[];
  constructor(changesetId: bigint, errors: CommitError[]) {
    super(`plan child changeset ${changesetId.toString()} failed to commit`);
    this.name = 'PlanChildCommitError';
    this.changesetId = changesetId;
    this.errors = errors;
  }
}

/**
 * Internal sentinel: thrown when a plan's child changeset is in a
 * non-pending non-committed state (e.g. discarded), which makes the
 * plan no longer coherent.
 */
class PlanChildNotPendingError extends Error {
  readonly changesetId: bigint;
  readonly childStatus: string;
  readonly entityType: string;
  constructor(changesetId: bigint, childStatus: string, entityType: string) {
    super(`plan child changeset ${changesetId.toString()} is ${childStatus}`);
    this.name = 'PlanChildNotPendingError';
    this.changesetId = changesetId;
    this.childStatus = childStatus;
    this.entityType = entityType;
  }
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
