/**
 * Version Control - Create Utilities
 * 
 * Functions for creating changegroups, changesets, and field_changes.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  EntityType,
  ChangeOperation,
  ChangegroupSource,
  CreateChangegroupInput,
  CreateChangesetInput,
  CreateFieldChangeInput,
  Changegroup,
  Changeset,
  FieldChange,
  ChangesetWithFieldChanges,
} from './types';

// Helper to convert value to Prisma JSON value (handling null)
function toJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null || value === undefined) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

// ============================================
// Changegroup Operations
// ============================================

/**
 * Create a new changegroup to group related changesets together.
 */
export async function createChangegroup(
  input: CreateChangegroupInput
): Promise<Changegroup> {
  const result = await prisma.changegroups.create({
    data: {
      source: input.source,
      label: input.label ?? null,
      description: input.description ?? null,
      llm_job_id: input.llm_job_id ?? null,
      created_by: input.created_by,
      status: 'pending',
      total_changesets: 0,
      approved_changesets: 0,
      rejected_changesets: 0,
    },
  });

  return transformChangegroup(result);
}

/**
 * Get a changegroup by ID.
 */
export async function getChangegroup(id: bigint): Promise<Changegroup | null> {
  const result = await prisma.changegroups.findUnique({
    where: { id },
  });

  return result ? transformChangegroup(result) : null;
}

/**
 * Update changegroup stats (call after modifying changesets).
 */
export async function updateChangegroupStats(changegroupId: bigint): Promise<void> {
  // Use raw query to call the database function
  await prisma.$executeRaw`SELECT update_changegroup_stats(${changegroupId})`;
}

// ============================================
// Changeset Operations
// ============================================

/**
 * Create a new changeset for an entity modification.
 * 
 * For UPDATE/DELETE: requires entity_id and entity_version
 * For CREATE: entity_id is null, use after_snapshot for the full entity
 */
export async function createChangeset(
  input: CreateChangesetInput
): Promise<Changeset> {
  const result = await prisma.changesets.create({
    data: {
      changegroup_id: input.changegroup_id ?? null,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      operation: input.operation,
      entity_version: input.entity_version ?? null,
      before_snapshot: toJsonValue(input.before_snapshot),
      after_snapshot: toJsonValue(input.after_snapshot),
      created_by: input.created_by,
      status: 'pending',
    },
  });

  // Update changegroup stats if this changeset belongs to one
  if (input.changegroup_id) {
    await updateChangegroupStats(input.changegroup_id);
  }

  return transformChangeset(result);
}

/**
 * Get a changeset by ID with its field changes.
 */
export async function getChangeset(id: bigint): Promise<ChangesetWithFieldChanges | null> {
  const result = await prisma.changesets.findUnique({
    where: { id },
    include: {
      field_changes: true,
    },
  });

  if (!result) return null;

  return {
    ...transformChangeset(result),
    field_changes: result.field_changes.map(transformFieldChange),
  };
}

/**
 * Find an existing pending changeset for an entity.
 * Returns null if no pending changeset exists.
 */
export async function findPendingChangeset(
  entityType: EntityType,
  entityId: bigint
): Promise<ChangesetWithFieldChanges | null> {
  const result = await prisma.changesets.findFirst({
    where: {
      entity_type: entityType,
      entity_id: entityId,
      status: 'pending',
    },
    include: {
      field_changes: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  if (!result) return null;

  return {
    ...transformChangeset(result),
    field_changes: result.field_changes.map(transformFieldChange),
  };
}

/**
 * Get all pending changesets for a list of entity IDs.
 * Useful for merging pending changes into query results.
 */
export async function getPendingChangesetsForEntities(
  entityType: EntityType,
  entityIds: bigint[]
): Promise<Map<bigint, ChangesetWithFieldChanges>> {
  if (entityIds.length === 0) {
    return new Map();
  }

  const results = await prisma.changesets.findMany({
    where: {
      entity_type: entityType,
      entity_id: { in: entityIds },
      status: 'pending',
    },
    include: {
      field_changes: {
        where: {
          status: 'approved',
        },
      },
    },
  });

  const map = new Map<bigint, ChangesetWithFieldChanges>();
  for (const result of results) {
    if (result.entity_id !== null) {
      map.set(result.entity_id, {
        ...transformChangeset(result),
        field_changes: result.field_changes.map(transformFieldChange),
      });
    }
  }

  return map;
}

// ============================================
// Field Change Operations
// ============================================

/**
 * Create a new field change within a changeset.
 */
export async function createFieldChange(
  input: CreateFieldChangeInput
): Promise<FieldChange> {
  const result = await prisma.field_changes.create({
    data: {
      changeset_id: input.changeset_id,
      field_name: input.field_name,
      old_value: toJsonValue(input.old_value),
      new_value: toJsonValue(input.new_value),
      status: 'pending',
    },
  });

  return transformFieldChange(result);
}

/**
 * Create or update a field change.
 * If a field change already exists for this field, update it.
 */
export async function upsertFieldChange(
  changesetId: bigint,
  fieldName: string,
  oldValue: unknown,
  newValue: unknown
): Promise<FieldChange> {
  const result = await prisma.field_changes.upsert({
    where: {
      changeset_id_field_name: {
        changeset_id: changesetId,
        field_name: fieldName,
      },
    },
    update: {
      old_value: toJsonValue(oldValue),
      new_value: toJsonValue(newValue),
      status: 'pending',  // Reset to pending if updated
    },
    create: {
      changeset_id: changesetId,
      field_name: fieldName,
      old_value: toJsonValue(oldValue),
      new_value: toJsonValue(newValue),
      status: 'pending',
    },
  });

  return transformFieldChange(result);
}

/**
 * Update the status of a field change (approve/reject).
 * @param fieldChangeId - The ID of the field change
 * @param status - The new status
 * @param userId - The user making the change (required for approve/reject)
 */
export async function updateFieldChangeStatus(
  fieldChangeId: bigint,
  status: 'pending' | 'approved' | 'rejected',
  userId?: string
): Promise<FieldChange> {
  const updateData: Record<string, unknown> = { status };
  
  if (status === 'approved') {
    updateData.approved_by = userId ?? null;
    updateData.approved_at = new Date();
    // Clear rejection fields if approving
    updateData.rejected_by = null;
    updateData.rejected_at = null;
  } else if (status === 'rejected') {
    updateData.rejected_by = userId ?? null;
    updateData.rejected_at = new Date();
    // Clear approval fields if rejecting
    updateData.approved_by = null;
    updateData.approved_at = null;
  } else {
    // Reset to pending - clear both
    updateData.approved_by = null;
    updateData.approved_at = null;
    updateData.rejected_by = null;
    updateData.rejected_at = null;
  }
  
  const result = await prisma.field_changes.update({
    where: { id: fieldChangeId },
    data: updateData,
  });

  return transformFieldChange(result);
}

/**
 * Approve all pending field changes in a changeset.
 * @param changesetId - The ID of the changeset
 * @param userId - The user approving the changes
 */
export async function approveAllFieldChanges(
  changesetId: bigint,
  userId: string
): Promise<number> {
  const result = await prisma.field_changes.updateMany({
    where: {
      changeset_id: changesetId,
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

  return result.count;
}

/**
 * Reject all pending field changes in a changeset.
 * @param changesetId - The ID of the changeset
 * @param userId - The user rejecting the changes
 */
export async function rejectAllFieldChanges(
  changesetId: bigint,
  userId: string
): Promise<number> {
  const result = await prisma.field_changes.updateMany({
    where: {
      changeset_id: changesetId,
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

  return result.count;
}

// ============================================
// High-Level Helper: Create Changeset from Entity Update
// ============================================

/**
 * Create a changeset with field changes for an entity update.
 * This is the main function to call when intercepting an edit.
 * 
 * @param entityType - The type of entity being modified
 * @param entityId - The ID of the entity (from the primary key)
 * @param currentEntity - The current state of the entity (for before_snapshot)
 * @param updates - The proposed changes (field name -> new value)
 * @param createdBy - The user making the change
 * @param changegroupId - Optional changegroup to add this changeset to
 */
export async function createChangesetFromUpdate(
  entityType: EntityType,
  entityId: bigint,
  currentEntity: Record<string, unknown>,
  updates: Record<string, unknown>,
  createdBy: string,
  changegroupId?: bigint
): Promise<ChangesetWithFieldChanges> {
  // Check if there's already a pending changeset for this entity
  let changeset = await findPendingChangeset(entityType, entityId);
  
  if (changeset) {
    // Add/update field changes in the existing changeset
    const fieldChanges: FieldChange[] = [];
    
    for (const [fieldName, newValue] of Object.entries(updates)) {
      const oldValue = currentEntity[fieldName];
      
      // Only create field change if value actually changed
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        const fc = await upsertFieldChange(
          changeset.id,
          fieldName,
          oldValue,
          newValue
        );
        fieldChanges.push(fc);
      }
    }
    
    // Refresh the changeset to get all field changes
    changeset = await getChangeset(changeset.id);
    return changeset!;
  }
  
  // Create a new changeset
  const newChangeset = await createChangeset({
    changegroup_id: changegroupId,
    entity_type: entityType,
    entity_id: entityId,
    operation: 'update',
    entity_version: (currentEntity.version as number) ?? 1,
    before_snapshot: currentEntity,
    created_by: createdBy,
  });
  
  // Create field changes for each updated field
  const fieldChanges: FieldChange[] = [];
  
  for (const [fieldName, newValue] of Object.entries(updates)) {
    const oldValue = currentEntity[fieldName];
    
    // Only create field change if value actually changed
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      const fc = await createFieldChange({
        changeset_id: newChangeset.id,
        field_name: fieldName,
        old_value: oldValue,
        new_value: newValue,
      });
      fieldChanges.push(fc);
    }
  }
  
  return {
    ...newChangeset,
    field_changes: fieldChanges,
  };
}

/**
 * Create a changeset for a new entity (CREATE operation).
 * 
 * @param entityType - The type of entity being created
 * @param entityData - The full entity data
 * @param createdBy - The user creating the entity
 * @param changegroupId - Optional changegroup to add this changeset to
 */
export async function createChangesetFromCreate(
  entityType: EntityType,
  entityData: Record<string, unknown>,
  createdBy: string,
  changegroupId?: bigint
): Promise<ChangesetWithFieldChanges> {
  // Create the changeset with after_snapshot containing the full entity
  const changeset = await createChangeset({
    changegroup_id: changegroupId,
    entity_type: entityType,
    entity_id: undefined,  // No ID yet
    operation: 'create',
    entity_version: undefined,
    before_snapshot: undefined,
    after_snapshot: entityData,
    created_by: createdBy,
  });
  
  // For CREATE operations, we don't create individual field_changes
  // The entire entity is the change
  return {
    ...changeset,
    field_changes: [],
  };
}

/**
 * Create a changeset for deleting an entity.
 * 
 * @param entityType - The type of entity being deleted
 * @param entityId - The ID of the entity
 * @param currentEntity - The current state of the entity (for audit purposes)
 * @param createdBy - The user deleting the entity
 * @param changegroupId - Optional changegroup to add this changeset to
 */
export async function createChangesetFromDelete(
  entityType: EntityType,
  entityId: bigint,
  currentEntity: Record<string, unknown>,
  createdBy: string,
  changegroupId?: bigint
): Promise<ChangesetWithFieldChanges> {
  const changeset = await createChangeset({
    changegroup_id: changegroupId,
    entity_type: entityType,
    entity_id: entityId,
    operation: 'delete',
    entity_version: (currentEntity.version as number) ?? 1,
    before_snapshot: currentEntity,
    created_by: createdBy,
  });
  
  return {
    ...changeset,
    field_changes: [],
  };
}

// ============================================
// Transform Functions (Prisma -> our types)
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformChangegroup(result: any): Changegroup {
  return {
    id: result.id,
    source: result.source as ChangegroupSource,
    label: result.label,
    description: result.description,
    llm_job_id: result.llm_job_id,
    status: result.status,
    created_by: result.created_by,
    created_at: result.created_at,
    committed_by: result.committed_by,
    committed_at: result.committed_at,
    total_changesets: result.total_changesets,
    approved_changesets: result.approved_changesets,
    rejected_changesets: result.rejected_changesets,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformChangeset(result: any): Changeset {
  return {
    id: result.id,
    changegroup_id: result.changegroup_id,
    entity_type: result.entity_type as EntityType,
    entity_id: result.entity_id,
    operation: result.operation as ChangeOperation,
    entity_version: result.entity_version,
    before_snapshot: result.before_snapshot as Record<string, unknown> | null,
    after_snapshot: result.after_snapshot as Record<string, unknown> | null,
    status: result.status,
    created_by: result.created_by,
    created_at: result.created_at,
    reviewed_by: result.reviewed_by,
    reviewed_at: result.reviewed_at,
    committed_at: result.committed_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformFieldChange(result: any): FieldChange {
  return {
    id: result.id,
    changeset_id: result.changeset_id,
    field_name: result.field_name,
    old_value: result.old_value,
    new_value: result.new_value,
    status: result.status,
    approved_by: result.approved_by,
    approved_at: result.approved_at,
    rejected_by: result.rejected_by,
    rejected_at: result.rejected_at,
  };
}

