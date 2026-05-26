/**
 * Bulk-commit pending change plans in one database transaction.
 *
 * Used by the pending-changes UI and the CLI script. Duplicate edge
 * proposals (same parent_of parent/child pair) are discarded rather
 * than committed.
 */

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { commitChangesetInTx } from './commit';

type PlanChangeset = {
  id: bigint;
  status: string;
  entity_type: string;
  entity_id: bigint | null;
  operation: string;
  after_snapshot: Prisma.JsonValue;
};

interface PlanWithChangesets {
  id: bigint;
  changesets: PlanChangeset[];
}

function getConflictKeys(cs: PlanChangeset): string[] {
  const keys: string[] = [];
  if (cs.operation === 'create' && (cs.entity_type === 'frame_relation' || cs.entity_type === 'concept_relation')) {
    const snap = cs.after_snapshot as Record<string, unknown> | null;
    if (snap) {
      const relType = snap.type ?? 'parent_of';
      const parentId = snap.parent_id ?? snap.source_id;
      const childId = snap.child_id ?? snap.target_id;
      if (parentId != null && childId != null) {
        keys.push(`create:${relType}:${parentId}:${childId}`);
      }
    }
  }
  if (cs.operation === 'delete' && cs.entity_id != null) {
    keys.push(`delete:${cs.entity_type}:${cs.entity_id}`);
  }
  return keys;
}

export interface BulkCommitPlansArgs {
  /** When set, only these plans are considered (must still be pending). */
  planIds?: bigint[];
  /** When planIds is omitted, optionally restrict by plan_kind. */
  planKind?: string;
  committedBy: string;
}

export interface BulkCommitPlansResult {
  total: number;
  committed: number;
  discarded: number;
  changesetsCommitted: number;
  error?: string;
  failedPlanId?: string;
}

export async function bulkCommitPlans(
  args: BulkCommitPlansArgs,
): Promise<BulkCommitPlansResult> {
  const plans: PlanWithChangesets[] = await prisma.change_plans.findMany({
    where: {
      status: 'pending',
      ...(args.planIds ? { id: { in: args.planIds } } : {}),
      ...(args.planKind ? { plan_kind: args.planKind } : {}),
    },
    include: {
      changesets: {
        orderBy: [{ entity_type: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          status: true,
          entity_type: true,
          entity_id: true,
          operation: true,
          after_snapshot: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  const seen = new Set<string>();
  const toCommit: PlanWithChangesets[] = [];
  const toDiscard: PlanWithChangesets[] = [];

  for (const plan of plans) {
    const planKeys: string[] = [];
    let isDuplicate = false;

    for (const cs of plan.changesets) {
      for (const key of getConflictKeys(cs)) {
        if (seen.has(key)) {
          isDuplicate = true;
          break;
        }
        planKeys.push(key);
      }
      if (isDuplicate) break;
    }

    if (isDuplicate) {
      toDiscard.push(plan);
    } else {
      for (const key of planKeys) seen.add(key);
      toCommit.push(plan);
    }
  }

  if (toCommit.length === 0 && toDiscard.length === 0) {
    return {
      total: 0,
      committed: 0,
      discarded: 0,
      changesetsCommitted: 0,
    };
  }

  let committed = 0;
  let discarded = 0;
  let changesetsCommitted = 0;

  const BATCH_SIZE = Number(process.env.BULK_COMMIT_BATCH_SIZE ?? 100);

  for (let i = 0; i < toCommit.length; i += BATCH_SIZE) {
    const batch = toCommit.slice(i, i + BATCH_SIZE);
    try {
      await prisma.$transaction(
        async (tx) => {
          for (const plan of batch) {
            for (const cs of plan.changesets) {
              if (cs.status === 'committed') continue;
              if (cs.status !== 'pending') {
                throw new Error(
                  `Plan ${plan.id}: changeset ${cs.id} has unexpected status "${cs.status}"`,
                );
              }

              const result = await commitChangesetInTx(tx, cs.id, args.committedBy);
              if (!result.success) {
                const errMsg = result.errors.map((e) => e.error).join('; ');
                throw new Error(
                  `Plan ${plan.id}: changeset ${cs.id} failed: ${errMsg}`,
                );
              }
              changesetsCommitted += 1;
            }

            await tx.change_plans.update({
              where: { id: plan.id },
              data: {
                status: 'committed',
                reviewed_by: args.committedBy,
                reviewed_at: new Date(),
                committed_at: new Date(),
              },
            });

            committed += 1;
          }
        },
        { timeout: 600_000, maxWait: 60_000 },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const planMatch = message.match(/Plan (\d+):/);
      return {
        total: plans.length,
        committed,
        discarded,
        changesetsCommitted,
        error: message,
        failedPlanId: planMatch?.[1],
      };
    }

    if ((i + BATCH_SIZE) % 1000 < BATCH_SIZE) {
      console.log(`  committed ${committed}/${toCommit.length} ...`);
    }
  }

  for (let i = 0; i < toDiscard.length; i += BATCH_SIZE) {
    const batch = toDiscard.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      async (tx) => {
        for (const plan of batch) {
          await tx.change_plans.update({
            where: { id: plan.id },
            data: {
              status: 'discarded',
              reviewed_by: args.committedBy,
              reviewed_at: new Date(),
            },
          });
          for (const cs of plan.changesets) {
            if (cs.status !== 'pending') continue;
            await tx.changesets.update({
              where: { id: cs.id },
              data: { status: 'discarded' },
            });
          }
          discarded += 1;
        }
      },
      { timeout: 600_000, maxWait: 60_000 },
    );
  }

  return {
    total: plans.length,
    committed,
    discarded,
    changesetsCommitted,
  };
}
