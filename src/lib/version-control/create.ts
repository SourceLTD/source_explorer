/**
 * Version Control - Create Utilities
 * 
 * Functions for creating changesets and field_changes.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  EntityType,
  ChangeOperation,
  CreateChangesetInput,
  CreateFieldChangeInput,
  Changeset,
  FieldChange,
  ChangesetWithFieldChanges,
} from './types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Normalize a value into a JSON-safe, stable representation.
 *
 * - Converts `bigint` to string (JSON doesn't support bigint)
 * - Converts `Date` to ISO string
 * - Converts empty string (`""`) to `null` (system semantics: empty string = null)
 * - Uses `toJSON()` for non-plain objects (e.g. Prisma Decimal)
 * - Sorts object keys for stable ordering
 */
function normalizeForJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  if (typeof value === 'bigint') return value.toString();

  if (typeof value === 'string') {
    // In this system, editing a string field to "" means setting it NULL.
    // Normalizing here keeps equality checks and stored changes consistent.
    if (value === '') return null;
    return value;
  }

  if (typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    // JSON.stringify turns NaN/Infinity into null; preserve a stable string instead.
    if (!Number.isFinite(value)) return String(value);
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForJson);
  }

  if (value instanceof Map) {
    const entries = Array.from(value.entries())
      .map(([k, v]) => [String(k), normalizeForJson(v)] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = v;
    return out;
  }

  if (value instanceof Set) {
    // Preserve deterministic order for equality checks/snapshots.
    return Array.from(value)
      .map(normalizeForJson)
      .sort((a, b) => String(a).localeCompare(String(b)));
  }

  // Respect toJSON() on non-plain objects (e.g. Decimal.js), but avoid altering plain objects.
  const maybeToJson = value as { toJSON?: () => unknown };
  if (!isPlainObject(value) && typeof maybeToJson.toJSON === 'function') {
    try {
      return normalizeForJson(maybeToJson.toJSON());
    } catch {
      // Fall through to best-effort object handling
    }
  }

  // Best-effort: normalize enumerable keys (stable key ordering)
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = normalizeForJson(obj[k]);
  }
  return out;
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(normalizeForJson(value));
}

// Helper to convert value to Prisma JSON value (handling null)
function toJsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  const normalized = normalizeForJson(value);
  if (normalized === null || normalized === undefined) return Prisma.DbNull;
  return normalized as Prisma.InputJsonValue;
}

/**
 * Compare two values for equality using JSON.stringify.
 * Handles null, undefined, objects, and arrays consistently.
 * 
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns true if values are equal (same JSON representation)
 */
export function valuesAreEqual(a: unknown, b: unknown): boolean {
  // Use stable JSON stringify for deep comparison (BigInt-safe, key-order-stable).
  // Note: `normalizeForJson()` implements our edit semantics ("" -> null).
  return stableJsonStringify(a) === stableJsonStringify(b);
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
      llm_jobs: input.llm_job_id ? { connect: { id: input.llm_job_id } } : undefined,
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
 * Custom error class for no-op field changes.
 */
export class NoOpFieldChangeError extends Error {
  constructor(fieldName: string) {
    super(`No-op field change: old_value equals new_value for field "${fieldName}"`);
    this.name = 'NoOpFieldChangeError';
  }
}

/**
 * Create a new field change within a changeset.
 * 
 * @throws {NoOpFieldChangeError} If old_value equals new_value (no actual change)
 */
export async function createFieldChange(
  input: CreateFieldChangeInput
): Promise<FieldChange> {
  // Validate that values are actually different
  if (valuesAreEqual(input.old_value, input.new_value)) {
    throw new NoOpFieldChangeError(input.field_name);
  }
  
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
 * Result of an upsert field change operation.
 */
export interface UpsertFieldChangeResult {
  /** What action was taken */
  action: 'created' | 'updated' | 'deleted' | 'skipped';
  /** The field change record (null if skipped or deleted) */
  fieldChange: FieldChange | null;
  /** Whether the changeset was auto-discarded (only applies to 'deleted' action) */
  changesetDiscarded?: boolean;
}

/**
 * Create or update a field change.
 * If a field change already exists for this field, update it.
 * 
 * If old_value equals new_value (no actual change):
 * - If no existing field change: returns 'skipped' action with null fieldChange
 * - If existing field change: deletes it and returns 'deleted' action
 *   (also auto-discards the changeset if no field changes remain)
 */
export async function upsertFieldChange(
  changesetId: bigint,
  fieldName: string,
  oldValue: unknown,
  newValue: unknown
): Promise<UpsertFieldChangeResult> {
  // Check if this is a no-op (values are equal)
  const isNoOp = valuesAreEqual(oldValue, newValue);
  
  // Check if there's an existing field change for this field
  const existing = await prisma.field_changes.findUnique({
    where: {
      changeset_id_field_name: {
        changeset_id: changesetId,
        field_name: fieldName,
      },
    },
  });
  
  if (isNoOp) {
    if (existing) {
      // Delete the existing field change since values are now equal (reverted)
      await prisma.field_changes.delete({
        where: { id: existing.id },
      });
      
      // Check if there are any remaining field changes in the changeset
      const remainingCount = await prisma.field_changes.count({
        where: { changeset_id: changesetId },
      });
      
      // If no remaining field changes, discard the changeset
      let changesetDiscarded = false;
      if (remainingCount === 0) {
        await prisma.changesets.update({
          where: { id: changesetId },
          data: { status: 'discarded' },
        });
        changesetDiscarded = true;
      }
      
      return {
        action: 'deleted',
        fieldChange: null,
        changesetDiscarded,
      };
    } else {
      // No existing field change and values are equal - skip creation
      return {
        action: 'skipped',
        fieldChange: null,
      };
    }
  }
  
  // Values are different - proceed with upsert
  if (existing) {
    // Update existing field change
    const result = await prisma.field_changes.update({
      where: { id: existing.id },
      data: {
        old_value: toJsonValue(oldValue),
        new_value: toJsonValue(newValue),
        status: 'pending',  // Reset to pending if updated
      },
    });
    
    return {
      action: 'updated',
      fieldChange: transformFieldChange(result),
    };
  } else {
    // Create new field change
    const result = await prisma.field_changes.create({
      data: {
        changeset_id: changesetId,
        field_name: fieldName,
        old_value: toJsonValue(oldValue),
        new_value: toJsonValue(newValue),
        status: 'pending',
      },
    });
    
    return {
      action: 'created',
      fieldChange: transformFieldChange(result),
    };
  }
}

/**
 * Check if all field changes in a changeset are rejected, and auto-discard if so.
 * @param changesetId - The ID of the changeset to check
 * @returns true if the changeset was auto-discarded
 */
export async function checkAndAutoDiscard(changesetId: bigint): Promise<boolean> {
  // Count field changes by status
  const fieldChanges = await prisma.field_changes.findMany({
    where: { changeset_id: changesetId },
    select: { status: true },
  });

  if (fieldChanges.length === 0) {
    return false;
  }

  // Check if ALL field changes are rejected
  const allRejected = fieldChanges.every(fc => fc.status === 'rejected');

  if (allRejected) {
    // Auto-discard the changeset
    await prisma.changesets.update({
      where: { id: changesetId },
      data: { status: 'discarded' },
    });
    return true;
  }

  return false;
}

/**
 * Update the status of a field change (approve/reject).
 * If rejecting and all field changes become rejected, auto-discards the changeset.
 * @param fieldChangeId - The ID of the field change
 * @param status - The new status
 * @param userId - The user making the change (required for approve/reject)
 * @returns The updated field change and whether the changeset was auto-discarded
 */
export async function updateFieldChangeStatus(
  fieldChangeId: bigint,
  status: 'pending' | 'approved' | 'rejected',
  userId?: string
): Promise<FieldChange & { changeset_discarded?: boolean }> {
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

  const fieldChange = transformFieldChange(result);

  // If we just rejected a field, check if all fields are now rejected
  let changeset_discarded = false;
  if (status === 'rejected') {
    changeset_discarded = await checkAndAutoDiscard(result.changeset_id);
  }

  return { ...fieldChange, changeset_discarded };
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
 * If all field changes become rejected, auto-discards the changeset.
 * @param changesetId - The ID of the changeset
 * @param userId - The user rejecting the changes
 * @returns Object with count of rejected changes and whether changeset was auto-discarded
 */
export async function rejectAllFieldChanges(
  changesetId: bigint,
  userId: string
): Promise<{ count: number; changeset_discarded: boolean }> {
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

  // Check if all fields are now rejected and auto-discard if so
  const changeset_discarded = await checkAndAutoDiscard(changesetId);

  return { count: result.count, changeset_discarded };
}

/**
 * Delete a single field change.
 * If it's the last field change in the changeset, discard the changeset too.
 * @param fieldChangeId - The ID of the field change to delete
 * @returns Object with deleted field info and whether the changeset was also discarded
 */
export async function deleteFieldChange(
  fieldChangeId: bigint
): Promise<{ deleted: boolean; changesetDiscarded: boolean }> {
  // First get the field change to find its changeset
  const fieldChange = await prisma.field_changes.findUnique({
    where: { id: fieldChangeId },
    select: { changeset_id: true },
  });

  if (!fieldChange) {
    return { deleted: false, changesetDiscarded: false };
  }

  const changesetId = fieldChange.changeset_id;

  // Delete the field change
  await prisma.field_changes.delete({
    where: { id: fieldChangeId },
  });

  // Check if there are any remaining field changes in the changeset
  const remainingCount = await prisma.field_changes.count({
    where: { changeset_id: changesetId },
  });

  // If no remaining field changes, discard the changeset
  if (remainingCount === 0) {
    await prisma.changesets.update({
      where: { id: changesetId },
      data: { status: 'discarded' },
    });
    return { deleted: true, changesetDiscarded: true };
  }

  return { deleted: true, changesetDiscarded: false };
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
 * @param llmJobId - Optional LLM job ID if this is part of an LLM batch
 */
export async function createChangesetFromUpdate(
  entityType: EntityType,
  entityId: bigint,
  currentEntity: Record<string, unknown>,
  updates: Record<string, unknown>,
  createdBy: string,
  llmJobId?: bigint,
): Promise<ChangesetWithFieldChanges> {
  // Check if there's already a pending changeset for this entity
  const changeset = await findPendingChangeset(entityType, entityId);
  
  if (changeset) {
    // Add/update field changes in the existing changeset
    for (const [fieldName, newValue] of Object.entries(updates)) {
      const oldValue = currentEntity[fieldName];
      
      // upsertFieldChange now handles no-op detection internally
      // It will skip creation or delete existing if values are equal
      await upsertFieldChange(
        changeset.id,
        fieldName,
        oldValue,
        newValue
      );
    }
    
    // Refresh the changeset to get all field changes
    // Note: changeset may have been auto-discarded if all fields were reverted
    const refreshed = await getChangeset(changeset.id);
    if (!refreshed) {
      // Changeset was discarded - return empty result
      return {
        ...changeset,
        field_changes: [],
      };
    }
    return refreshed;
  }
  
  // Filter updates to only include actual changes before creating changeset
  const actualUpdates: Record<string, unknown> = {};
  for (const [fieldName, newValue] of Object.entries(updates)) {
    const oldValue = currentEntity[fieldName];
    if (!valuesAreEqual(oldValue, newValue)) {
      actualUpdates[fieldName] = newValue;
    }
  }
  
  // If no actual changes, don't create a changeset
  if (Object.keys(actualUpdates).length === 0) {
    // Return a "virtual" empty changeset to indicate no changes
    // Callers can check field_changes.length === 0
    return {
      id: BigInt(0),
      entity_type: entityType,
      entity_id: entityId,
      operation: 'update',
      entity_version: (currentEntity.version as number) ?? 1,
      before_snapshot: currentEntity,
      after_snapshot: null,
      status: 'discarded',
      created_by: createdBy,
      created_at: new Date(),
      reviewed_by: null,
      reviewed_at: null,
      committed_at: null,
      llm_job_id: llmJobId ?? null,
      field_changes: [],
    };
  }
  
  // Create a new changeset
  const newChangeset = await createChangeset({
    llm_job_id: llmJobId,
    entity_type: entityType,
    entity_id: entityId,
    operation: 'update',
    entity_version: (currentEntity.version as number) ?? 1,
    before_snapshot: currentEntity,
    created_by: createdBy,
  });
  
  // Create field changes for each actual change
  const fieldChanges: FieldChange[] = [];
  
  for (const [fieldName, newValue] of Object.entries(actualUpdates)) {
    const oldValue = currentEntity[fieldName];
    
    // createFieldChange will throw if values are equal (shouldn't happen here)
    const fc = await createFieldChange({
      changeset_id: newChangeset.id,
      field_name: fieldName,
      old_value: oldValue,
      new_value: newValue,
    });
    fieldChanges.push(fc);
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
 * @param llmJobId - Optional LLM job ID if this is part of an LLM batch
 */
export async function createChangesetFromCreate(
  entityType: EntityType,
  entityData: Record<string, unknown>,
  createdBy: string,
  llmJobId?: bigint,
): Promise<ChangesetWithFieldChanges> {
  // Create the changeset with after_snapshot containing the full entity
  const changeset = await createChangeset({
    llm_job_id: llmJobId,
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
 * @param llmJobId - Optional LLM job ID if this is part of an LLM batch
 */
export async function createChangesetFromDelete(
  entityType: EntityType,
  entityId: bigint,
  currentEntity: Record<string, unknown>,
  createdBy: string,
  llmJobId?: bigint,
): Promise<ChangesetWithFieldChanges> {
  const changeset = await createChangeset({
    llm_job_id: llmJobId,
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
function transformChangeset(result: any): Changeset {
  return {
    id: result.id,
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
    llm_job_id: result.llm_job_id,
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
