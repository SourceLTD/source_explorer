/**
 * Version Control - Commit Utilities
 * 
 * Functions for committing approved changes to the main database tables.
 * Includes version conflict detection and audit logging.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  ChangesetWithFieldChanges,
  CommitResult,
  CommitError,
  isLexicalUnitType,
} from './types';
import { getChangeset, createChangesetFromUpdate } from './create';
import { addComment } from './comments';
import {
  applyFrameRolesSubChanges,
  isFrameRolesFieldName,
  type NormalizedFrameRole,
} from './frameRolesSubfields';

// Convert camelCase field names to snake_case for Prisma
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
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
 * @param changesetId - The ID of the changeset to commit
 * @param committedBy - The user committing the changes
 * @returns The result of the commit operation
 */
export async function commitChangeset(
  changesetId: bigint,
  committedBy: string
): Promise<CommitResult> {
  const changeset = await getChangeset(changesetId);
  
  if (!changeset) {
    return {
      success: false,
      committed_count: 0,
      skipped_count: 0,
      errors: [{
        changeset_id: changesetId,
        entity_type: 'lexical_unit',
        entity_id: null,
        error: 'Changeset not found',
      }],
    };
  }

  if (changeset.status !== 'pending') {
    return {
      success: false,
      committed_count: 0,
      skipped_count: 0,
      errors: [{
        changeset_id: changesetId,
        entity_type: changeset.entity_type,
        entity_id: changeset.entity_id,
        error: `Changeset is already ${changeset.status}`,
      }],
    };
  }

  // Get approved field changes
  const approvedChanges = changeset.field_changes.filter(fc => fc.status === 'approved');
  
  if (approvedChanges.length === 0 && changeset.operation === 'update') {
    return {
      success: false,
      committed_count: 0,
      skipped_count: changeset.field_changes.length,
      errors: [{
        changeset_id: changesetId,
        entity_type: changeset.entity_type,
        entity_id: changeset.entity_id,
        error: 'No approved field changes to commit',
      }],
    };
  }

  try {
    // Handle based on operation type
    switch (changeset.operation) {
      case 'create':
        return await commitCreate(changeset, committedBy);
      case 'update':
        return await commitUpdate(changeset, approvedChanges, committedBy);
      case 'delete':
        return await commitDelete(changeset, committedBy);
      default:
        return {
          success: false,
          committed_count: 0,
          skipped_count: 0,
          errors: [{
            changeset_id: changesetId,
            entity_type: changeset.entity_type,
            entity_id: changeset.entity_id,
            error: `Unknown operation: ${changeset.operation}`,
          }],
        };
    }
  } catch (error) {
    return {
      success: false,
      committed_count: 0,
      skipped_count: 0,
      errors: [{
        changeset_id: changesetId,
        entity_type: changeset.entity_type,
        entity_id: changeset.entity_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }],
    };
  }
}

// ============================================
// Commit Operations by Type
// ============================================

async function commitCreate(
  changeset: ChangesetWithFieldChanges,
  committedBy: string
): Promise<CommitResult> {
  if (!changeset.after_snapshot) {
    return {
      success: false,
      committed_count: 0,
      skipped_count: 0,
      errors: [{
        changeset_id: changeset.id,
        entity_type: changeset.entity_type,
        entity_id: null,
        error: 'No after_snapshot for CREATE operation',
      }],
    };
  }

  // Use a transaction to create the entity and update the changeset
  await prisma.$transaction(async (tx) => {
    const entityData = changeset.after_snapshot!;
    let newEntityId: bigint;
    
    if (isLexicalUnitType(changeset.entity_type)) {
      const lu = await tx.lexical_units.create({
        data: entityData as Prisma.lexical_unitsCreateInput,
      });
      newEntityId = lu.id;
    } else if (changeset.entity_type === 'frame') {
      // Support optional `frame_roles` in after_snapshot for CREATE operations.
      // This is used by AI split jobs (and some MCP tooling) to propose roles for new superframes.
      const frameData: Record<string, unknown> = { ...(entityData as Record<string, unknown>) };
      const frameRolesRaw = (frameData as { frame_roles?: unknown }).frame_roles;
      delete (frameData as { frame_roles?: unknown }).frame_roles;

      const frame = await tx.frames.create({
        data: frameData as Prisma.framesCreateInput,
      });
      newEntityId = frame.id;

      if (Array.isArray(frameRolesRaw) && frameRolesRaw.length > 0) {
        // Expect items like:
        // - { role_type_code: "AGENT", description: "...", main: true, examples: [...] }
        // Optionally supports { role_type_id: 123 } if already resolved.
        const roles = frameRolesRaw as Array<Record<string, unknown>>;

        // Resolve role_type_id by role_type_code (preferred) or role_type_id (fallback)
        const codes = Array.from(
          new Set(
            roles
              .map(r => (typeof r.role_type_code === 'string' ? r.role_type_code : null))
              .filter((c): c is string => Boolean(c))
          )
        );
        const roleTypeRecords = codes.length > 0
          ? await tx.role_types.findMany({
              where: { code: { in: codes } },
              select: { id: true, code: true },
            })
          : [];
        const codeToId = new Map(roleTypeRecords.map(rt => [rt.code, rt.id]));

        const createManyData: Prisma.frame_rolesCreateManyInput[] = [];
        const seenRoleTypeIds = new Set<string>();

        for (const role of roles) {
          const roleTypeId =
            role.role_type_id != null
              ? BigInt(role.role_type_id as any)
              : (typeof role.role_type_code === 'string' ? codeToId.get(role.role_type_code) : undefined);

          if (!roleTypeId) {
            throw new Error(
              `CREATE frame_roles failed: unknown role_type_code "${String(role.role_type_code ?? '')}"`
            );
          }

          const roleTypeIdKey = roleTypeId.toString();
          if (seenRoleTypeIds.has(roleTypeIdKey)) {
            throw new Error(`CREATE frame_roles failed: duplicate role_type for new frame (${roleTypeIdKey})`);
          }
          seenRoleTypeIds.add(roleTypeIdKey);

          createManyData.push({
            frame_id: frame.id,
            role_type_id: roleTypeId,
            description: (role.description as string) ?? null,
            notes: (role.notes as string) ?? null,
            main: (role.main as boolean) ?? false,
            examples: (Array.isArray(role.examples) ? (role.examples as string[]) : []),
            label: (role.label as string) ?? null,
            version: 1,
          });
        }

        if (createManyData.length > 0) {
          await tx.frame_roles.createMany({
            data: createManyData,
            skipDuplicates: false,
          });
        }
      }
    } else if (changeset.entity_type === 'lexical_unit_relation') {
      const rel = await tx.lexical_unit_relations.create({
        data: entityData as Prisma.lexical_unit_relationsCreateInput,
      });
      newEntityId = rel.id;
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

    return newEntityId;
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
  return fieldName === 'hypernym' || isFrameRolesFieldName(fieldName);
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
    include: { role_types: { select: { label: true } } },
    orderBy: { id: 'asc' },
  });

  const baseRoles: NormalizedFrameRole[] = [];
  for (const r of currentRolesRaw as any[]) {
    const roleType = typeof r?.role_types?.label === 'string' ? r.role_types.label : '';
    if (!roleType) continue;
    baseRoles.push({
      roleType,
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

  const labels = Array.from(new Set(finalRoles.map(r => r.roleType)));
  const roleTypes = await tx.role_types.findMany({
    where: { label: { in: labels } },
    select: { id: true, label: true },
  });
  const idByLabel = new Map(roleTypes.map(rt => [rt.label, rt.id]));

  const createManyData: Prisma.frame_rolesCreateManyInput[] = [];
  for (const r of finalRoles) {
    const roleTypeId = idByLabel.get(r.roleType);
    if (!roleTypeId) {
      throw new Error(`Role type not found: ${r.roleType}`);
    }
    createManyData.push({
      frame_id: entityId,
      role_type_id: roleTypeId,
      description: r.description ?? null,
      notes: r.notes ?? null,
      main: r.main ?? false,
      examples: r.examples ?? [],
      label: r.label ?? null,
    });
  }

  await tx.frame_roles.createMany({ data: createManyData });
}

async function commitUpdate(
  changeset: ChangesetWithFieldChanges,
  approvedChanges: ChangesetWithFieldChanges['field_changes'],
  committedBy: string
): Promise<CommitResult> {
  if (!changeset.entity_id) {
    return {
      success: false,
      committed_count: 0,
      skipped_count: 0,
      errors: [{
        changeset_id: changeset.id,
        entity_type: changeset.entity_type,
        entity_id: null,
        error: 'No entity_id for UPDATE operation',
      }],
    };
  }

  // Check for version conflict
  const conflictResult = await checkVersionConflict(changeset);
  if (conflictResult) {
    return {
      success: false,
      committed_count: 0,
      skipped_count: approvedChanges.length,
      errors: [conflictResult],
    };
  }

  // Separate complex fields from simple fields
  const simpleChanges = approvedChanges.filter(fc => !isComplexField(fc.field_name));
  const complexChanges = approvedChanges.filter(fc => isComplexField(fc.field_name));
  const frameRolesLegacy = complexChanges.find(fc => fc.field_name === 'frame_roles');
  const frameRolesSub = complexChanges.filter(fc => fc.field_name.startsWith('frame_roles.'));
  const hypernymChanges = complexChanges.filter(fc => fc.field_name === 'hypernym');

  // Build the update data for simple fields only, resolving virtual IDs (negative IDs = -changeset_id)
  const updateData: Record<string, unknown> = {};

  // Use a transaction
  await prisma.$transaction(async (tx) => {
    for (const fc of simpleChanges) {
      let nextValue: unknown = fc.new_value;

      // Virtual-ID resolution (used by AI SPLIT jobs to reference pending CREATEs)
      if (fc.field_name === 'frame_id' || fc.field_name === 'super_frame_id') {
        const asString = typeof nextValue === 'string' ? nextValue.trim() : null;
        if (asString && /^-\d+$/.test(asString)) {
          const virtualId = BigInt(asString); // negative
          const createChangesetId = -virtualId; // positive changeset id
          const createChangeset = await tx.changesets.findUnique({
            where: { id: createChangesetId },
            select: { id: true, entity_id: true, operation: true, status: true },
          });

          if (!createChangeset || createChangeset.operation !== 'create' || createChangeset.status !== 'committed' || createChangeset.entity_id === null) {
            throw new Error(`Unable to resolve virtual ID ${asString} (create changeset ${createChangesetId.toString()} not committed)`);
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

    // Update simple fields on the entity using optimistic locking
    if (Object.keys(updateData).length > 0) {
      let updateCount: number;
      
      if (isLexicalUnitType(changeset.entity_type)) {
        const result = await tx.lexical_units.updateMany({
          where: {
            id: changeset.entity_id!,
            version: changeset.entity_version!,
          },
          data: updateData,
        });
        updateCount = result.count;
      } else if (changeset.entity_type === 'frame') {
        const result = await tx.frames.updateMany({
          where: {
            id: changeset.entity_id!,
            version: changeset.entity_version!,
          },
          data: updateData,
        });
        updateCount = result.count;
      } else {
        throw new Error(`UPDATE not implemented for entity type: ${changeset.entity_type}`);
      }

      if (updateCount === 0) {
        throw new Error('Version conflict: entity was modified by another user');
      }
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
  });

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
          let roleTypeId: bigint;
          if (typeof frameRole.roleType === 'string') {
            const roleType = await tx.role_types.findUnique({
              where: { label: frameRole.roleType },
            });
            if (!roleType) {
              throw new Error(`Role type not found: ${frameRole.roleType}`);
            }
            roleTypeId = roleType.id;
          } else {
            roleTypeId = BigInt(frameRole.role_type_id as string | number);
          }

          await tx.frame_roles.create({
            data: {
              frame_id: entityId,
              role_type_id: roleTypeId,
              description: (frameRole.description as string | undefined) ?? null,
              notes: (frameRole.notes as string | undefined) ?? null,
              main: (frameRole.main as boolean | undefined) ?? false,
              examples: (frameRole.examples as string[] | undefined) ?? [],
              label: (frameRole.label as string | undefined) ?? null,
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
  if (!changeset.entity_id) {
    return {
      success: false,
      committed_count: 0,
      skipped_count: 0,
      errors: [{
        changeset_id: changeset.id,
        entity_type: changeset.entity_type,
        entity_id: null,
        error: 'No entity_id for DELETE operation',
      }],
    };
  }

  // Check for version conflict
  const conflictResult = await checkVersionConflict(changeset);
  if (conflictResult) {
    return {
      success: false,
      committed_count: 0,
      skipped_count: 0,
      errors: [conflictResult],
    };
  }

  // For lexical unit deletions, handle hyponym reassignment first
  if (changeset.entity_type === 'lexical_unit') {
    await handleLexicalUnitDeletionHyponymReassignment(changeset, committedBy);
  }

  await prisma.$transaction(async (tx) => {
    if (isLexicalUnitType(changeset.entity_type)) {
      // Soft delete for lexical units
      await tx.lexical_units.update({
        where: { id: changeset.entity_id! },
        data: {
          deleted: true,
          deleted_reason: 'Deleted via version control',
          deleted_at: new Date(),
        },
      });
    } else if (changeset.entity_type === 'frame') {
      await tx.frames.update({
        where: { id: changeset.entity_id! },
        data: {
          deleted: true,
          deleted_reason: 'Deleted via version control',
          deleted_at: new Date(),
        },
      });
    } else if (changeset.entity_type === 'lexical_unit_relation') {
      // Hard delete for relations
      await tx.lexical_unit_relations.delete({
        where: { id: changeset.entity_id! },
      });
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
  if (!changeset.entity_id || changeset.entity_version === null) {
    return null;
  }

  let currentVersion: number | null = null;
  
  if (changeset.entity_type === 'lexical_unit') {
    const lu = await prisma.lexical_units.findUnique({
      where: { id: changeset.entity_id },
      select: { version: true },
    });
    currentVersion = lu?.version ?? null;
  } else if (changeset.entity_type === 'frame') {
    const frame = await prisma.frames.findUnique({
      where: { id: changeset.entity_id },
      select: { version: true },
    });
    currentVersion = frame?.version ?? null;
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
