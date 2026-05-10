/**
 * Regression test for `commitPlan` atomicity.
 *
 * Constructs a two-changeset `change_plans` row where:
 *
 *   - changeset #1 (DELETE frame_relation): would normally succeed.
 *   - changeset #2 (CREATE frame_relation): is intentionally malformed
 *     (missing required `source_id` field) so `commitChangesetInTx`
 *     throws inside the transaction.
 *
 * The expectation is that the entire plan rolls back: the original
 * `frame_relation` row still exists, BOTH changesets stay `pending`,
 * the plan stays `pending`, and a `conflict_report` is written to the
 * plan documenting the failure.
 *
 * Cleans up after itself (discards the test plan + changesets) so
 * re-runs are idempotent.
 *
 * Usage: npx tsx scripts/test-commit-plan-atomicity.ts
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { Prisma, PrismaClient } from '@prisma/client';

import { commitPlan } from '../src/lib/version-control/commit-plan';

const prisma = new PrismaClient();

const TEST_USER = 'commit-plan-atomicity-test';

interface TestRelation {
  id: bigint;
  source_id: bigint;
  target_id: bigint;
  type: string;
}

async function findCandidateRelation(): Promise<TestRelation> {
  // Pick any parent_of relation between two non-deleted frames whose
  // child has at least 2 parents — this lets us safely DELETE one
  // edge without leaving the child orphaned (in case the rollback
  // unexpectedly fails to roll back, the child still has another
  // parent and we don't break the production graph).
  const candidates = await prisma.$queryRaw<
    Array<{
      id: bigint;
      source_id: bigint;
      target_id: bigint;
      type: string;
    }>
  >(Prisma.sql`
    SELECT fr.id, fr.source_id, fr.target_id, fr.type::text AS type
    FROM frame_relations fr
    JOIN frames child ON child.id = fr.source_id
    JOIN frames parent ON parent.id = fr.target_id
    WHERE fr.type = 'parent_of'
      AND child.deleted = false
      AND parent.deleted = false
      AND (
        SELECT COUNT(*) FROM frame_relations fr2
        WHERE fr2.source_id = fr.source_id AND fr2.type = 'parent_of'
      ) >= 2
    ORDER BY fr.id ASC
    LIMIT 1
  `);
  if (candidates.length === 0) {
    throw new Error(
      'no candidate parent_of relation found (need a child with >=2 parents to safely test rollback). Seed test data first.',
    );
  }
  return candidates[0];
}

async function main(): Promise<void> {
  console.log('== commitPlan atomicity regression test ==\n');

  const candidate = await findCandidateRelation();
  console.log(
    `picked test relation: rel#${candidate.id} ` +
      `(${candidate.source_id} -[${candidate.type}]-> ${candidate.target_id})`,
  );

  // 1. Stage the two-changeset plan ourselves (bypass the runner).
  //    DELETE first (lower id), CREATE second (higher id).
  console.log('\nstaging test change_plan with DELETE + malformed CREATE...');

  const planAndChangesets = await prisma.$transaction(async (tx) => {
    const deleteCs = await tx.changesets.create({
      data: {
        entity_type: 'frame_relation',
        entity_id: candidate.id,
        operation: 'delete',
        entity_version: null,
        before_snapshot: {
          id: candidate.id.toString(),
          source_id: candidate.source_id.toString(),
          target_id: candidate.target_id.toString(),
          type: candidate.type,
        },
        after_snapshot: undefined as unknown as object,
        created_by: TEST_USER,
        status: 'pending',
      },
    });

    const createCs = await tx.changesets.create({
      data: {
        entity_type: 'frame_relation',
        entity_id: null,
        operation: 'create',
        entity_version: null,
        before_snapshot: undefined as unknown as object,
        // INTENTIONALLY MALFORMED: no source_id. commitCreateInTx for
        // entity_type='frame_relation' requires source_id/target_id/type;
        // missing source_id triggers an Error that propagates out and
        // rolls back the outer transaction.
        after_snapshot: {
          // source_id deliberately omitted
          target_id: candidate.target_id.toString(),
          type: candidate.type,
        },
        created_by: TEST_USER,
        status: 'pending',
      },
    });

    const plan = await tx.change_plans.create({
      data: {
        plan_kind: 'move_frame_parent',
        summary: 'commitPlan atomicity test (auto-cleanup)',
        status: 'pending',
        created_by: TEST_USER,
        metadata: {
          test: 'commitPlan atomicity regression',
          rationale: 'regression test for atomic rollback',
        },
      },
    });

    await tx.changesets.updateMany({
      where: { id: { in: [deleteCs.id, createCs.id] } },
      data: { change_plan_id: plan.id },
    });

    return { plan, deleteCs, createCs };
  });

  const { plan, deleteCs, createCs } = planAndChangesets;
  console.log(
    `staged plan #${plan.id}: deleteCs=${deleteCs.id}, createCs=${createCs.id}`,
  );

  // 2. Capture pre-commit DB state.
  const relBefore = await prisma.frame_relations.findUnique({
    where: { id: candidate.id },
    select: { id: true },
  });
  if (!relBefore) {
    throw new Error('test setup error: candidate relation already gone');
  }
  console.log(`pre-commit: rel#${candidate.id} present in DB`);

  // 3. Commit the plan (expected to fail).
  console.log('\ncalling commitPlan(...)...');
  const result = await commitPlan(plan.id, TEST_USER);
  console.log(
    `  result.success=${result.success}, committed=${result.committed}/${result.attempted}`,
  );
  if (result.conflictReport) {
    console.log(
      `  conflict_report: status=${result.conflictReport.status}, committed=${result.conflictReport.committed}`,
    );
    for (const e of result.conflictReport.errors) {
      console.log(`    error: cs#${e.changeset_id} ${e.error}`);
    }
  }

  // 4. Assert post-state.
  const failures: string[] = [];

  if (result.success) failures.push('expected result.success=false, got true');
  if (result.committed !== 0)
    failures.push(`expected committed=0, got ${result.committed}`);
  if (!result.conflictReport)
    failures.push('expected conflictReport, got null');
  if (result.conflictReport && result.conflictReport.status !== 'failed')
    failures.push(
      `expected conflictReport.status='failed', got '${result.conflictReport.status}'`,
    );
  if (result.conflictReport && result.conflictReport.committed !== 0)
    failures.push(
      `expected conflictReport.committed=0, got ${result.conflictReport.committed}`,
    );

  const planAfter = await prisma.change_plans.findUnique({
    where: { id: plan.id },
    select: { status: true, conflict_report: true, committed_at: true },
  });
  if (!planAfter) failures.push('plan disappeared');
  else {
    if (planAfter.status !== 'pending')
      failures.push(`plan status: expected 'pending', got '${planAfter.status}'`);
    if (planAfter.committed_at !== null)
      failures.push('plan committed_at should be null after rollback');
    if (planAfter.conflict_report === null)
      failures.push('plan conflict_report should be set after failure');
  }

  const deleteCsAfter = await prisma.changesets.findUnique({
    where: { id: deleteCs.id },
    select: { status: true, committed_at: true },
  });
  if (deleteCsAfter && deleteCsAfter.status !== 'pending')
    failures.push(
      `DELETE changeset status: expected 'pending' (rolled back), got '${deleteCsAfter.status}'`,
    );
  if (deleteCsAfter && deleteCsAfter.committed_at !== null)
    failures.push('DELETE changeset committed_at should be null (rolled back)');

  const createCsAfter = await prisma.changesets.findUnique({
    where: { id: createCs.id },
    select: { status: true },
  });
  if (createCsAfter && createCsAfter.status !== 'pending')
    failures.push(
      `CREATE changeset status: expected 'pending' (failed and rolled back), got '${createCsAfter.status}'`,
    );

  const relAfter = await prisma.frame_relations.findUnique({
    where: { id: candidate.id },
    select: { id: true },
  });
  if (!relAfter)
    failures.push(
      `CRITICAL: rel#${candidate.id} was deleted despite plan failure (rollback broken!)`,
    );

  if (failures.length === 0) {
    console.log('\n  PASS: atomic rollback worked correctly');
    console.log('    - rel still in DB');
    console.log('    - both changesets still pending');
    console.log('    - plan still pending with conflict_report');
  } else {
    console.log('\n  FAIL:');
    for (const f of failures) console.log(`    - ${f}`);
  }

  // 5. Cleanup.
  console.log('\ncleaning up test plan + changesets...');
  await prisma.$transaction(async (tx) => {
    await tx.changesets.updateMany({
      where: { id: { in: [deleteCs.id, createCs.id] } },
      data: { status: 'discarded' },
    });
    await tx.change_plans.update({
      where: { id: plan.id },
      data: { status: 'discarded', reviewed_by: TEST_USER, reviewed_at: new Date() },
    });
  });
  console.log('  done.');

  await prisma.$disconnect();
  if (failures.length > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e?.stack ?? e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
