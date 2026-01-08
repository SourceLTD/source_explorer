/**
 * Version Control - Commit Utilities
 * 
 * Functions for committing approved changes to the main database tables.
 * Includes version conflict detection and audit logging.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  EntityType,
  ChangesetWithFieldChanges,
  CommitResult,
  CommitError,
  ConflictInfo,
  ENTITY_TYPE_TO_TABLE,
} from './types';
import { getChangeset, updateChangegroupStats } from './create';

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
        entity_type: 'verb', // placeholder
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

  const tableName = ENTITY_TYPE_TO_TABLE[changeset.entity_type];
  
  // Use a transaction to create the entity and update the changeset
  const result = await prisma.$transaction(async (tx) => {
    // Create the entity using raw SQL (dynamic table name)
    const entityData = changeset.after_snapshot!;
    
    // Build the insert - this is simplified, in practice you'd need
    // to handle this per entity type due to different schemas
    let newEntityId: bigint;
    
    switch (changeset.entity_type) {
      case 'verb':
        const verb = await tx.verbs.create({
          data: entityData as Prisma.verbsCreateInput,
        });
        newEntityId = verb.id;
        break;
      case 'noun':
        const noun = await tx.nouns.create({
          data: entityData as Prisma.nounsCreateInput,
        });
        newEntityId = noun.id;
        break;
      case 'adjective':
        const adj = await tx.adjectives.create({
          data: entityData as Prisma.adjectivesCreateInput,
        });
        newEntityId = adj.id;
        break;
      case 'adverb':
        const adv = await tx.adverbs.create({
          data: entityData as Prisma.adverbsCreateInput,
        });
        newEntityId = adv.id;
        break;
      case 'frame':
        const frame = await tx.frames.create({
          data: entityData as Prisma.framesCreateInput,
        });
        newEntityId = frame.id;
        break;
      default:
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

    // Fetch changegroup to get source info
    const changegroup = changeset.changegroup_id
      ? await tx.changegroups.findUnique({ where: { id: changeset.changegroup_id } })
      : null;
    const source = changegroup?.source ?? 'manual';
    const proposedBy = changeset.created_by;

    // Create audit log entry
    await tx.audit_log.create({
      data: {
        entity_type: changeset.entity_type,
        entity_id: newEntityId,
        field_name: '*',  // Indicates full entity creation
        operation: 'create',
        old_value: Prisma.DbNull,
        new_value: entityData as Prisma.InputJsonValue,
        changed_by: committedBy,
        changesets: changeset.id ? { connect: { id: changeset.id } } : undefined,
        changegroups: changeset.changegroup_id ? { connect: { id: changeset.changegroup_id } } : undefined,
        source: source,
        proposed_by: proposedBy,
        comment: changeset.comment,
      },
    });

    return newEntityId;
  });

  // Update changegroup stats if applicable
  if (changeset.changegroup_id) {
    await updateChangegroupStats(changeset.changegroup_id);
  }

  return {
    success: true,
    committed_count: 1,
    skipped_count: 0,
    errors: [],
  };
}

// Special fields that require separate table updates instead of direct field updates
const COMPLEX_FIELDS = ['roles', 'role_groups', 'frame_roles'];

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
  const simpleChanges = approvedChanges.filter(fc => !COMPLEX_FIELDS.includes(fc.field_name));
  const complexChanges = approvedChanges.filter(fc => COMPLEX_FIELDS.includes(fc.field_name));

  // Build the update data for simple fields only
  const updateData: Record<string, unknown> = {};
  for (const fc of simpleChanges) {
    updateData[fc.field_name] = fc.new_value;
  }

  // Use a transaction
  await prisma.$transaction(async (tx) => {
    // Update simple fields on the entity using optimistic locking
    if (Object.keys(updateData).length > 0) {
      let updateCount: number;
      
      switch (changeset.entity_type) {
        case 'verb':
          const verbResult = await tx.verbs.updateMany({
            where: {
              id: changeset.entity_id!,
              version: changeset.entity_version!,
            },
            data: updateData,
          });
          updateCount = verbResult.count;
          break;
        case 'noun':
          const nounResult = await tx.nouns.updateMany({
            where: {
              id: changeset.entity_id!,
              version: changeset.entity_version!,
            },
            data: updateData,
          });
          updateCount = nounResult.count;
          break;
        case 'adjective':
          const adjResult = await tx.adjectives.updateMany({
            where: {
              id: changeset.entity_id!,
              version: changeset.entity_version!,
            },
            data: updateData,
          });
          updateCount = adjResult.count;
          break;
        case 'adverb':
          const advResult = await tx.adverbs.updateMany({
            where: {
              id: changeset.entity_id!,
              version: changeset.entity_version!,
            },
            data: updateData,
          });
          updateCount = advResult.count;
          break;
        case 'frame':
          const frameResult = await tx.frames.updateMany({
            where: {
              id: changeset.entity_id!,
              version: changeset.entity_version!,
            },
            data: updateData,
          });
          updateCount = frameResult.count;
          break;
        default:
          throw new Error(`UPDATE not implemented for entity type: ${changeset.entity_type}`);
      }

      if (updateCount === 0) {
        throw new Error('Version conflict: entity was modified by another user');
      }
    }

    // Handle complex field changes (roles, role_groups, frame_roles)
    for (const fc of complexChanges) {
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
        status: 'approved', // Keep as approved (historical record)
      },
    });

    // Fetch changegroup to get source info
    const changegroup = changeset.changegroup_id
      ? await tx.changegroups.findUnique({ where: { id: changeset.changegroup_id } })
      : null;
    const source = changegroup?.source ?? 'manual';
    const proposedBy = changeset.created_by;

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
          changegroups: changeset.changegroup_id ? { connect: { id: changeset.changegroup_id } } : undefined,
          source: source,
          proposed_by: proposedBy,
          comment: changeset.comment,
        },
      });
    }
  });

  // Update changegroup stats if applicable
  if (changeset.changegroup_id) {
    await updateChangegroupStats(changeset.changegroup_id);
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
 * Handles: roles, role_groups, frame_roles
 */
async function commitComplexFieldChange(
  tx: Prisma.TransactionClient,
  changeset: ChangesetWithFieldChanges,
  fc: ChangesetWithFieldChanges['field_changes'][0]
): Promise<void> {
  const entityId = changeset.entity_id!;
  const newValue = fc.new_value as Array<Record<string, unknown>> | null;

  switch (fc.field_name) {
    case 'roles':
      // Delete existing roles for this verb
      await tx.roles.deleteMany({
        where: { verb_id: entityId },
      });
      
      // Insert new roles
      if (newValue && Array.isArray(newValue)) {
        for (const role of newValue) {
          await tx.roles.create({
            data: {
              verb_id: entityId,
              role_type_id: BigInt(role.role_type_id as string | number),
              description: (role.description as string | undefined) ?? null,
              example_sentence: (role.example_sentence as string | undefined) ?? null,
              main: (role.main as boolean | undefined) ?? false,
            },
          });
        }
      }
      break;

    case 'role_groups':
      // Delete existing role groups for this verb
      await tx.role_groups.deleteMany({
        where: { verb_id: entityId },
      });
      
      // Insert new role groups
      if (newValue && Array.isArray(newValue)) {
        for (const group of newValue) {
          const createdGroup = await tx.role_groups.create({
            data: {
              verb_id: entityId,
              description: (group.description as string | undefined) ?? null,
              require_at_least_one: (group.require_at_least_one as boolean | undefined) ?? true,
            },
          });
          
          // Handle role_group_members if present
          const members = group.role_group_members as Array<Record<string, unknown>> | undefined;
          if (members && Array.isArray(members)) {
            for (const member of members) {
              await tx.role_group_members.create({
                data: {
                  role_group_id: createdGroup.id,
                  role_id: BigInt(member.role_id as string | number),
                },
              });
            }
          }
        }
      }
      break;

    case 'frame_roles':
      // Delete existing frame roles for this frame
      await tx.frame_roles.deleteMany({
        where: { frame_id: entityId },
      });
      
      // Insert new frame roles
      if (newValue && Array.isArray(newValue)) {
        for (const frameRole of newValue) {
          // If roleType is a string label, we need to look up the role_type_id
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

  await prisma.$transaction(async (tx) => {
    // Delete the entity (or soft-delete for verbs)
    switch (changeset.entity_type) {
      case 'verb':
        // Verbs use soft delete
        await tx.verbs.update({
          where: { id: changeset.entity_id! },
          data: {
            deleted: true,
            deleted_reason: 'Deleted via version control',
            deleted_at: new Date(),
          },
        });
        break;
      case 'noun':
        await tx.nouns.delete({
          where: { id: changeset.entity_id! },
        });
        break;
      case 'adjective':
        await tx.adjectives.delete({
          where: { id: changeset.entity_id! },
        });
        break;
      case 'adverb':
        await tx.adverbs.delete({
          where: { id: changeset.entity_id! },
        });
        break;
      case 'frame':
        await tx.frames.delete({
          where: { id: changeset.entity_id! },
        });
        break;
      default:
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

    // Fetch changegroup to get source info
    const changegroup = changeset.changegroup_id
      ? await tx.changegroups.findUnique({ where: { id: changeset.changegroup_id } })
      : null;
    const source = changegroup?.source ?? 'manual';
    const proposedBy = changeset.created_by;

    // Create audit log entry
    await tx.audit_log.create({
      data: {
        entity_type: changeset.entity_type,
        entity_id: changeset.entity_id!,
        field_name: '*',  // Indicates full entity deletion
        operation: 'delete',
        old_value: changeset.before_snapshot === null ? Prisma.DbNull : changeset.before_snapshot as Prisma.InputJsonValue,
        new_value: Prisma.DbNull,
        changed_by: committedBy,
        changesets: changeset.id ? { connect: { id: changeset.id } } : undefined,
        changegroups: changeset.changegroup_id ? { connect: { id: changeset.changegroup_id } } : undefined,
        source: source,
        proposed_by: proposedBy,
        comment: changeset.comment,
      },
    });
  });

  // Update changegroup stats if applicable
  if (changeset.changegroup_id) {
    await updateChangegroupStats(changeset.changegroup_id);
  }

  return {
    success: true,
    committed_count: 1,
    skipped_count: 0,
    errors: [],
  };
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

  // Get current version from database
  let currentVersion: number | null = null;
  
  switch (changeset.entity_type) {
    case 'verb':
      const verb = await prisma.verbs.findUnique({
        where: { id: changeset.entity_id },
        select: { version: true },
      });
      currentVersion = verb?.version ?? null;
      break;
    case 'noun':
      const noun = await prisma.nouns.findUnique({
        where: { id: changeset.entity_id },
        select: { version: true },
      });
      currentVersion = noun?.version ?? null;
      break;
    case 'adjective':
      const adj = await prisma.adjectives.findUnique({
        where: { id: changeset.entity_id },
        select: { version: true },
      });
      currentVersion = adj?.version ?? null;
      break;
    case 'adverb':
      const adv = await prisma.adverbs.findUnique({
        where: { id: changeset.entity_id },
        select: { version: true },
      });
      currentVersion = adv?.version ?? null;
      break;
    case 'frame':
      const frame = await prisma.frames.findUnique({
        where: { id: changeset.entity_id },
        select: { version: true },
      });
      currentVersion = frame?.version ?? null;
      break;
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
// Commit Changegroup
// ============================================

/**
 * Commit all approved changesets in a changegroup.
 */
export async function commitChangegroup(
  changegroupId: bigint,
  committedBy: string
): Promise<CommitResult> {
  // Get all pending changesets in the group
  const changesets = await prisma.changesets.findMany({
    where: {
      changegroup_id: changegroupId,
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

  // Commit each changeset
  for (const cs of changesets) {
    const result = await commitChangeset(cs.id, committedBy);
    
    results.committed_count += result.committed_count;
    results.skipped_count += result.skipped_count;
    results.errors.push(...result.errors);
    
    if (!result.success) {
      results.success = false;
    }
  }

  // Update changegroup status
  if (results.success && results.errors.length === 0) {
    await prisma.changegroups.update({
      where: { id: changegroupId },
      data: {
        status: 'committed',
        committed_by: committedBy,
        committed_at: new Date(),
      },
    });
  }

  return results;
}

// ============================================
// Discard Operations
// ============================================

/**
 * Discard a changeset (mark it as discarded, don't apply changes).
 */
export async function discardChangeset(changesetId: bigint): Promise<void> {
  const changeset = await prisma.changesets.findUnique({
    where: { id: changesetId },
    select: { changegroup_id: true },
  });

  await prisma.changesets.update({
    where: { id: changesetId },
    data: {
      status: 'discarded',
    },
  });

  if (changeset?.changegroup_id) {
    await updateChangegroupStats(changeset.changegroup_id);
  }
}

/**
 * Discard all changesets in a changegroup.
 */
export async function discardChangegroup(changegroupId: bigint): Promise<void> {
  await prisma.changesets.updateMany({
    where: {
      changegroup_id: changegroupId,
      status: 'pending',
    },
    data: {
      status: 'discarded',
    },
  });

  await prisma.changegroups.update({
    where: { id: changegroupId },
    data: {
      status: 'discarded',
    },
  });
}

