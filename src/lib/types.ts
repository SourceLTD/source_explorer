// ============================================
// Part of Speech Types
// ============================================

export type PartOfSpeech = 'verb' | 'noun' | 'adjective' | 'adverb';

// Legacy type for backward compatibility - maps to table name style
export type LexicalType = 'lexical_units';

export type VendlerClass = 'state' | 'activity' | 'accomplishment' | 'achievement';

// ============================================
// Unified Lexical Unit Interface
// ============================================

/**
 * Unified interface for all lexical units (verbs, nouns, adjectives, adverbs).
 * All entries are stored in the `lexical_units` table with a `pos` discriminator.
 */
export interface LexicalUnit {
  id: string;
  code: string;
  legacy_id: string;
  pos: PartOfSpeech;
  lemmas: string[];
  src_lemmas: string[];
  gloss: string;
  lexfile: string;
  examples: string[];
  isMwe?: boolean;
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  legal_gloss?: string | null;
  deleted?: boolean;
  senses?: FrameSenseWithFrame[];
  frame_id?: string | null;
  frame_ids?: string[];
  frame?: Frame | null;
  wikidata_id?: string | null;
  createdAt: Date;
  updatedAt: Date;
  version?: number;
  
  // Verb-specific fields
  vendler_class?: VendlerClass | null;
  created_from?: string[];
  
  // Noun-specific fields
  countable?: boolean | null;
  proper?: boolean;
  collective?: boolean;
  concrete?: boolean;
  predicate?: boolean;
  
  // Adjective-specific fields
  isSatellite?: boolean;
  predicative?: boolean;
  attributive?: boolean;
  subjective?: boolean;
  relational?: boolean;
  
  // Adjective/Adverb fields
  gradable?: boolean | null;
  
  // Pending changes info
  pending?: PendingChangeInfo | null;
}

// ============================================
// Unified Relation Types
// ============================================

/**
 * All relation types from the unified lexical_unit_relations table.
 * Combines verb, noun, adjective, and adverb relation types.
 */
export enum LexicalUnitRelationType {
  // Verb relations
  ALSO_SEE = 'also_see',
  CAUSES = 'causes',
  ENTAILS = 'entails',
  HYPERNYM = 'hypernym',
  HYPONYM = 'hyponym',
  STARTS = 'starts',
  ENDS = 'ends',
  PRECEDES = 'precedes',
  DURING = 'during',
  ENABLES = 'enables',
  DO_AGAIN = 'do_again',
  CO_TEMPORAL = 'co_temporal',
  
  // Noun relations
  INSTANCE_HYPERNYM = 'instance_hypernym',
  INSTANCE_HYPONYM = 'instance_hyponym',
  MERONYM_PART = 'meronym_part',
  HOLONYM_PART = 'holonym_part',
  MERONYM_MEMBER = 'meronym_member',
  HOLONYM_MEMBER = 'holonym_member',
  MERONYM_SUBSTANCE = 'meronym_substance',
  HOLONYM_SUBSTANCE = 'holonym_substance',
  SIMILAR_TO = 'similar_to',
  ATTRIBUTE = 'attribute',
  DERIVATIONALLY_RELATED = 'derivationally_related',
  PERTAINYM = 'pertainym',
  DOMAIN_TOPIC = 'domain_topic',
  DOMAIN_REGION = 'domain_region',
  DOMAIN_USAGE = 'domain_usage',
  MEMBER_OF_DOMAIN_TOPIC = 'member_of_domain_topic',
  MEMBER_OF_DOMAIN_REGION = 'member_of_domain_region',
  MEMBER_OF_DOMAIN_USAGE = 'member_of_domain_usage',
  
  // Adjective relations
  SIMILAR = 'similar',
  ANTONYM = 'antonym',
  EXEMPLIFIES = 'exemplifies',
  PARTICIPLE_OF = 'participle_of',
  RELATED_TO = 'related_to',
  ALSO = 'also',
}

export interface LexicalUnitRelation {
  sourceId: string;
  targetId: string;
  type: LexicalUnitRelationType;
  source?: LexicalUnit;
  target?: LexicalUnit;
  weight?: number | null;
  properties?: Record<string, unknown> | null;
}

export interface LexicalUnitWithRelations extends LexicalUnit {
  sourceRelations: LexicalUnitRelation[];
  targetRelations: LexicalUnitRelation[];
}

// ============================================
// Frame Types
// ============================================

export interface FrameRole {
  id: string;
  description?: string | null;
  notes?: string | null;
  main?: boolean | null;
  examples?: string[];
  example_sentence?: string | null;
  label?: string | null;
  fillers?: unknown;
}

export interface RoleGroup {
  id: string;
  description?: string | null;
  role_ids: string[];
  require_at_least_one?: boolean;
}

// Lexical unit snippet for displaying in the frames table
export interface LexicalUnitSnippet {
  code: string;
  lemmas: string[];
  src_lemmas: string[];
  pos: PartOfSpeech;
  gloss: string;
}

// Collection of lexical unit snippets (unified)
export interface LexicalUnitsSample {
  entries: LexicalUnitSnippet[];
  totalCount: number;
  hasMore: boolean;
}

export interface Frame {
  id: string;
  label: string;
  definition?: string | null;
  short_definition?: string | null;
  code?: string | null;
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  createdAt: Date;
  updatedAt: Date;
  frame_roles?: FrameRole[];
  roles_count?: number;
  /** Distinct lexical units reachable through frame senses (via frame_sense_frames). */
  lexical_units_count?: number;
  /** Number of frame_senses linked to this frame. */
  senses_count?: number;
  /** Number of senses linked to this frame that ALSO link to another frame (>1). */
  sensesWithMultipleFrames?: number;
  lexical_units?: LexicalUnitsSample;
  pending?: PendingChangeInfo | null;
  frame_type?: string | null;
  subtype?: string | null;
  disable_healthcheck?: boolean;
  vendler?: string | null;
  multi_perspective?: boolean | null;
  wikidata_id?: string | null;
  recipe?: FrameRecipe | null;
}

export type FrameRecipe = Record<string, unknown>;

// ============================================
// Frame Sense Types
// ============================================

/**
 * Indicates an anomaly in a sense's frame linkage.
 * - 'none': the sense is linked to zero frames
 * - 'multiple': the sense is linked to more than one frame
 * - null: exactly one frame (the happy path)
 */
export type FrameSenseWarning = 'none' | 'multiple' | null;

export interface FrameSenseFrameRef {
  id: string;
  label: string;
  code: string | null;
}

/**
 * A frame_sense row — the intermediate concept between a lexical_unit and a frame.
 * Carries its own POS/definition/frame_type/... and is expected to link to exactly
 * one frame in practice.
 */
export interface FrameSense {
  id: string;
  pos: string;
  definition: string;
  frame_type: string;
  lemmas?: string[];
  confidence?: string | null;
  type_dispute?: string | null;
  causative?: boolean | null;
  inchoative?: boolean | null;
  perspectival?: boolean | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

/**
 * Frame sense with its linked frames. `frame` is the canonical single frame
 * (first entry of `frames`), `frames` is the raw list (for drilldown / warning UX),
 * and `frameWarning` signals when the 1:1 invariant is violated.
 */
export interface FrameSenseWithFrame extends FrameSense {
  frame: FrameSenseFrameRef | null;
  frames: FrameSenseFrameRef[];
  frameWarning: FrameSenseWarning;
}

export interface FrameSenseLexicalUnitSnippet {
  id: string;
  code: string;
  lemmas: string[];
  src_lemmas: string[];
  pos: string;
  gloss: string;
}

export interface FrameSenseTableRow extends Omit<FrameSenseWithFrame, 'createdAt' | 'updatedAt'> {
  createdAt: string | null;
  updatedAt: string | null;
  lexical_units: {
    entries: FrameSenseLexicalUnitSnippet[];
    totalCount: number;
    hasMore: boolean;
  };
  lexical_units_count: number;
  pending?: PendingChangeInfo | null;
}

// ============================================
// Recipe Graph Types (recipe_graph JSON column)
// ============================================

export interface RecipeGraphNode {
  id: string;
  node_type: 'entity' | 'event' | 'attribute' | string;
  keywords: string[];
  description: string;
}

export interface RecipeGraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface RecipeGraph {
  nodes: RecipeGraphNode[];
  edges: RecipeGraphEdge[];
  confidence: string;
  confidence_reasoning: string;
}

// ============================================
// Graph Types
// ============================================

export interface GraphNode {
  id: string;
  numericId: string;
  legacy_id: string;
  lemmas: string[];
  src_lemmas: string[];
  gloss: string;
  legal_gloss?: string | null;
  pos: string;
  lexfile: string;
  examples: string[];
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  
  // Verb-specific fields
  vendler_class?: VendlerClass | null;

  // Senses chain (frame_senses) — each sense links to zero-or-more frames;
  // the 1:1 happy path is surfaced as `frame` and anomalies via `frameWarning`.
  senses?: FrameSenseWithFrame[];
  // Legacy/derived: kept for UI backward compatibility. `frame` / `frame_id`
  // correspond to the first sense's single frame when present.
  frame_id?: string | null;
  frame_ids?: string[];
  frame?: Frame | null;

  // Noun-specific fields
  countable?: boolean | null;
  proper?: boolean;
  collective?: boolean;
  concrete?: boolean;
  predicate?: boolean;
  
  // Adjective-specific fields
  isSatellite?: boolean;
  gradable?: boolean | null;
  predicative?: boolean;
  attributive?: boolean;
  subjective?: boolean;
  relational?: boolean;
  
  // Common fields
  isMwe?: boolean;
  
  // Relation fields
  parents: GraphNode[];
  children: GraphNode[];
  entails: GraphNode[];
  causes: GraphNode[];
  alsoSee: GraphNode[];

  // Role fields
  roles?: FrameRole[];
  role_groups?: RoleGroup[];
  
  // Pending changes
  pending?: PendingChangeInfo | null;
}

// ============================================
// Search Types
// ============================================

export interface SearchResult {
  id: string;
  label?: string;
  numericId?: string;
  legacy_id: string;
  lemmas: string[];
  src_lemmas: string[];
  gloss: string;
  pos: string;
  rank?: number;
  frameDefinition?: string | null;
  frameType?: string | null;
}

export interface SearchOptions {
  query: string;
  pos?: PartOfSpeech | PartOfSpeech[];
  limit?: number;
}

export interface PaginatedSearchResult {
  entries: LexicalUnit[];
  total: number;
  hasMore: boolean;
}

// ============================================
// Table Types
// ============================================

export interface TableEntry {
  id: string;
  code: string;
  numericId: string;
  legacy_id: string;
  lemmas: string[];
  src_lemmas: string[];
  gloss: string;
  pos: string;
  lexfile: string;
  // Senses for this entry (canonical source of frame info going forward).
  senses?: FrameSenseWithFrame[];
  // Count of senses with frameWarning !== null — for row-level flagging.
  anomalousSenseCount?: number;
  // Legacy/derived from senses for backward compat.
  frame_id?: string | null;
  frame_ids?: string[];
  frame?: string | null;
  frames?: FrameSenseFrameRef[];

  // Verb-specific
  vendler_class?: VendlerClass | null;
  
  // Noun-specific
  isMwe?: boolean;
  countable?: boolean | null;
  proper?: boolean;
  collective?: boolean;
  concrete?: boolean;
  predicate?: boolean;
  
  // Adjective-specific
  isSatellite?: boolean;
  gradable?: boolean | null;
  predicative?: boolean;
  attributive?: boolean;
  subjective?: boolean;
  relational?: boolean;
  
  // Common fields
  examples: string[];
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  parentsCount: number;
  childrenCount: number;
  createdAt: Date;
  updatedAt: Date;
  pending?: PendingChangeInfo | null;
}

/**
 * @deprecated Use TableEntry
 */
export type TableLexicalUnit = TableEntry;

// ============================================
// Stats Types
// ============================================

export interface DatabaseStats {
  totalEntries: number;
  totalRelations: number;
  entriesByPos: Record<string, number>;
  relationsByType: Record<string, number>;
}

// ============================================
// Pagination Types
// ============================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  
  // POS filter (new - replaces separate tables)
  pos?: PartOfSpeech | PartOfSpeech[] | string;
  lexfile?: string;
  frame_id?: string;
  flaggedByJobId?: string;
  
  // Text filters
  gloss?: string;
  lemmas?: string;
  examples?: string;
  flaggedReason?: string;
  unverifiableReason?: string;
  
  // Boolean filters
  isMwe?: boolean;
  flagged?: boolean;
  verifiable?: boolean;
  excludeNullFrame?: boolean;
  
  // Pending state filters
  pendingCreate?: boolean;
  pendingUpdate?: boolean;
  pendingDelete?: boolean;
  
  // Numeric filters
  parentsCountMin?: number;
  parentsCountMax?: number;
  childrenCountMin?: number;
  childrenCountMax?: number;
  
  // Date filters
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
}

export interface FramePaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  
  label?: string;
  code?: string;
  definition?: string;
  short_definition?: string;
  
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResultWithPending<T> {
  data: WithPendingInfo<T>[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ============================================
// Breadcrumb Types
// ============================================

export interface BreadcrumbItem {
  id: string;
  legacy_id: string;
  lemma: string;
  gloss: string;
}

// ============================================
// UI Constants
// ============================================

export const POS_LABELS: Record<string, string> = {
  'verb': 'Verb',
  'noun': 'Noun',
  'adjective': 'Adjective',
  'adverb': 'Adverb',
  // Legacy single-char codes
  'n': 'Noun',
  'v': 'Verb',
  'a': 'Adjective',
  'r': 'Adverb',
  's': 'Satellite Adjective',
  'f': 'Frame'
};

export const RELATION_LABELS: Record<string, string> = {
  [LexicalUnitRelationType.HYPERNYM]: 'Hypernym',
  [LexicalUnitRelationType.HYPONYM]: 'Hyponym',
  [LexicalUnitRelationType.ALSO_SEE]: 'Also See',
  [LexicalUnitRelationType.CAUSES]: 'Causes',
  [LexicalUnitRelationType.ENTAILS]: 'Entails',
  [LexicalUnitRelationType.SIMILAR]: 'Similar',
  [LexicalUnitRelationType.ANTONYM]: 'Antonym',
  [LexicalUnitRelationType.INSTANCE_HYPERNYM]: 'Instance Hypernym',
  [LexicalUnitRelationType.INSTANCE_HYPONYM]: 'Instance Hyponym',
  [LexicalUnitRelationType.MERONYM_PART]: 'Part Meronym',
  [LexicalUnitRelationType.HOLONYM_PART]: 'Part Holonym',
  [LexicalUnitRelationType.MERONYM_MEMBER]: 'Member Meronym',
  [LexicalUnitRelationType.HOLONYM_MEMBER]: 'Member Holonym',
  [LexicalUnitRelationType.DERIVATIONALLY_RELATED]: 'Derivationally Related',
};

// ============================================
// Pending Change Types
// ============================================

export type PendingChangeOperation = 'create' | 'update' | 'delete' | 'merge';

export interface PendingFieldChange {
  field_change_id: string;
  old_value: unknown;
  new_value: unknown;
  status: 'pending' | 'approved' | 'rejected';
}

export interface PendingChangeInfo {
  operation: PendingChangeOperation;
  changeset_id: string;
  pending_fields: Record<string, PendingFieldChange>;
}

export interface WithPendingInfo<T> {
  data: T;
  pending: PendingChangeInfo | null;
}

// ============================================
// Frame Graph Types
// ============================================

export type FrameRelationType = 'parent_of';

export interface FrameGraphRole {
  id: string;
  frame_id: string;
  description: string | null;
  notes: string | null;
  main: boolean | null;
  examples: string[];
  label: string | null;
  fillers?: unknown;
}

export interface FrameGraphLexicalUnit {
  id: string;
  code: string;
  legacy_id: string;
  gloss: string;
  pos: PartOfSpeech;
  lemmas: string[];
  src_lemmas: string[];
  examples: string[];
  flagged: boolean | null;
  flagged_reason: string | null;
}

/**
 * A sense attached to a frame, with its expected-single linkage back to that frame
 * (`frameWarning !== null` means the sense links to zero or multiple frames — render
 * a warning). `lexical_units` lists the LUs attached to this sense.
 */
export interface FrameGraphSense {
  id: string;
  pos: string;
  definition: string;
  frame_type: string;
  lemmas?: string[];
  confidence: string | null;
  type_dispute: string | null;
  causative: boolean | null;
  inchoative: boolean | null;
  perspectival: boolean | null;
  frames: FrameSenseFrameRef[];
  frameWarning: FrameSenseWarning;
  lexical_units: FrameGraphLexicalUnit[];
}

export interface FrameGraphRelation {
  type: FrameRelationType;
  direction: 'incoming' | 'outgoing';
  target?: {
    id: string;
    label: string;
    short_definition?: string | null;
  };
  source?: {
    id: string;
    label: string;
    short_definition?: string | null;
  };
}

export interface FrameGraphNode {
  id: string;
  numericId: string;
  pos: 'frames';
  label: string;
  gloss?: string | null;
  short_definition?: string | null;
  roles: FrameGraphRole[];
  // Senses attached to this frame (senses-first view); each sense carries its LUs.
  senses: FrameGraphSense[];
  // Flattened de-duplicated LUs across all senses — kept for legacy UI paths.
  lexical_units: FrameGraphLexicalUnit[];
  relations: FrameGraphRelation[];
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  pending?: PendingChangeInfo | null;
  frame_type?: string | null;
  vendler?: string | null;
  multi_perspective?: boolean | null;
  wikidata_id?: string | null;
  recipe?: FrameRecipe | null;
  recipe_graph?: RecipeGraph | null;
}

export interface FrameRecipeRole {
  id: string;
  label: string | null;
  description: string | null;
  notes: string | null;
  main: boolean | null;
  examples: string[];
  fillers?: unknown;
  groups: Array<{
    id: string;
    description: string | null;
    require_at_least_one: boolean;
  }>;
}

export interface FrameRecipeLexicalUnit {
  id: string;
  code: string;
  pos: PartOfSpeech;
  lemmas: string[];
  gloss: string;
  vendler_class: VendlerClass | null;
}

export interface FrameRecipeRelatedFrame {
  id: string;
  label: string;
  short_definition?: string | null;
  roles?: Array<{
    id: string;
    label: string | null;
    description: string | null;
    main: boolean | null;
  }>;
}

export interface FrameRecipeSense {
  id: string;
  pos: string;
  definition: string;
  frame_type: string;
  confidence: string | null;
  type_dispute: string | null;
  causative: boolean | null;
  inchoative: boolean | null;
  perspectival: boolean | null;
  frameWarning: FrameSenseWarning;
  lexical_units: FrameRecipeLexicalUnit[];
}

export interface FrameRecipeData {
  frame: {
    id: string;
    label: string;
    definition?: string | null;
    short_definition?: string | null;
    flagged: boolean | null;
    flagged_reason: string | null;
    frame_type?: string | null;
    subtype?: string | null;
    disable_healthcheck?: boolean;
    vendler?: string | null;
    multi_perspective?: boolean | null;
    wikidata_id?: string | null;
    recipe?: FrameRecipe | null;
  };
  roles: FrameRecipeRole[];
  senses: FrameRecipeSense[];
  lexical_units: FrameRecipeLexicalUnit[];
  relations: {
    parent_of: FrameRecipeRelatedFrame[];
    child_of: FrameRecipeRelatedFrame[];
  };
}

// ============================================
// Role Type Acronyms (max 4 characters)
// ============================================

export const ROLE_TYPE_ACRONYMS: Record<string, string> = {
  'PROTO_AGENT': 'PAG',
  'CONTENT.ENTITY': 'CTENT',
  'CONTENT.CLAUSE': 'CTCLS',
  'CONTENT.QUOTE': 'CTQTE',
  'RECIPIENT': 'RECIP',
  'CO_PROTO_AGENT': 'COPAG',
  'TOPIC': 'TOPIC',
  'THEME': 'THEME',
  'CO_THEME': 'COTHM',
  'PATIENT': 'PATNT',
  'EXPERIENCER': 'EXPRN',
  'INSTRUMENT': 'INSTR',
  'SOURCE': 'SRC',
  'DESTINATION': 'DEST',
  'BENEFICIARY': 'BENEF',
  'EXTENT': 'EXTN',
  'GOAL': 'GOAL',
  'TIME': 'TIME',
  'LOCATION': 'LOC',
  'STIMULUS': 'STIM',
  'CO_PATIENT': 'COPAT',
  'PURPOSE': 'PURP',
  'CAUSE': 'CAUSE',
  'RESULT': 'RSLT',
  'PRODUCT': 'PROD',
  'MATERIAL': 'MATRL',
  'ATTRIBUTE': 'ATTR',
  'VALUE': 'VALUE',
  'ASSET': 'ASSET',
  'IDIOM': 'IDIOM',
};

export function getRoleTypeAcronym(roleTypeLabel: string): string {
  return ROLE_TYPE_ACRONYMS[roleTypeLabel] || roleTypeLabel.substring(0, 5).toUpperCase();
}

// Role Precedence (for frame roles display)
// ============================================

export const ROLE_PRECEDENCE: Record<string, number> = {
  'PROTO_AGENT': 28,
  'CONTENT.ENTITY': 27,
  'CONTENT.CLAUSE': 26,
  'CONTENT.QUOTE': 25,
  'RECIPIENT': 24,
  'CO_PROTO_AGENT': 23,
  'TOPIC': 22,
  'THEME': 21,
  'CO_THEME': 20,
  'PATIENT': 19,
  'EXPERIENCER': 18,
  'INSTRUMENT': 17,
  'SOURCE': 16,
  'DESTINATION': 15,
  'BENEFICIARY': 14,
  'EXTENT': 13,
  'GOAL': 12,
  'TIME': 11,
  'LOCATION': 10,
  'STIMULUS': 9,
  'CO_PATIENT': 8,
  'PURPOSE': 7,
  'CAUSE': 6,
  'RESULT': 5,
  'PRODUCT': 4,
  'MATERIAL': 3,
  'ATTRIBUTE': 2,
  'VALUE': 1,
  'ASSET': 0,
  'IDIOM': -1
};

export function sortRolesByPrecedence<T extends { label?: string | null; main?: boolean | null }>(roles: T[]): T[] {
  return [...roles].sort((a, b) => {
    const mainA = a.main ?? false;
    const mainB = b.main ?? false;
    
    if (mainA !== mainB) {
      return mainB ? 1 : -1;
    }
    
    const roleA = a.label || '';
    const roleB = b.label || '';
    
    const precedenceA = ROLE_PRECEDENCE[roleA] ?? -999;
    const precedenceB = ROLE_PRECEDENCE[roleB] ?? -999;
    
    if (precedenceA !== precedenceB) {
      return precedenceB - precedenceA;
    }
    
    return roleA.localeCompare(roleB);
  });
}
