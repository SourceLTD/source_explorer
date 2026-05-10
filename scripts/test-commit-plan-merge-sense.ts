/**
 * End-to-end smoke test for the `merge_sense` plan kind.
 *
 * `frame_sense_contrasts` enforces TWO non-trivial invariants we have
 * to respect both in the fixture and in the post-state assertions:
 *
 *   - CHECK (frame_sense_id < contrasted_sense_id) — canonical
 *     ordering, so contrast rows can only ever be inserted in
 *     (small_id, big_id) form.
 *   - UNIQUE (frame_sense_id, contrasted_sense_id) — naïve UPDATEs
 *     can collide with pre-existing winner rows.
 *
 * Sense ids are auto-incrementing, so we deliberately allocate them
 * in this order to cover BOTH column positions of the loser:
 *
 *     siblingLow  <  winner  <  loser  <  siblingHigh
 *
 * Fixture:
 *
 *   - 1 throwaway "merge frame" (the merge is between two senses on
 *     this frame), 1 throwaway "sibling frame" hosting siblingLow +
 *     siblingHigh.
 *   - 4 frame_senses: siblingLow, winner, loser, siblingHigh (in that
 *     creation order, so their ids monotonically increase).
 *   - 3 throwaway lexical_units: lu_loser_only (only on the loser),
 *     lu_shared (on BOTH winner and loser — exercises B3 dedup),
 *     lu_winner_only (control, must survive intact).
 *   - frame_sense_contrasts seeded canonically:
 *       (siblingLow, loser)      — exercises loser-in-col2 repoint
 *                                  → must become (siblingLow, winner)
 *                                    (newly inserted row).
 *       (loser, siblingHigh)     — exercises loser-in-col1 repoint
 *                                  → would become (winner, siblingHigh),
 *                                    but pre-existing row deduplicates it.
 *       (winner, siblingHigh)    — pre-existing, MUST survive intact
 *                                  with the same id.
 *       (winner, loser)          — self-contrast precursor (winner
 *                                  contrasted with the soon-to-be-gone
 *                                  loser), MUST be dropped.
 *
 * Then stages a `change_plans` row of kind `merge_sense` with one
 * child changeset (`operation='merge'`), invokes `commitPlan`, and
 * verifies:
 *
 *   - loser frame_sense gone
 *   - winner frame_sense.definition == merged_definition
 *   - lexical_unit_senses: loser's links collapsed onto winner; the
 *     pre-existing winner link is retained (no duplicate row)
 *   - frame_sense_contrasts:
 *       * (siblingLow, winner) exists exactly once (newly inserted)
 *       * (winner, siblingHigh) exists exactly once with its ORIGINAL id
 *         (pre-existing row preserved, NOT replaced)
 *       * no row references the loser any more (and no self-contrasts)
 *   - audit_log row for the loser with operation='merge'
 *   - changeset.status='committed'; plan.status='committed'
 *
 * Cleans up its own fixtures (and the staged plan/changeset rows)
 * regardless of pass/fail. Re-runs are idempotent.
 *
 * Usage: npx tsx scripts/test-commit-plan-merge-sense.ts
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { PrismaClient, Prisma } from '@prisma/client';

import { commitPlan } from '../src/lib/version-control/commit-plan';

const prisma = new PrismaClient();

const TEST_USER = 'commit-plan-merge-sense-test';
const TEST_TAG = `mergesense-test-${Date.now()}`;

interface Fixture {
  frameId: bigint;
  siblingFrameId: bigint;
  siblingLowSenseId: number;
  winnerSenseId: number;
  loserSenseId: number;
  siblingHighSenseId: number;
  luLoserOnlyId: bigint;
  luSharedId: bigint;
  luWinnerOnlyId: bigint;
  preExistingWinnerSiblingHighContrastId: number;
}

async function setupFixture(): Promise<Fixture> {
  // Bump the transaction timeout - lexical_units inserts hit a few
  // tsvector + trigger paths that can push the default 5s budget over
  // the edge on a busy DB.
  return prisma.$transaction(async (tx) => {
    const frame = await tx.frames.create({
      data: {
        label: `mergesense-test-frame-${TEST_TAG}`,
        definition: 'merge_sense smoke test frame',
        deleted: false,
      },
    });
    const siblingFrame = await tx.frames.create({
      data: {
        label: `mergesense-test-sibling-frame-${TEST_TAG}`,
        definition: 'merge_sense smoke test sibling frame',
        deleted: false,
      },
    });

    // Order of creation matters - frame_senses.id is auto-incremented
    // and the contrast check constraint requires
    // frame_sense_id < contrasted_sense_id, so we need
    // siblingLow < winner < loser < siblingHigh.
    const siblingLow = await tx.frame_senses.create({
      data: {
        pos: 'noun',
        definition: 'siblingLow definition (control, on sibling frame, smallest id)',
        frame_type: 'event',
      },
    });
    const winner = await tx.frame_senses.create({
      data: {
        pos: 'noun',
        definition: 'WINNER definition (will be overwritten by merge)',
        frame_type: 'event',
      },
    });
    const loser = await tx.frame_senses.create({
      data: {
        pos: 'noun',
        definition: 'LOSER definition (loser is to be deleted)',
        frame_type: 'event',
      },
    });
    const siblingHigh = await tx.frame_senses.create({
      data: {
        pos: 'noun',
        definition: 'siblingHigh definition (control, on sibling frame, largest id)',
        frame_type: 'event',
      },
    });

    // Sanity check: id ordering must hold for the contrast fixture
    // to satisfy the canonical-ordering CHECK constraint.
    if (!(siblingLow.id < winner.id && winner.id < loser.id && loser.id < siblingHigh.id)) {
      throw new Error(
        `id ordering violated: siblingLow=${siblingLow.id}, winner=${winner.id}, loser=${loser.id}, siblingHigh=${siblingHigh.id}. ` +
          `frame_senses sequence may have been reset out of order; rerun the test.`,
      );
    }

    await tx.frame_sense_frames.createMany({
      data: [
        { frame_sense_id: winner.id, frame_id: frame.id },
        { frame_sense_id: loser.id, frame_id: frame.id },
        { frame_sense_id: siblingLow.id, frame_id: siblingFrame.id },
        { frame_sense_id: siblingHigh.id, frame_id: siblingFrame.id },
      ],
    });

    const luLoserOnly = await tx.lexical_units.create({
      data: {
        pos: 'noun',
        code: `${TEST_TAG}-luloseronly`,
        legacy_id: `${TEST_TAG}-luloseronly-legacy`,
        lemmas: ['loser-only'],
        gloss: 'loser-only LU',
        lexfile: 'noun.test',
      },
    });
    const luShared = await tx.lexical_units.create({
      data: {
        pos: 'noun',
        code: `${TEST_TAG}-lushared`,
        legacy_id: `${TEST_TAG}-lushared-legacy`,
        lemmas: ['shared'],
        gloss: 'shared LU',
        lexfile: 'noun.test',
      },
    });
    const luWinnerOnly = await tx.lexical_units.create({
      data: {
        pos: 'noun',
        code: `${TEST_TAG}-luwinneronly`,
        legacy_id: `${TEST_TAG}-luwinneronly-legacy`,
        lemmas: ['winner-only'],
        gloss: 'winner-only LU',
        lexfile: 'noun.test',
      },
    });

    await tx.lexical_unit_senses.createMany({
      data: [
        { lexical_unit_id: luLoserOnly.id, frame_sense_id: loser.id },
        // Both senses link to the shared LU - B3 dedup must keep the
        // WINNER row and drop the LOSER one.
        { lexical_unit_id: luShared.id, frame_sense_id: loser.id },
        { lexical_unit_id: luShared.id, frame_sense_id: winner.id },
        { lexical_unit_id: luWinnerOnly.id, frame_sense_id: winner.id },
      ],
    });

    // contrast 1: (siblingLow, loser) — exercises loser-in-col2.
    //   After merge: must become (siblingLow, winner) — newly
    //   inserted, did not exist before.
    await tx.frame_sense_contrasts.create({
      data: {
        frame_sense_id: siblingLow.id,
        contrasted_sense_id: loser.id,
        contrast_text: '(siblingLow, loser) — must repoint to (siblingLow, winner) [new row]',
      },
    });

    // contrast 2: (loser, siblingHigh) — exercises loser-in-col1.
    //   After merge: would be (winner, siblingHigh) but that row
    //   already exists → must be deduplicated (pre-existing row wins).
    await tx.frame_sense_contrasts.create({
      data: {
        frame_sense_id: loser.id,
        contrasted_sense_id: siblingHigh.id,
        contrast_text: '(loser, siblingHigh) — must dedup against pre-existing (winner, siblingHigh)',
      },
    });

    // contrast 3: (winner, loser) — self-contrast precursor. After
    //   merge winner==loser, so this row must be DROPPED.
    await tx.frame_sense_contrasts.create({
      data: {
        frame_sense_id: winner.id,
        contrasted_sense_id: loser.id,
        contrast_text: '(winner, loser) — self-contrast precursor, must be DROPPED',
      },
    });

    // contrast 4: pre-existing (winner, siblingHigh) — must survive
    //   intact (same id) after the merge.
    const preExistingWinnerSiblingHigh = await tx.frame_sense_contrasts.create({
      data: {
        frame_sense_id: winner.id,
        contrasted_sense_id: siblingHigh.id,
        contrast_text: '(winner, siblingHigh) — pre-existing, must survive dedup intact',
      },
    });

    return {
      frameId: frame.id,
      siblingFrameId: siblingFrame.id,
      siblingLowSenseId: siblingLow.id,
      winnerSenseId: winner.id,
      loserSenseId: loser.id,
      siblingHighSenseId: siblingHigh.id,
      luLoserOnlyId: luLoserOnly.id,
      luSharedId: luShared.id,
      luWinnerOnlyId: luWinnerOnly.id,
      preExistingWinnerSiblingHighContrastId: preExistingWinnerSiblingHigh.id,
    };
  }, { timeout: 30_000, maxWait: 10_000 });
}

interface StagedPlan {
  planId: bigint;
  changesetId: bigint;
}

async function stageMergePlan(fx: Fixture): Promise<StagedPlan> {
  const mergedDefinition = 'MERGED definition produced by the test (replaces winner.definition)';

  return prisma.$transaction(async (tx) => {
    // Mirror the runner plan-writer's before_snapshot shape for a
    // merge changeset: loser baseline + __merge_* metadata.
    const beforeSnapshot = {
      id: String(fx.loserSenseId),
      pos: 'noun',
      definition: 'LOSER definition (loser is to be deleted)',
      frame_type: 'event',
      __merge_target_id: String(fx.winnerSenseId),
      __merge_context: { frame_id: fx.frameId.toString() },
      __merge_payload: { merged_definition: mergedDefinition },
    };

    const cs = await tx.changesets.create({
      data: {
        entity_type: 'frame_sense',
        entity_id: BigInt(fx.loserSenseId),
        operation: 'merge',
        entity_version: null,
        before_snapshot: beforeSnapshot,
        after_snapshot: undefined as unknown as object,
        created_by: TEST_USER,
        status: 'pending',
      },
    });

    const plan = await tx.change_plans.create({
      data: {
        plan_kind: 'merge_sense',
        summary: `merge_sense smoke test (${TEST_TAG})`,
        status: 'pending',
        created_by: TEST_USER,
        metadata: {
          test: TEST_TAG,
          frame_id: fx.frameId.toString(),
          winner_sense_id: fx.winnerSenseId,
          loser_sense_id: fx.loserSenseId,
          merged_definition: mergedDefinition,
        },
      },
    });

    await tx.changesets.update({
      where: { id: cs.id },
      data: { change_plan_id: plan.id },
    });

    return { planId: plan.id, changesetId: cs.id };
  });
}

async function assertPostState(fx: Fixture): Promise<string[]> {
  const failures: string[] = [];

  // 1) loser sense gone.
  const loser = await prisma.frame_senses.findUnique({
    where: { id: fx.loserSenseId },
  });
  if (loser) failures.push(`loser frame_sense #${fx.loserSenseId} should have been deleted, but still exists`);

  // 2) winner sense exists with merged definition.
  const winner = await prisma.frame_senses.findUnique({
    where: { id: fx.winnerSenseId },
  });
  if (!winner) {
    failures.push(`winner frame_sense #${fx.winnerSenseId} disappeared`);
  } else if (winner.definition !== 'MERGED definition produced by the test (replaces winner.definition)') {
    failures.push(
      `winner.definition not updated; got "${winner.definition}"`,
    );
  }

  // 3) lexical_unit_senses for the winner: loser_only + shared + winner_only,
  //    with no leftover loser pointers and exactly one row for the shared LU
  //    (no duplicate from the merge).
  const luSenses = await prisma.lexical_unit_senses.findMany({
    where: { frame_sense_id: { in: [fx.winnerSenseId, fx.loserSenseId] } },
    orderBy: { lexical_unit_id: 'asc' },
  });
  const winnerLuIds = luSenses
    .filter((r) => r.frame_sense_id === fx.winnerSenseId)
    .map((r) => r.lexical_unit_id.toString())
    .sort();
  const expectedLuIds = [fx.luLoserOnlyId, fx.luSharedId, fx.luWinnerOnlyId]
    .map((id) => id.toString())
    .sort();
  if (JSON.stringify(winnerLuIds) !== JSON.stringify(expectedLuIds)) {
    failures.push(
      `winner LU links wrong: expected ${JSON.stringify(expectedLuIds)}, got ${JSON.stringify(winnerLuIds)}`,
    );
  }
  const luSensesOnLoser = luSenses.filter((r) => r.frame_sense_id === fx.loserSenseId);
  if (luSensesOnLoser.length > 0) {
    failures.push(
      `loser still has ${luSensesOnLoser.length} lexical_unit_senses row(s); cascade or B3 logic broken`,
    );
  }

  // 4) frame_sense_frames for the winner: must include the test frame
  //    exactly once (the loser's link should have been dropped by B4
  //    dedup, NOT moved to the winner as a duplicate).
  const winnerFrames = await prisma.frame_sense_frames.findMany({
    where: { frame_sense_id: fx.winnerSenseId },
  });
  const winnerFrameIds = winnerFrames.map((r) => r.frame_id.toString()).sort();
  const expectedFrameIds = [fx.frameId.toString()].sort();
  if (JSON.stringify(winnerFrameIds) !== JSON.stringify(expectedFrameIds)) {
    failures.push(
      `winner frame links wrong: expected ${JSON.stringify(expectedFrameIds)}, got ${JSON.stringify(winnerFrameIds)}`,
    );
  }

  // 5) frame_sense_contrasts (canonical-ordering aware):
  //
  //    a) (siblingLow, winner) exists exactly once - newly inserted
  //       from the loser-in-col2 repoint
  //    b) (winner, siblingHigh) exists exactly once with its ORIGINAL
  //       id (pre-existing row preserved, NOT replaced by the
  //       loser-in-col1 repoint)
  //    c) NO row references the loser any more
  //    d) NO self-contrasts
  const siblingLowWinnerContrasts = await prisma.frame_sense_contrasts.findMany({
    where: {
      frame_sense_id: fx.siblingLowSenseId,
      contrasted_sense_id: fx.winnerSenseId,
    },
  });
  if (siblingLowWinnerContrasts.length !== 1) {
    failures.push(
      `expected exactly one (siblingLow, winner) contrast, got ${siblingLowWinnerContrasts.length}`,
    );
  }

  const winnerSiblingHighContrasts = await prisma.frame_sense_contrasts.findMany({
    where: {
      frame_sense_id: fx.winnerSenseId,
      contrasted_sense_id: fx.siblingHighSenseId,
    },
  });
  if (winnerSiblingHighContrasts.length !== 1) {
    failures.push(
      `expected exactly one (winner, siblingHigh) contrast, got ${winnerSiblingHighContrasts.length}`,
    );
  } else if (
    winnerSiblingHighContrasts[0].id !== fx.preExistingWinnerSiblingHighContrastId
  ) {
    failures.push(
      `pre-existing (winner, siblingHigh) row was replaced ` +
        `(expected id ${fx.preExistingWinnerSiblingHighContrastId}, got ${winnerSiblingHighContrasts[0].id})`,
    );
  }

  const loserResidualContrasts = await prisma.frame_sense_contrasts.findMany({
    where: {
      OR: [
        { frame_sense_id: fx.loserSenseId },
        { contrasted_sense_id: fx.loserSenseId },
      ],
    },
  });
  if (loserResidualContrasts.length > 0) {
    failures.push(
      `loser still referenced by ${loserResidualContrasts.length} contrast row(s)`,
    );
  }

  // Even though the canonical-ordering CHECK constraint forbids
  // self-contrasts at insert time, a buggy UPDATE could create one
  // in flight; verify post-state.
  const selfContrasts = await prisma.frame_sense_contrasts.findMany({
    where: {
      OR: [
        { frame_sense_id: fx.winnerSenseId, contrasted_sense_id: fx.winnerSenseId },
        { frame_sense_id: fx.loserSenseId, contrasted_sense_id: fx.loserSenseId },
      ],
    },
  });
  if (selfContrasts.length > 0) {
    failures.push(`unexpected self-contrast rows: ${JSON.stringify(selfContrasts)}`);
  }

  return failures;
}

async function teardownFixture(fx: Fixture): Promise<void> {
  // Cascade rules clean most of it up. We do explicit deletes in the
  // safest order anyway so a partial-success state never leaks rows.
  await prisma.$transaction(async (tx) => {
    const allSenseIds = [
      fx.siblingLowSenseId,
      fx.winnerSenseId,
      fx.loserSenseId,
      fx.siblingHighSenseId,
    ];
    await tx.lexical_unit_senses.deleteMany({
      where: {
        OR: [
          { lexical_unit_id: { in: [fx.luLoserOnlyId, fx.luSharedId, fx.luWinnerOnlyId] } },
          { frame_sense_id: { in: allSenseIds } },
        ],
      },
    });
    await tx.frame_sense_contrasts.deleteMany({
      where: {
        OR: [
          { frame_sense_id: { in: allSenseIds } },
          { contrasted_sense_id: { in: allSenseIds } },
        ],
      },
    });
    await tx.frame_sense_frames.deleteMany({
      where: { frame_sense_id: { in: allSenseIds } },
    });
    await tx.frame_senses.deleteMany({
      where: { id: { in: allSenseIds } },
    });
    await tx.lexical_units.deleteMany({
      where: { id: { in: [fx.luLoserOnlyId, fx.luSharedId, fx.luWinnerOnlyId] } },
    });
    await tx.frames.deleteMany({
      where: { id: { in: [fx.frameId, fx.siblingFrameId] } },
    });
  }, { timeout: 30_000, maxWait: 10_000 });
}

async function teardownStagedRows(plan: StagedPlan, fx: Fixture): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // The merge changeset's audit_log row connects via FK; null it out
    // before nuking the changeset so we don't violate the FK during
    // cleanup. (audit_log has onDelete: NoAction on the changesets FK.)
    await tx.audit_log.deleteMany({
      where: { entity_id: BigInt(fx.loserSenseId), entity_type: 'frame_sense' },
    });
    await tx.change_comments.deleteMany({ where: { changeset_id: plan.changesetId } });
    await tx.field_changes.deleteMany({ where: { changeset_id: plan.changesetId } });
    await tx.changesets.deleteMany({ where: { id: plan.changesetId } });
    await tx.change_plans.deleteMany({ where: { id: plan.planId } });
  });
}

async function main(): Promise<void> {
  console.log(`== merge_sense plan smoke test (${TEST_TAG}) ==\n`);

  let fixture: Fixture | null = null;
  let staged: StagedPlan | null = null;
  let testPassed = false;

  try {
    fixture = await setupFixture();
    console.log(
      `fixture: frame#${fixture.frameId} sibFrame#${fixture.siblingFrameId}`,
    );
    console.log(
      `  senses: siblingLow#${fixture.siblingLowSenseId} < winner#${fixture.winnerSenseId} < loser#${fixture.loserSenseId} < siblingHigh#${fixture.siblingHighSenseId}`,
    );
    console.log(
      `  LUs: only-loser#${fixture.luLoserOnlyId} shared#${fixture.luSharedId} only-winner#${fixture.luWinnerOnlyId}`,
    );

    staged = await stageMergePlan(fixture);
    console.log(`staged plan#${staged.planId} changeset#${staged.changesetId}`);

    console.log('\ncalling commitPlan(...)...');
    const result = await commitPlan(staged.planId, TEST_USER);
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

    const failures: string[] = [];
    if (!result.success) failures.push('commitPlan returned success=false');
    if (result.committed !== 1) failures.push(`expected committed=1, got ${result.committed}`);

    const planAfter = await prisma.change_plans.findUnique({
      where: { id: staged.planId },
      select: { status: true, committed_at: true, conflict_report: true },
    });
    if (!planAfter) {
      failures.push('plan disappeared');
    } else {
      if (planAfter.status !== 'committed')
        failures.push(`plan.status: expected 'committed', got '${planAfter.status}'`);
      if (planAfter.committed_at === null)
        failures.push('plan.committed_at should be set');
      if (planAfter.conflict_report !== null)
        failures.push('plan.conflict_report should be null on success');
    }

    const csAfter = await prisma.changesets.findUnique({
      where: { id: staged.changesetId },
      select: { status: true, committed_at: true },
    });
    if (csAfter && csAfter.status !== 'committed')
      failures.push(`changeset.status: expected 'committed', got '${csAfter.status}'`);

    const auditRows = await prisma.audit_log.findMany({
      where: {
        entity_type: 'frame_sense',
        entity_id: BigInt(fixture.loserSenseId),
        operation: 'merge',
      },
    });
    if (auditRows.length !== 1)
      failures.push(`expected exactly one audit_log row for the merge, got ${auditRows.length}`);

    const stateFailures = await assertPostState(fixture);
    failures.push(...stateFailures);

    if (failures.length === 0) {
      console.log('\n  PASS: merge_sense commit applied B3+B4+B5 + UPDATE + DELETE atomically');
      console.log('    - loser deleted');
      console.log('    - winner.definition updated to merged_definition');
      console.log('    - LU links collapsed and deduplicated');
      console.log('    - contrasts repointed, self-contrasts dropped, no duplicates');
      console.log('    - audit_log row written, plan + changeset committed');
      testPassed = true;
    } else {
      console.log('\n  FAIL:');
      for (const f of failures) console.log(`    - ${f}`);
    }
  } finally {
    if (staged && fixture) {
      console.log('\ncleaning up staged plan + changeset...');
      try {
        await teardownStagedRows(staged, fixture);
      } catch (e) {
        console.error(`  cleanup of staged rows failed: ${(e as Error).message}`);
      }
    }
    if (fixture) {
      console.log('cleaning up fixture frames + senses + LUs...');
      try {
        await teardownFixture(fixture);
      } catch (e) {
        console.error(`  cleanup of fixture failed: ${(e as Error).message}`);
      }
    }
    await prisma.$disconnect();
  }

  if (!testPassed) process.exit(1);
}

main().catch(async (e) => {
  console.error(e?.stack ?? e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
