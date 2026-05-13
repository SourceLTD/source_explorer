/**
 * Version Control - Commit Utilities
 * 
 * Functions for committing approved changes to the main database tables.
 * Includes version conflict detection and audit logging.
 */

import { prisma } from '@/lib/prisma';
import { Prisma, part_of_speech } from '@prisma/client';

const PART_OF_SPEECH_VALUES = new Set<string>(Object.values(part_of_speech));
import {
  ChangesetWithFieldChanges,
  CommitResult,
  CommitError,
  isLexicalUnitType,
} from './types';
import { getChangeset, createChangesetFromUpdate } from './create';
import { addComment } from './comments';
import { setRowHistoryContext } from './rowHistoryContext';
import {
  applyFrameRolesSubChanges,
  isFrameRolesFieldName,
  type NormalizedFrameRole,
} from './frameRolesSubfields';
import {
  isSensesFieldName,
  parseSensesExistsFieldName,
} from './sensesSubfields';

// Convert camelCase field names to snake_case for Prisma
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// No bidirectional relation pairs - parent_of is unidirectional
// (child_of relations are created as inverse but not auto-managed)
export const INVERSE_RELATION_TYPE: Record<string, string> = {};

function toBigIntSafe(v: unknown): bigint | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v);
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
  }
  return null;
}

/**
 * Resolve a v2 plan placeholder id (negative bigint encoded as a
 * string like "-1", "-2", ...) to the real entity id of the
 * matching CREATE changeset. The convention is:
 *
 *   placeholder_id  =  -create_changeset_id
 *
 * The runner's plan-writer emits CREATE changesets in insertion
 * order, then references them in subsequent ops via
 * `negative_id = -changeset.id`. At commit time we look the
 * changeset up and substitute its real `entity_id` (which is set
 * by `commitCreateInTx` when the row is INSERTed).
 *
 * Used by:
 *   - Phase 5 `merge_frame`     (frame_sense.frame_id, frame.merged_into)
 *   - Phase 6 `split_frame`     (frame_sense.frame_id, frame_relation.{source_id,target_id})
 *   - Future plan kinds with cross-changeset FK references.
 *
 * Returns the resolved bigint, OR throws if the referenced CREATE
 * isn't committed yet (which means the plan ordering is wrong, or
 * the create failed).
 */
async function resolveVirtualOrBigInt(
  tx: Prisma.TransactionClient,
  raw: unknown,
  contextLabel: string,
): Promise<bigint | null> {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'bigint') return raw;
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    if (raw < 0) {
      return resolveVirtualOrBigInt(tx, raw.toString(), contextLabel);
    }
    return BigInt(raw);
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  if (/^-\d+$/.test(trimmed)) {
    const virtualId = BigInt(trimmed);
    const createChangesetId = -virtualId;
    const createChangeset = await tx.changesets.findUnique({
      where: { id: createChangesetId },
      select: { id: true, entity_id: true, operation: true, status: true },
    });
    if (
      !createChangeset ||
      createChangeset.operation !== 'create' ||
      createChangeset.status !== 'committed' ||
      createChangeset.entity_id === null
    ) {
      throw new Error(
        `Unable to resolve virtual ID ${trimmed} on ${contextLabel} ` +
          `(create changeset ${createChangesetId.toString()} not committed)`,
      );
    }
    return createChangeset.entity_id;
  }

  if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
  return null;
}

// ============================================
// Commit Single Changeset
// ============================================

/**
 * Commit a single changeset, applying approved field changes to the main table.
 *
 * This function:
 * 1. Validates that the entity version hasn't changed (conflict detection)
 * 2. Applies all approved field changes
 * 3. Creates audit log entries
 * 4. Marks the changeset as committed
 *
 * Wraps `commitChangesetInTx` in its own `prisma.$transaction` so the
 * caller doesn't need an outer one. For plan-level atomic commits use
 * `commitChangesetInTx` directly inside `prisma.$transaction(...)`.
 *
 * @param changesetId - The ID of the changeset to commit
 * @param committedBy - The user committing the changes
 * @returns The result of the commit operation
 */
export async function commitChangeset(
  changesetId: bigint,
  committedBy: string
): Promise<CommitResult> {
  // For lexical_unit DELETE we still need the pre-flight hyponym
  // reassignment, which historically ran outside the transaction. Keep
  // that behaviour for the standalone path.
  const preCheck = await prisma.changesets.findUnique({
    where: { id: changesetId },
    select: { entity_type: true, operation: true, entity_id: true, status: true },
  });
  if (
    preCheck &&
    preCheck.status === 'pending' &&
    preCheck.operation === 'delete' &&
    isLexicalUnitType(preCheck.entity_type) &&
    preCheck.entity_id !== null
  ) {
    // Build the synthetic changeset shape needed by the helper.
    await handleLexicalUnitDeletionHyponymReassignment(
      {
        id: changesetId,
        entity_type: preCheck.entity_type,
        entity_id: preCheck.entity_id,
      } as ChangesetWithFieldChanges,
      committedBy,
    );
  }

  try {
    return await prisma.$transaction(
      async (tx) => commitChangesetInTx(tx, changesetId, committedBy),
      // 30s mirrors `commitPlan`'s budget so a standalone merge
      // changeset (which can touch many link rows) doesn't exhaust
      // the default 5s window. maxWait keeps connection-acquisition
      // generous enough that contention doesn't cause spurious
      // ConnectorError.
      { timeout: 30_000, maxWait: 10_000 },
    );
  } catch (error) {
    return {
      success: false,
      committed_count: 0,
      skipped_count: 0,
      errors: [{
        changeset_id: changesetId,
        entity_type: (preCheck?.entity_type ?? 'lexical_unit') as CommitError['entity_type'],
        entity_id: preCheck?.entity_id ?? null,
        error: error instanceof Error ? error.message : 'Unknown error',
      }],
    };
  }
}

/**
 * Tx-aware variant of `commitChangeset`. Use this from inside an outer
 * `prisma.$transaction` (e.g. `commitPlan`) so that all per-changeset
 * writes share one atomic unit-of-work.
 *
 * Errors thrown here propagate out of the outer transaction, rolling
 * back every prior write. Callers convert thrown errors into the
 * `CommitResult` shape themselves; this function NEVER catches a thrown
 * error and returns a failure result, because doing so would silently
 * commit the outer transaction.
 *
 * Limitation: this path does not run the lexical_unit pre-deletion
 * hyponym reassignment. Plans containing a lexical_unit DELETE must
 * either (a) be flagged for serial commit via the standalone
 * `commitChangeset`, or (b) extend this function to perform the
 * reassignment inside `tx` (currently unused - none of the v2 plan
 * kinds delete lexical_units).
 */
export async function commitChangesetInTx(
  tx: Prisma.TransactionClient,
  changesetId: bigint,
  committedBy: string,
): Promise<CommitResult> {
  const changeset = await getChangesetInTx(tx, changesetId);

  if (!changeset) {
    throw new Error(`Changeset not found: ${changesetId.toString()}`);
  }

  if (changeset.status !== 'pending') {
    throw new Error(`Changeset is already ${changeset.status}`);
  }

  const approvedChanges = changeset.field_changes.filter(fc => fc.status === 'approved');

  if (approvedChanges.length === 0 && changeset.operation === 'update') {
    throw new Error(
      `No approved field changes to commit on changeset ${changesetId.toString()}`,
    );
  }

  if (
    changeset.operation === 'delete' &&
    isLexicalUnitType(changeset.entity_type)
  ) {
    // The hyponym reassignment helper writes new pending changesets,
    // which must happen outside this transaction (otherwise the new
    // changesets and their comments roll back if the plan fails). For
    // the planner-driven path we deliberately reject this case rather
    // than silently dropping reassignment.
    throw new Error(
      `commitChangesetInTx does not support lexical_unit DELETE (changeset ${changesetId.toString()}); use commitChangeset standalone or extend to handle hyponym reassignment.`,
    );
  }

  switch (changeset.operation) {
    case 'create':
      return await commitCreateInTx(tx, changeset, committedBy);
    case 'update':
      return await commitUpdateInTx(tx, changeset, approvedChanges, committedBy);
    case 'delete':
      return await commitDeleteInTx(tx, changeset, committedBy);
    case 'merge':
      return await commitMergeInTx(tx, changeset, committedBy);
    default:
      throw new Error(`Unknown operation: ${changeset.operation}`);
  }
}

async function getChangesetInTx(
  tx: Prisma.TransactionClient,
  id: bigint,
): Promise<ChangesetWithFieldChanges | null> {
  const result = await tx.changesets.findUnique({
    where: { id },
    include: { field_changes: true },
  });
  if (!result) return null;
  return {
    id: result.id,
    entity_type: result.entity_type as ChangesetWithFieldChanges['entity_type'],
    entity_id: result.entity_id,
    operation: result.operation as ChangesetWithFieldChanges['operation'],
    entity_version: result.entity_version,
    before_snapshot: result.before_snapshot as Record<string, unknown> | null,
    after_snapshot: result.after_snapshot as Record<string, unknown> | null,
    status: result.status,
    created_by: result.created_by,
    created_at: result.created_at,
    reviewed_by: result.reviewed_by,
    reviewed_at: result.reviewed_at,
    committed_at: result.committed_at,
    llm_job_id: result.llm_job_id,
    field_changes: result.field_changes.map((fc) => ({
      id: fc.id,
      changeset_id: fc.changeset_id,
      field_name: fc.field_name,
      old_value: fc.old_value as ChangesetWithFieldChanges['field_changes'][number]['old_value'],
      new_value: fc.new_value as ChangesetWithFieldChanges['field_changes'][number]['new_value'],
      status: fc.status,
      approved_by: fc.approved_by,
      approved_at: fc.approved_at,
      rejected_by: fc.rejected_by,
      rejected_at: fc.rejected_at,
    })),
  };
}

// ============================================
// Commit Operations by Type
// ============================================

async function commitCreate(
  changeset: ChangesetWithFieldChanges,
  committedBy: string
): Promise<CommitResult> {
  return await prisma.$transaction(async (tx) =>
    commitCreateInTx(tx, changeset, committedBy),
  );
}

async function commitCreateInTx(
  tx: Prisma.TransactionClient,
  changeset: ChangesetWithFieldChanges,
  committedBy: string,
): Promise<CommitResult> {
  if (!changeset.after_snapshot) {
    throw new Error(
      `No after_snapshot for CREATE operation on changeset ${changeset.id.toString()}`,
    );
  }

  await setRowHistoryContext(tx, {
    userId: committedBy,
    changesetId: changeset.id,
  });

  const entityData = changeset.after_snapshot!;
    let newEntityId: bigint;
    
    if (isLexicalUnitType(changeset.entity_type)) {
      const lu = await tx.lexical_units.create({
        data: entityData as Prisma.lexical_unitsCreateInput,
      });
      newEntityId = lu.id;
    } else if (changeset.entity_type === 'frame') {
      // Support optional `frame_roles` in after_snapshot for CREATE operations.
      // This is used by AI split jobs (and some MCP tooling) to propose roles for new frames.
      const frameData: Record<string, unknown> = { ...(entityData as Record<string, unknown>) };
      const frameRolesRaw = (frameData as { frame_roles?: unknown }).frame_roles;
      delete (frameData as { frame_roles?: unknown }).frame_roles;

      const frame = await tx.frames.create({
        data: frameData as Prisma.framesCreateInput,
      });
      newEntityId = frame.id;

      if (Array.isArray(frameRolesRaw) && frameRolesRaw.length > 0) {
        const roles = frameRolesRaw as Array<Record<string, unknown>>;

        const createManyData: Prisma.frame_rolesCreateManyInput[] = [];
        const seenLabels = new Set<string>();

        for (const role of roles) {
          const label = typeof role.label === 'string' ? role.label
            : typeof role.role_type_code === 'string' ? role.role_type_code
            : typeof role.roleType === 'string' ? role.roleType
            : null;

          if (!label) {
            throw new Error(
              `CREATE frame_roles failed: no label provided for role`
            );
          }

          if (seenLabels.has(label)) {
            throw new Error(`CREATE frame_roles failed: duplicate label for new frame ("${label}")`);
          }
          seenLabels.add(label);

          createManyData.push({
            frame_id: frame.id,
            description: (role.description as string) ?? null,
            notes: (role.notes as string) ?? null,
            main: (role.main as boolean) ?? false,
            examples: (Array.isArray(role.examples) ? (role.examples as string[]) : []),
            label,
          });
        }

        if (createManyData.length > 0) {
          await tx.frame_roles.createMany({
            data: createManyData,
            skipDuplicates: false,
          });
        }
      }
    } else if (changeset.entity_type === 'frame_sense') {
      // CREATE frame_sense:
      //   after_snapshot = { pos, definition, frame_type, [confidence], [type_dispute],
      //                      [causative], [inchoative], [perspectival],
      //                      frame_id, [lexical_unit_ids] }
      const senseData = entityData as Record<string, unknown>;
      const pos = typeof senseData.pos === 'string' ? senseData.pos : null;
      const definition = typeof senseData.definition === 'string' ? senseData.definition : null;
      const frameType = typeof senseData.frame_type === 'string' ? senseData.frame_type : null;
      const frameIdRaw = senseData.frame_id;
      if (!pos || !definition || !frameType) {
        throw new Error('CREATE frame_sense requires pos, definition, frame_type');
      }
      if (!PART_OF_SPEECH_VALUES.has(pos)) {
        // `frame_senses.pos` is the `part_of_speech` enum
        // (`verb | noun | adjective | adverb`) after the standardization
        // migration. Reject anything else loudly so a stale runner /
        // upstream producer can't silently corrupt the column.
        throw new Error(
          `CREATE frame_sense: pos must be one of ${Object.values(part_of_speech).join(', ')}; got "${pos}"`,
        );
      }
      if (frameIdRaw === undefined || frameIdRaw === null) {
        throw new Error('CREATE frame_sense requires frame_id (senses anchor to exactly one frame)');
      }
      const frameId = toBigIntSafe(frameIdRaw);
      if (!frameId) {
        throw new Error(`CREATE frame_sense: invalid frame_id (${String(frameIdRaw)})`);
      }
      const luIdsRaw = Array.isArray(senseData.lexical_unit_ids) ? senseData.lexical_unit_ids : [];
      const luIds: bigint[] = [];
      for (const v of luIdsRaw) {
        const b = toBigIntSafe(v);
        if (b) luIds.push(b);
      }

      const sense = await tx.frame_senses.create({
        data: {
          pos: pos as part_of_speech,
          definition,
          frame_type: frameType,
          confidence: (senseData.confidence as string | null | undefined) ?? null,
          type_dispute: (senseData.type_dispute as string | null | undefined) ?? null,
          causative: (senseData.causative as boolean | null | undefined) ?? null,
          inchoative: (senseData.inchoative as boolean | null | undefined) ?? null,
          perspectival: (senseData.perspectival as boolean | null | undefined) ?? null,
        },
      });
      await tx.frame_sense_frames.create({
        data: { frame_sense_id: sense.id, frame_id: frameId },
      });
      if (luIds.length > 0) {
        await tx.lexical_unit_senses.createMany({
          data: luIds.map(lu => ({ lexical_unit_id: lu, frame_sense_id: sense.id })),
          skipDuplicates: true,
        });
      }
      // frame_senses.id is Int, but audit_log.entity_id is BigInt. Safe to cast.
      newEntityId = BigInt(sense.id);
    } else if (changeset.entity_type === 'frame_relation') {
      const relData = entityData as Record<string, unknown>;
      // V2 plan source_id / target_id may be placeholder strings
      // (e.g. "-3") referencing a sibling CREATE-frame changeset
      // staged earlier in the same plan. (Phase 8: `split_frame`
      // no longer emits parent_of edges for brand-new frames -
      // new frames are orphans by design - so this path is now
      // exercised primarily by `reparent_frame` plans where one
      // or both endpoints can legitimately be a placeholder.)
      const sourceId = await resolveVirtualOrBigInt(
        tx,
        relData.source_id,
        `frame_relation.source_id (changeset ${changeset.id.toString()})`,
      );
      const targetId = await resolveVirtualOrBigInt(
        tx,
        relData.target_id,
        `frame_relation.target_id (changeset ${changeset.id.toString()})`,
      );
      const relType = relData.type as string;

      if (!sourceId || !targetId || !relType) {
        throw new Error('CREATE frame_relation requires source_id, target_id, and type');
      }

      const rel = await tx.frame_relations.create({
        data: {
          source_id: sourceId,
          target_id: targetId,
          type: relType as any,
        },
      });
      newEntityId = rel.id;

      // Auto-create the inverse relation for bidirectional pairs
      const inverse = INVERSE_RELATION_TYPE[relType];
      if (inverse) {
        await tx.frame_relations.upsert({
          where: {
            source_id_type_target_id: {
              source_id: targetId,
              type: inverse as any,
              target_id: sourceId,
            },
          },
          create: {
            source_id: targetId,
            target_id: sourceId,
            type: inverse as any,
          },
          update: {},
        });
      }
    } else if (changeset.entity_type === 'frame_role_mapping') {
      // CREATE frame_role_mapping (Phase 2 cascading remediations).
      //
      // Used by the v2 `upsert_role_mappings` plan kind. The
      // strategy LLM emits one entry per parent role; the runner
      // lowers each into a CREATE on `frame_role_mappings` with a
      // negative placeholder entity_id so the writer treats it as
      // a create. We accept either direct columns
      // (parent_frame_id / child_frame_id / parent_role_label /
      // child_role_label) or denormalised aliases for forward
      // compatibility.
      const mappingData = entityData as Record<string, unknown>;
      const parentFrameId = toBigIntSafe(mappingData.parent_frame_id);
      const childFrameId = toBigIntSafe(mappingData.child_frame_id);
      const parentRoleLabel =
        typeof mappingData.parent_role_label === 'string'
          ? mappingData.parent_role_label
          : null;
      const childRoleLabel =
        typeof mappingData.child_role_label === 'string'
          ? mappingData.child_role_label
          : mappingData.child_role_label === null
            ? null
            : undefined;
      const runId =
        typeof mappingData.run_id === 'string' ? mappingData.run_id : '';
      const model =
        typeof mappingData.model === 'string' ? mappingData.model : null;

      if (!parentFrameId || !childFrameId) {
        throw new Error(
          'CREATE frame_role_mapping requires parent_frame_id and child_frame_id',
        );
      }
      if (!parentRoleLabel) {
        throw new Error(
          'CREATE frame_role_mapping requires parent_role_label (non-empty string)',
        );
      }
      if (childRoleLabel === undefined) {
        throw new Error(
          'CREATE frame_role_mapping requires child_role_label (string or explicit null)',
        );
      }

      // The (parent_frame_id, child_frame_id, parent_role_label,
      // child_role_label, run_id) tuple is unique. Use upsert-by-
      // composite-key to make the commit idempotent on retry: if a
      // sibling changeset (or a concurrent run) already inserted
      // the row, we no-op rather than blowing the plan tx up. The
      // plan-writer's per-changeset ordering keeps the audit trail
      // intact even when the underlying INSERT becomes a no-op.
      const existing = await tx.frame_role_mappings.findFirst({
        where: {
          parent_frame_id: parentFrameId,
          child_frame_id: childFrameId,
          parent_role_label: parentRoleLabel,
          child_role_label: childRoleLabel,
          run_id: runId,
        },
      });
      const mapping = existing
        ? existing
        : await tx.frame_role_mappings.create({
            data: {
              parent_frame_id: parentFrameId,
              child_frame_id: childFrameId,
              parent_role_label: parentRoleLabel,
              child_role_label: childRoleLabel,
              run_id: runId,
              model,
            },
          });
      newEntityId = mapping.id;
    } else if (changeset.entity_type === 'frame_role') {
      // Standalone CREATE frame_role (Phase 10 - 100% remediation
      // coverage). Frame-create already supports inlined roles via
      // the `frame_roles` array on the frame's after_snapshot; this
      // branch handles the case where the runner emits a single
      // role-create against an *existing* frame (the
      // `create_frame_role` strategy for DR-018, DR-029 family,
      // DR-033 family, DR-035 family - "Missing core/peripheral/
      // scalar role" diagnoses on an already-created frame).
      const roleData = entityData as Record<string, unknown>;
      const frameId = toBigIntSafe(roleData.frame_id);
      const label = typeof roleData.label === 'string' ? roleData.label : null;
      if (!frameId) {
        throw new Error('CREATE frame_role requires frame_id');
      }
      if (!label) {
        throw new Error('CREATE frame_role requires a non-empty label');
      }
      // Sibling-label uniqueness pre-check. The schema does not
      // enforce label uniqueness per frame, but every health check
      // that consumes role labels assumes it - and the LLM
      // validator on the runner side enforces it too. Guard here
      // so a stale plan doesn't slip a duplicate through.
      const dup = await tx.frame_roles.findFirst({
        where: { frame_id: frameId, label },
        select: { id: true },
      });
      if (dup) {
        throw new Error(
          `CREATE frame_role: label "${label}" already exists on frame ${frameId.toString()}`,
        );
      }
      const role = await tx.frame_roles.create({
        data: {
          frame_id: frameId,
          label,
          description:
            typeof roleData.description === 'string' ? roleData.description : null,
          notes: typeof roleData.notes === 'string' ? roleData.notes : null,
          main: typeof roleData.main === 'boolean' ? roleData.main : false,
          examples: Array.isArray(roleData.examples)
            ? (roleData.examples as string[])
            : [],
        },
      });
      newEntityId = role.id;
    } else {
      throw new Error(`CREATE not implemented for entity type: ${changeset.entity_type}`);
    }

    // Update changeset with the new entity ID and mark as committed
    await tx.changesets.update({
      where: { id: changeset.id },
      data: {
        entity_id: newEntityId,
        status: 'committed',
        committed_at: new Date(),
      },
    });

  // Create audit log entry
  await tx.audit_log.create({
    data: {
      entity_type: changeset.entity_type,
      entity_id: newEntityId,
      field_name: '*',
      operation: 'create',
      old_value: Prisma.DbNull,
      new_value: entityData as Prisma.InputJsonValue,
      changed_by: committedBy,
      changesets: changeset.id ? { connect: { id: changeset.id } } : undefined,
    },
  });

  return {
    success: true,
    committed_count: 1,
    skipped_count: 0,
    errors: [],
  };
}

// Special fields that require separate table updates instead of direct field updates

function isComplexField(fieldName: string): boolean {
  return (
    fieldName === 'hypernym' ||
    isFrameRolesFieldName(fieldName) ||
    isSensesFieldName(fieldName)
  );
}

async function commitFrameRolesSubChanges(
  tx: Prisma.TransactionClient,
  changeset: ChangesetWithFieldChanges,
  approvedRoleChanges: ChangesetWithFieldChanges['field_changes'],
): Promise<void> {
  if (changeset.entity_type !== 'frame') {
    throw new Error(`frame_roles.* changes are only supported for frames (got ${changeset.entity_type})`);
  }
  const entityId = changeset.entity_id!;

  // Fetch current roles and normalize to the same shape as staging
  const currentRolesRaw = await tx.frame_roles.findMany({
    where: { frame_id: entityId },
    orderBy: { id: 'asc' },
  });

  const baseRoles: NormalizedFrameRole[] = [];
  for (const r of currentRolesRaw as any[]) {
    const roleLabel = typeof r?.label === 'string' ? r.label : '';
    if (!roleLabel) continue;
    baseRoles.push({
      roleType: roleLabel,
      description: typeof r.description === 'string' ? r.description : null,
      notes: typeof r.notes === 'string' ? r.notes : null,
      main: typeof r.main === 'boolean' ? r.main : Boolean(r.main),
      examples: Array.isArray(r.examples) ? r.examples.filter((x: unknown): x is string => typeof x === 'string') : [],
      label: typeof r.label === 'string' ? r.label : null,
    });
  }

  const finalRoles = applyFrameRolesSubChanges(
    baseRoles,
    approvedRoleChanges.map(fc => ({ field_name: fc.field_name, new_value: fc.new_value }))
  );

  await tx.frame_roles.deleteMany({ where: { frame_id: entityId } });

  if (finalRoles.length === 0) {
    return;
  }

  const createManyData: Prisma.frame_rolesCreateManyInput[] = [];
  for (const r of finalRoles) {
    createManyData.push({
      frame_id: entityId,
      description: r.description ?? null,
      notes: r.notes ?? null,
      main: r.main ?? false,
      examples: r.examples ?? [],
      label: r.label ?? r.roleType,
    });
  }

  await tx.frame_roles.createMany({ data: createManyData });
}

async function commitUpdate(
  changeset: ChangesetWithFieldChanges,
  approvedChanges: ChangesetWithFieldChanges['field_changes'],
  committedBy: string
): Promise<CommitResult> {
  return await prisma.$transaction(async (tx) =>
    commitUpdateInTx(tx, changeset, approvedChanges, committedBy),
  );
}

async function commitUpdateInTx(
  tx: Prisma.TransactionClient,
  changeset: ChangesetWithFieldChanges,
  approvedChanges: ChangesetWithFieldChanges['field_changes'],
  committedBy: string,
): Promise<CommitResult> {
  if (!changeset.entity_id) {
    throw new Error(
      `No entity_id for UPDATE operation on changeset ${changeset.id.toString()}`,
    );
  }

  const conflictResult = await checkVersionConflictInTx(tx, changeset);
  if (conflictResult) {
    throw new Error(conflictResult.error);
  }

  // Separate complex fields from simple fields
  const simpleChanges = approvedChanges.filter(fc => !isComplexField(fc.field_name));
  const complexChanges = approvedChanges.filter(fc => isComplexField(fc.field_name));
  const frameRolesLegacy = complexChanges.find(fc => fc.field_name === 'frame_roles');
  const frameRolesSub = complexChanges.filter(fc => fc.field_name.startsWith('frame_roles.'));
  const hypernymChanges = complexChanges.filter(fc => fc.field_name === 'hypernym');
  // Sense attach/detach on a lexical_unit: `senses.<senseId>.__exists = true|false`.
  const sensesSubChanges = complexChanges.filter(
    fc => isLexicalUnitType(changeset.entity_type) && isSensesFieldName(fc.field_name),
  );

  // Build the update data for simple fields only, resolving virtual IDs (negative IDs = -changeset_id)
  const updateData: Record<string, unknown> = {};

  // For frame_sense updates, `frame_id` is not a scalar column — it's stored via
  // frame_sense_frames. Pull it out and apply as a complex change after simple fields.
  const senseFrameIdChange =
    changeset.entity_type === 'frame_sense'
      ? simpleChanges.find(fc => fc.field_name === 'frame_id') ?? null
      : null;
  const senseSimpleChanges =
    changeset.entity_type === 'frame_sense'
      ? simpleChanges.filter(fc => fc.field_name !== 'frame_id')
      : simpleChanges;

  await setRowHistoryContext(tx, {
    userId: committedBy,
    changesetId: changeset.id,
  });

  {
    for (const fc of senseSimpleChanges) {
      let nextValue: unknown = fc.new_value;

      // `frame_id` is no longer a scalar column on lexical_units — frames are routed
      // through frame_senses. Skip any legacy staged field changes targeting it on a
      // lexical unit; these changesets came from the pre-sense era and committing them
      // would fail at the Prisma layer. Frame-level frame_id (e.g. on frame_roles) is
      // unaffected and still committed normally.
      if (fc.field_name === 'frame_id' && isLexicalUnitType(changeset.entity_type)) {
        console.warn(
          `[commit] Skipping legacy frame_id field change on lexical_unit ${changeset.entity_id} — use frame_senses instead.`
        );
        continue;
      }

      // Virtual-ID resolution (used by AI SPLIT jobs and Phase 5
      // merge_frame plans to reference pending CREATEs). The same
      // resolution path applies to ANY FK column that may carry a
      // negative placeholder id pointing at an in-flight CREATE
      // changeset.
      //
      // Known FK fields that may need virtual-id resolution + bigint
      // coercion when staged from the runner:
      //
      //   - `frame_id`     on `frame_sense`  (move_frame_sense /
      //                                       merge_frame sense
      //                                       repoints; can target a
      //                                       newly-created merge
      //                                       target frame)
      //   - `merged_into`  on `frame`        (Phase 5 merge_frame
      //                                       per-source finalisation;
      //                                       may point at a brand-
      //                                       new target frame when
      //                                       `target.kind === 'new'`)
      const isFkField =
        fc.field_name === 'frame_id' ||
        (changeset.entity_type === 'frame' && fc.field_name === 'merged_into');

      if (isFkField) {
        const asString = typeof nextValue === 'string' ? nextValue.trim() : null;
        if (asString && /^-\d+$/.test(asString)) {
          const virtualId = BigInt(asString); // negative
          const createChangesetId = -virtualId; // positive changeset id
          const createChangeset = await tx.changesets.findUnique({
            where: { id: createChangesetId },
            select: { id: true, entity_id: true, operation: true, status: true },
          });

          if (!createChangeset || createChangeset.operation !== 'create' || createChangeset.status !== 'committed' || createChangeset.entity_id === null) {
            throw new Error(`Unable to resolve virtual ID ${asString} on ${changeset.entity_type}.${fc.field_name} (create changeset ${createChangesetId.toString()} not committed)`);
          }

          nextValue = createChangeset.entity_id;
        }

        // BigInt foreign keys often come through JSON as strings; coerce to bigint for Prisma.
        if (typeof nextValue === 'string') {
          const trimmed = nextValue.trim();
          if (trimmed === '') {
            nextValue = null;
          } else if (/^\d+$/.test(trimmed)) {
            nextValue = BigInt(trimmed);
          }
        } else if (typeof nextValue === 'number' && Number.isInteger(nextValue)) {
          nextValue = BigInt(nextValue);
        }
      }

      updateData[camelToSnake(fc.field_name)] = nextValue;
    }

    // Update simple fields on the entity using optimistic locking, and bump version
    const hasSimpleChanges = Object.keys(updateData).length > 0;
    const hasComplexChanges =
      !!frameRolesLegacy ||
      frameRolesSub.length > 0 ||
      hypernymChanges.length > 0 ||
      sensesSubChanges.length > 0;

    if (hasSimpleChanges || hasComplexChanges) {
      const versionedData = { ...updateData, version: { increment: 1 } };
      // V2 plan-driven changesets (Phase 5 merge_frame, Phase 6
      // split_frame, etc.) don't thread entity_version through the
      // plan-writer because the issue lock + drift fingerprint
      // already guarantee no concurrent writer for the focal
      // entity. Older v1 single-entity changesets DO carry
      // entity_version for true optimistic concurrency. We branch on
      // whether entity_version is present:
      //   - present  -> updateMany with version filter (fail if changed)
      //   - missing  -> update by id (no concurrency check)
      // Without this branch, `version: null` reaches Prisma and
      // throws an opaque "Argument `version` must not be null"
      // error inside the plan transaction.
      const useOptimisticLock = changeset.entity_version != null;
      let updateCount: number;

      if (isLexicalUnitType(changeset.entity_type)) {
        if (useOptimisticLock) {
          const result = await tx.lexical_units.updateMany({
            where: {
              id: changeset.entity_id!,
              version: changeset.entity_version!,
            },
            data: versionedData,
          });
          updateCount = result.count;
        } else {
          await tx.lexical_units.update({
            where: { id: changeset.entity_id! },
            data: versionedData,
          });
          updateCount = 1;
        }
      } else if (changeset.entity_type === 'frame') {
        if (useOptimisticLock) {
          const result = await tx.frames.updateMany({
            where: {
              id: changeset.entity_id!,
              version: changeset.entity_version!,
            },
            data: versionedData,
          });
          updateCount = result.count;
        } else {
          await tx.frames.update({
            where: { id: changeset.entity_id! },
            data: versionedData,
          });
          updateCount = 1;
        }
      } else if (changeset.entity_type === 'frame_sense') {
        // frame_senses has no `version` column — skip optimistic locking here.
        if (hasSimpleChanges) {
          const senseUpdateData = { ...updateData };
          // Int PK — entity_id is stored as BigInt in the changeset.
          const senseId = Number(changeset.entity_id!);
          await tx.frame_senses.update({
            where: { id: senseId },
            data: {
              ...senseUpdateData,
              updated_at: new Date(),
            },
          });
        }
        updateCount = 1;
      } else {
        throw new Error(`UPDATE not implemented for entity type: ${changeset.entity_type}`);
      }

      if (updateCount === 0) {
        throw new Error('Version conflict: entity was modified by another user');
      }
    }

    // frame_sense: re-point the sense to a different frame (complex update).
    if (senseFrameIdChange) {
      const senseId = Number(changeset.entity_id!);
      const raw = senseFrameIdChange.new_value;
      // V2 plan paths can pass a placeholder string (e.g. "-711")
      // that references a sibling CREATE-frame changeset staged
      // earlier in the same plan (e.g. Phase 6 split_frame: each
      // result frame is brand-new, and senses repoint at it via
      // its placeholder). Resolve via the shared helper so we
      // get the same semantics as the simple-field code path.
      const newFrameId = await resolveVirtualOrBigInt(
        tx,
        raw,
        `frame_sense.frame_id (changeset ${changeset.id.toString()})`,
      );
      if (!newFrameId) {
        throw new Error(
          `Invalid frame_id for frame_sense update: ${String(raw)} (must resolve to a BigInt)`
        );
      }
      await tx.frame_sense_frames.deleteMany({ where: { frame_sense_id: senseId } });
      await tx.frame_sense_frames.create({
        data: { frame_sense_id: senseId, frame_id: newFrameId },
      });
    }

    // Handle complex field changes (frame_roles.*, hypernym)
    if (frameRolesLegacy) {
      // Backward-compatible full replacement
      await commitComplexFieldChange(tx, changeset, frameRolesLegacy);
    } else if (frameRolesSub.length > 0) {
      // Apply approved granular role changes in one pass
      await commitFrameRolesSubChanges(tx, changeset, frameRolesSub);
    }

    for (const fc of hypernymChanges) {
      await commitComplexFieldChange(tx, changeset, fc);
    }

    // Apply sense attach/detach changes on the LU. Each subfield is idempotent:
    //   senses.<senseId>.__exists = true  -> upsert lexical_unit_senses link
    //   senses.<senseId>.__exists = false -> delete the link if present
    if (sensesSubChanges.length > 0 && isLexicalUnitType(changeset.entity_type)) {
      const luId = changeset.entity_id!;
      // Dedupe by sense id; last write wins within a single changeset.
      const effectiveBySenseId = new Map<number, boolean>();
      for (const fc of sensesSubChanges) {
        const parsed = parseSensesExistsFieldName(fc.field_name);
        if (!parsed) continue;
        const next =
          typeof fc.new_value === 'boolean'
            ? fc.new_value
            : Boolean(fc.new_value);
        effectiveBySenseId.set(parsed.senseId, next);
      }
      for (const [senseId, shouldExist] of effectiveBySenseId) {
        if (shouldExist) {
          // Validate the sense still exists before linking (defensive — keeps
          // the audit log honest if the sense was deleted after staging).
          const exists = await tx.frame_senses.findUnique({
            where: { id: senseId },
            select: { id: true },
          });
          if (!exists) {
            throw new Error(
              `Cannot attach sense ${senseId} to lexical_unit ${luId.toString()}: sense not found`
            );
          }
          await tx.lexical_unit_senses.upsert({
            where: {
              lexical_unit_id_frame_sense_id: {
                lexical_unit_id: luId,
                frame_sense_id: senseId,
              },
            },
            create: { lexical_unit_id: luId, frame_sense_id: senseId },
            update: {},
          });
        } else {
          await tx.lexical_unit_senses.deleteMany({
            where: { lexical_unit_id: luId, frame_sense_id: senseId },
          });
        }
      }
    }

    // Mark changeset as committed
    await tx.changesets.update({
      where: { id: changeset.id },
      data: {
        status: 'committed',
        committed_at: new Date(),
      },
    });

    // Mark approved field changes as committed
    await tx.field_changes.updateMany({
      where: {
        changeset_id: changeset.id,
        status: 'approved',
      },
      data: {
        status: 'approved',
      },
    });

    // Create audit log entries for each field change
    for (const fc of approvedChanges) {
      await tx.audit_log.create({
        data: {
          entity_type: changeset.entity_type,
          entity_id: changeset.entity_id!,
          field_name: fc.field_name,
          operation: 'update',
          old_value: fc.old_value === null ? Prisma.DbNull : fc.old_value as Prisma.InputJsonValue,
          new_value: fc.new_value === null ? Prisma.DbNull : fc.new_value as Prisma.InputJsonValue,
          changed_by: committedBy,
          changesets: changeset.id ? { connect: { id: changeset.id } } : undefined,
        },
      });
    }
  }

  const skippedCount = changeset.field_changes.length - approvedChanges.length;
  
  return {
    success: true,
    committed_count: approvedChanges.length,
    skipped_count: skippedCount,
    errors: [],
  };
}

/**
 * Commit a complex field change that requires updates to related tables.
 * Handles: frame_roles, hypernym
 */
async function commitComplexFieldChange(
  tx: Prisma.TransactionClient,
  changeset: ChangesetWithFieldChanges,
  fc: ChangesetWithFieldChanges['field_changes'][0]
): Promise<void> {
  const entityId = changeset.entity_id!;
  const newValue = fc.new_value as Array<Record<string, unknown>> | null;

  switch (fc.field_name) {
    case 'frame_roles':
      // Delete existing frame roles for this frame
      await tx.frame_roles.deleteMany({
        where: { frame_id: entityId },
      });
      
      // Insert new frame roles
      if (newValue && Array.isArray(newValue)) {
        for (const frameRole of newValue) {
          const label = typeof frameRole.roleType === 'string'
            ? frameRole.roleType
            : typeof frameRole.label === 'string'
              ? frameRole.label
              : null;

          if (!label) {
            throw new Error(`Frame role missing label/roleType`);
          }

          await tx.frame_roles.create({
            data: {
              frame_id: entityId,
              description: (frameRole.description as string | undefined) ?? null,
              notes: (frameRole.notes as string | undefined) ?? null,
              main: (frameRole.main as boolean | undefined) ?? false,
              examples: (frameRole.examples as string[] | undefined) ?? [],
              label,
            },
          });
        }
      }
      break;

    case 'hypernym':
      // Handle hypernym relation changes for lexical units
      const hypernymData = newValue as unknown as { old_hypernym_id?: unknown; new_hypernym_id?: unknown } | null;
      
      if (hypernymData) {
        const toBigIntOrNull = (v: unknown): bigint | null => {
          if (v === null || v === undefined) return null;
          if (typeof v === 'bigint') return v;
          if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v);
          if (typeof v === 'string') {
            const trimmed = v.trim();
            if (!trimmed) return null;
            if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
          }
          return null;
        };

        const oldHypernymId = toBigIntOrNull(hypernymData.old_hypernym_id);
        const newHypernymId = toBigIntOrNull(hypernymData.new_hypernym_id);

        // Delete the old hypernym relation if it exists
        if (oldHypernymId) {
          await tx.lexical_unit_relations.deleteMany({
            where: {
              source_id: entityId,
              target_id: oldHypernymId,
              type: 'hypernym',
            },
          });
        }
        
        // Create new hypernym relation if there's a new hypernym
        if (newHypernymId) {
          await tx.lexical_unit_relations.upsert({
            where: {
              source_id_type_target_id: {
                source_id: entityId,
                target_id: newHypernymId,
                type: 'hypernym',
              },
            },
            create: {
              source_id: entityId,
              target_id: newHypernymId,
              type: 'hypernym',
            },
            update: {},
          });
        }
      }
      break;

    default:
      throw new Error(`Unknown complex field: ${fc.field_name}`);
  }
}

async function commitDelete(
  changeset: ChangesetWithFieldChanges,
  committedBy: string
): Promise<CommitResult> {
  // For lexical unit deletions, handle hyponym reassignment first.
  // This stages new pending changesets and intentionally happens
  // outside the delete transaction; if the delete fails the staged
  // changesets stay (they are independently reviewable). This branch
  // is only hit for the standalone-commit path - `commitChangesetInTx`
  // throws on lexical_unit DELETE.
  if (changeset.entity_type === 'lexical_unit') {
    await handleLexicalUnitDeletionHyponymReassignment(changeset, committedBy);
  }
  return await prisma.$transaction(async (tx) =>
    commitDeleteInTx(tx, changeset, committedBy),
  );
}

async function commitDeleteInTx(
  tx: Prisma.TransactionClient,
  changeset: ChangesetWithFieldChanges,
  committedBy: string,
): Promise<CommitResult> {
  if (!changeset.entity_id) {
    throw new Error(
      `No entity_id for DELETE operation on changeset ${changeset.id.toString()}`,
    );
  }

  const conflictResult = await checkVersionConflictInTx(tx, changeset);
  if (conflictResult) {
    throw new Error(conflictResult.error);
  }

  await setRowHistoryContext(tx, {
    userId: committedBy,
    changesetId: changeset.id,
  });

  {

    if (isLexicalUnitType(changeset.entity_type)) {
      await tx.lexical_units.update({
        where: { id: changeset.entity_id! },
        data: {
          deleted: true,
          deleted_reason: 'Deleted via version control',
          deleted_at: new Date(),
          version: { increment: 1 },
        },
      });
    } else if (changeset.entity_type === 'frame') {
      await tx.frames.update({
        where: { id: changeset.entity_id! },
        data: {
          deleted: true,
          deleted_reason: 'Deleted via version control',
          deleted_at: new Date(),
          version: { increment: 1 },
        },
      });
    } else if (changeset.entity_type === 'frame_sense') {
      // Hard-delete (frame_senses has no soft-delete column).
      //
      // FK cascade map (see prisma/schema.prisma):
      //   frame_sense_frames        -> onDelete: Cascade  (cleaned up automatically)
      //   lexical_unit_senses       -> onDelete: Cascade  (cleaned up automatically)
      //   frame_sense_contrasts     -> onDelete: Cascade  (cleaned up automatically)
      //   frame_sense_definition_revisions -> onDelete: NoAction (BLOCKING)
      //
      // We refuse to delete a sense that still has revision history rather
      // than silently dropping the audit trail. Callers can prune/archive the
      // revisions first (a deliberate, separate action).
      const senseId = Number(changeset.entity_id!);
      const revisionCount = await tx.frame_sense_definition_revisions.count({
        where: { frame_sense_id: senseId },
      });
      if (revisionCount > 0) {
        throw new Error(
          `Cannot delete frame_sense ${senseId}: ${revisionCount} definition revision(s) still reference it ` +
            `(frame_sense_definition_revisions.onDelete = NoAction). Archive or remove the revision history first.`
        );
      }
      await tx.frame_senses.delete({ where: { id: senseId } });
    } else if (changeset.entity_type === 'frame_relation') {
      // Hard-delete (frame_relations has no soft-delete column)
      const rel = await tx.frame_relations.findUnique({
        where: { id: changeset.entity_id! },
      });

      if (rel) {
        await tx.frame_relations.delete({
          where: { id: changeset.entity_id! },
        });

        // Auto-delete the inverse relation for bidirectional pairs
        const inverse = INVERSE_RELATION_TYPE[rel.type];
        if (inverse) {
          await tx.frame_relations.deleteMany({
            where: {
              source_id: rel.target_id,
              target_id: rel.source_id,
              type: inverse as any,
            },
          });
        }
      }
    } else if (changeset.entity_type === 'frame_role_mapping') {
      // Hard-delete (frame_role_mappings has no soft-delete column).
      //
      // Used by Phase 2 of the cascading-remediations plan: when a
      // reparent (`move_frame_parent`) commits, the runner appends
      // DELETE ops for every mapping row touching the old parent->
      // child edge AND the new parent->child edge so the next health
      // run's `INHERITANCE_ROLE_MAPPING_RULES` check picks
      // them up cleanly via the `upsert_role_mappings` strategy.
      //
      // `findUnique`+conditional-delete keeps this idempotent: if a
      // sibling changeset (or the FK cascade from a parent frame
      // delete elsewhere in the same plan) already removed the row,
      // we no-op rather than blowing the whole transaction up.
      const mappingId = changeset.entity_id!;
      const existing = await tx.frame_role_mappings.findUnique({
        where: { id: mappingId },
      });
      if (existing) {
        await tx.frame_role_mappings.delete({
          where: { id: mappingId },
        });
      }
    } else if (changeset.entity_type === 'frame_role') {
      // Hard-delete (frame_roles has no soft-delete column).
      //
      // FK cascade map (see prisma/schema.prisma):
      //   role_group_members.role_id -> ON DELETE CASCADE
      //                                 (cleaned up automatically)
      //
      // Used by the `delete_frame_role` strategy (DR-030 family,
      // DR-034 family, DR-041 - "Spurious / Duplicate / Scalar role
      // duplication" diagnoses). We do NOT cascade clean
      // frame_role_mappings rows that reference the role's label by
      // string here: that responsibility belongs to the
      // `delete_frame_role_mapping` strategy on the next health
      // pass (eventual-consistency model). `findUnique` keeps the
      // delete idempotent on retry.
      const roleId = changeset.entity_id!;
      const existing = await tx.frame_roles.findUnique({
        where: { id: roleId },
      });
      if (existing) {
        await tx.frame_roles.delete({ where: { id: roleId } });
      }
    } else {
      throw new Error(`DELETE not implemented for entity type: ${changeset.entity_type}`);
    }

    // Mark changeset as committed
    await tx.changesets.update({
      where: { id: changeset.id },
      data: {
        status: 'committed',
        committed_at: new Date(),
      },
    });

    // Create audit log entry
    await tx.audit_log.create({
      data: {
        entity_type: changeset.entity_type,
        entity_id: changeset.entity_id!,
        field_name: '*',
        operation: 'delete',
        old_value: changeset.before_snapshot === null ? Prisma.DbNull : changeset.before_snapshot as Prisma.InputJsonValue,
        new_value: Prisma.DbNull,
        changed_by: committedBy,
        changesets: changeset.id ? { connect: { id: changeset.id } } : undefined,
      },
    });
  }

  return {
    success: true,
    committed_count: 1,
    skipped_count: 0,
    errors: [],
  };
}

// ============================================
// Commit MERGE
// ============================================

/**
 * Commits a `merge` operation. Currently only `entity_type='frame_sense'`
 * is supported (Phase 1 - merge_sense plan kind). Phase 5 will add the
 * `frame` case for merge_frame.
 *
 * Contract for `merge` on `frame_sense`:
 *
 *   - `entity_id` points at the LOSER sense (the row that gets DELETEd
 *     at the tail of the merge).
 *   - `before_snapshot.__merge_target_id` is the WINNER sense id.
 *   - `before_snapshot.__merge_context.frame_id` is the frame both
 *     senses currently belong to (drift-detection: if either sense
 *     moved away, the merge aborts).
 *   - `before_snapshot.__merge_payload.merged_definition` is the
 *     LLM-baked text the winner ends up with.
 *
 * Sequence (all under the outer plan tx):
 *
 *   1. DRIFT CHECK: re-read both senses + their `frame_sense_frames`
 *      links; abort if either sense is gone, the winner's frame_id
 *      no longer matches, or the loser doesn't link to the same
 *      frame anymore.
 *   2. B3 (relink lexical_unit_senses): UPDATE rows where
 *      frame_sense_id=loser to use winner; deduplicate by deleting
 *      collisions on (lexical_unit_id, winner) before the move.
 *   3. B4 (relink frame_sense_frames): same pattern keyed on frame_id.
 *   4. B5 (relink frame_sense_contrasts): same pattern keyed on
 *      (frame_sense_id, contrasted_sense_id) and on the inverse
 *      column. Self-contrasts (contrasted_sense_id == winner) are
 *      dropped.
 *   5. UPDATE `frame_senses.definition = merged_definition` on winner.
 *   6. DELETE loser. Cascades automatically clean any link rows we
 *      didn't repoint (e.g. residuals after dedup).
 *   7. AUDIT: write one audit_log row keyed on the loser id with
 *      `operation='delete'` (closest existing semantic) plus the
 *      merge metadata in `new_value`. Mark the changeset committed.
 */
async function commitMergeInTx(
  tx: Prisma.TransactionClient,
  changeset: ChangesetWithFieldChanges,
  committedBy: string,
): Promise<CommitResult> {
  if (changeset.entity_type !== 'frame_sense') {
    throw new Error(
      `MERGE not implemented for entity type: ${changeset.entity_type} (changeset ${changeset.id.toString()})`,
    );
  }
  if (!changeset.entity_id) {
    throw new Error(
      `MERGE on frame_sense requires entity_id (loser sense) on changeset ${changeset.id.toString()}`,
    );
  }
  const before = changeset.before_snapshot as Record<string, unknown> | null;
  if (!before) {
    throw new Error(
      `MERGE on frame_sense requires before_snapshot (changeset ${changeset.id.toString()})`,
    );
  }

  const targetIdRaw = before.__merge_target_id;
  const winnerSenseId = toBigIntSafe(targetIdRaw);
  if (!winnerSenseId) {
    throw new Error(
      `MERGE before_snapshot missing __merge_target_id on changeset ${changeset.id.toString()}`,
    );
  }
  const loserSenseId = changeset.entity_id;
  if (winnerSenseId === loserSenseId) {
    throw new Error(
      `MERGE refuses self-merge: winner=loser=${winnerSenseId.toString()} (changeset ${changeset.id.toString()})`,
    );
  }

  const ctx = (before.__merge_context ?? {}) as Record<string, unknown>;
  const expectedFrameIdRaw = ctx.frame_id;
  const expectedFrameId = toBigIntSafe(expectedFrameIdRaw);
  if (!expectedFrameId) {
    throw new Error(
      `MERGE before_snapshot missing __merge_context.frame_id on changeset ${changeset.id.toString()}`,
    );
  }

  const payload = (before.__merge_payload ?? {}) as Record<string, unknown>;
  const mergedDefinition = payload.merged_definition;
  if (typeof mergedDefinition !== 'string' || mergedDefinition.length === 0) {
    throw new Error(
      `MERGE before_snapshot missing __merge_payload.merged_definition on changeset ${changeset.id.toString()}`,
    );
  }

  await setRowHistoryContext(tx, {
    userId: committedBy,
    changesetId: changeset.id,
  });

  // 1) DRIFT CHECK: reload winner + loser rows. frame_senses uses Int
  //    PKs, BigInt in the changeset.
  const winnerIdInt = Number(winnerSenseId);
  const loserIdInt = Number(loserSenseId);

  const [winnerRow, loserRow] = await Promise.all([
    tx.frame_senses.findUnique({ where: { id: winnerIdInt } }),
    tx.frame_senses.findUnique({ where: { id: loserIdInt } }),
  ]);
  if (!winnerRow) {
    throw new Error(
      `MERGE drift: winner frame_sense ${winnerIdInt} no longer exists`,
    );
  }
  if (!loserRow) {
    throw new Error(
      `MERGE drift: loser frame_sense ${loserIdInt} no longer exists`,
    );
  }

  // Both senses must currently link to the expected frame_id.
  const [winnerLink, loserLink] = await Promise.all([
    tx.frame_sense_frames.findFirst({
      where: { frame_sense_id: winnerIdInt, frame_id: expectedFrameId },
    }),
    tx.frame_sense_frames.findFirst({
      where: { frame_sense_id: loserIdInt, frame_id: expectedFrameId },
    }),
  ]);
  if (!winnerLink) {
    throw new Error(
      `MERGE drift: winner frame_sense ${winnerIdInt} no longer linked to frame ${expectedFrameId.toString()}`,
    );
  }
  if (!loserLink) {
    throw new Error(
      `MERGE drift: loser frame_sense ${loserIdInt} no longer linked to frame ${expectedFrameId.toString()}`,
    );
  }

  // 2) B3 relink lexical_unit_senses with dedup.
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM lexical_unit_senses
    WHERE frame_sense_id = ${loserIdInt}
      AND lexical_unit_id IN (
        SELECT lexical_unit_id FROM lexical_unit_senses
        WHERE frame_sense_id = ${winnerIdInt}
      )
  `);
  await tx.$executeRaw(Prisma.sql`
    UPDATE lexical_unit_senses
    SET frame_sense_id = ${winnerIdInt}
    WHERE frame_sense_id = ${loserIdInt}
  `);

  // 3) B4 relink frame_sense_frames with dedup.
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM frame_sense_frames
    WHERE frame_sense_id = ${loserIdInt}
      AND frame_id IN (
        SELECT frame_id FROM frame_sense_frames
        WHERE frame_sense_id = ${winnerIdInt}
      )
  `);
  await tx.$executeRaw(Prisma.sql`
    UPDATE frame_sense_frames
    SET frame_sense_id = ${winnerIdInt}
    WHERE frame_sense_id = ${loserIdInt}
  `);

  // 4) B5 relink frame_sense_contrasts.
  //
  // The table has TWO non-trivial integrity rules we must respect:
  //
  //   (a) CHECK (frame_sense_id < contrasted_sense_id) — rows are
  //       always stored with the lower id in the first column. A
  //       naïve UPDATE that swaps one column to the winner can flip
  //       the inequality and abort the whole merge.
  //   (b) UNIQUE (frame_sense_id, contrasted_sense_id) — repointing a
  //       loser-referencing row to the winner can collide with an
  //       existing winner row.
  //
  // Strategy: collect every distinct "other" sense the loser
  // contrasts with (from EITHER column position), insert canonical
  // (min(winner, other), max(winner, other)) rows where they do not
  // already exist, then bulk-delete every loser-referencing row.
  // This naturally drops:
  //   - self-contrasts (other == winner -> filtered out by WHERE)
  //   - duplicates (handled by ON CONFLICT DO NOTHING)
  //
  // We pick one `contrast_text` per `other` to seed the new row when
  // it doesn't already exist; the COALESCE / MIN combination keeps
  // the choice deterministic but does prefer the loser's text over
  // the winner's (the winner's text would already be on the existing
  // row, so this is the only way to surface loser-side annotations).
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO frame_sense_contrasts (frame_sense_id, contrasted_sense_id, contrast_text)
    SELECT
      LEAST(${winnerIdInt}, other_id) AS lo,
      GREATEST(${winnerIdInt}, other_id) AS hi,
      MIN(contrast_text) AS contrast_text
    FROM (
      SELECT contrasted_sense_id AS other_id, contrast_text
      FROM frame_sense_contrasts
      WHERE frame_sense_id = ${loserIdInt}
      UNION ALL
      SELECT frame_sense_id AS other_id, contrast_text
      FROM frame_sense_contrasts
      WHERE contrasted_sense_id = ${loserIdInt}
    ) loser_rows
    WHERE other_id <> ${winnerIdInt}
      AND other_id <> ${loserIdInt}
    GROUP BY other_id
    ON CONFLICT (frame_sense_id, contrasted_sense_id) DO NOTHING
  `);
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM frame_sense_contrasts
    WHERE frame_sense_id = ${loserIdInt}
       OR contrasted_sense_id = ${loserIdInt}
  `);

  // 5) UPDATE winner.definition.
  await tx.frame_senses.update({
    where: { id: winnerIdInt },
    data: {
      definition: mergedDefinition,
      updated_at: new Date(),
    },
  });

  // 6) DELETE loser. Refuse if revision history blocks it (mirrors
  //    `commitDeleteInTx`'s frame_sense behaviour).
  const revisionCount = await tx.frame_sense_definition_revisions.count({
    where: { frame_sense_id: loserIdInt },
  });
  if (revisionCount > 0) {
    throw new Error(
      `MERGE refuses to delete loser frame_sense ${loserIdInt}: ${revisionCount} definition revision(s) still reference it. Archive or remove the revision history first.`,
    );
  }
  await tx.frame_senses.delete({ where: { id: loserIdInt } });

  // 7) AUDIT + mark changeset committed.
  await tx.changesets.update({
    where: { id: changeset.id },
    data: {
      status: 'committed',
      committed_at: new Date(),
    },
  });
  await tx.audit_log.create({
    data: {
      entity_type: 'frame_sense',
      entity_id: loserSenseId,
      field_name: '*',
      operation: 'merge',
      old_value: before as Prisma.InputJsonValue,
      new_value: {
        merged_into: winnerSenseId.toString(),
        frame_id: expectedFrameId.toString(),
        merged_definition: mergedDefinition,
      } as Prisma.InputJsonValue,
      changed_by: committedBy,
      changesets: { connect: { id: changeset.id } },
    },
  });

  return {
    success: true,
    committed_count: 1,
    skipped_count: 0,
    errors: [],
  };
}

// ============================================
// Lexical Unit Deletion - Hyponym Reassignment
// ============================================

/**
 * Handle hyponym reassignment when a lexical unit is deleted.
 */
async function handleLexicalUnitDeletionHyponymReassignment(
  changeset: ChangesetWithFieldChanges,
  committedBy: string
): Promise<void> {
  const deletedLuId = changeset.entity_id!;
  
  // Get the deleted lexical unit's details
  const deletedLu = await prisma.lexical_units.findUnique({
    where: { id: deletedLuId },
    select: { id: true, code: true },
  });
  
  if (!deletedLu) {
    return;
  }
  
  // Find the deleted unit's hypernym (parent)
  const hypernymRelation = await prisma.lexical_unit_relations.findFirst({
    where: {
      source_id: deletedLuId,
      type: 'hypernym',
    },
    select: {
      target_id: true,
    },
  });
  
  // Find all hyponyms (children) pointing to this unit
  const hyponymRelations = await prisma.lexical_unit_relations.findMany({
    where: {
      target_id: deletedLuId,
      type: 'hypernym',
    },
    select: {
      source_id: true,
    },
  });
  
  if (hyponymRelations.length === 0) {
    return;
  }
  
  // Get the new hypernym info for the comment
  let newHypernymCode: string | null = null;
  if (hypernymRelation) {
    const newHypernym = await prisma.lexical_units.findUnique({
      where: { id: hypernymRelation.target_id },
      select: { code: true },
    });
    newHypernymCode = newHypernym?.code ?? null;
  }
  
  // For each hyponym, create a pending changeset for the hypernym reassignment
  for (const rel of hyponymRelations) {
    const hyponymId = rel.source_id;
    
    const hyponymLu = await prisma.lexical_units.findUnique({
      where: { id: hyponymId },
    });
    
    if (!hyponymLu || hyponymLu.deleted) {
      continue;
    }
    
    const hypernymChangeData = {
      old_hypernym_id: deletedLuId,
      new_hypernym_id: hypernymRelation?.target_id ?? null,
    };
    
    const hyponymChangeset = await createChangesetFromUpdate(
      'lexical_unit',
      hyponymId,
      hyponymLu as unknown as Record<string, unknown>,
      { hypernym: hypernymChangeData },
      committedBy,
    );
    
    let commentContent: string;
    if (newHypernymCode) {
      commentContent = `Hypernym automatically reassigned from "${deletedLu.code}" to "${newHypernymCode}" due to deletion of "${deletedLu.code}".`;
    } else {
      commentContent = `Hypernym relation removed (becomes a root) due to deletion of parent "${deletedLu.code}".`;
    }
    
    await addComment({
      changeset_id: hyponymChangeset.id,
      author: 'system',
      content: commentContent,
    });
  }
}

// ============================================
// Version Conflict Detection
// ============================================

async function checkVersionConflict(
  changeset: ChangesetWithFieldChanges
): Promise<CommitError | null> {
  return await checkVersionConflictInTx(prisma, changeset);
}

async function checkVersionConflictInTx(
  client: Prisma.TransactionClient | typeof prisma,
  changeset: ChangesetWithFieldChanges,
): Promise<CommitError | null> {
  if (!changeset.entity_id || changeset.entity_version === null) {
    return null;
  }

  // frame_senses has no version column — cannot perform optimistic-locking check.
  if (changeset.entity_type === 'frame_sense') {
    return null;
  }

  let currentVersion: number | null = null;

  if (changeset.entity_type === 'lexical_unit') {
    const lu = await client.lexical_units.findUnique({
      where: { id: changeset.entity_id },
      select: { version: true },
    });
    currentVersion = lu?.version ?? null;
  } else if (changeset.entity_type === 'frame') {
    const frame = await client.frames.findUnique({
      where: { id: changeset.entity_id },
      select: { version: true },
    });
    currentVersion = frame?.version ?? null;
  } else if (changeset.entity_type === 'frame_relation') {
    const rel = await client.frame_relations.findUnique({
      where: { id: changeset.entity_id },
      select: { version: true },
    });
    currentVersion = rel?.version ?? null;
  }

  if (currentVersion === null) {
    return {
      changeset_id: changeset.id,
      entity_type: changeset.entity_type,
      entity_id: changeset.entity_id,
      error: 'Entity not found - it may have been deleted',
    };
  }

  if (currentVersion !== changeset.entity_version) {
    return {
      changeset_id: changeset.id,
      entity_type: changeset.entity_type,
      entity_id: changeset.entity_id,
      error: `Version conflict: expected version ${changeset.entity_version}, found ${currentVersion}`,
      conflict: {
        field_name: 'version',
        expected_value: changeset.entity_version,
        current_value: currentVersion,
        proposed_value: changeset.entity_version,
      },
    };
  }

  return null;
}

// ============================================
// Batch Operations by LLM Job
// ============================================

/**
 * Commit all pending changesets for an LLM job.
 */
export async function commitByLlmJob(
  llmJobId: bigint,
  committedBy: string
): Promise<CommitResult> {
  const changesets = await prisma.changesets.findMany({
    where: {
      llm_job_id: llmJobId,
      status: 'pending',
    },
    include: {
      field_changes: true,
    },
  });

  if (changesets.length === 0) {
    return {
      success: true,
      committed_count: 0,
      skipped_count: 0,
      errors: [],
    };
  }

  const results: CommitResult = {
    success: true,
    committed_count: 0,
    skipped_count: 0,
    errors: [],
  };

  // Commit in a stable, dependency-aware order:
  // 1) create (so virtual IDs can be resolved)
  // 2) update
  // 3) delete
  const opOrder = (op: string) => (op === 'create' ? 0 : op === 'update' ? 1 : 2);
  const ordered = [...changesets].sort((a, b) => {
    const diff = opOrder(a.operation) - opOrder(b.operation);
    if (diff !== 0) return diff;
    // Tie-breaker: stable by id
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  for (const cs of ordered) {
    const result = await commitChangeset(cs.id, committedBy);
    
    results.committed_count += result.committed_count;
    results.skipped_count += result.skipped_count;
    results.errors.push(...result.errors);
    
    if (!result.success) {
      results.success = false;
    }
  }

  return results;
}

/**
 * Commit all pending manual changesets for a user.
 */
export async function commitByUser(
  createdBy: string,
  committedBy: string
): Promise<CommitResult> {
  const changesets = await prisma.changesets.findMany({
    where: {
      created_by: createdBy,
      llm_job_id: null,
      status: 'pending',
    },
    include: {
      field_changes: true,
    },
  });

  if (changesets.length === 0) {
    return {
      success: true,
      committed_count: 0,
      skipped_count: 0,
      errors: [],
    };
  }

  const results: CommitResult = {
    success: true,
    committed_count: 0,
    skipped_count: 0,
    errors: [],
  };

  for (const cs of changesets) {
    const result = await commitChangeset(cs.id, committedBy);
    
    results.committed_count += result.committed_count;
    results.skipped_count += result.skipped_count;
    results.errors.push(...result.errors);
    
    if (!result.success) {
      results.success = false;
    }
  }

  return results;
}

// ============================================
// Discard Operations
// ============================================

export async function discardChangeset(changesetId: bigint): Promise<void> {
  await prisma.changesets.update({
    where: { id: changesetId },
    data: {
      status: 'discarded',
    },
  });
}

export async function discardByLlmJob(llmJobId: bigint): Promise<void> {
  await prisma.changesets.updateMany({
    where: {
      llm_job_id: llmJobId,
      status: 'pending',
    },
    data: {
      status: 'discarded',
    },
  });
}

export async function discardByUser(createdBy: string): Promise<void> {
  await prisma.changesets.updateMany({
    where: {
      created_by: createdBy,
      llm_job_id: null,
      status: 'pending',
    },
    data: {
      status: 'discarded',
    },
  });
}

// ============================================
// Bulk Operations by IDs
// ============================================

export interface BulkOperationResult {
  success: boolean;
  processed: number;
  committed?: number;
  rejected?: number;
  discarded?: number;
  errors: Array<{
    changeset_id: string;
    error: string;
  }>;
  conflict?: {
    changeset_id: string;
    errors: CommitError[];
  };
}

export async function bulkApproveAndCommit(
  changesetIds: bigint[],
  userId: string
): Promise<BulkOperationResult> {
  const result: BulkOperationResult = {
    success: true,
    processed: 0,
    committed: 0,
    errors: [],
  };

  await prisma.$transaction(async (tx) => {
    await tx.field_changes.updateMany({
      where: {
        changeset_id: { in: changesetIds },
        status: 'pending',
      },
      data: {
        status: 'approved',
        approved_by: userId,
        approved_at: new Date(),
        rejected_by: null,
        rejected_at: null,
      },
    });
  });

  for (const changesetId of changesetIds) {
    const commitResult = await commitChangeset(changesetId, userId);
    result.processed++;

    if (!commitResult.success) {
      const hasConflict = commitResult.errors.some(e => 
        e.error.includes('Version conflict') || e.error.includes('has been modified')
      );
      
      if (hasConflict) {
        result.success = false;
        result.conflict = {
          changeset_id: changesetId.toString(),
          errors: commitResult.errors,
        };
        return result;
      }
      
      result.errors.push({
        changeset_id: changesetId.toString(),
        error: commitResult.errors.map(e => e.error).join('; '),
      });
    } else {
      result.committed = (result.committed || 0) + commitResult.committed_count;
    }
  }

  return result;
}

export async function bulkReject(
  changesetIds: bigint[],
  userId: string
): Promise<BulkOperationResult> {
  const result: BulkOperationResult = {
    success: true,
    processed: 0,
    rejected: 0,
    discarded: 0,
    errors: [],
  };

  const changesets = await prisma.changesets.findMany({
    where: { id: { in: changesetIds } },
    select: { id: true, operation: true },
  });

  const discardIds: bigint[] = [];
  const rejectIds: bigint[] = [];

  for (const cs of changesets) {
    if (cs.operation === 'delete' || cs.operation === 'create') {
      discardIds.push(cs.id);
    } else {
      rejectIds.push(cs.id);
    }
  }

  if (discardIds.length > 0) {
    await prisma.changesets.updateMany({
      where: { id: { in: discardIds } },
      data: { status: 'discarded' },
    });
    result.discarded = discardIds.length;
    result.processed += discardIds.length;
  }

  if (rejectIds.length > 0) {
    const updateResult = await prisma.field_changes.updateMany({
      where: {
        changeset_id: { in: rejectIds },
        status: 'pending',
      },
      data: {
        status: 'rejected',
        rejected_by: userId,
        rejected_at: new Date(),
        approved_by: null,
        approved_at: null,
      },
    });
    result.rejected = updateResult.count;
    result.processed += rejectIds.length;

    for (const changesetId of rejectIds) {
      const fieldChanges = await prisma.field_changes.findMany({
        where: { changeset_id: changesetId },
        select: { status: true },
      });

      const allRejected = fieldChanges.every(fc => fc.status === 'rejected');
      if (allRejected) {
        await prisma.changesets.update({
          where: { id: changesetId },
          data: { status: 'discarded' },
        });
        result.discarded = (result.discarded || 0) + 1;
      }
    }
  }

  return result;
}

export async function bulkDiscard(
  changesetIds: bigint[]
): Promise<BulkOperationResult> {
  const updateResult = await prisma.changesets.updateMany({
    where: { id: { in: changesetIds } },
    data: { status: 'discarded' },
  });

  return {
    success: true,
    processed: updateResult.count,
    discarded: updateResult.count,
    errors: [],
  };
}
