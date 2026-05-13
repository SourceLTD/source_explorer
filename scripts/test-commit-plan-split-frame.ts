/**
 * End-to-end smoke test for the `split_frame` plan kind.
 *
 * Mirrors what the runner stages via `enrichSplitFramePayload` +
 * `normaliseSplitFrame` + `writeRemediationPlan`, then drives the
 * staged plan through `commitPlan` and asserts the post-state
 * matches what we'd expect after splitting one source frame into
 * two new frames with senses partitioned across them.
 *
 * Phase 8 contract: new frames produced by a split are ALWAYS
 * orphans (no `parent_of` edges). Parent attachment is a separate,
 * reviewable step driven by hierarchy health checks on a later
 * run via `reparent_frame`. This test no longer exercises the
 * virtual-id resolution path for
 * `frame_relation.source_id`-against-a-placeholder; that path
 * stays covered by `test-commit-plan-atomicity.ts` (move-kind
 * DELETE+CREATE on existing frame ids).
 *
 * Fixture topology (all rows tagged with `${TEST_TAG}` for safe
 * teardown):
 *
 *           parent
 *             |
 *             | parent_of (PRE-EXISTING; survives commit)
 *             v        (source_id = parent, target_id = source)
 *           source
 *             |
 *             |- senseA (will go to result A)
 *             |- senseB (will go to result A)
 *             |- senseC (will go to result B)
 *             '- senseD (stays on source — left out of sense_ids)
 *                       ^ (only relevant if disposition=keep;
 *                          here disposition=delete so it gets
 *                          orphaned by design — Phase 4
 *                          orphan-sense check picks it up next
 *                          run)
 *
 * Plan staged: split_frame source=source, results=[
 *   { label: A, sense_ids: [senseA, senseB] },
 *   { label: B, sense_ids: [senseC] },
 * ], source_disposition='delete'
 *
 * Expected post-commit state:
 *   - source frame is soft-deleted (deleted=true).
 *   - 2 brand-new frames exist with labels A, B; both NOT
 *     deleted; both with NO `parent_of` outgoing edges (orphans
 *     by design).
 *   - senseA, senseB now link to new frame A (via
 *     frame_sense_frames; old link to source is gone).
 *   - senseC now links to new frame B.
 *   - senseD still links to source (intentional: it wasn't in
 *     the partition; this leaves a stranded link, picked up by
 *     a future health-check sweep).
 *   - The pre-existing source -> parent edge is still intact
 *     (the soft-delete cascades semantically; the edge is
 *     cleaned up by a follow-up sweep).
 *
 * Cleans up its own fixtures (and the staged plan/changeset rows)
 * regardless of pass/fail. Re-runs are idempotent.
 *
 * Usage: npx tsx scripts/test-commit-plan-split-frame.ts
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { PrismaClient } from '@prisma/client';

import { commitPlan } from '../src/lib/version-control/commit-plan';

const prisma = new PrismaClient();

const TEST_USER = 'commit-plan-split-frame-test';
const TEST_TAG = `splitframe-test-${Date.now()}`;

interface Fixture {
  sourceFrameId: bigint;
  parentFrameId: bigint;
  senseAId: number;
  senseBId: number;
  senseCId: number;
  senseDId: number;
  // Pre-existing parent --[parent_of]--> source edge (stays intact
  // post-commit). Convention: source_id = parent, target_id = child.
  relParentSourceId: bigint;
}

async function setupFixture(): Promise<Fixture> {
  return prisma.$transaction(
    async (tx) => {
      const ins = (label: string) =>
        tx.frames.create({
          data: {
            label: `${TEST_TAG}-${label}`,
            definition: `${TEST_TAG} synthetic frame (${label})`,
            deleted: false,
            disable_healthcheck: true,
          },
        });

      const source = await ins('source');
      const parent = await ins('parent');

      const insSense = async (frameId: bigint, label: string) => {
        const sense = await tx.frame_senses.create({
          data: {
            pos: 'noun',
            definition: `${TEST_TAG} synthetic sense (${label})`,
            frame_type: 'event',
          },
        });
        await tx.frame_sense_frames.create({
          data: { frame_sense_id: sense.id, frame_id: frameId },
        });
        return sense.id;
      };
      const senseAId = await insSense(source.id, 'senseA');
      const senseBId = await insSense(source.id, 'senseB');
      const senseCId = await insSense(source.id, 'senseC');
      const senseDId = await insSense(source.id, 'senseD');

      // Convention: parent_of source_id = parent, target_id = child.
      const rel = await tx.frame_relations.create({
        data: {
          source_id: parent.id,
          target_id: source.id,
          type: 'parent_of',
        },
      });

      return {
        sourceFrameId: source.id,
        parentFrameId: parent.id,
        senseAId,
        senseBId,
        senseCId,
        senseDId,
        relParentSourceId: rel.id,
      };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

interface StagedPlan {
  planId: bigint;
  changesetIds: bigint[];
  /**
   * Tracked separately so the assert phase can find the brand-
   * new frame ids (created via virtual-id resolution in
   * commit.ts) by looking at each CREATE changeset's resolved
   * `entity_id` after commit.
   */
  resultACreateChangesetId: bigint;
  resultBCreateChangesetId: bigint;
}

/**
 * Build the changeset graph the runner's plan-writer would emit
 * for a split_frame plan with two results.
 *
 * Op order (mirrors `normaliseSplitFrame`):
 *   1. update frame  (source soft-delete; field_changes [deleted])
 *   2. create frame  (result A; placeholder=-1)
 *   3. update frame_sense (senseA -> result A placeholder)
 *   4. update frame_sense (senseB -> result A placeholder)
 *   5. create frame  (result B; placeholder=-N for next changeset)
 *   6. update frame_sense (senseC -> result B placeholder)
 *
 * Phase 8: NO `frame_relation` CREATEs are staged. New frames are
 * orphans by design; parent attachment is a separate step driven
 * by hierarchy checks on a later run.
 *
 * After CREATE changesets land, their `entity_id` is the real
 * row id; the explorer's virtual-id resolver maps `-N` to
 * "create changeset id N" and substitutes its entity_id. So
 * we MUST set the placeholder ids to `-CHANGESET_ID` of the
 * matching CREATE row. We do that by creating each CREATE row
 * first, then computing `-changeset.id` and using that as the
 * placeholder for downstream FK fields.
 *
 * That's exactly what `normaliseSplitFrame` does in the runner
 * (placeholder counter starts at -1 and decrements per emitted
 * op, and the plan-writer assigns changeset ids in INSERTION
 * order so `placeholder == -insertion_order`). We replicate the
 * same trick here using the actual changeset.id that Prisma
 * returns for each row.
 *
 * All `update` field_changes are inserted with status='approved'.
 */
async function stageSplitFramePlan(fx: Fixture): Promise<StagedPlan> {
  return prisma.$transaction(
    async (tx) => {
      const plan = await tx.change_plans.create({
        data: {
          plan_kind: 'split_frame',
          summary: `split_frame smoke test (${TEST_TAG})`,
          status: 'pending',
          created_by: TEST_USER,
          metadata: {
            test: TEST_TAG,
            source_frame_id: fx.sourceFrameId.toString(),
          },
        },
      });
      const planId = plan.id;
      const csIds: bigint[] = [];

      // Helpers (mirror the merge_frame smoke test).
      const stageUpdate = async (
        entityType: 'frame_sense' | 'frame',
        entityId: bigint,
        beforeSnapshot: Record<string, unknown>,
        fieldChanges: Array<{ field: string; oldValue: unknown; newValue: unknown }>,
      ) => {
        const cs = await tx.changesets.create({
          data: {
            entity_type: entityType,
            entity_id: entityId,
            operation: 'update',
            entity_version: null,
            before_snapshot: beforeSnapshot,
            after_snapshot: undefined as unknown as object,
            created_by: TEST_USER,
            status: 'pending',
            change_plan_id: planId,
          },
        });
        for (const fc of fieldChanges) {
          await tx.field_changes.create({
            data: {
              changeset_id: cs.id,
              field_name: fc.field,
              old_value: fc.oldValue as object,
              new_value: fc.newValue as object,
              status: 'approved',
            },
          });
        }
        csIds.push(cs.id);
        return cs.id;
      };
      const stageCreate = async (
        entityType: 'frame',
        afterSnapshot: Record<string, unknown>,
      ) => {
        const cs = await tx.changesets.create({
          data: {
            entity_type: entityType,
            entity_id: null,
            operation: 'create',
            entity_version: null,
            before_snapshot: undefined as unknown as object,
            after_snapshot: afterSnapshot,
            created_by: TEST_USER,
            status: 'pending',
            change_plan_id: planId,
          },
        });
        csIds.push(cs.id);
        return cs.id;
      };

      // 1. Source soft-delete.
      await stageUpdate(
        'frame',
        fx.sourceFrameId,
        { id: fx.sourceFrameId.toString(), deleted: false },
        [{ field: 'deleted', oldValue: false, newValue: true }],
      );

      // 2. Result A frame CREATE. Capture its changeset id so
      //    downstream sense flips and parent_of CREATE can
      //    reference its negative-placeholder form.
      const resultACreateId = await stageCreate('frame', {
        label: `${TEST_TAG}-resultA`,
        definition: `${TEST_TAG} result A (split from source)`,
      });
      const resultAPlaceholder = `-${resultACreateId.toString()}`;

      // 3+4. Sense flips to result A.
      await stageUpdate(
        'frame_sense',
        BigInt(fx.senseAId),
        { id: fx.senseAId, frame_id: fx.sourceFrameId.toString() },
        [
          {
            field: 'frame_id',
            oldValue: fx.sourceFrameId.toString(),
            newValue: resultAPlaceholder,
          },
        ],
      );
      await stageUpdate(
        'frame_sense',
        BigInt(fx.senseBId),
        { id: fx.senseBId, frame_id: fx.sourceFrameId.toString() },
        [
          {
            field: 'frame_id',
            oldValue: fx.sourceFrameId.toString(),
            newValue: resultAPlaceholder,
          },
        ],
      );

      // 5. Result B frame CREATE. (Phase 8: no parent_of edge
      //    between steps 4 and 5; new frames are orphans.)
      const resultBCreateId = await stageCreate('frame', {
        label: `${TEST_TAG}-resultB`,
        definition: `${TEST_TAG} result B (split from source)`,
      });
      const resultBPlaceholder = `-${resultBCreateId.toString()}`;

      // 6. Sense flip to result B.
      await stageUpdate(
        'frame_sense',
        BigInt(fx.senseCId),
        { id: fx.senseCId, frame_id: fx.sourceFrameId.toString() },
        [
          {
            field: 'frame_id',
            oldValue: fx.sourceFrameId.toString(),
            newValue: resultBPlaceholder,
          },
        ],
      );

      return {
        planId,
        changesetIds: csIds,
        resultACreateChangesetId: resultACreateId,
        resultBCreateChangesetId: resultBCreateId,
      };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

interface AssertContext {
  failures: string[];
}

async function assertPostState(
  fx: Fixture,
  staged: StagedPlan,
  ctx: AssertContext,
): Promise<{ resultAFrameId: bigint | null; resultBFrameId: bigint | null }> {
  // 1) Source frame is soft-deleted.
  const source = await prisma.frames.findUnique({
    where: { id: fx.sourceFrameId },
    select: { deleted: true },
  });
  if (!source) {
    ctx.failures.push('source frame disappeared (expected to be soft-deleted)');
  } else if (source.deleted !== true) {
    ctx.failures.push(`source.deleted: expected true, got ${source.deleted}`);
  }

  // 2) Look up the new frames via their CREATE changeset's
  //    `entity_id` (set by commit.ts when the row landed).
  const aCs = await prisma.changesets.findUnique({
    where: { id: staged.resultACreateChangesetId },
    select: { entity_id: true, status: true },
  });
  const bCs = await prisma.changesets.findUnique({
    where: { id: staged.resultBCreateChangesetId },
    select: { entity_id: true, status: true },
  });
  if (!aCs || aCs.status !== 'committed' || aCs.entity_id === null) {
    ctx.failures.push(
      `result A frame CREATE changeset #${staged.resultACreateChangesetId} not committed`,
    );
  }
  if (!bCs || bCs.status !== 'committed' || bCs.entity_id === null) {
    ctx.failures.push(
      `result B frame CREATE changeset #${staged.resultBCreateChangesetId} not committed`,
    );
  }
  const resultAFrameId = aCs?.entity_id ?? null;
  const resultBFrameId = bCs?.entity_id ?? null;

  // 3) New frames exist + not deleted + correct labels.
  if (resultAFrameId !== null) {
    const resultA = await prisma.frames.findUnique({
      where: { id: resultAFrameId },
      select: { deleted: true, label: true },
    });
    if (!resultA) {
      ctx.failures.push(`result A frame #${resultAFrameId} should exist post-commit`);
    } else {
      if (resultA.deleted !== false) {
        ctx.failures.push(`result A.deleted: expected false, got ${resultA.deleted}`);
      }
      if (resultA.label !== `${TEST_TAG}-resultA`) {
        ctx.failures.push(`result A.label mismatch: ${resultA.label}`);
      }
    }
  }
  if (resultBFrameId !== null) {
    const resultB = await prisma.frames.findUnique({
      where: { id: resultBFrameId },
      select: { deleted: true, label: true },
    });
    if (!resultB) {
      ctx.failures.push(`result B frame #${resultBFrameId} should exist post-commit`);
    } else {
      if (resultB.deleted !== false) {
        ctx.failures.push(`result B.deleted: expected false, got ${resultB.deleted}`);
      }
      if (resultB.label !== `${TEST_TAG}-resultB`) {
        ctx.failures.push(`result B.label mismatch: ${resultB.label}`);
      }
    }
  }

  // 4) Sense links: senseA, senseB -> result A; senseC -> result B.
  if (resultAFrameId !== null) {
    for (const senseId of [fx.senseAId, fx.senseBId]) {
      const links = await prisma.frame_sense_frames.findMany({
        where: { frame_sense_id: senseId },
        select: { frame_id: true },
      });
      const frameIds = links.map((l) => l.frame_id.toString()).sort();
      if (frameIds.length !== 1 || frameIds[0] !== resultAFrameId.toString()) {
        ctx.failures.push(
          `sense#${senseId} should link to result A only (${resultAFrameId.toString()}); got ${JSON.stringify(frameIds)}`,
        );
      }
    }
  }
  if (resultBFrameId !== null) {
    const links = await prisma.frame_sense_frames.findMany({
      where: { frame_sense_id: fx.senseCId },
      select: { frame_id: true },
    });
    const frameIds = links.map((l) => l.frame_id.toString()).sort();
    if (frameIds.length !== 1 || frameIds[0] !== resultBFrameId.toString()) {
      ctx.failures.push(
        `senseC should link to result B only (${resultBFrameId.toString()}); got ${JSON.stringify(frameIds)}`,
      );
    }
  }

  // 5) senseD is still linked to the source (we intentionally
  //    left it out of the partition).
  const senseDLinks = await prisma.frame_sense_frames.findMany({
    where: { frame_sense_id: fx.senseDId },
    select: { frame_id: true },
  });
  const senseDFrameIds = senseDLinks.map((l) => l.frame_id.toString());
  if (
    senseDFrameIds.length !== 1 ||
    senseDFrameIds[0] !== fx.sourceFrameId.toString()
  ) {
    ctx.failures.push(
      `senseD should still link to source (#${fx.sourceFrameId.toString()}); got ${JSON.stringify(senseDFrameIds)}`,
    );
  }

  // 6) Phase 8: new frames are orphans. Neither result A nor
  //    result B may have any outgoing `parent_of` (or any other
  //    type) frame_relations. Parent attachment is a separate
  //    review step driven by hierarchy health checks on a later
  //    run.
  if (resultAFrameId !== null && resultBFrameId !== null) {
    const newEdges = await prisma.frame_relations.findMany({
      where: {
        OR: [
          { source_id: { in: [resultAFrameId, resultBFrameId] } },
          { target_id: { in: [resultAFrameId, resultBFrameId] } },
        ],
      },
    });
    if (newEdges.length !== 0) {
      const detail = newEdges
        .map((e) => `#${e.id}(${e.source_id}->${e.target_id} ${e.type})`)
        .join(', ');
      ctx.failures.push(
        `Phase 8: expected 0 frame_relations touching the new result frames ` +
          `(orphan by design); found ${newEdges.length}: ${detail}`,
      );
    }
  }

  // 7) Pre-existing parent -> source relation still exists (we
  //    don't repoint or delete it; the source's soft-delete just
  //    leaves the edge pointing at a tombstone, which subsequent
  //    health-check sweeps will clean up).
  const oldEdge = await prisma.frame_relations.findUnique({
    where: { id: fx.relParentSourceId },
  });
  if (!oldEdge) {
    ctx.failures.push(
      `pre-existing parent->source relation #${fx.relParentSourceId} disappeared`,
    );
  }

  return { resultAFrameId, resultBFrameId };
}

async function teardownFixture(
  fx: Fixture,
  newFrameIds: { resultAFrameId: bigint | null; resultBFrameId: bigint | null },
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const allFrameIds = [
        fx.sourceFrameId,
        fx.parentFrameId,
        ...(newFrameIds.resultAFrameId !== null ? [newFrameIds.resultAFrameId] : []),
        ...(newFrameIds.resultBFrameId !== null ? [newFrameIds.resultBFrameId] : []),
      ];
      const allSenseIds = [fx.senseAId, fx.senseBId, fx.senseCId, fx.senseDId];
      // Drop relations (any direction).
      await tx.frame_relations.deleteMany({
        where: {
          OR: [
            { source_id: { in: allFrameIds } },
            { target_id: { in: allFrameIds } },
          ],
        },
      });
      await tx.lexical_unit_senses.deleteMany({
        where: { frame_sense_id: { in: allSenseIds } },
      });
      await tx.frame_sense_frames.deleteMany({
        where: { frame_sense_id: { in: allSenseIds } },
      });
      await tx.frame_senses.deleteMany({
        where: { id: { in: allSenseIds } },
      });
      await tx.frames.deleteMany({ where: { id: { in: allFrameIds } } });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

async function teardownStagedRows(plan: StagedPlan, fx: Fixture): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.audit_log.deleteMany({
      where: {
        OR: [
          { entity_type: 'frame', entity_id: fx.sourceFrameId },
          { entity_type: 'frame_sense', entity_id: { in: [BigInt(fx.senseAId), BigInt(fx.senseBId), BigInt(fx.senseCId)] } },
        ],
      },
    });
    await tx.change_comments.deleteMany({
      where: { changeset_id: { in: plan.changesetIds } },
    });
    await tx.field_changes.deleteMany({
      where: { changeset_id: { in: plan.changesetIds } },
    });
    await tx.changesets.deleteMany({
      where: { id: { in: plan.changesetIds } },
    });
    await tx.change_plans.deleteMany({ where: { id: plan.planId } });
  });
}

async function main(): Promise<void> {
  console.log(`== split_frame plan smoke test (${TEST_TAG}) ==\n`);

  let fixture: Fixture | null = null;
  let staged: StagedPlan | null = null;
  let testPassed = false;
  let newFrames: { resultAFrameId: bigint | null; resultBFrameId: bigint | null } = {
    resultAFrameId: null,
    resultBFrameId: null,
  };

  try {
    fixture = await setupFixture();
    console.log(
      `fixture frames:\n` +
        `  source=${fixture.sourceFrameId}  parent=${fixture.parentFrameId}\n` +
        `senses (all on source):\n` +
        `  senseA=${fixture.senseAId} senseB=${fixture.senseBId} ` +
        `senseC=${fixture.senseCId} senseD=${fixture.senseDId} (intentionally orphaned)\n` +
        `relation:\n` +
        `  parent->source (#${fixture.relParentSourceId}) -- pre-existing, must survive`,
    );

    staged = await stageSplitFramePlan(fixture);
    console.log(
      `\nstaged plan #${staged.planId} with ${staged.changesetIds.length} changesets ` +
        `(result A create=${staged.resultACreateChangesetId}, result B create=${staged.resultBCreateChangesetId})`,
    );

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

    const ctx: AssertContext = { failures: [] };
    if (!result.success) ctx.failures.push('commitPlan returned success=false');
    if (result.committed !== staged.changesetIds.length) {
      ctx.failures.push(
        `expected committed=${staged.changesetIds.length}, got ${result.committed}`,
      );
    }

    const planAfter = await prisma.change_plans.findUnique({
      where: { id: staged.planId },
      select: { status: true, committed_at: true, conflict_report: true },
    });
    if (!planAfter) {
      ctx.failures.push('plan disappeared');
    } else {
      if (planAfter.status !== 'committed')
        ctx.failures.push(
          `plan.status: expected 'committed', got '${planAfter.status}'`,
        );
      if (planAfter.committed_at === null)
        ctx.failures.push('plan.committed_at should be set');
      if (planAfter.conflict_report !== null)
        ctx.failures.push('plan.conflict_report should be null on success');
    }

    newFrames = await assertPostState(fixture, staged, ctx);

    if (ctx.failures.length === 0) {
      testPassed = true;
      console.log(
        '\n>>> ALL ASSERTIONS PASSED. split_frame commit pipeline works end-to-end ' +
          '(source soft-delete + 2 frame CREATEs + sense flips with ' +
          'virtual-id resolution; Phase 8: NO parent_of CREATEs).',
      );
    } else {
      console.log('\n!!! FAILURES:');
      for (const f of ctx.failures) console.log(`  - ${f}`);
    }
  } catch (e) {
    console.error('!!! UNEXPECTED ERROR:', (e as Error).message);
    console.error((e as Error).stack);
  } finally {
    console.log('\n=== teardown ===');
    if (staged) {
      try {
        await teardownStagedRows(staged, fixture!);
        console.log('  staged rows deleted');
      } catch (te) {
        console.error('  staged-rows teardown FAILED:', (te as Error).message);
      }
    }
    if (fixture) {
      try {
        await teardownFixture(fixture, newFrames);
        console.log('  fixture deleted');
      } catch (te) {
        console.error('  fixture teardown FAILED:', (te as Error).message);
      }
    }
    await prisma.$disconnect();
  }

  process.exit(testPassed ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
