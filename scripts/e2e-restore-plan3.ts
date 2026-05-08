/**
 * Plan 3 (ADULT_MALE -> JILT replacing COMRADE) hit a unique-constraint
 * violation on its CREATE because Plan 2 already created
 * (ADULT_MALE, parent_of, JILT). Plan 2's commit landed cleanly; Plan
 * 3's DELETE of rel#80758 landed but its CREATE failed.
 *
 * commitPlan is currently SEQUENTIAL (one $transaction per changeset)
 * rather than a single transactional commit. This is a known design
 * gap noted in the architecture summary: "It is currently sequential
 * rather than a single atomic SQL transaction." This e2e is the first
 * end-to-end exercise of the path; the conflict_report is correctly
 * populated and the plan is left in `pending` status, but the DELETE
 * landed in isolation - leaving the data half-state.
 *
 * To restore consistency for the test data:
 *   - Re-insert (ADULT_MALE, parent_of, COMRADE) to undo the orphan
 *     DELETE.
 *   - Mark cs#611 (the failed CREATE) as `discarded` and plan #3 as
 *     `discarded` so the system stops trying to retry.
 *
 * Production follow-ups (out of e2e scope, doc them here for the
 * reviewer):
 *   1. Make `commitPlan` truly atomic by wrapping the loop in a
 *      single `prisma.$transaction(async (tx) => ...)` and
 *      refactoring `commitCreate` / `commitUpdate` / `commitDelete`
 *      to accept an optional tx client.
 *   2. Add a pre-flight conflict check that walks the plan's
 *      children before mutation, catching dup-row CREATEs and
 *      missing-row DELETEs up front, so the worst-case is a refused
 *      plan rather than a half-committed one.
 *   3. Add a "rollback partial plan" reviewer action that takes a
 *      stuck plan and emits compensating changesets.
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Re-insert (ADULT_MALE=199259, parent_of, COMRADE=156730).
  const existing = await prisma.frame_relations.findFirst({
    where: { source_id: 199259n, target_id: 156730n, type: 'parent_of' },
  });
  if (!existing) {
    const restored = await prisma.frame_relations.create({
      data: { source_id: 199259n, target_id: 156730n, type: 'parent_of' },
    });
    console.log(`restored frame_relation: rel#${restored.id} (199259 -> 156730 parent_of)`);
  } else {
    console.log(`frame_relation already exists: rel#${existing.id}`);
  }

  // 2. Mark cs#611 as discarded so it doesn't get retried.
  const cs611 = await prisma.changesets.findUnique({ where: { id: 611n } });
  if (cs611 && cs611.status !== 'discarded') {
    await prisma.changesets.update({
      where: { id: 611n },
      data: { status: 'discarded', reviewed_by: 'e2e-system', reviewed_at: new Date() },
    });
    console.log('marked cs#611 as discarded');
  } else {
    console.log(`cs#611 already ${cs611?.status ?? 'missing'}`);
  }

  // 3. Mark plan 3 as discarded.
  const plan3 = await prisma.change_plans.findUnique({ where: { id: 3n } });
  if (plan3 && plan3.status !== 'discarded') {
    await prisma.change_plans.update({
      where: { id: 3n },
      data: { status: 'discarded', reviewed_by: 'e2e-system', reviewed_at: new Date() },
    });
    console.log('marked plan #3 as discarded');
  } else {
    console.log(`plan #3 already ${plan3?.status ?? 'missing'}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e?.stack ?? e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
