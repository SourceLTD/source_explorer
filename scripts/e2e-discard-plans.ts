/**
 * E2E helper: discard the given pending plans + all their pending child
 * changesets. Used to clear test plans so the next stage run can re-write
 * them with updated snapshot fields. Mirrors what `commitPlan`/discardPlan
 * paths would do, but does not exist as an API endpoint yet.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function discard(planId: bigint) {
  await prisma.$transaction(async (tx) => {
    const plan = await tx.change_plans.findUnique({ where: { id: planId } });
    if (!plan) {
      console.log(`plan#${planId}: not found`);
      return;
    }
    if (plan.status !== 'pending') {
      console.log(`plan#${planId}: status=${plan.status}; skipping`);
      return;
    }
    const cs = await tx.changesets.findMany({
      where: { change_plan_id: planId, status: 'pending' },
      select: { id: true },
    });
    for (const c of cs) {
      await tx.changesets.update({
        where: { id: c.id },
        data: { status: 'discarded', reviewed_at: new Date(), reviewed_by: 'e2e-discard' },
      });
    }
    await tx.change_plans.update({
      where: { id: planId },
      data: { status: 'discarded' },
    });
    console.log(`plan#${planId}: discarded (${cs.length} changesets)`);
  });
}

async function main() {
  const ids = process.argv.slice(2).map((s) => BigInt(s));
  if (ids.length === 0) {
    console.error('usage: ts-node e2e-discard-plans.ts <planId> [<planId> ...]');
    process.exit(1);
  }
  for (const id of ids) await discard(id);
  await prisma.$disconnect();
}

void main();
