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
  findPendingChangeset,
  upsertFieldChange,
  getChangeset,
} from './create';
import { parseFrameRolesFieldName } from './frameRolesSubfields';
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
        (isRecord(r.role_types) && typeof r.role_types.label === 'string' ? r.role_types.label.trim() : '');

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

  // Fetch current frame roles (include role type label to match overlay payload)
  const currentFrameRolesRaw = await prisma.frame_roles.findMany({
    where: { frame_id: numericId },
    orderBy: { id: 'asc' },
    include: { role_types: { select: { label: true } } },
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
