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
import { EntityType } from './types';

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

type EntityTable = 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames';

const ENTITY_TYPE_TO_PRISMA_TABLE: Record<EntityType, EntityTable | null> = {
  verb: 'verbs',
  noun: 'nouns',
  adjective: 'adjectives',
  adverb: 'adverbs',
  frame: 'frames',
  frame_role: null,
  role: null,
  recipe: null,
  verb_relation: null,
  noun_relation: null,
  adjective_relation: null,
  adverb_relation: null,
  frame_relation: null,
};

/**
 * Fetch the current state of an entity by its code (string ID like "run.v.01")
 */
async function fetchEntityByCode(
  entityType: EntityType,
  code: string
): Promise<{ entity: Record<string, unknown>; numericId: bigint } | null> {
  const table = ENTITY_TYPE_TO_PRISMA_TABLE[entityType];
  if (!table) return null;

  let entity: Record<string, unknown> | null = null;

  switch (table) {
    case 'verbs':
      entity = await prisma.verbs.findUnique({
        where: { code, deleted: false } as any,
      }) as Record<string, unknown> | null;
      break;
    case 'nouns':
      entity = await prisma.nouns.findUnique({
        where: { code, deleted: false } as any,
      }) as Record<string, unknown> | null;
      break;
    case 'adjectives':
      entity = await prisma.adjectives.findUnique({
        where: { code, deleted: false } as any,
      }) as Record<string, unknown> | null;
      break;
    case 'adverbs':
      entity = await prisma.adverbs.findUnique({
        where: { code, deleted: false } as any,
      }) as Record<string, unknown> | null;
      break;
    case 'frames':
      // Frames use numeric ID, not code
      try {
        const frameId = BigInt(code);
        entity = await prisma.frames.findUnique({
          where: { id: frameId, deleted: false },
        }) as Record<string, unknown> | null;
      } catch {
        // Invalid BigInt conversion - frame not found
        return null;
      }
      break;
  }

  if (!entity) return null;

  return {
    entity,
    numericId: entity.id as bigint,
  };
}

// ============================================
// Main Staging Functions
// ============================================

/**
 * Stage an update to an entity. Creates a changeset with field changes.
 * 
 * @param entityType - The type of entity (verb, noun, etc.)
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

  // Create or update the changeset
  const changeset = await createChangesetFromUpdate(
    entityType,
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
 * @param entityType - The type of entity (verb, noun, etc.)
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
  // Fetch current entity state
  const result = await fetchEntityByCode(entityType, entityCode);
  if (!result) {
    throw new Error(`Entity not found: ${entityType}:${entityCode}`);
  }

  const { entity, numericId } = result;

  // Create delete changeset
  const changeset = await createChangesetFromDelete(
    entityType,
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
 * @param entityType - The type of entity (verb, noun, etc.)
 * @param entityCodes - Array of entity codes/IDs
 * @param updates - The moderation updates (flagged, forbidden, etc.)
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
 * Stage updates to roles for a verb.
 * Roles are complex - we store them as a JSON blob in the changeset.
 * 
 * @param entityCode - The verb code (e.g., "run.v.01")
 * @param newRoles - The new roles array
 * @param newRoleGroups - The new role groups array (optional)
 * @param userId - The user making the changes
 * @param comment - Optional justification for the changes
 */
export async function stageRolesUpdate(
  entityCode: string,
  newRoles: unknown[],
  newRoleGroups: unknown[] | undefined,
  userId: string,
  comment?: string
): Promise<StagedResponse> {
  const result = await fetchEntityByCode('verb', entityCode);
  if (!result) {
    throw new Error(`Verb not found: ${entityCode}`);
  }

  const { entity, numericId } = result;

  // Fetch current roles
  const currentRoles = await prisma.roles.findMany({
    where: { verb_id: numericId },
    orderBy: { id: 'asc' },
  });

  // Fetch current role groups
  const currentRoleGroups = await prisma.role_groups.findMany({
    where: { verb_id: numericId },
    orderBy: { id: 'asc' },
  });

  // Check if there's already a pending changeset for this entity
  let changeset = await findPendingChangeset('verb', numericId);

  if (changeset) {
    // Update the roles field change
    await upsertFieldChange(
      changeset.id,
      'roles',
      currentRoles,
      newRoles
    );
    
    if (newRoleGroups !== undefined) {
      await upsertFieldChange(
        changeset.id,
        'role_groups',
        currentRoleGroups,
        newRoleGroups
      );
    }

    changeset = await getChangeset(changeset.id);
    
    return {
      staged: true,
      changeset_id: changeset!.id.toString(),
      message: 'Role changes staged for review',
      field_changes_count: changeset!.field_changes.length,
    };
  }

  // Create new changeset with roles as a field change
  const updates: Record<string, unknown> = {
    roles: newRoles,
  };
  if (newRoleGroups !== undefined) {
    updates.role_groups = newRoleGroups;
  }

  // Create the changeset using the existing helper but with roles in the before_snapshot
  const entityWithRoles = {
    ...entity,
    roles: currentRoles,
    role_groups: currentRoleGroups,
  };

  const newChangeset = await createChangesetFromUpdate(
    'verb',
    numericId,
    entityWithRoles,
    updates,
    userId,
    undefined,
  );

  return {
    staged: true,
    changeset_id: newChangeset.id.toString(),
    message: 'Role changes staged for review',
    field_changes_count: newChangeset.field_changes.length,
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

