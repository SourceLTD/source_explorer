/**
 * End-to-end smoke test for the `merge_frame` plan kind (Phase 5).
 *
 * Mirrors what the runner stages via `enrichMergeFramePayload` +
 * `normaliseMergeFrame` + `writeRemediationPlan`, then drives the
 * staged plan through `commitPlan` and asserts the post-state
 * matches what we'd expect after merging two source frames into a
 * pre-existing target.
 *
 * Fixture topology (all rows tagged with `${TEST_TAG}` for safe
 * teardown). Convention: in `frame_relations`, `source_id = parent`,
 * `target_id = child` for `parent_of` rows. Arrows below point from
 * parent (source_id) down to child (target_id):
 *
 *               sharedParent
 *                /    |    \
 *               v     v     v
 *           target  sourceA  sourceB
 *                       |
 *                       v
 *                      aux
 *
 *   sharedParent --[parent_of]--> target       (pre-existing; survives)
 *   sharedParent --[parent_of]--> sourceA      (DUP of pre-existing)
 *   sharedParent --[parent_of]--> sourceB      (DUP of pre-existing)
 *   sourceA      --[parent_of]--> aux          (NON-dup)
 *
 *   senseA -- on sourceA
 *   senseB -- on sourceB
 *
 * Plan staged: merge_frame target=existing(target),
 * source_frame_ids=[sourceA, sourceB], with runner-injected:
 *   - sense_repoints:        [(senseA, sourceA), (senseB, sourceB)]
 *   - relation_repoints:
 *       (sharedParent->sourceA)  delete-only (target already has it)
 *       (sharedParent->sourceB)  delete-only (same reason)
 *       (sourceA->aux)           repoint -> (target->aux)
 *   - stale_role_mapping_ids: [] (none in fixture)
 *   - per-source finalisation: deleted=true, merged_into=target
 *
 * Expected post-commit state:
 *   - sourceA, sourceB are deleted=true with merged_into=target.
 *   - senseA, senseB are linked to target via frame_sense_frames
 *     (and NOT to their old source frames).
 *   - Three frame_relations rows are gone:
 *     sharedParent->sourceA, sharedParent->sourceB, sourceA->aux.
 *   - One brand-new frame_relations row exists: target->aux
 *     (source_id=target, target_id=aux).
 *   - Pre-existing sharedParent->target row is unchanged.
 *
 * Cleans up its own fixtures (and the staged plan/changeset rows)
 * regardless of pass/fail. Re-runs are idempotent.
 *
 * Usage: npx tsx scripts/test-commit-plan-merge-frame.ts
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { PrismaClient } from '@prisma/client';

import { commitPlan } from '../src/lib/version-control/commit-plan';

const prisma = new PrismaClient();

const TEST_USER = 'commit-plan-merge-frame-test';
const TEST_TAG = `mergeframe-test-${Date.now()}`;

interface Fixture {
  targetFrameId: bigint;
  sourceAFrameId: bigint;
  sourceBFrameId: bigint;
  sharedParentId: bigint;
  auxFrameId: bigint;
  senseAId: number;
  senseBId: number;
  // Pre-existing relation that must SURVIVE the commit unchanged.
  // (sharedParent --[parent_of]--> target).
  relSharedToTargetId: bigint;
  // Three relations that must be GONE post-commit.
  relSharedToAId: bigint;
  relSharedToBId: bigint;
  relAToAuxId: bigint;
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

      const target = await ins('target');
      const sourceA = await ins('sourceA');
      const sourceB = await ins('sourceB');
      const sharedParent = await ins('sharedParent');
      const aux = await ins('aux');

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
      const senseAId = await insSense(sourceA.id, 'senseA');
      const senseBId = await insSense(sourceB.id, 'senseB');

      const insRel = async (
        sourceId: bigint,
        targetId: bigint,
        type: 'parent_of',
      ) => {
        const r = await tx.frame_relations.create({
          data: { source_id: sourceId, target_id: targetId, type },
        });
        return r.id;
      };
      // parent_of convention: source_id = parent, target_id = child.
      const relSharedToTargetId = await insRel(sharedParent.id, target.id, 'parent_of');
      const relSharedToAId = await insRel(sharedParent.id, sourceA.id, 'parent_of');
      const relSharedToBId = await insRel(sharedParent.id, sourceB.id, 'parent_of');
      const relAToAuxId = await insRel(sourceA.id, aux.id, 'parent_of');

      return {
        targetFrameId: target.id,
        sourceAFrameId: sourceA.id,
        sourceBFrameId: sourceB.id,
        sharedParentId: sharedParent.id,
        auxFrameId: aux.id,
        senseAId,
        senseBId,
        relSharedToTargetId,
        relSharedToAId,
        relSharedToBId,
        relAToAuxId,
      };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

interface StagedPlan {
  planId: bigint;
  // Tracked so teardown can null FKs and delete cleanly even on
  // partial failure.
  changesetIds: bigint[];
}

/**
 * Build the changeset graph the runner's plan-writer would emit
 * given an enriched merge_frame payload for our fixture.
 *
 * Operation breakdown (see header docstring for the topology):
 *   - update frame_sense (senseA): field_changes [frame_id null -> target]
 *   - update frame_sense (senseB): field_changes [frame_id null -> target]
 *   - delete frame_relation (relSharedToA): no field_changes (the
 *     plan-writer's `detectDelete` upgrades a single deleted-flip
 *     to operation='delete' without emitting field_changes; we
 *     mirror that here by writing operation='delete' directly).
 *   - delete frame_relation (relSharedToB): same shape
 *   - delete frame_relation (relAToAux):    same shape
 *   - create frame_relation: after_snapshot {source_id=target,
 *     target_id=aux, type='parent_of'}  (target becomes parent of aux)
 *   - update frame (sourceA): field_changes
 *     [deleted false -> true, merged_into null -> target]
 *   - update frame (sourceB): field_changes [same shape]
 *
 * All `update` field_changes are inserted with status='approved' so
 * `commitChangesetInTx` doesn't trip the
 * "No approved field changes to commit" guard. (In production the
 * runner doesn't auto-approve; the reviewer / approver flow flips
 * each field_change. For a deterministic smoke test we approve up-
 * front so we test the COMMIT semantics in isolation.)
 */
async function stageMergeFramePlan(fx: Fixture): Promise<StagedPlan> {
  return prisma.$transaction(
    async (tx) => {
      const plan = await tx.change_plans.create({
        data: {
          plan_kind: 'merge_frame',
          summary: `merge_frame smoke test (${TEST_TAG})`,
          status: 'pending',
          created_by: TEST_USER,
          metadata: {
            test: TEST_TAG,
            target_frame_id: fx.targetFrameId.toString(),
            source_frame_ids: [
              fx.sourceAFrameId.toString(),
              fx.sourceBFrameId.toString(),
            ],
          },
        },
      });
      const planId = plan.id;
      const csIds: bigint[] = [];

      // Helper: stage an UPDATE changeset + its approved field_changes.
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

      const stageDelete = async (
        entityType: 'frame_relation',
        entityId: bigint,
        beforeSnapshot: Record<string, unknown>,
      ) => {
        const cs = await tx.changesets.create({
          data: {
            entity_type: entityType,
            entity_id: entityId,
            operation: 'delete',
            entity_version: null,
            before_snapshot: beforeSnapshot,
            after_snapshot: undefined as unknown as object,
            created_by: TEST_USER,
            status: 'pending',
            change_plan_id: planId,
          },
        });
        csIds.push(cs.id);
        return cs.id;
      };

      const stageCreate = async (
        entityType: 'frame_relation',
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

      // 1+2. Sense flips. The before_snapshot mirrors the live row so
      //      the audit_log entry has both sides; new_value is a
      //      stringified bigint because that's how the runner
      //      serialises it (commit.ts coerces it back to bigint).
      await stageUpdate(
        'frame_sense',
        BigInt(fx.senseAId),
        { id: fx.senseAId, frame_id: fx.sourceAFrameId.toString() },
        [
          {
            field: 'frame_id',
            oldValue: fx.sourceAFrameId.toString(),
            newValue: fx.targetFrameId.toString(),
          },
        ],
      );
      await stageUpdate(
        'frame_sense',
        BigInt(fx.senseBId),
        { id: fx.senseBId, frame_id: fx.sourceBFrameId.toString() },
        [
          {
            field: 'frame_id',
            oldValue: fx.sourceBFrameId.toString(),
            newValue: fx.targetFrameId.toString(),
          },
        ],
      );

      // 3,4,5. Relation deletes (3 of them: 2 duplicates that
      //        collapsed to delete-only + 1 non-duplicate's old row).
      // Convention: parent_of source_id = parent, target_id = child.
      await stageDelete('frame_relation', fx.relSharedToAId, {
        id: fx.relSharedToAId.toString(),
        source_id: fx.sharedParentId.toString(),
        target_id: fx.sourceAFrameId.toString(),
        type: 'parent_of',
      });
      await stageDelete('frame_relation', fx.relSharedToBId, {
        id: fx.relSharedToBId.toString(),
        source_id: fx.sharedParentId.toString(),
        target_id: fx.sourceBFrameId.toString(),
        type: 'parent_of',
      });
      await stageDelete('frame_relation', fx.relAToAuxId, {
        id: fx.relAToAuxId.toString(),
        source_id: fx.sourceAFrameId.toString(),
        target_id: fx.auxFrameId.toString(),
        type: 'parent_of',
      });

      // 6. Relation create (the rewritten edge: target -> aux).
      //    target becomes the parent of aux after the merge.
      await stageCreate('frame_relation', {
        source_id: fx.targetFrameId.toString(),
        target_id: fx.auxFrameId.toString(),
        type: 'parent_of',
      });

      // 7+8. Per-source frame finalisation: (deleted=true,
      //      merged_into=target). Two field_changes each so the
      //      operation stays 'update' (detectDelete only matches the
      //      single-field deleted-flip).
      await stageUpdate(
        'frame',
        fx.sourceAFrameId,
        {
          id: fx.sourceAFrameId.toString(),
          deleted: false,
          merged_into: null,
        },
        [
          { field: 'deleted', oldValue: false, newValue: true },
          {
            field: 'merged_into',
            oldValue: null,
            newValue: fx.targetFrameId.toString(),
          },
        ],
      );
      await stageUpdate(
        'frame',
        fx.sourceBFrameId,
        {
          id: fx.sourceBFrameId.toString(),
          deleted: false,
          merged_into: null,
        },
        [
          { field: 'deleted', oldValue: false, newValue: true },
          {
            field: 'merged_into',
            oldValue: null,
            newValue: fx.targetFrameId.toString(),
          },
        ],
      );

      return { planId, changesetIds: csIds };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

interface AssertContext {
  failures: string[];
}

async function assertPostState(fx: Fixture, ctx: AssertContext): Promise<void> {
  // 1) Both source frames are soft-deleted with merged_into=target.
  for (const [label, srcId] of [
    ['sourceA', fx.sourceAFrameId],
    ['sourceB', fx.sourceBFrameId],
  ] as const) {
    const row = await prisma.frames.findUnique({
      where: { id: srcId as bigint },
      select: { deleted: true, merged_into: true },
    });
    if (!row) {
      ctx.failures.push(`${label} frame disappeared (expected to be soft-deleted)`);
      continue;
    }
    if (row.deleted !== true) {
      ctx.failures.push(`${label}.deleted: expected true, got ${row.deleted}`);
    }
    if (row.merged_into !== fx.targetFrameId) {
      ctx.failures.push(
        `${label}.merged_into: expected ${fx.targetFrameId.toString()}, got ${row.merged_into?.toString() ?? 'null'}`,
      );
    }
  }

  // 2) Target frame is unchanged (not deleted, no merged_into pointer).
  const target = await prisma.frames.findUnique({
    where: { id: fx.targetFrameId },
    select: { deleted: true, merged_into: true },
  });
  if (!target) {
    ctx.failures.push('target frame disappeared');
  } else {
    if (target.deleted !== false) {
      ctx.failures.push(
        `target.deleted: expected false (must NOT be deleted by merge), got ${target.deleted}`,
      );
    }
    if (target.merged_into !== null) {
      ctx.failures.push(
        `target.merged_into: expected null, got ${target.merged_into?.toString()}`,
      );
    }
  }

  // 3) Both senses now link to target (via frame_sense_frames) and
  //    NOT to their original source frames.
  for (const [label, senseId, oldFrameId] of [
    ['senseA', fx.senseAId, fx.sourceAFrameId],
    ['senseB', fx.senseBId, fx.sourceBFrameId],
  ] as const) {
    const links = await prisma.frame_sense_frames.findMany({
      where: { frame_sense_id: senseId as number },
      select: { frame_id: true },
    });
    const frameIds = links.map((l) => l.frame_id.toString()).sort();
    if (frameIds.length !== 1 || frameIds[0] !== fx.targetFrameId.toString()) {
      ctx.failures.push(
        `${label} should link to target only (${fx.targetFrameId.toString()}); got ${JSON.stringify(frameIds)}`,
      );
    }
    if (frameIds.includes((oldFrameId as bigint).toString())) {
      ctx.failures.push(
        `${label} still linked to original source frame ${(oldFrameId as bigint).toString()}`,
      );
    }
  }

  // 4) The three "expected gone" relations are gone.
  for (const [label, relId] of [
    ['sharedParent->sourceA', fx.relSharedToAId],
    ['sharedParent->sourceB', fx.relSharedToBId],
    ['sourceA->aux',          fx.relAToAuxId],
  ] as const) {
    const row = await prisma.frame_relations.findUnique({
      where: { id: relId as bigint },
      select: { id: true },
    });
    if (row) {
      ctx.failures.push(
        `${label} relation #${(relId as bigint).toString()} still exists; expected delete`,
      );
    }
  }

  // 5) Pre-existing sharedParent->target relation is unchanged
  //    (same id, same fields). Convention: source_id = parent
  //    (sharedParent), target_id = child (target).
  const preExistingSharedTarget = await prisma.frame_relations.findUnique({
    where: { id: fx.relSharedToTargetId },
  });
  if (!preExistingSharedTarget) {
    ctx.failures.push(
      `pre-existing sharedParent->target relation #${fx.relSharedToTargetId.toString()} disappeared (must survive merge)`,
    );
  } else {
    if (preExistingSharedTarget.source_id !== fx.sharedParentId) {
      ctx.failures.push(
        `sharedParent->target.source_id changed from ${fx.sharedParentId.toString()} to ${preExistingSharedTarget.source_id.toString()}`,
      );
    }
    if (preExistingSharedTarget.target_id !== fx.targetFrameId) {
      ctx.failures.push(
        `sharedParent->target.target_id changed from ${fx.targetFrameId.toString()} to ${preExistingSharedTarget.target_id.toString()}`,
      );
    }
  }

  // 6) A new target->aux relation exists exactly once.
  const targetToAux = await prisma.frame_relations.findMany({
    where: {
      source_id: fx.targetFrameId,
      target_id: fx.auxFrameId,
      type: 'parent_of',
    },
  });
  if (targetToAux.length !== 1) {
    ctx.failures.push(
      `expected exactly 1 target->aux parent_of relation; found ${targetToAux.length}`,
    );
  }

  // 7) No remaining edges should reference either source frame on
  //    either side. (Catches any relation we forgot to repoint or
  //    delete.)
  const stragglers = await prisma.frame_relations.findMany({
    where: {
      OR: [
        { source_id: { in: [fx.sourceAFrameId, fx.sourceBFrameId] } },
        { target_id: { in: [fx.sourceAFrameId, fx.sourceBFrameId] } },
      ],
    },
    select: { id: true, source_id: true, target_id: true, type: true },
  });
  if (stragglers.length > 0) {
    ctx.failures.push(
      `found ${stragglers.length} relation(s) still referencing a source frame: ` +
        stragglers
          .map(
            (r) =>
              `#${r.id.toString()} (${r.source_id.toString()} -[${r.type}]-> ${r.target_id.toString()})`,
          )
          .join(', '),
    );
  }
}

async function teardownFixture(fx: Fixture): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const frameIds = [
        fx.targetFrameId,
        fx.sourceAFrameId,
        fx.sourceBFrameId,
        fx.sharedParentId,
        fx.auxFrameId,
      ];
      // Drop ALL relations touching our synthetic frames (the merge
      // may have created new rows that have ids we don't track).
      await tx.frame_relations.deleteMany({
        where: {
          OR: [
            { source_id: { in: frameIds } },
            { target_id: { in: frameIds } },
          ],
        },
      });
      // Senses + their links.
      await tx.lexical_unit_senses.deleteMany({
        where: { frame_sense_id: { in: [fx.senseAId, fx.senseBId] } },
      });
      await tx.frame_sense_frames.deleteMany({
        where: { frame_sense_id: { in: [fx.senseAId, fx.senseBId] } },
      });
      await tx.frame_senses.deleteMany({
        where: { id: { in: [fx.senseAId, fx.senseBId] } },
      });
      // Frames last.
      await tx.frames.deleteMany({ where: { id: { in: frameIds } } });
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

async function teardownStagedRows(plan: StagedPlan, fx: Fixture): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Audit log entries the commit handler may have written.
    await tx.audit_log.deleteMany({
      where: {
        OR: [
          { entity_type: 'frame', entity_id: { in: [fx.sourceAFrameId, fx.sourceBFrameId] } },
          { entity_type: 'frame_sense', entity_id: { in: [BigInt(fx.senseAId), BigInt(fx.senseBId)] } },
          { entity_type: 'frame_relation', entity_id: { in: [fx.relSharedToAId, fx.relSharedToBId, fx.relAToAuxId] } },
        ],
      },
    });
    // Comments + field_changes are FK-cascaded from changesets in
    // some envs but not others; nuke explicitly to be safe.
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
  console.log(`== merge_frame plan smoke test (${TEST_TAG}) ==\n`);

  let fixture: Fixture | null = null;
  let staged: StagedPlan | null = null;
  let testPassed = false;

  try {
    fixture = await setupFixture();
    console.log(
      `fixture frames:\n` +
        `  target=${fixture.targetFrameId}\n` +
        `  sourceA=${fixture.sourceAFrameId}\n` +
        `  sourceB=${fixture.sourceBFrameId}\n` +
        `  sharedParent=${fixture.sharedParentId}\n` +
        `  aux=${fixture.auxFrameId}\n` +
        `  senseA=${fixture.senseAId}  senseB=${fixture.senseBId}\n` +
        `relations:\n` +
        `  shared->target  (#${fixture.relSharedToTargetId})  -- pre-existing, must survive\n` +
        `  shared->sourceA (#${fixture.relSharedToAId})    -- DUP, delete-only\n` +
        `  shared->sourceB (#${fixture.relSharedToBId})    -- DUP, delete-only\n` +
        `  sourceA->aux   (#${fixture.relAToAuxId})       -- non-dup, repoint to target->aux`,
    );

    staged = await stageMergeFramePlan(fixture);
    console.log(
      `\nstaged plan #${staged.planId} with ${staged.changesetIds.length} changesets`,
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

    await assertPostState(fixture, ctx);

    if (ctx.failures.length === 0) {
      testPassed = true;
      console.log('\n>>> ALL ASSERTIONS PASSED. merge_frame commit pipeline works end-to-end.');
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
        await teardownFixture(fixture);
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
