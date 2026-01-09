/**
 * Version Control System
 * 
 * This module provides version control capabilities for database entities,
 * allowing changes to be staged, reviewed, and committed before being
 * applied to the main tables.
 * 
 * ## Key Concepts
 * 
 * - **Changeset**: All pending changes to a single entity (like a "modified file" in git)
 * - **FieldChange**: A change to a single field (like a "hunk" in a diff)
 * 
 * Changesets are grouped by:
 * - **llm_job_id**: If set, the changeset belongs to an LLM job batch
 * - **created_by**: Manual changes (llm_job_id is null) are grouped by user in the UI
 * 
 * ## Usage
 * 
 * ### Creating a changeset when editing an entity:
 * ```typescript
 * import { createChangesetFromUpdate } from '@/lib/version-control';
 * 
 * const changeset = await createChangesetFromUpdate(
 *   'verb',
 *   verbId,
 *   currentVerbData,
 *   { gloss: 'new definition' },
 *   'user@example.com'
 * );
 * ```
 * 
 * ### Merging pending changes into query results:
 * ```typescript
 * import { withPendingChanges } from '@/lib/version-control';
 * 
 * const verbs = await prisma.verbs.findMany({ ... });
 * const verbsWithPending = await withPendingChanges(
 *   verbs,
 *   'verb',
 *   (v) => v.id
 * );
 * ```
 * 
 * ### Committing changes (admin only):
 * ```typescript
 * import { commitChangeset } from '@/lib/version-control';
 * 
 * const result = await commitChangeset(changesetId, 'admin@example.com');
 * if (!result.success) {
 *   console.error(result.errors);
 * }
 * ```
 */

// Types
export type {
  // Enums
  EntityType,
  ChangeOperation,
  ChangesetStatus,
  FieldChangeStatus,
  // Database records
  Changeset,
  FieldChange,
  AuditLogEntry,
  ChangeComment,
  CommentRead,
  // Input types
  CreateChangesetInput,
  CreateFieldChangeInput,
  CreateCommentInput,
  // Response types
  ChangesetWithFieldChanges,
  UnreadChangesetInfo,
  // Query types
  ChangesetFilters,
  // Commit types
  CommitResult,
  CommitError,
  ConflictInfo,
  // Merge types
  WithPendingChanges,
  PendingFieldInfo,
  // Pagination types
  PaginatedChangesets,
} from './types';

// Constants
export {
  ENTITY_TYPE_TO_TABLE,
  TABLE_TO_ENTITY_TYPE,
  MAIN_ENTITY_TYPES,
} from './types';

// Create operations
export {
  // Changeset operations
  createChangeset,
  getChangeset,
  findPendingChangeset,
  getPendingChangesetsForEntities,
  // Field change operations
  createFieldChange,
  upsertFieldChange,
  updateFieldChangeStatus,
  approveAllFieldChanges,
  rejectAllFieldChanges,
  deleteFieldChange,
  checkAndAutoDiscard,
  // High-level helpers
  createChangesetFromUpdate,
  createChangesetFromCreate,
  createChangesetFromDelete,
} from './create';

// Merge operations
export {
  withPendingChanges,
  mergeChangesetIntoEntity,
  getPendingCreates,
  pendingCreateToVirtualEntity,
  getPendingDeleteIds,
  hasPendingChanges,
  entityHasPendingChanges,
  getDirtyEntityIds,
  isPendingCreateId,
  getChangesetIdFromVirtualId,
  // API serialization helpers
  toPendingChangeInfo,
  attachPendingInfoToEntities,
  getPendingInfoForEntity,
  applyPendingToEntity,
} from './merge';

// Commit operations
export {
  commitChangeset,
  discardChangeset,
  // Batch operations by LLM job
  commitByLlmJob,
  discardByLlmJob,
  // Batch operations by user (manual changes)
  commitByUser,
  discardByUser,
  // Bulk operations by IDs
  bulkApproveAndCommit,
  bulkReject,
  bulkDiscard,
} from './commit';

export type { BulkOperationResult } from './commit';

// Staging operations (for API routes)
export {
  stageUpdate,
  stageDelete,
  stageModerationUpdates,
  stageRolesUpdate,
  stageFrameRolesUpdate,
} from './stage';

export type { StagedResponse } from './stage';

// Comment operations
export {
  getComments,
  addComment,
  getCommentCounts,
  markAsRead,
  getUnreadComments,
  getUnreadStatusForChangesets,
} from './comments';
