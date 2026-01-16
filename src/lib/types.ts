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
  frame_id?: string | null;
  frame?: Frame | null;
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
  example_sentence?: string | null; // For backward compatibility
  label?: string | null;
  role_type: RoleType;
  instantiation_type_ids?: string[];
}

export interface RoleType {
  id: string;
  code?: string;
  label: string;
  generic_description: string;
  explanation?: string | null;
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
  lexical_units_count?: number;
  subframes_count?: number;
  lexical_entries?: LexicalUnitsSample;
  pending?: PendingChangeInfo | null;
  super_frame_id?: string | null;
  super_frame?: { id: string; label: string; code?: string | null } | null;
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
  frame_id?: string | null;
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
  frame_id?: string | null;
  frame?: string | null; // Stores frame code (falling back to label)
  
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
  isSuperFrame?: string;
  
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
  /**
   * String form because this is typically sourced from URLSearchParams.
   * - 'true' => super frames only (super_frame_id is null)
   * - 'false' => non-super frames only (super_frame_id is not null)
   */
  isSuperFrame?: 'true' | 'false';
  super_frame_id?: string;
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
// Recipe Types
// ============================================

export type RecipeRelationType =
  | 'also_see'
  | 'causes'
  | 'entails'
  | 'hypernym'
  | 'hyponym'
  | 'starts'
  | 'ends'
  | 'precedes'
  | 'during'
  | 'enables';

export interface RecipePredicateRoleMapping {
  predicateRoleLabel: string;
  entryRoleLabel?: string;
  bindKind: 'role' | 'variable' | 'constant';
  variableTypeLabel?: string;
  variableKey?: string;
  constant?: unknown;
  discovered?: boolean;
  lexicalUnitCode?: string;
}

export interface RecipePredicateNode {
  id: string;
  alias?: string | null;
  position?: number | null;
  optional?: boolean;
  negated?: boolean;
  example?: string | null;
  lexical: GraphNode;
  roleMappings: RecipePredicateRoleMapping[];
}

export interface RecipePredicateEdge {
  sourcePredicateId: string;
  targetPredicateId: string;
  relation_type: RecipeRelationType;
}

export interface PredicateGroup {
  id: string;
  description?: string | null;
  require_at_least_one: boolean;
  predicate_ids: string[];
}

export type LogicNodeKind = 'and' | 'or' | 'not' | 'leaf' | 'enables' | 'causes' | 'precedes' | 'starts' | 'ends' | 'during' | 'co_temporal';

export interface LogicNode {
  id: string;
  recipe_id: string;
  kind: LogicNodeKind;
  description?: string | null;
  target_predicate_id?: string | null;
  target_predicate?: RecipePredicateNode | null;
  children: LogicNode[];
}

export interface RecipePrecondition {
  id: string;
  condition_type: string;
  target_role_id?: string | null;
  target_role_label?: string | null;
  target_recipe_predicate_id?: string | null;
  condition_params?: unknown;
  description?: string | null;
  error_message?: string | null;
}

export interface RecipeVariable {
  id: string;
  key: string;
  predicate_variable_type_label?: string | null;
  lexical_unit_id?: string | null;
  lexical_unit_code?: string | null;
  lexical_unit_gloss?: string | null;
  default_value?: unknown;
}

export interface Recipe {
  id: string;
  label?: string | null;
  description?: string | null;
  example?: string | null;
  is_default: boolean;
  predicates: RecipePredicateNode[];
  predicate_groups: PredicateGroup[];
  relations: RecipePredicateEdge[];
  preconditions: RecipePrecondition[];
  variables: RecipeVariable[];
  logic_root?: LogicNode | null;
}

export interface EntryRecipes {
  entryId: string;
  recipes: Recipe[];
}

// ============================================
// Pending Change Types
// ============================================

export type PendingChangeOperation = 'create' | 'update' | 'delete';

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

export type FrameRelationType = 
  | 'causes'
  | 'inherits_from'
  | 'inherited_by'
  | 'uses'
  | 'used_by'
  | 'subframe_of'
  | 'has_subframe'
  | 'precedes'
  | 'preceded_by'
  | 'perspective_on'
  | 'perspectivized_in'
  | 'see_also'
  | 'reframing_mapping'
  | 'metaphor';

export interface FrameGraphRole {
  id: string;
  frame_id: string;
  role_type_id: string;
  role_type_code: string;
  role_type_label: string;
  description: string | null;
  notes: string | null;
  main: boolean | null;
  examples: string[];
  label: string | null;
}

export interface FrameGraphLexicalUnit {
  id: string;
  code: string;
  gloss: string;
  pos: PartOfSpeech;
  lemmas: string[];
  examples: string[];
  flagged: boolean | null;
  flagged_reason: string | null;
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
  lexical_units: FrameGraphLexicalUnit[];
  relations: FrameGraphRelation[];
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  pending?: PendingChangeInfo | null;
}

export interface FrameRecipeRole {
  id: string;
  role_type: {
    id: string;
    code: string;
    label: string;
    generic_description: string;
  };
  description: string | null;
  notes: string | null;
  main: boolean | null;
  examples: string[];
  label: string | null;
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
    role_type_label: string;
    description: string | null;
    main: boolean | null;
  }>;
}

export interface FrameRecipeData {
  frame: {
    id: string;
    label: string;
    definition?: string | null;
    short_definition?: string | null;
    flagged: boolean | null;
    flagged_reason: string | null;
  };
  roles: FrameRecipeRole[];
  lexical_units: FrameRecipeLexicalUnit[];
  relations: {
    inherits_from: FrameRecipeRelatedFrame[];
    inherited_by: FrameRecipeRelatedFrame[];
    uses: FrameRecipeRelatedFrame[];
    used_by: FrameRecipeRelatedFrame[];
    other: Array<{
      type: FrameRelationType;
      direction: 'incoming' | 'outgoing';
      frame: FrameRecipeRelatedFrame;
    }>;
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

export function sortRolesByPrecedence<T extends { role_type: { label: string }; main?: boolean | null }>(roles: T[]): T[] {
  return [...roles].sort((a, b) => {
    const mainA = a.main ?? false;
    const mainB = b.main ?? false;
    
    if (mainA !== mainB) {
      return mainB ? 1 : -1;
    }
    
    const roleA = a.role_type?.label || '';
    const roleB = b.role_type?.label || '';
    
    const precedenceA = ROLE_PRECEDENCE[roleA] ?? -999;
    const precedenceB = ROLE_PRECEDENCE[roleB] ?? -999;
    
    if (precedenceA !== precedenceB) {
      return precedenceB - precedenceA;
    }
    
    return roleA.localeCompare(roleB);
  });
}
