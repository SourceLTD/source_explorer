/**
 * Version Control - Merge Utilities
 * 
 * Functions for merging pending changes with entity query results.
 * This allows the UI to display the "preview" state of entities
 * with their uncommitted changes applied.
 */

import { prisma } from '@/lib/prisma';
import {
  EntityType,
  ChangesetWithFieldChanges,
  WithPendingChanges,
  PendingFieldInfo,
  FieldChangeStatus,
  normalizeEntityType,
} from './types';
import {
  PendingChangeInfo,
  PendingFieldChange,
  PendingChangeOperation,
} from '@/lib/types';
import {
  applyFrameRolesSubChanges,
  parseFrameRolesFieldName,
  type NormalizedFrameRole,
} from './frameRolesSubfields';

// ============================================
// Core Merge Functions
// ============================================

/**
 * Merge pending changes into a list of entities.
 * 
 * This is the main function to use after fetching entities from the database.
 * It will:
 * 1. Find all pending changesets for the given entity IDs
 * 2. Apply approved field changes to each entity
 * 3. Return entities with pending change metadata
 * 
 * @param entities - The base entities fetched from the database
 * @param entityType - The type of entity (verb, noun, etc.)
 * @param getId - Function to extract the ID from an entity
 * @returns Entities with pending changes merged in
 */
export async function withPendingChanges<T extends Record<string, unknown>>(
  entities: T[],
  entityType: EntityType,
  getId: (entity: T) => bigint
): Promise<WithPendingChanges<T>[]> {
  if (entities.length === 0) {
    return [];
  }

  // Get all entity IDs
  const entityIds = entities.map(getId);

  // Fetch pending changesets for these entities
  const pendingChangesets = await getPendingChangesetsMap(entityType, entityIds);

  // Merge changes into each entity
  return entities.map(entity => {
    const entityId = getId(entity);
    const changeset = pendingChangesets.get(entityId);

    if (!changeset) {
      // No pending changes for this entity
      return {
        data: entity,
        has_pending: false,
        is_pending_create: false,
        is_pending_delete: false,
        changeset_id: null,
        pending_fields: new Map(),
      };
    }

    return mergeChangesetIntoEntity(entity, changeset);
  });
}

/**
 * Merge a single changeset into an entity.
 */
export function mergeChangesetIntoEntity<T extends Record<string, unknown>>(
  entity: T,
  changeset: ChangesetWithFieldChanges
): WithPendingChanges<T> {
  // Build the merged data
  const mergedData = { ...entity };
  const pendingFields = new Map<string, PendingFieldInfo>();

  // Apply approved field changes
  for (const fc of changeset.field_changes) {
    pendingFields.set(fc.field_name, {
      field_change_id: fc.id,
      old_value: fc.old_value,
      new_value: fc.new_value,
      status: fc.status as FieldChangeStatus,
      approved_by: fc.approved_by,
      approved_at: fc.approved_at,
      rejected_by: fc.rejected_by,
      rejected_at: fc.rejected_at,
    });

    // Only apply approved changes to the merged data
    if (fc.status === 'approved') {
      mergedData[fc.field_name as keyof T] = fc.new_value as T[keyof T];
    }
  }

  return {
    data: mergedData,
    has_pending: true,
    is_pending_create: changeset.operation === 'create',
    is_pending_delete: changeset.operation === 'delete',
    changeset_id: changeset.id,
    pending_fields: pendingFields,
  };
}

/**
 * Get pending changesets as a map keyed by entity ID.
 */
async function getPendingChangesetsMap(
  entityType: EntityType,
  entityIds: bigint[]
): Promise<Map<bigint, ChangesetWithFieldChanges>> {
  if (entityIds.length === 0) {
    return new Map();
  }

  const normalizedType = normalizeEntityType(entityType);

  const results = await prisma.changesets.findMany({
    where: {
      entity_type: normalizedType,
      entity_id: { in: entityIds },
      status: 'pending',
    },
    include: {
      field_changes: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  const map = new Map<bigint, ChangesetWithFieldChanges>();
  
  for (const result of results) {
    if (result.entity_id !== null && !map.has(result.entity_id)) {
      // Only take the most recent changeset per entity
      map.set(result.entity_id, {
        id: result.id,
        entity_type: result.entity_type as EntityType,
        entity_id: result.entity_id,
        operation: result.operation as 'create' | 'update' | 'delete',
        entity_version: result.entity_version,
        before_snapshot: result.before_snapshot as Record<string, unknown> | null,
        after_snapshot: result.after_snapshot as Record<string, unknown> | null,
        status: result.status as 'pending' | 'committed' | 'discarded',
        created_by: result.created_by,
        created_at: result.created_at,
        reviewed_by: result.reviewed_by,
        reviewed_at: result.reviewed_at,
        committed_at: result.committed_at,
        llm_job_id: result.llm_job_id,
        field_changes: result.field_changes.map(fc => ({
          id: fc.id,
          changeset_id: fc.changeset_id,
          field_name: fc.field_name,
          old_value: fc.old_value,
          new_value: fc.new_value,
          status: fc.status as FieldChangeStatus,
          approved_by: fc.approved_by,
          approved_at: fc.approved_at,
          rejected_by: fc.rejected_by,
          rejected_at: fc.rejected_at,
        })),
      });
    }
  }

  return map;
}

// ============================================
// Pending Creates
// ============================================

/**
 * Get all pending CREATE changesets for an entity type.
 * These are "virtual" entities that don't exist in the main table yet.
 * 
 * @param entityType - The type of entity
 * @param filters - Optional filters to apply (e.g., by created_by)
 * @returns Array of pending create changesets with synthetic negative IDs
 */
export async function getPendingCreates(
  entityType: EntityType,
  filters?: {
    created_by?: string;
    llm_job_id?: bigint;
  }
): Promise<ChangesetWithFieldChanges[]> {
  const normalizedType = normalizeEntityType(entityType);
  const results = await prisma.changesets.findMany({
    where: {
      entity_type: normalizedType,
      operation: 'create',
      status: 'pending',
      ...(filters?.created_by && { created_by: filters.created_by }),
      ...(filters?.llm_job_id && { llm_job_id: filters.llm_job_id }),
    },
    include: {
      field_changes: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  return results.map(result => ({
    id: result.id,
    entity_type: result.entity_type as EntityType,
    entity_id: result.entity_id,
    operation: result.operation as 'create' | 'update' | 'delete',
    entity_version: result.entity_version,
    before_snapshot: result.before_snapshot as Record<string, unknown> | null,
    after_snapshot: result.after_snapshot as Record<string, unknown> | null,
    status: result.status as 'pending' | 'committed' | 'discarded',
    created_by: result.created_by,
    created_at: result.created_at,
    reviewed_by: result.reviewed_by,
    reviewed_at: result.reviewed_at,
    committed_at: result.committed_at,
    llm_job_id: result.llm_job_id,
    field_changes: result.field_changes.map(fc => ({
      id: fc.id,
      changeset_id: fc.changeset_id,
      field_name: fc.field_name,
      old_value: fc.old_value,
      new_value: fc.new_value,
      status: fc.status as FieldChangeStatus,
      approved_by: fc.approved_by,
      approved_at: fc.approved_at,
      rejected_by: fc.rejected_by,
      rejected_at: fc.rejected_at,
    })),
  }));
}

/**
 * Convert a pending CREATE changeset to a virtual entity with a negative ID.
 * The negative ID is -changeset_id, making it unique and easily identifiable.
 * 
 * @param changeset - The pending create changeset
 * @returns A virtual entity with the proposed data and a negative ID
 */
export function pendingCreateToVirtualEntity<T extends { id: bigint }>(
  changeset: ChangesetWithFieldChanges
): WithPendingChanges<T> {
  if (changeset.operation !== 'create' || !changeset.after_snapshot) {
    throw new Error('Can only convert CREATE changesets with after_snapshot to virtual entities');
  }

  // Use negative changeset ID as the synthetic entity ID
  const virtualId = -changeset.id;
  
  const data = {
    ...changeset.after_snapshot,
    id: virtualId,
  } as T;

  return {
    data,
    has_pending: true,
    is_pending_create: true,
    is_pending_delete: false,
    changeset_id: changeset.id,
    pending_fields: new Map(),  // For creates, all fields are "new"
  };
}

// ============================================
// Pending Deletes
// ============================================

/**
 * Get IDs of entities that have pending DELETE changesets.
 */
export async function getPendingDeleteIds(
  entityType: EntityType
): Promise<Set<bigint>> {
  const normalizedType = normalizeEntityType(entityType);
  const results = await prisma.changesets.findMany({
    where: {
      entity_type: normalizedType,
      operation: 'delete',
      status: 'pending',
    },
    select: {
      entity_id: true,
    },
  });

  return new Set(
    results
      .filter(r => r.entity_id !== null)
      .map(r => r.entity_id!)
  );
}

// ============================================
// Quick Checks
// ============================================

/**
 * Check if there are any pending changesets for an entity type.
 * Useful for quick checks to skip merge logic when no pending changes exist.
 */
export async function hasPendingChanges(entityType: EntityType): Promise<boolean> {
  const count = await prisma.changesets.count({
    where: {
      entity_type: entityType,
      status: 'pending',
    },
  });

  return count > 0;
}

/**
 * Check if a specific entity has pending changes.
 */
export async function entityHasPendingChanges(
  entityType: EntityType,
  entityId: bigint
): Promise<boolean> {
  const count = await prisma.changesets.count({
    where: {
      entity_type: entityType,
      entity_id: entityId,
      status: 'pending',
    },
  });

  return count > 0;
}

/**
 * Get the dirty set - entity IDs that have pending changes.
 * This is useful for the optimized query pattern where we only
 * fetch pending changes for entities that actually have them.
 */
export async function getDirtyEntityIds(entityType: EntityType): Promise<Set<bigint>> {
  const results = await prisma.changesets.findMany({
    where: {
      entity_type: entityType,
      status: 'pending',
      entity_id: { not: null },
    },
    select: {
      entity_id: true,
    },
    distinct: ['entity_id'],
  });

  return new Set(
    results
      .filter(r => r.entity_id !== null)
      .map(r => r.entity_id!)
  );
}

// ============================================
// Utility: Check if Entity is Pending Create
// ============================================

/**
 * Check if an entity ID represents a pending create (negative ID).
 */
export function isPendingCreateId(id: bigint): boolean {
  return id < BigInt(0);
}

/**
 * Get the changeset ID from a pending create's virtual entity ID.
 */
export function getChangesetIdFromVirtualId(virtualId: bigint): bigint {
  if (virtualId >= BigInt(0)) {
    throw new Error('Not a virtual entity ID (must be negative)');
  }
  return -virtualId;
}

// ============================================
// API Serialization Helpers
// ============================================

/**
 * Convert internal WithPendingChanges to API-friendly PendingChangeInfo.
 * This converts Maps and BigInts to JSON-serializable formats.
 */
export function toPendingChangeInfo(
  changeset: ChangesetWithFieldChanges
): PendingChangeInfo {
  const pendingFields: Record<string, PendingFieldChange> = {};

  for (const fc of changeset.field_changes) {
    pendingFields[fc.field_name] = {
      field_change_id: fc.id.toString(),
      old_value: fc.old_value,
      new_value: fc.new_value,
      status: fc.status as 'pending' | 'approved' | 'rejected',
    };
  }

  return {
    operation: changeset.operation as PendingChangeOperation,
    changeset_id: changeset.id.toString(),
    pending_fields: pendingFields,
  };
}

// ============================================
// Pending Field Hydration (API preview helpers)
// ============================================

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

function extractRoleTypeLabel(v: unknown): string {
  if (!isRecord(v)) return '';
  const label =
    (typeof v.roleType === 'string' ? v.roleType.trim() : '') ||
    (typeof v.role_type_label === 'string' ? v.role_type_label.trim() : '') ||
    (isRecord(v.role_type) && typeof v.role_type.label === 'string' ? v.role_type.label.trim() : '') ||
    (isRecord(v.role_types) && typeof v.role_types.label === 'string' ? v.role_types.label.trim() : '');

  return label || '';
}

function normalizeFrameRolesFromApiValue(rawValue: unknown): NormalizedFrameRole[] {
  if (!Array.isArray(rawValue)) return [];
  const normalized: NormalizedFrameRole[] = [];
  for (const role of rawValue) {
    const obj = isRecord(role) ? role : {};
    const roleType = extractRoleTypeLabel(obj);
    if (!roleType) continue;

    const examples = Array.isArray(obj.examples)
      ? obj.examples.filter((ex): ex is string => typeof ex === 'string')
      : [];

    normalized.push({
      roleType,
      description: typeof obj.description === 'string' ? obj.description : null,
      notes: typeof obj.notes === 'string' ? obj.notes : null,
      main: typeof obj.main === 'boolean' ? obj.main : Boolean(obj.main),
      examples,
      label: typeof obj.label === 'string' ? obj.label : null,
    });
  }
  normalized.sort((a, b) => a.roleType.localeCompare(b.roleType));
  return normalized;
}

function normalizedFrameRolesToClientPayload(roles: NormalizedFrameRole[]): Array<Record<string, unknown>> {
  return roles.map(r => ({
    roleType: r.roleType,
    description: r.description,
    notes: r.notes,
    main: r.main,
    examples: r.examples,
    label: r.label,
  }));
}

function hydratePendingFrameRolesForApi(
  entity: Record<string, unknown>,
  rawValue: unknown,
  roleTypeByLabel: Map<string, { id: bigint; code: string; label: string; generic_description: string; explanation: string | null }>
): unknown {
  if (!Array.isArray(rawValue)) return rawValue;

  // Map existing role IDs/labels by role type label so pending previews stay stable.
  const existingRoles = Array.isArray((entity as any).frame_roles) ? (entity as any).frame_roles : [];
  const existingByRoleTypeLabel = new Map<string, any>();
  for (const r of existingRoles) {
    const roleTypeLabel = isRecord(r) && isRecord((r as any).role_type) && typeof (r as any).role_type.label === 'string'
      ? (r as any).role_type.label
      : '';
    if (roleTypeLabel) existingByRoleTypeLabel.set(roleTypeLabel, r);
  }

  return rawValue.map((role, idx) => {
    const obj = isRecord(role) ? role : {};
    const roleTypeLabel = extractRoleTypeLabel(obj);
    const existing = existingByRoleTypeLabel.get(roleTypeLabel);
    const rt = roleTypeByLabel.get(roleTypeLabel);

    const role_type = rt
      ? {
          id: rt.id.toString(),
          code: rt.code,
          label: rt.label,
          generic_description: rt.generic_description,
          explanation: rt.explanation,
        }
      : {
          id: '',
          code: undefined,
          label: roleTypeLabel || 'Unknown',
          generic_description: '',
          explanation: null,
        };

    const examples = Array.isArray(obj.examples)
      ? obj.examples.filter((ex): ex is string => typeof ex === 'string')
      : [];

    return {
      id:
        typeof obj.id === 'string'
          ? obj.id
          : (existing && typeof existing.id === 'string' ? existing.id : `pending-role-${idx}`),
      description: typeof obj.description === 'string' ? obj.description : null,
      notes: typeof obj.notes === 'string' ? obj.notes : null,
      main: typeof obj.main === 'boolean' ? obj.main : Boolean(obj.main),
      examples,
      label:
        typeof obj.label === 'string'
          ? obj.label
          : (existing && typeof existing.label === 'string' ? existing.label : null),
      role_type,
    };
  });
}

/**
 * Attach pending change info to entities for API responses.
 * Returns entities with their data plus a `pending` field.
 * 
 * Unlike withPendingChanges(), this:
 * - Returns JSON-serializable format (no Maps, BigInts as strings)
 * - Attaches pending info directly to entity object
 * - Applies pending new values to the entity data for preview
 */
export async function attachPendingInfoToEntities<T extends object>(
  entities: T[],
  entityType: EntityType,
  getId: (entity: T) => bigint
): Promise<Array<T & { pending: PendingChangeInfo | null }>> {
  if (entities.length === 0) {
    return [];
  }

  // Get all entity IDs
  const entityIds = entities.map(getId);

  // Fetch pending changesets for these entities
  const pendingChangesets = await getPendingChangesetsMap(entityType, entityIds);

  // Preload role types used by pending frame_roles so list/table endpoints can
  // render the same API shape as "live" records (role_type nested object).
  let roleTypeByLabel: Map<string, { id: bigint; code: string; label: string; generic_description: string; explanation: string | null }> | null = null;
  if (entityType === 'frame') {
    const labels = new Set<string>();
    for (const cs of pendingChangesets.values()) {
      for (const fc of cs.field_changes) {
        if (fc.status !== 'pending' && fc.status !== 'approved') continue;
        if (fc.field_name === 'frame_roles') {
          if (!Array.isArray(fc.new_value)) continue;
          for (const r of fc.new_value) {
            const label = extractRoleTypeLabel(r);
            if (label) labels.add(label);
          }
          continue;
        }

        const parsed = parseFrameRolesFieldName(fc.field_name);
        if (parsed?.roleType) labels.add(parsed.roleType);
      }
    }

    if (labels.size > 0) {
      const roleTypes = await prisma.role_types.findMany({
        where: { label: { in: Array.from(labels) } },
      });
      roleTypeByLabel = new Map(roleTypes.map(rt => [rt.label, rt]));
    } else {
      roleTypeByLabel = new Map();
    }
  }

  // Attach pending info to each entity
  return entities.map(entity => {
    const entityId = getId(entity);
    const changeset = pendingChangesets.get(entityId);

    if (!changeset) {
      return {
        ...entity,
        pending: null,
      };
    }

    // Apply pending field values to entity for preview
    const updatedEntity = { ...entity };
    const pendingFrameRoleSubChanges: Array<{ field_name: string; new_value: unknown }> = [];
    for (const fc of changeset.field_changes) {
      // Apply all pending changes (not just approved) for preview
      if (fc.status === 'pending' || fc.status === 'approved') {
        if (entityType === 'frame') {
          if (fc.field_name === 'frame_roles' && roleTypeByLabel) {
            (updatedEntity as Record<string, unknown>).frame_roles = hydratePendingFrameRolesForApi(
              updatedEntity as unknown as Record<string, unknown>,
              fc.new_value,
              roleTypeByLabel
            );
            continue;
          }

          if (fc.field_name.startsWith('frame_roles.')) {
            pendingFrameRoleSubChanges.push({ field_name: fc.field_name, new_value: fc.new_value });
            continue;
          }
        }

        (updatedEntity as Record<string, unknown>)[fc.field_name] = fc.new_value;
      }
    }

    // Apply granular frame_roles.* patches on top of the current preview frame_roles.
    if (entityType === 'frame' && roleTypeByLabel && pendingFrameRoleSubChanges.length > 0) {
      const baseRoles = normalizeFrameRolesFromApiValue((updatedEntity as any).frame_roles);
      const patched = applyFrameRolesSubChanges(baseRoles, pendingFrameRoleSubChanges);
      (updatedEntity as Record<string, unknown>).frame_roles = hydratePendingFrameRolesForApi(
        updatedEntity as unknown as Record<string, unknown>,
        normalizedFrameRolesToClientPayload(patched),
        roleTypeByLabel
      );
    }

    return {
      ...updatedEntity,
      pending: toPendingChangeInfo(changeset),
    };
  });
}

/**
 * Get pending change info for a single entity by its ID.
 */
export async function getPendingInfoForEntity(
  entityType: EntityType,
  entityId: bigint
): Promise<PendingChangeInfo | null> {
  const changeset = await prisma.changesets.findFirst({
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

  if (!changeset) {
    return null;
  }

  return toPendingChangeInfo({
    id: changeset.id,
    entity_type: changeset.entity_type as EntityType,
    entity_id: changeset.entity_id,
    operation: changeset.operation as 'create' | 'update' | 'delete',
    entity_version: changeset.entity_version,
    before_snapshot: changeset.before_snapshot as Record<string, unknown> | null,
    after_snapshot: changeset.after_snapshot as Record<string, unknown> | null,
    status: changeset.status as 'pending' | 'committed' | 'discarded',
    created_by: changeset.created_by,
    created_at: changeset.created_at,
    reviewed_by: changeset.reviewed_by,
    reviewed_at: changeset.reviewed_at,
    committed_at: changeset.committed_at,
    llm_job_id: changeset.llm_job_id,
    field_changes: changeset.field_changes.map(fc => ({
      id: fc.id,
      changeset_id: fc.changeset_id,
      field_name: fc.field_name,
      old_value: fc.old_value,
      new_value: fc.new_value,
      status: fc.status as FieldChangeStatus,
      approved_by: fc.approved_by,
      approved_at: fc.approved_at,
      rejected_by: fc.rejected_by,
      rejected_at: fc.rejected_at,
    })),
  });
}

/**
 * Apply pending changes to a single entity and return both the modified entity and pending info.
 * This merges pending field values into the entity data for preview display.
 */
export async function applyPendingToEntity<T extends object>(
  entity: T,
  entityType: EntityType,
  entityId: bigint
): Promise<{ entity: T; pending: PendingChangeInfo | null }> {
  const changeset = await prisma.changesets.findFirst({
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

  if (!changeset) {
    return { entity, pending: null };
  }

  // Apply pending field values to entity for preview
  const updatedEntity = { ...entity };
  const pendingFrameRoleSubChanges: Array<{ field_name: string; new_value: unknown }> = [];
  let roleTypeByLabel: Map<string, { id: bigint; code: string; label: string; generic_description: string; explanation: string | null }> | null = null;

  if (entityType === 'frame') {
    const labels = new Set<string>();
    for (const fc of changeset.field_changes) {
      if (fc.status !== 'pending' && fc.status !== 'approved') continue;
      if (fc.field_name === 'frame_roles') {
        if (!Array.isArray(fc.new_value)) continue;
        for (const r of fc.new_value) {
          const label = extractRoleTypeLabel(r);
          if (label) labels.add(label);
        }
        continue;
      }

      const parsed = parseFrameRolesFieldName(fc.field_name);
      if (parsed?.roleType) labels.add(parsed.roleType);
    }

    const roleTypes = labels.size > 0
      ? await prisma.role_types.findMany({ where: { label: { in: Array.from(labels) } } })
      : [];
    roleTypeByLabel = new Map(roleTypes.map(rt => [rt.label, rt]));
  }

  for (const fc of changeset.field_changes) {
    // Apply all pending changes (not just approved) for preview
    if (fc.status === 'pending' || fc.status === 'approved') {
      if (entityType === 'frame') {
        if (fc.field_name === 'frame_roles' && roleTypeByLabel) {
          (updatedEntity as Record<string, unknown>).frame_roles = hydratePendingFrameRolesForApi(
            updatedEntity as unknown as Record<string, unknown>,
            fc.new_value,
            roleTypeByLabel
          );
          continue;
        }

        if (fc.field_name.startsWith('frame_roles.')) {
          pendingFrameRoleSubChanges.push({ field_name: fc.field_name, new_value: fc.new_value });
          continue;
        }
      }

      (updatedEntity as Record<string, unknown>)[fc.field_name] = fc.new_value;
    }
  }

  if (entityType === 'frame' && roleTypeByLabel && pendingFrameRoleSubChanges.length > 0) {
    const baseRoles = normalizeFrameRolesFromApiValue((updatedEntity as any).frame_roles);
    const patched = applyFrameRolesSubChanges(baseRoles, pendingFrameRoleSubChanges);
    (updatedEntity as Record<string, unknown>).frame_roles = hydratePendingFrameRolesForApi(
      updatedEntity as unknown as Record<string, unknown>,
      normalizedFrameRolesToClientPayload(patched),
      roleTypeByLabel
    );
  }

  const pendingInfo = toPendingChangeInfo({
    id: changeset.id,
    entity_type: changeset.entity_type as EntityType,
    entity_id: changeset.entity_id,
    operation: changeset.operation as 'create' | 'update' | 'delete',
    entity_version: changeset.entity_version,
    before_snapshot: changeset.before_snapshot as Record<string, unknown> | null,
    after_snapshot: changeset.after_snapshot as Record<string, unknown> | null,
    status: changeset.status as 'pending' | 'committed' | 'discarded',
    created_by: changeset.created_by,
    created_at: changeset.created_at,
    reviewed_by: changeset.reviewed_by,
    reviewed_at: changeset.reviewed_at,
    committed_at: changeset.committed_at,
    llm_job_id: changeset.llm_job_id,
    field_changes: changeset.field_changes.map(fc => ({
      id: fc.id,
      changeset_id: fc.changeset_id,
      field_name: fc.field_name,
      old_value: fc.old_value,
      new_value: fc.new_value,
      status: fc.status as FieldChangeStatus,
      approved_by: fc.approved_by,
      approved_at: fc.approved_at,
      rejected_by: fc.rejected_by,
      rejected_at: fc.rejected_at,
    })),
  });

  return { entity: updatedEntity, pending: pendingInfo };
}

