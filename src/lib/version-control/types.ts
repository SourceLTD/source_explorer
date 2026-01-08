/**
 * Version Control System Types
 * 
 * These types define the structure for tracking changes to entities
 * before they're committed to the main database tables.
 */

// ============================================
// Enums (matching database enums)
// ============================================

export type ChangegroupSource = 'llm_job' | 'manual' | 'import' | 'migration';

export type EntityType = 
  | 'verb'
  | 'noun'
  | 'adjective'
  | 'adverb'
  | 'frame'
  | 'frame_role'
  | 'role'
  | 'recipe'
  | 'verb_relation'
  | 'noun_relation'
  | 'adjective_relation'
  | 'adverb_relation'
  | 'frame_relation';

export type ChangeOperation = 'create' | 'update' | 'delete';

export type ChangesetStatus = 'pending' | 'committed' | 'discarded';

export type FieldChangeStatus = 'pending' | 'approved' | 'rejected';

// ============================================
// Database Record Types
// ============================================

/**
 * A changegroup groups related changesets together.
 * E.g., all changes from a single LLM job, or a manual editing session.
 */
export interface Changegroup {
  id: bigint;
  source: ChangegroupSource;
  label: string | null;
  description: string | null;
  llm_job_id: bigint | null;
  status: ChangesetStatus;
  created_by: string;
  created_at: Date;
  /** Who committed the changegroup (distinct from who reviewed individual changesets) */
  committed_by: string | null;
  committed_at: Date | null;
  total_changesets: number;
  approved_changesets: number;
  rejected_changesets: number;
}

/**
 * A changeset represents all pending changes to a single entity (row).
 * Like a "modified file" in git.
 */
export interface Changeset {
  id: bigint;
  changegroup_id: bigint | null;
  entity_type: EntityType;
  entity_id: bigint | null;  // null for CREATE operations
  operation: ChangeOperation;
  entity_version: number | null;  // null for CREATE operations
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;  // Used for CREATE operations
  status: ChangesetStatus;
  created_by: string;
  created_at: Date;
  /** Who reviewed the changeset (distinct from who committed the changegroup) */
  reviewed_by: string | null;
  reviewed_at: Date | null;
  committed_at: Date | null;
  comment: string | null;
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
  changegroup_id: bigint | null;
  source: ChangegroupSource;
  proposed_by: string | null;
  comment: string | null;
}

// ============================================
// Input Types (for creating/updating records)
// ============================================

export interface CreateChangegroupInput {
  source: ChangegroupSource;
  label?: string;
  description?: string;
  llm_job_id?: bigint;
  created_by: string;
}

export interface CreateChangesetInput {
  changegroup_id?: bigint;
  entity_type: EntityType;
  entity_id?: bigint;  // Required for update/delete, omit for create
  operation: ChangeOperation;
  entity_version?: number;  // Required for update/delete
  before_snapshot?: Record<string, unknown>;
  after_snapshot?: Record<string, unknown>;  // For CREATE operations
  created_by: string;
  comment?: string;
}

export interface CreateFieldChangeInput {
  changeset_id: bigint;
  field_name: string;
  old_value?: unknown;
  new_value?: unknown;
}

// ============================================
// Response Types (with relations loaded)
// ============================================

export interface ChangegroupWithChangesets extends Changegroup {
  changesets: ChangesetWithFieldChanges[];
}

export interface ChangesetWithFieldChanges extends Changeset {
  field_changes: FieldChange[];
}

// ============================================
// Query Types
// ============================================

export interface ChangegroupFilters {
  source?: ChangegroupSource;
  status?: ChangesetStatus;
  created_by?: string;
  llm_job_id?: bigint;
}

export interface ChangesetFilters {
  changegroup_id?: bigint;
  entity_type?: EntityType;
  entity_id?: bigint;
  operation?: ChangeOperation;
  status?: ChangesetStatus;
  created_by?: string;
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

export interface PaginatedChangegroups {
  data: Changegroup[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PaginatedChangesets {
  data: ChangesetWithFieldChanges[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ============================================
// Utility Types
// ============================================

/**
 * Maps entity types to their table names in the database.
 */
export const ENTITY_TYPE_TO_TABLE: Record<EntityType, string> = {
  verb: 'verbs',
  noun: 'nouns',
  adjective: 'adjectives',
  adverb: 'adverbs',
  frame: 'frames',
  frame_role: 'frame_roles',
  role: 'roles',
  recipe: 'recipes',
  verb_relation: 'verb_relations',
  noun_relation: 'noun_relations',
  adjective_relation: 'adjective_relations',
  adverb_relation: 'adverb_relations',
  frame_relation: 'frame_relations',
};

/**
 * Maps table names to entity types.
 */
export const TABLE_TO_ENTITY_TYPE: Record<string, EntityType> = {
  verbs: 'verb',
  nouns: 'noun',
  adjectives: 'adjective',
  adverbs: 'adverb',
  frames: 'frame',
  frame_roles: 'frame_role',
  roles: 'role',
  recipes: 'recipe',
  verb_relations: 'verb_relation',
  noun_relations: 'noun_relation',
  adjective_relations: 'adjective_relation',
  adverb_relations: 'adverb_relation',
  frame_relations: 'frame_relation',
};

/**
 * Entity types that are the main "word" types (not relations or children).
 */
export const MAIN_ENTITY_TYPES: EntityType[] = [
  'verb',
  'noun',
  'adjective',
  'adverb',
  'frame',
];

