/**
 * Version Control System
 * 
 * This module provides version control capabilities for database entities,
 * allowing changes to be staged, reviewed, and committed before being
 * applied to the main tables.
 * 
 * ## Key Concepts
 * 
 * - **Changegroup**: Groups related changesets together (e.g., all changes from one LLM job)
 * - **Changeset**: All pending changes to a single entity (like a "modified file" in git)
 * - **FieldChange**: A change to a single field (like a "hunk" in a diff)
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
  ChangegroupSource,
  EntityType,
  ChangeOperation,
  ChangesetStatus,
  FieldChangeStatus,
  // Database records
  Changegroup,
  Changeset,
  FieldChange,
  AuditLogEntry,
  // Input types
  CreateChangegroupInput,
  CreateChangesetInput,
  CreateFieldChangeInput,
  // Response types
  ChangegroupWithChangesets,
  ChangesetWithFieldChanges,
  // Query types
  ChangegroupFilters,
  ChangesetFilters,
  // Commit types
  CommitResult,
  CommitError,
  ConflictInfo,
  // Merge types
  WithPendingChanges,
  PendingFieldInfo,
  // Pagination types
  PaginatedChangegroups,
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
  // Changegroup operations
  createChangegroup,
  getChangegroup,
  updateChangegroupStats,
  // Changeset operations
  createChangeset,
  getChangeset,
  findPendingChangeset,
  getPendingChangesetsForEntities,
  updateChangesetComment,
  // Field change operations
  createFieldChange,
  upsertFieldChange,
  updateFieldChangeStatus,
  approveAllFieldChanges,
  rejectAllFieldChanges,
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
  commitChangegroup,
  discardChangeset,
  discardChangegroup,
} from './commit';

// Staging operations (for API routes)
export {
  stageUpdate,
  stageDelete,
  stageModerationUpdates,
  stageRolesUpdate,
  stageFrameRolesUpdate,
} from './stage';

export type { StagedResponse } from './stage';

