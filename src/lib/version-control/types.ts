/**
 * Version Control System Types
 * 
 * These types define the structure for tracking changes to entities
 * before they're committed to the main database tables.
 */

// ============================================
// Enums (matching database enums)
// ============================================

/**
 * Entity types for version control.
 */
export type EntityType = 
  | 'lexical_unit'           // Unified type
  | 'lexical_unit_relation'  // Unified relation type
  | 'frame'
  | 'frame_role'
  | 'recipe'
  | 'frame_relation';

export type ChangeOperation = 'create' | 'update' | 'delete';

export type ChangesetStatus = 'pending' | 'committed' | 'discarded';

export type FieldChangeStatus = 'pending' | 'approved' | 'rejected';

// ============================================
// Database Record Types
// ============================================

/**
 * A changeset represents all pending changes to a single entity (row).
 * Like a "modified file" in git.
 * 
 * Grouping:
 * - If llm_job_id is set, this changeset belongs to an LLM job batch
 * - If llm_job_id is null, this is a manual change (group by created_by in UI)
 */
export interface Changeset {
  id: bigint;
  entity_type: EntityType;
  entity_id: bigint | null;  // null for CREATE operations
  operation: ChangeOperation;
  entity_version: number | null;  // null for CREATE operations
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;  // Used for CREATE operations
  status: ChangesetStatus;
  created_by: string;
  created_at: Date;
  /** Who reviewed the changeset */
  reviewed_by: string | null;
  reviewed_at: Date | null;
  committed_at: Date | null;
  /** If set, this changeset belongs to an LLM job batch */
  llm_job_id: bigint | null;
}

/**
 * A field_change represents a change to a single field within a changeset.
 * Like a "hunk" in a git diff - can be approved/rejected individually.
 */
export interface FieldChange {
  id: bigint;
  changeset_id: bigint;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  status: FieldChangeStatus;
  /** Who approved this field change */
  approved_by: string | null;
  approved_at: Date | null;
  /** Who rejected this field change */
  rejected_by: string | null;
  rejected_at: Date | null;
}

/**
 * A comment on a changeset or field change.
 */
export interface ChangeComment {
  id: bigint;
  changeset_id: bigint | null;
  field_change_id: bigint | null;
  author: string;
  content: string;
  created_at: Date;
}

/**
 * Tracking record for when a user last read a changeset's comments.
 */
export interface CommentRead {
  id: bigint;
  user_id: string;
  changeset_id: bigint;
  last_read_at: Date;
}

/**
 * An audit_log entry is a permanent record of a committed change.
 */
export interface AuditLogEntry {
  id: bigint;
  entity_type: EntityType;
  entity_id: bigint;
  field_name: string;
  operation: ChangeOperation;
  old_value: unknown;
  new_value: unknown;
  changed_by: string;
  changed_at: Date;
  changeset_id: bigint | null;
}

// ============================================
// Input Types (for creating/updating records)
// ============================================

export interface CreateChangesetInput {
  entity_type: EntityType;
  entity_id?: bigint;  // Required for update/delete, omit for create
  operation: ChangeOperation;
  entity_version?: number;  // Required for update/delete
  before_snapshot?: Record<string, unknown>;
  after_snapshot?: Record<string, unknown>;  // For CREATE operations
  created_by: string;
  /** Optional LLM job ID if this changeset is part of an LLM batch */
  llm_job_id?: bigint;
}

export interface CreateFieldChangeInput {
  changeset_id: bigint;
  field_name: string;
  old_value?: unknown;
  new_value?: unknown;
}

export interface CreateCommentInput {
  changeset_id?: bigint;
  field_change_id?: bigint;
  author: string;
  content: string;
}

// ============================================
// Response Types (with relations loaded)
// ============================================

export interface ChangesetWithFieldChanges extends Changeset {
  field_changes: FieldChange[];
}

// ============================================
// Query Types
// ============================================

export interface ChangesetFilters {
  entity_type?: EntityType;
  entity_id?: bigint;
  operation?: ChangeOperation;
  status?: ChangesetStatus;
  created_by?: string;
  llm_job_id?: bigint;
}

// ============================================
// Commit Types
// ============================================

export interface CommitResult {
  success: boolean;
  committed_count: number;
  skipped_count: number;
  errors: CommitError[];
}

export interface CommitError {
  changeset_id: bigint;
  entity_type: EntityType;
  entity_id: bigint | null;
  error: string;
  conflict?: ConflictInfo;
}

export interface ConflictInfo {
  field_name: string;
  expected_value: unknown;  // What we thought the value was (before_snapshot)
  current_value: unknown;   // What it actually is now
  proposed_value: unknown;  // What we want to change it to
}

// ============================================
// Merge Types (for client-side preview)
// ============================================

/**
 * Represents an entity with pending changes merged in.
 * The base entity fields are extended with metadata about pending changes.
 */
export interface WithPendingChanges<T> {
  /** The merged entity data (base + approved pending changes) */
  data: T;
  /** Whether this entity has any pending changes */
  has_pending: boolean;
  /** Whether this is a pending create (negative ID) */
  is_pending_create: boolean;
  /** Whether this entity is pending deletion */
  is_pending_delete: boolean;
  /** The changeset ID if there are pending changes */
  changeset_id: bigint | null;
  /** Map of field names to their pending change info */
  pending_fields: Map<string, PendingFieldInfo>;
}

export interface PendingFieldInfo {
  field_change_id: bigint;
  old_value: unknown;
  new_value: unknown;
  status: FieldChangeStatus;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
}

// ============================================
// API Response Types
// ============================================

export interface PaginatedChangesets {
  data: ChangesetWithFieldChanges[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UnreadChangesetInfo {
  changeset_id: string;
  entity_type: EntityType;
  entity_display: string;
  comment_count: number;
  latest_comment: {
    author: string;
    content: string;
    created_at: string;
  };
}

// ============================================
// Utility Types
// ============================================

/**
 * Maps entity types to their table names in the database.
 */
export const ENTITY_TYPE_TO_TABLE: Record<EntityType, string> = {
  lexical_unit: 'lexical_units',
  lexical_unit_relation: 'lexical_unit_relations',
  frame: 'frames',
  frame_role: 'frame_roles',
  recipe: 'recipes',
  frame_relation: 'frame_relations',
};

/**
 * Maps table names to entity types.
 */
export const TABLE_TO_ENTITY_TYPE: Record<string, EntityType> = {
  lexical_units: 'lexical_unit',
  lexical_unit_relations: 'lexical_unit_relation',
  frames: 'frame',
  frame_roles: 'frame_role',
  recipes: 'recipe',
  frame_relations: 'frame_relation',
};

/**
 * Entity types that are the main "word" types (not relations or children).
 */
export const MAIN_ENTITY_TYPES: EntityType[] = [
  'lexical_unit',
  'frame',
];

/**
 * Normalize entity type for database storage.
 * Maps legacy POS types to the unified 'lexical_unit' type.
 */
export function normalizeEntityType(type: string): EntityType {
  if (['verb', 'noun', 'adjective', 'adverb', 'lexical_unit'].includes(type)) {
    return 'lexical_unit';
  }
  if (['verb_relation', 'noun_relation', 'adjective_relation', 'adverb_relation', 'lexical_unit_relation'].includes(type)) {
    return 'lexical_unit_relation';
  }
  return type as EntityType;
}

/**
 * Check if an entity type is a lexical unit type.
 */
export function isLexicalUnitType(type: string): boolean {
  return type === 'lexical_unit';
}
