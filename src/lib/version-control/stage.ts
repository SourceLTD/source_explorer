/**
 * Version Control - Staging Helpers
 * 
 * High-level functions for API routes to stage changes instead of directly
 * updating the database. These functions create changesets that can be
 * reviewed and committed through the Pending Changes modal.
 */

import { prisma } from '@/lib/prisma';
import {
  createChangesetFromUpdate,
  createChangesetFromDelete,
  createChangesetFromCreate,
  findPendingChangeset,
  upsertFieldChange,
  getChangeset,
} from './create';
import { randomUUID } from 'crypto';
import { parseFrameRolesFieldName } from './frameRolesSubfields';
import { sensesExistsFieldName } from './sensesSubfields';
import {
  EntityType,
  ENTITY_TYPE_TO_TABLE,
  normalizeEntityType,
  isLexicalUnitType,
} from './types';

// ============================================
// Response Types for API Routes
// ============================================

export interface StagedResponse {
  staged: true;
  changeset_id: string;
  message: string;
  field_changes_count: number;
}

// ============================================
// Entity Fetchers (to get current state)
// ============================================

/**
 * Fetch the current state of an entity by its code (string ID like "run.v.01")
 */
async function fetchEntityByCode(
  entityType: string,
  code: string
): Promise<{ entity: Record<string, unknown>; numericId: bigint } | null> {
  const normalizedType = normalizeEntityType(entityType);
  const table = ENTITY_TYPE_TO_TABLE[normalizedType];
  if (!table) return null;

  let entity: Record<string, unknown> | null = null;

  // Most tables use numeric ID, lexical_units also supports lookup by code
  if (isLexicalUnitType(normalizedType)) {
    entity = await prisma.lexical_units.findFirst({
      where: { 
        OR: [
          { code },
          ...(isNumericId(code) ? [{ id: BigInt(code) }] : [])
        ],
        deleted: false 
      },
    }) as Record<string, unknown> | null;
  } else if (normalizedType === 'frame_sense') {
    // frame_senses uses Int PK and has no string "code". Fetch the row and
    // flatten the single linked frame_id onto the pseudo-entity so staged field
    // changes to `frame_id` have an accurate before_value.
    if (!isNumericId(code)) return null;
    const senseId = Number(code);
    const sense = await prisma.frame_senses.findUnique({
      where: { id: senseId },
      include: { frame_sense_frames: { select: { frame_id: true } } },
    });
    if (!sense) return null;
    const linkedFrameId = sense.frame_sense_frames[0]?.frame_id ?? null;
    const { frame_sense_frames: _omit, ...senseRest } = sense;
    void _omit;
    entity = { ...senseRest, frame_id: linkedFrameId } as Record<string, unknown>;
    return { entity, numericId: BigInt(sense.id) };
  } else {
    // Standard numeric ID lookup for other tables
    if (!isNumericId(code)) return null;
    
    try {
      const numericId = BigInt(code);
      // We have to use any because we don't know the table name at compile time
      // and Prisma doesn't support dynamic table names easily without $queryRaw
      entity = await (prisma[table as keyof typeof prisma] as any).findUnique({
        where: { id: numericId },
      }) as Record<string, unknown> | null;
    } catch (error) {
      console.error(`Error fetching entity from ${table}:`, error);
      return null;
    }
  }

  if (!entity) return null;

  return {
    entity,
    numericId: entity.id as bigint,
  };
}

/**
 * Check if a string is a numeric ID
 */
function isNumericId(id: string): boolean {
  return /^\d+$/.test(id);
}

// ============================================
// Main Staging Functions
// ============================================

/**
 * Stage an update to an entity. Creates a changeset with field changes.
 * 
 * @param entityType - The type of entity (lexical_unit, frame, etc.)
 * @param entityCode - The code/ID of the entity (e.g., "run.v.01" or "123")
 * @param updates - The proposed updates (field name -> new value)
 * @param userId - The user making the change
 * @param comment - Optional justification for the change
 * @returns StagedResponse with changeset info
 */
export async function stageUpdate(
  entityType: EntityType,
  entityCode: string,
  updates: Record<string, unknown>,
  userId: string,
  comment?: string
): Promise<StagedResponse> {
  // Normalize entity type (e.g., verb -> lexical_unit)
  const normalizedType = normalizeEntityType(entityType);

  // Fetch current entity state
  const result = await fetchEntityByCode(entityType, entityCode);
  if (!result) {
    throw new Error(`Entity not found: ${entityType}:${entityCode}`);
  }

  const { entity, numericId } = result;

  // IMPORTANT:
  // Do NOT pre-filter "no-op" updates here.
  //
  // Even when a requested value equals the current DB value (including our system
  // semantics of "" -> null), we still need to pass the field through so that
  // `upsertFieldChange()` can delete an existing pending field_change (i.e. the
  // user is reverting a previously staged change back to the original value).
  //
  // `createChangesetFromUpdate()` already filters no-ops when creating *new*
  // changesets, so we won't create empty changesets in the common case.
  const changeset = await createChangesetFromUpdate(
    normalizedType,
    numericId,
    entity,
    updates,
    userId,
    undefined,
  );

  // `createChangesetFromUpdate()` returns a "virtual" empty changeset (id=0)
  // when no pending changeset exists AND the update is a no-op.
  if (changeset.id === BigInt(0) || changeset.field_changes.length === 0) {
    // If we touched an existing pending changeset and it became empty, treat it as a revert.
    if (changeset.id !== BigInt(0)) {
      return {
        staged: true,
        changeset_id: '',
        message: 'Changes reverted - changeset discarded',
        field_changes_count: 0,
      };
    }

    // Otherwise it's simply a no-op request.
    return {
      staged: true,
      changeset_id: '',
      message: 'No changes detected - values are the same',
      field_changes_count: 0,
    };
  }

  return {
    staged: true,
    changeset_id: changeset.id.toString(),
    message: `Changes staged for review (${changeset.field_changes.length} field${changeset.field_changes.length !== 1 ? 's' : ''})`,
    field_changes_count: changeset.field_changes.length,
  };
}

/**
 * Stage a delete operation for an entity.
 * 
 * @param entityType - The type of entity (lexical_unit, frame, etc.)
 * @param entityCode - The code/ID of the entity
 * @param userId - The user requesting deletion
 * @param comment - Optional justification for the deletion
 * @returns StagedResponse with changeset info
 */
export async function stageDelete(
  entityType: EntityType,
  entityCode: string,
  userId: string,
  comment?: string
): Promise<StagedResponse> {
  // Normalize entity type
  const normalizedType = normalizeEntityType(entityType);

  // Fetch current entity state
  const result = await fetchEntityByCode(entityType, entityCode);
  if (!result) {
    throw new Error(`Entity not found: ${entityType}:${entityCode}`);
  }

  const { entity, numericId } = result;

  // Create delete changeset
  const changeset = await createChangesetFromDelete(
    normalizedType,
    numericId,
    entity,
    userId,
    undefined,
  );

  return {
    staged: true,
    changeset_id: changeset.id.toString(),
    message: 'Delete operation staged for review',
    field_changes_count: 0,
  };
}

/**
 * Stage an attach/detach of an existing frame_sense to/from a lexical unit.
 *
 * The link change is recorded as a subfield change on the LU's changeset using
 * the `senses.<senseId>.__exists` convention, so it flows through the normal
 * review/commit/audit pipeline.
 *
 * Idempotency: if the link already matches the requested state, the call is a
 * no-op (no changeset is created and any existing matching field change is
 * cleared via `upsertFieldChange`).
 *
 * @param luCodeOrId - LU code (e.g. "run.v.01") or numeric id as a string
 * @param senseId    - The frame_sense.id to attach/detach
 * @param attach     - true to attach, false to detach
 * @param userId     - The user making the change
 */
export async function stageSenseAttachment(
  luCodeOrId: string,
  senseId: number,
  attach: boolean,
  userId: string,
): Promise<StagedResponse> {
  const result = await fetchEntityByCode('lexical_unit', luCodeOrId);
  if (!result) {
    throw new Error(`Lexical unit not found: ${luCodeOrId}`);
  }
  const { entity, numericId } = result;

  const existingLink = await prisma.lexical_unit_senses.findUnique({
    where: {
      lexical_unit_id_frame_sense_id: {
        lexical_unit_id: numericId,
        frame_sense_id: senseId,
      },
    },
    select: { lexical_unit_id: true },
  });
  const currentlyExists = existingLink !== null;

  // We intentionally route through `createChangesetFromUpdate` so that this
  // field change coexists cleanly with other pending LU updates (merges into an
  // existing pending changeset on the same entity, rather than creating a new
  // one per attach/detach call).
  const fieldName = sensesExistsFieldName(senseId);
  // Seed the pseudo-entity with the subfield's current boolean so no-op /
  // revert detection works.
  const pseudoEntity: Record<string, unknown> = { ...entity, [fieldName]: currentlyExists };

  const changeset = await createChangesetFromUpdate(
    'lexical_unit',
    numericId,
    pseudoEntity,
    { [fieldName]: attach },
    userId,
    undefined,
  );

  if (changeset.id === BigInt(0) || changeset.field_changes.length === 0) {
    if (changeset.id !== BigInt(0)) {
      return {
        staged: true,
        changeset_id: '',
        message: 'Changes reverted - changeset discarded',
        field_changes_count: 0,
      };
    }
    return {
      staged: true,
      changeset_id: '',
      message: 'No changes detected - link already in requested state',
      field_changes_count: 0,
    };
  }

  return {
    staged: true,
    changeset_id: changeset.id.toString(),
    message: `Sense ${attach ? 'attach' : 'detach'} staged for review`,
    field_changes_count: changeset.field_changes.length,
  };
}

/**
 * Stage flag updates for multiple entities.
 * Creates one changeset per entity.
 * 
 * @param entityType - The type of entity (lexical_unit, frame, etc.)
 * @param entityCodes - Array of entity codes/IDs
 * @param updates - The flag updates (flagged, verifiable, etc.)
 * @param userId - The user making the changes
 * @returns Array of StagedResponse for each entity
 */
export async function stageFlagUpdates(
  entityType: EntityType,
  entityCodes: string[],
  updates: Record<string, unknown>,
  userId: string
): Promise<{ staged_count: number; changeset_ids: string[] }> {
  const changesetIds: string[] = [];

  for (const code of entityCodes) {
    try {
      const response = await stageUpdate(entityType, code, updates, userId);
      changesetIds.push(response.changeset_id);
    } catch (error) {
      console.warn(`Failed to stage update for ${entityType}:${code}:`, error);
    }
  }

  return {
    staged_count: changesetIds.length,
    changeset_ids: changesetIds,
  };
}

/**
 * Stage updates to frame roles.
 * 
 * @param frameId - The frame ID
 * @param newFrameRoles - The new frame roles array
 * @param userId - The user making the changes
 * @param comment - Optional justification for the changes
 */
export async function stageFrameRolesUpdate(
  frameId: string,
  newFrameRoles: unknown[],
  userId: string,
  comment?: string
): Promise<StagedResponse> {
  const numericId = BigInt(frameId);

  type NormalizedFrameRole = {
    roleType: string;
    description: string | null;
    notes: string | null;
    main: boolean;
    examples: string[];
    label: string | null;
  };

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

  const normalizeNullableString = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const normalizeExamples = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return v
      .map(ex => (typeof ex === 'string' ? ex.trim() : ''))
      .filter(Boolean);
  };

  const normalizeFrameRoles = (roles: unknown[]): NormalizedFrameRole[] => {
    const normalized: NormalizedFrameRole[] = [];
    for (const r of roles) {
      if (!isRecord(r)) continue;

      const roleType =
        (typeof r.roleType === 'string' ? r.roleType.trim() : '') ||
        (isRecord(r.role_type) && typeof r.role_type.label === 'string' ? r.role_type.label.trim() : '') ||
        (typeof r.label === 'string' ? r.label.trim() : '');

      if (!roleType) continue;

      normalized.push({
        roleType,
        description: normalizeNullableString(r.description),
        notes: normalizeNullableString(r.notes),
        main: Boolean(r.main),
        examples: normalizeExamples(r.examples),
        label: normalizeNullableString(r.label),
      });
    }

    // Order-insensitive comparison/storage: keep stable ordering by role type label
    normalized.sort((a, b) => a.roleType.localeCompare(b.roleType));
    return normalized;
  };
  
  const getRoleDefaults = (): Omit<NormalizedFrameRole, 'roleType'> => ({
    description: null,
    notes: null,
    main: false,
    examples: [],
    label: null,
  });
  
  // Fetch current frame
  const frame = await prisma.frames.findUnique({
    where: { id: numericId },
  });

  if (!frame) {
    throw new Error(`Frame not found: ${frameId}`);
  }

  // Fetch current frame roles
  const currentFrameRolesRaw = await prisma.frame_roles.findMany({
    where: { frame_id: numericId },
    orderBy: { id: 'asc' },
  });

  // Check if frame roles actually changed
  const currentFrameRoles = normalizeFrameRoles(currentFrameRolesRaw as unknown[]);
  let normalizedNewFrameRoles = normalizeFrameRoles(newFrameRoles);

  // Preserve non-editable fields (like `label`) if the client didn't send them.
  // This prevents staging a no-op change that would otherwise wipe labels on commit.
  const labelByRoleType = new Map(currentFrameRoles.map(r => [r.roleType, r.label]));
  normalizedNewFrameRoles = normalizedNewFrameRoles.map(r => ({
    ...r,
    label: r.label ?? labelByRoleType.get(r.roleType) ?? null,
  }));
  
  const currentByRoleType = new Map(currentFrameRoles.map(r => [r.roleType, r]));
  const newByRoleType = new Map(normalizedNewFrameRoles.map(r => [r.roleType, r]));
  const roleTypes = Array.from(new Set<string>([
    ...Array.from(currentByRoleType.keys()),
    ...Array.from(newByRoleType.keys()),
  ])).sort((a, b) => a.localeCompare(b));
  
  const roleFields: Array<keyof Omit<NormalizedFrameRole, 'roleType'>> = [
    'label',
    'description',
    'notes',
    'main',
    'examples',
  ];

  // Ensure the changeset status matches reality after a batch of upserts.
  // upsertFieldChange() can auto-discard a changeset when the last field change is deleted,
  // but in this function we may delete and create changes in one pass.
  const reconcileChangesetStatus = async (changesetId: bigint): Promise<number> => {
    const count = await prisma.field_changes.count({
      where: { changeset_id: changesetId },
    });
    await prisma.changesets.update({
      where: { id: changesetId },
      data: { status: count > 0 ? 'pending' : 'discarded' },
    });
    return count;
  };

  // Check if there's already a pending changeset for this frame
  const changeset = await findPendingChangeset('frame', numericId);

  if (changeset) {
    // If a legacy full-field change exists, delete it so we only track granular sub-changes.
    // This avoids double-applying frame_roles edits at commit time.
    await prisma.field_changes.deleteMany({
      where: { changeset_id: changeset.id, field_name: 'frame_roles' },
    });

    // Important: role types may exist only in the pending changeset (not in DB)
    // e.g. a role was staged as "created" and the user removed it again.
    // If we only iterate roleTypes derived from (DB ∪ newPayload), we'd never
    // touch those pending-only role types and their field_changes would remain.
    const pendingRoleTypes = new Set<string>();
    for (const fc of changeset.field_changes) {
      const parsed = parseFrameRolesFieldName(fc.field_name);
      if (parsed?.roleType) pendingRoleTypes.add(parsed.roleType);
    }

    const roleTypesToUpsert = Array.from(new Set<string>([
      ...roleTypes,
      ...Array.from(pendingRoleTypes),
    ])).sort((a, b) => a.localeCompare(b));

    // Upsert per-role-field changes. upsertFieldChange handles no-op deletions.
    for (const rt of roleTypesToUpsert) {
      const oldRole = currentByRoleType.get(rt);
      const newRole = newByRoleType.get(rt);
      const oldExists = Boolean(oldRole);
      const newExists = Boolean(newRole);

      await upsertFieldChange(
        changeset.id,
        `frame_roles.${rt}.__exists`,
        oldExists,
        newExists
      );

      for (const f of roleFields) {
        const oldValue = oldRole ? oldRole[f] : getRoleDefaults()[f];
        const newValue = newRole ? newRole[f] : getRoleDefaults()[f];

        await upsertFieldChange(
          changeset.id,
          `frame_roles.${rt}.${String(f)}`,
          oldValue,
          newValue
        );
      }
    }

    const fieldChangesCount = await reconcileChangesetStatus(changeset.id);
    if (fieldChangesCount === 0) {
      return {
        staged: true,
        changeset_id: '',
        message: 'Changes reverted - changeset discarded',
        field_changes_count: 0,
      };
    }

    return {
      staged: true,
      changeset_id: changeset.id.toString(),
      message: 'Frame role changes staged for review',
      field_changes_count: fieldChangesCount,
    };
  }

  // Create new changeset
  const entityWithRoles = {
    ...frame,
    frame_roles: currentFrameRoles,
  };

  // Create changeset via a legacy `frame_roles` change (so we get a real changeset row),
  // then immediately delete that field change and replace with granular sub-changes.
  const newChangeset = await createChangesetFromUpdate(
    'frame',
    numericId,
    entityWithRoles as Record<string, unknown>,
    { frame_roles: normalizedNewFrameRoles },
    userId,
    undefined,
  );

  // Virtual empty changeset indicates no differences
  if (newChangeset.id === BigInt(0)) {
    return {
      staged: true,
      changeset_id: '',
      message: 'No changes detected - frame roles are the same',
      field_changes_count: 0,
    };
  }

  // Delete the legacy full-field change so only granular sub-changes remain.
  await prisma.field_changes.deleteMany({
    where: { changeset_id: newChangeset.id, field_name: 'frame_roles' },
  });

  for (const rt of roleTypes) {
    const oldRole = currentByRoleType.get(rt);
    const newRole = newByRoleType.get(rt);
    const oldExists = Boolean(oldRole);
    const newExists = Boolean(newRole);

    await upsertFieldChange(
      newChangeset.id,
      `frame_roles.${rt}.__exists`,
      oldExists,
      newExists
    );

    for (const f of roleFields) {
      const oldValue = oldRole ? oldRole[f] : getRoleDefaults()[f];
      const newValue = newRole ? newRole[f] : getRoleDefaults()[f];

      await upsertFieldChange(
        newChangeset.id,
        `frame_roles.${rt}.${String(f)}`,
        oldValue,
        newValue
      );
    }
  }

  const fieldChangesCount = await reconcileChangesetStatus(newChangeset.id);
  if (fieldChangesCount === 0) {
    return {
      staged: true,
      changeset_id: '',
      message: 'No changes detected - frame roles are the same',
      field_changes_count: 0,
    };
  }

  return {
    staged: true,
    changeset_id: newChangeset.id.toString(),
    message: 'Frame role changes staged for review',
    field_changes_count: fieldChangesCount,
  };
}

// ============================================
// Frame Relation Reparent Staging
// ============================================

export interface ReparentResult {
  staged: true;
  deleteChangesetId: string | null;
  createChangesetId: string;
  message: string;
}

/**
 * Stage a reparent operation for a frame in the parent_of DAG.
 * Creates up to two changesets:
 * 1. DELETE changeset for the old parent_of relation (if one exists)
 * 2. CREATE changeset for the new parent_of relation
 *
 * Also validates that the reparent does not create a cycle.
 */
export async function stageFrameRelationReparent(
  frameId: bigint,
  newParentFrameId: bigint,
  userId: string,
  llmJobId?: bigint,
): Promise<ReparentResult> {
  // Validate frames exist and are not deleted
  const [frame, newParent] = await Promise.all([
    prisma.frames.findUnique({ where: { id: frameId }, select: { id: true, label: true, deleted: true } }),
    prisma.frames.findUnique({ where: { id: newParentFrameId }, select: { id: true, label: true, deleted: true } }),
  ]);

  if (!frame || frame.deleted) {
    throw new Error(`Frame ${frameId} not found or deleted`);
  }
  if (!newParent || newParent.deleted) {
    throw new Error(`Target parent frame ${newParentFrameId} not found or deleted`);
  }
  if (frameId === newParentFrameId) {
    throw new Error('A frame cannot inherit from itself');
  }

  // Cycle detection: walk up from newParentFrameId following parent_of edges
  await assertNoCycle(frameId, newParentFrameId);

  // Find the current parent_of relation for this frame (if any)
  const existingRelation = await prisma.frame_relations.findFirst({
    where: {
      source_id: frameId,
      type: 'parent_of',
    },
  });

  // If already pointing at the requested parent, no-op
  if (existingRelation && existingRelation.target_id === newParentFrameId) {
    return {
      staged: true,
      deleteChangesetId: null,
      createChangesetId: '',
      message: 'Frame already inherits from the specified parent',
    };
  }

  let deleteChangesetId: string | null = null;

  // Generate a shared ID so the UI can group the DELETE + CREATE as a single logical move
  const moveGroupId = randomUUID();

  // Stage DELETE for the old relation
  if (existingRelation) {
    // Resolve old parent label for richer snapshots
    const oldParent = await prisma.frames.findUnique({
      where: { id: existingRelation.target_id },
      select: { label: true },
    });

    const relSnapshot = {
      id: existingRelation.id,
      source_id: existingRelation.source_id,
      target_id: existingRelation.target_id,
      type: existingRelation.type,
      version: existingRelation.version,
      move_group_id: moveGroupId,
      source_label: frame.label,
      target_label: oldParent?.label ?? null,
    } as unknown as Record<string, unknown>;

    const deleteChangeset = await createChangesetFromDelete(
      'frame_relation',
      existingRelation.id,
      relSnapshot,
      userId,
      llmJobId,
    );
    deleteChangesetId = deleteChangeset.id.toString();
  }

  // Stage CREATE for the new relation
  const createChangeset = await createChangesetFromCreate(
    'frame_relation',
    {
      source_id: frameId,
      target_id: newParentFrameId,
      type: 'parent_of',
      move_group_id: moveGroupId,
      source_label: frame.label,
      target_label: newParent.label,
    } as unknown as Record<string, unknown>,
    userId,
    llmJobId,
  );

  return {
    staged: true,
    deleteChangesetId,
    createChangesetId: createChangeset.id.toString(),
    message: existingRelation
      ? `Reparent staged: will move from old parent to "${newParent.label}"`
      : `Reparent staged: will set parent to "${newParent.label}"`,
  };
}

/**
 * Walk up the parent_of chain from `startFrameId` and throw if `targetFrameId` is encountered,
 * which would indicate a cycle.
 */
async function assertNoCycle(targetFrameId: bigint, startFrameId: bigint): Promise<void> {
  const visited = new Set<string>();
  let current = startFrameId;

  while (true) {
    const key = current.toString();
    if (visited.has(key)) break;
    visited.add(key);

    if (current === targetFrameId) {
      throw new Error(
        'Reparenting would create a cycle in the parent_of hierarchy'
      );
    }

    const parentRel = await prisma.frame_relations.findFirst({
      where: {
        source_id: current,
        type: 'parent_of',
      },
      select: { target_id: true },
    });

    if (!parentRel) break;
    current = parentRel.target_id;
  }
}
