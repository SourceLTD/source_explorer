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
  ENTITY_TYPE_TO_TABLE,
} from './types';
import { getChangeset, createChangesetFromUpdate } from './create';
import { addComment } from './comments';

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
const COMPLEX_FIELDS = ['roles', 'role_groups', 'frame_roles', 'hypernym'];

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
  // Convert camelCase field names to snake_case for Prisma
  const updateData: Record<string, unknown> = {};
  for (const fc of simpleChanges) {
    updateData[camelToSnake(fc.field_name)] = fc.new_value;
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

    case 'hypernym':
      // Handle hypernym relation changes for verbs
      // newValue is { old_hypernym_id: bigint | null, new_hypernym_id: bigint | null }
      const hypernymData = newValue as { old_hypernym_id: bigint | null; new_hypernym_id: bigint | null } | null;
      
      if (hypernymData) {
        // Delete the old hypernym relation if it exists
        if (hypernymData.old_hypernym_id) {
          await tx.verb_relations.deleteMany({
            where: {
              source_id: entityId,
              target_id: hypernymData.old_hypernym_id,
              type: 'hypernym',
            },
          });
        }
        
        // Create new hypernym relation if there's a new hypernym
        if (hypernymData.new_hypernym_id) {
          await tx.verb_relations.upsert({
            where: {
              source_id_type_target_id: {
                source_id: entityId,
                target_id: hypernymData.new_hypernym_id,
                type: 'hypernym',
              },
            },
            create: {
              source_id: entityId,
              target_id: hypernymData.new_hypernym_id,
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

  // For verb deletions, handle hyponym reassignment first (outside transaction)
  if (changeset.entity_type === 'verb') {
    await handleVerbDeletionHyponymReassignment(changeset, committedBy);
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
// Verb Deletion - Hyponym Reassignment
// ============================================

/**
 * Handle hyponym reassignment when a verb is deleted.
 * Creates pending changesets for each hyponym that needs to be reassigned.
 * Each changeset gets an explanatory comment.
 * 
 * @param changeset - The delete changeset for the verb being deleted
 * @param committedBy - The user committing the deletion
 */
async function handleVerbDeletionHyponymReassignment(
  changeset: ChangesetWithFieldChanges,
  committedBy: string
): Promise<void> {
  const deletedVerbId = changeset.entity_id!;
  
  // Get the deleted verb's details for the comment
  const deletedVerb = await prisma.verbs.findUnique({
    where: { id: deletedVerbId },
    select: { id: true, code: true },
  });
  
  if (!deletedVerb) {
    return; // Verb already deleted or doesn't exist
  }
  
  // Find the deleted verb's hypernym (parent)
  const hypernymRelation = await prisma.verb_relations.findFirst({
    where: {
      source_id: deletedVerbId,
      type: 'hypernym',
    },
    select: {
      target_id: true,
    },
  });
  
  // Find all hyponyms (children) pointing to this verb
  const hyponymRelations = await prisma.verb_relations.findMany({
    where: {
      target_id: deletedVerbId,
      type: 'hypernym',
    },
    select: {
      source_id: true,
    },
  });
  
  if (hyponymRelations.length === 0) {
    // No hyponyms to reassign
    return;
  }
  
  // Get the new hypernym info for the comment (if any)
  let newHypernymCode: string | null = null;
  if (hypernymRelation) {
    const newHypernym = await prisma.verbs.findUnique({
      where: { id: hypernymRelation.target_id },
      select: { code: true },
    });
    newHypernymCode = newHypernym?.code ?? null;
  }
  
  // For each hyponym, create a pending changeset for the hypernym reassignment
  for (const rel of hyponymRelations) {
    const hyponymId = rel.source_id;
    
    // Get the full hyponym entity
    const hyponymVerb = await prisma.verbs.findUnique({
      where: { id: hyponymId },
    });
    
    if (!hyponymVerb || hyponymVerb.deleted) {
      continue; // Skip if hyponym is already deleted
    }
    
    // Create the hypernym field change data
    const hypernymChangeData = {
      old_hypernym_id: deletedVerbId,
      new_hypernym_id: hypernymRelation?.target_id ?? null,
    };
    
    // Create a pending changeset for this hyponym's hypernym reassignment
    const hyponymChangeset = await createChangesetFromUpdate(
      'verb',
      hyponymId,
      hyponymVerb as unknown as Record<string, unknown>,
      { hypernym: hypernymChangeData },
      committedBy, // Use the same user who committed the deletion
    );
    
    // Build the explanatory comment
    let commentContent: string;
    if (newHypernymCode) {
      commentContent = `Hypernym automatically reassigned from "${deletedVerb.code}" to "${newHypernymCode}" due to deletion of "${deletedVerb.code}".`;
    } else {
      commentContent = `Hypernym relation removed (verb becomes a root) due to deletion of parent verb "${deletedVerb.code}".`;
    }
    
    // Add the auto-comment to the changeset
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
// Batch Operations by LLM Job
// ============================================

/**
 * Commit all pending changesets for an LLM job.
 */
export async function commitByLlmJob(
  llmJobId: bigint,
  committedBy: string
): Promise<CommitResult> {
  // Get all pending changesets for this job
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

  return results;
}

/**
 * Commit all pending manual changesets for a user.
 */
export async function commitByUser(
  createdBy: string,
  committedBy: string
): Promise<CommitResult> {
  // Get all pending manual changesets (llm_job_id is null) for this user
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

  return results;
}

// ============================================
// Discard Operations
// ============================================

/**
 * Discard a changeset (mark it as discarded, don't apply changes).
 */
export async function discardChangeset(changesetId: bigint): Promise<void> {
  await prisma.changesets.update({
    where: { id: changesetId },
    data: {
      status: 'discarded',
    },
  });
}

/**
 * Discard all pending changesets for an LLM job.
 */
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

/**
 * Discard all pending manual changesets for a user.
 */
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
  // If there's a conflict, we stop and return info about it
  conflict?: {
    changeset_id: string;
    errors: CommitError[];
  };
}

/**
 * Bulk approve all fields and commit multiple changesets.
 * Stops on first conflict and returns conflict info.
 */
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

  // Process in a transaction for field approvals (but commits must be separate due to conflict detection)
  await prisma.$transaction(async (tx) => {
    // Bulk approve all pending field changes for all changesets at once
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

  // Now commit each changeset (must be done individually due to conflict detection)
  for (const changesetId of changesetIds) {
    const commitResult = await commitChangeset(changesetId, userId);
    result.processed++;

    if (!commitResult.success) {
      // Check if this is a conflict (not just an error like "no approved changes")
      const hasConflict = commitResult.errors.some(e => 
        e.error.includes('Version conflict') || e.error.includes('has been modified')
      );
      
      if (hasConflict) {
        result.success = false;
        result.conflict = {
          changeset_id: changesetId.toString(),
          errors: commitResult.errors,
        };
        // Stop processing on conflict
        return result;
      }
      
      // Non-conflict error, continue processing but log it
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

/**
 * Bulk reject all fields for multiple changesets.
 * For DELETE/CREATE operations, discards the changeset entirely.
 * For UPDATE operations, rejects all fields then auto-discards if all are rejected.
 */
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

  // Get changesets to determine operation type
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

  // Bulk discard DELETE/CREATE changesets
  if (discardIds.length > 0) {
    await prisma.changesets.updateMany({
      where: { id: { in: discardIds } },
      data: { status: 'discarded' },
    });
    result.discarded = discardIds.length;
    result.processed += discardIds.length;
  }

  // Bulk reject UPDATE changesets - reject all pending fields
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

    // Now check each UPDATE changeset - if all fields are rejected, auto-discard
    // This handles the case where some fields were already approved before this bulk action
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

/**
 * Bulk discard multiple changesets.
 */
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
