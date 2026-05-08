/**
 * E2E commit step for the v2 reparent_frame plan.
 *
 * Reads a plan id from the CLI, prints its current state, then calls
 * `commitPlan(planId, 'system')` and prints the post-state plus the
 * resulting frame_relations rows so we can verify DELETE+CREATE
 * landed atomically.
 *
 * Usage: npx tsx scripts/e2e-commit-reparent-plan.ts <planId>
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { PrismaClient } from '@prisma/client';

import { commitPlan } from '../src/lib/version-control/commit-plan';

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2];
  if (!arg || !/^\d+$/.test(arg)) {
    console.error('usage: e2e-commit-reparent-plan.ts <planId>');
    process.exit(2);
  }
  const planId = BigInt(arg);

  // 1. Pre-state
  const pre = await prisma.change_plans.findUnique({
    where: { id: planId },
    include: {
      changesets: {
        select: {
          id: true,
          operation: true,
          entity_type: true,
          entity_id: true,
          status: true,
          before_snapshot: true,
          after_snapshot: true,
        },
        orderBy: [{ entity_type: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!pre) throw new Error(`plan ${planId} not found`);

  console.log(`=== plan #${planId} pre-commit ===`);
  console.log(`  status=${pre.status} kind=${pre.plan_kind}`);
  console.log(`  summary: ${pre.summary}`);
  for (const cs of pre.changesets) {
    console.log(
      `    cs#${cs.id} op=${cs.operation} entity=${cs.entity_type}#${cs.entity_id ?? '(new)'} status=${cs.status}`,
    );
  }

  // Snapshot the affected frame_relations BEFORE commit so we can
  // diff. We pull every parent_of edge for the source frame so the
  // multi-parent topology is visible.
  const childIdRaw = (() => {
    const del = pre.changesets.find((c) => c.operation === 'delete');
    if (!del?.before_snapshot) return null;
    const snap = del.before_snapshot as Record<string, unknown>;
    return snap.source_id ? BigInt(String(snap.source_id)) : null;
  })();
  const newParentIdRaw = (() => {
    const cre = pre.changesets.find((c) => c.operation === 'create');
    if (!cre?.after_snapshot) return null;
    const snap = cre.after_snapshot as Record<string, unknown>;
    return snap.target_id ? BigInt(String(snap.target_id)) : null;
  })();
  const oldParentIdRaw = (() => {
    const del = pre.changesets.find((c) => c.operation === 'delete');
    if (!del?.before_snapshot) return null;
    const snap = del.before_snapshot as Record<string, unknown>;
    return snap.target_id ? BigInt(String(snap.target_id)) : null;
  })();

  if (childIdRaw && oldParentIdRaw && newParentIdRaw) {
    const before = await prisma.frame_relations.findMany({
      where: { source_id: childIdRaw, type: 'parent_of' },
      select: { id: true, source_id: true, target_id: true, type: true },
      orderBy: { id: 'asc' },
    });
    console.log(`\n=== parent_of rows for frame ${childIdRaw} (BEFORE) ===`);
    for (const r of before) {
      const flag = r.target_id === oldParentIdRaw ? '  <- DELETING' : '';
      console.log(`  rel#${r.id}: ${r.source_id} -> ${r.target_id}${flag}`);
    }
  }

  // 2. Commit
  console.log(`\n=== calling commitPlan(${planId}, 'e2e-system') ===`);
  const result = await commitPlan(planId, 'e2e-system');
  console.log(`  success=${result.success}`);
  console.log(`  committed=${result.committed}/${result.attempted}`);
  if (result.conflictReport) {
    console.log(`  conflictReport: ${JSON.stringify(result.conflictReport, null, 2)}`);
  }

  // 3. Post-state
  const post = await prisma.change_plans.findUnique({
    where: { id: planId },
    include: {
      changesets: {
        select: {
          id: true,
          operation: true,
          entity_type: true,
          entity_id: true,
          status: true,
          committed_at: true,
        },
        orderBy: [{ entity_type: 'asc' }, { id: 'asc' }],
      },
    },
  });
  if (!post) throw new Error(`plan ${planId} disappeared`);

  console.log(`\n=== plan #${planId} post-commit ===`);
  console.log(`  status=${post.status}`);
  console.log(`  committed_at=${post.committed_at?.toISOString() ?? '(none)'}`);
  console.log(`  reviewed_by=${post.reviewed_by ?? '(none)'}`);
  for (const cs of post.changesets) {
    console.log(
      `    cs#${cs.id} op=${cs.operation} entity=${cs.entity_type}#${cs.entity_id ?? '(new)'} status=${cs.status} committed_at=${cs.committed_at?.toISOString() ?? '(none)'}`,
    );
  }

  // 4. Frame_relation diff
  if (childIdRaw) {
    const after = await prisma.frame_relations.findMany({
      where: { source_id: childIdRaw, type: 'parent_of' },
      select: { id: true, source_id: true, target_id: true, type: true },
      orderBy: { id: 'asc' },
    });
    console.log(`\n=== parent_of rows for frame ${childIdRaw} (AFTER) ===`);
    for (const r of after) {
      const flag =
        newParentIdRaw && r.target_id === newParentIdRaw ? '  <- NEW' : '';
      console.log(`  rel#${r.id}: ${r.source_id} -> ${r.target_id}${flag}`);
    }

    // Look for the soft-deleted DELETE row.
    const deletedRel = pre.changesets.find((c) => c.operation === 'delete');
    if (deletedRel?.entity_id) {
      const stillThere = await prisma.frame_relations.findUnique({
        where: { id: deletedRel.entity_id },
      });
      console.log(
        `\n  DELETED rel#${deletedRel.entity_id}: ` +
          (stillThere ? 'STILL EXISTS (BUG)' : 'gone (correct)'),
      );
    }

    // Find the new row by its (source, target, type) triple.
    if (newParentIdRaw) {
      const newRel = await prisma.frame_relations.findFirst({
        where: {
          source_id: childIdRaw,
          target_id: newParentIdRaw,
          type: 'parent_of',
        },
      });
      console.log(
        `  NEW relation source=${childIdRaw} target=${newParentIdRaw}: ` +
          (newRel ? `present as rel#${newRel.id}` : 'MISSING (BUG)'),
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e?.stack ?? e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
