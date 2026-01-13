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

  // Check if any values actually changed before creating a changeset
  const actualChanges: Record<string, unknown> = {};
  for (const [key, newValue] of Object.entries(updates)) {
    const oldValue = entity[key];
    // Compare stringified values to handle complex types
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      actualChanges[key] = newValue;
    }
  }

  // If nothing actually changed, and no comment was provided, return early
  if (Object.keys(actualChanges).length === 0 && !comment) {
    return {
      staged: true,
      changeset_id: '',
      message: 'No changes detected - values are the same',
      field_changes_count: 0,
    };
  }

  // Create or update the changeset using the normalized type
  const changeset = await createChangesetFromUpdate(
    normalizedType,
    numericId,
    entity,
    actualChanges,
    userId,
    undefined,
  );

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
 * Stage moderation updates for multiple entities.
 * Creates one changeset per entity.
 * 
 * @param entityType - The type of entity (lexical_unit, frame, etc.)
 * @param entityCodes - Array of entity codes/IDs
 * @param updates - The moderation updates (flagged, verifiable, etc.)
 * @param userId - The user making the changes
 * @returns Array of StagedResponse for each entity
 */
export async function stageModerationUpdates(
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
  
  // Fetch current frame
  const frame = await prisma.frames.findUnique({
    where: { id: numericId },
  });

  if (!frame) {
    throw new Error(`Frame not found: ${frameId}`);
  }

  // Fetch current frame roles
  const currentFrameRoles = await prisma.frame_roles.findMany({
    where: { frame_id: numericId },
    orderBy: { id: 'asc' },
  });

  // Check if there's already a pending changeset for this frame
  let changeset = await findPendingChangeset('frame', numericId);

  if (changeset) {
    // Update the frame_roles field change
    await upsertFieldChange(
      changeset.id,
      'frame_roles',
      currentFrameRoles,
      newFrameRoles
    );

    changeset = await getChangeset(changeset.id);
    
    return {
      staged: true,
      changeset_id: changeset!.id.toString(),
      message: 'Frame role changes staged for review',
      field_changes_count: changeset!.field_changes.length,
    };
  }

  // Create new changeset
  const entityWithRoles = {
    ...frame,
    frame_roles: currentFrameRoles,
  };

  const newChangeset = await createChangesetFromUpdate(
    'frame',
    numericId,
    entityWithRoles as Record<string, unknown>,
    { frame_roles: newFrameRoles },
    userId,
    undefined,
  );

  return {
    staged: true,
    changeset_id: newChangeset.id.toString(),
    message: 'Frame role changes staged for review',
    field_changes_count: newChangeset.field_changes.length,
  };
}
