/**
 * Bulk-commits all pending `move_frame_parent` change plans created by
 * the health-check remediation pipeline (finding_id IS NOT NULL).
 *
 * All plans are committed inside ONE Prisma interactive transaction so
 * the operation is all-or-nothing. This replicates the exact same code
 * path as clicking "Approve" in the UI: commitChangesetInTx + marking
 * the plan committed.
 *
 * Duplicate handling: when multiple plans propose the same edge
 * (source_id, type, target_id) or delete the same entity, only the
 * first is committed; the rest are marked 'discarded' within the same
 * transaction.
 *
 * Usage:
 *   npx tsx scripts/bulk-commit-reparents.ts
 *
 * Options (env vars):
 *   DRY_RUN=1       - print what would be committed without committing
 *   COMMITTED_BY=.. - reviewer label (default "system:bulk-commit")
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { commitChangesetInTx } from '../src/lib/version-control/commit';

const DRY_RUN = process.env.DRY_RUN === '1';
const COMMITTED_BY = process.env.COMMITTED_BY ?? 'system:bulk-commit';

type Changeset = {
  id: bigint;
  status: string;
  entity_type: string;
  entity_id: bigint | null;
  operation: string;
  after_snapshot: Prisma.JsonValue;
};

interface PlanWithChangesets {
  id: bigint;
  changesets: Changeset[];
}

function getConflictKeys(cs: Changeset): string[] {
  const keys: string[] = [];
  if (cs.operation === 'create' && cs.entity_type === 'frame_relation') {
    const snap = cs.after_snapshot as Record<string, unknown> | null;
    if (snap) {
      keys.push(`create:${snap.source_id}:${snap.type}:${snap.target_id}`);
    }
  }
  if (cs.operation === 'delete' && cs.entity_id != null) {
    keys.push(`delete:${cs.entity_type}:${cs.entity_id}`);
  }
  return keys;
}

async function main() {
  const plans: PlanWithChangesets[] = await prisma.change_plans.findMany({
    where: {
      plan_kind: 'move_frame_parent',
      status: 'pending',
      finding_id: { not: null },
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

  const totalChangesets = toCommit.reduce((n, p) => n + p.changesets.length, 0);
  console.log(
    `Found ${plans.length} pending plans: ${toCommit.length} to commit (${totalChangesets} changesets), ${toDiscard.length} duplicates to discard.`,
  );

  if (DRY_RUN) {
    console.log('DRY_RUN=1 — no changes will be committed.');
    return;
  }

  if (toCommit.length === 0 && toDiscard.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  console.log(`Committing in a single transaction (COMMITTED_BY=${COMMITTED_BY})...`);
  const t0 = Date.now();

  let committed = 0;
  let discarded = 0;
  let changesetsCommitted = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const plan of toCommit) {
        for (const cs of plan.changesets) {
          if (cs.status === 'committed') continue;
          if (cs.status !== 'pending') {
            throw new Error(
              `Plan ${plan.id}: changeset ${cs.id} has unexpected status "${cs.status}"`,
            );
          }

          const result = await commitChangesetInTx(tx, cs.id, COMMITTED_BY);
          if (!result.success) {
            const errMsg = result.errors.map((e) => e.error).join('; ');
            throw new Error(
              `Plan ${plan.id}: changeset ${cs.id} failed: ${errMsg}`,
            );
          }
          changesetsCommitted++;
        }

        await tx.change_plans.update({
          where: { id: plan.id },
          data: {
            status: 'committed',
            reviewed_by: COMMITTED_BY,
            reviewed_at: new Date(),
            committed_at: new Date(),
          },
        });

        committed++;
        if (committed % 100 === 0) {
          console.log(`  ... ${committed}/${toCommit.length} plans committed`);
        }
      }

      for (const plan of toDiscard) {
        await tx.change_plans.update({
          where: { id: plan.id },
          data: {
            status: 'discarded',
            reviewed_by: COMMITTED_BY,
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
        discarded++;
      }
    },
    { timeout: 3_600_000, maxWait: 60_000 },
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\nDone in ${elapsed}s. Committed ${committed} plans (${changesetsCommitted} changesets), discarded ${discarded} duplicate plans.`,
  );
}

main()
  .catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
