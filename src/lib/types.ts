// Lexical type union for API routes
export type LexicalType = 'verbs' | 'nouns' | 'adjectives' | 'adverbs';

export interface Verb {
  id: string;
  code?: string; // Human-readable code (e.g., "aphorize.v.01")
  legacy_id: string;
  gloss: string;
  pos: string;
  lexfile: string;
  lemmas: string[];
  src_lemmas: string[];
  examples: string[];
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  concrete?: boolean;
  frame_id?: string | null;
  vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Noun {
  id: string;
  code?: string; // Human-readable code (e.g., "dog.n.01")
  legacy_id: string;
  gloss: string;
  pos: string;
  lexfile: string;
  isMwe: boolean;
  countable?: boolean | null;
  proper?: boolean;
  collective?: boolean;
  concrete?: boolean;
  predicate?: boolean;
  lemmas: string[];
  src_lemmas: string[];
  examples: string[];
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  frame_id?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Adjective {
  id: string;
  code?: string; // Human-readable code (e.g., "good.a.01")
  legacy_id: string;
  gloss: string;
  pos: string;
  lexfile: string;
  isMwe: boolean;
  isSatellite?: boolean;
  gradable?: boolean | null;
  predicative?: boolean;
  attributive?: boolean;
  subjective?: boolean;
  relational?: boolean;
  lemmas: string[];
  src_lemmas: string[];
  examples: string[];
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  frame_id?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VerbRelation {
  sourceId: string;
  targetId: string;
  type: RelationType;
  source?: Verb;
  target?: Verb;
}

export interface NounRelation {
  sourceId: string;
  targetId: string;
  type: NounRelationType;
  source?: Noun;
  target?: Noun;
}

export interface AdjectiveRelation {
  sourceId: string;
  targetId: string;
  type: AdjectiveRelationType;
  source?: Adjective;
  target?: Adjective;
}

export enum RelationType {
  ALSO_SEE = 'also_see',
  CAUSES = 'causes',
  ENTAILS = 'entails',
  HYPERNYM = 'hypernym',
  HYPONYM = 'hyponym',
}

export enum NounRelationType {
  HYPERNYM = 'hypernym',
  HYPONYM = 'hyponym',
  INSTANCE_HYPERNYM = 'instance_hypernym',
  INSTANCE_HYPONYM = 'instance_hyponym',
  MERONYM_PART = 'meronym_part',
  HOLONYM_PART = 'holonym_part',
  MERONYM_MEMBER = 'meronym_member',
  HOLONYM_MEMBER = 'holonym_member',
  MERONYM_SUBSTANCE = 'meronym_substance',
  HOLONYM_SUBSTANCE = 'holonym_substance',
  SIMILAR_TO = 'similar_to',
  ALSO_SEE = 'also_see',
  ATTRIBUTE = 'attribute',
  DERIVATIONALLY_RELATED = 'derivationally_related',
  PERTAINYM = 'pertainym',
  DOMAIN_TOPIC = 'domain_topic',
  DOMAIN_REGION = 'domain_region',
  DOMAIN_USAGE = 'domain_usage',
  MEMBER_OF_DOMAIN_TOPIC = 'member_of_domain_topic',
  MEMBER_OF_DOMAIN_REGION = 'member_of_domain_region',
  MEMBER_OF_DOMAIN_USAGE = 'member_of_domain_usage',
}

export enum AdjectiveRelationType {
  SIMILAR = 'similar',
  ALSO_SEE = 'also_see',
  ATTRIBUTE = 'attribute',
  ANTONYM = 'antonym',
  DOMAIN_TOPIC = 'domain_topic',
  DOMAIN_REGION = 'domain_region',
  DOMAIN_USAGE = 'domain_usage',
  MEMBER_OF_DOMAIN_TOPIC = 'member_of_domain_topic',
  MEMBER_OF_DOMAIN_REGION = 'member_of_domain_region',
  MEMBER_OF_DOMAIN_USAGE = 'member_of_domain_usage',
  EXEMPLIFIES = 'exemplifies',
  DERIVATIONALLY_RELATED = 'derivationally_related',
  PERTAINYM = 'pertainym',
  PARTICIPLE_OF = 'participle_of',
  RELATED_TO = 'related_to',
  CAUSES = 'causes',
}

export interface VerbWithRelations extends Verb {
  sourceRelations: VerbRelation[];
  targetRelations: VerbRelation[];
}

export interface NounWithRelations extends Noun {
  sourceRelations: NounRelation[];
  targetRelations: NounRelation[];
}

export interface AdjectiveWithRelations extends Adjective {
  sourceRelations: AdjectiveRelation[];
  targetRelations: AdjectiveRelation[];
}

export interface Adverb {
  id: string;
  code?: string;
  legacy_id: string;
  gloss: string;
  pos: string;
  lexfile: string;
  isMwe: boolean;
  gradable?: boolean | null;
  lemmas: string[];
  src_lemmas: string[];
  examples: string[];
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  frame_id?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdverbRelation {
  sourceId: string;
  targetId: string;
  type: string;
  source?: Adverb;
  target?: Adverb;
}

export interface AdverbWithRelations extends Adverb {
  sourceRelations: AdverbRelation[];
  targetRelations: AdverbRelation[];
}

export interface FrameRole {
  id: string;
  description?: string | null;
  notes?: string | null;
  main?: boolean | null;
  examples?: string[];
  label?: string | null;
  role_type: RoleType;
}

export interface Frame {
  id: string;
  label: string;
  definition?: string | null;
  short_definition?: string | null;
  prototypical_synset: string;
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  createdAt: Date;
  updatedAt: Date;
  frame_roles?: FrameRole[];
  // Counts from related entities
  roles_count?: number;
  verbs_count?: number;
  // Pending changes info (optional, included when there are uncommitted changes)
  pending?: PendingChangeInfo | null;
}

export interface RoleType {
  id: string;
  code?: string; // Human-readable code (e.g., "agent.rl")
  label: string;
  generic_description: string;
  explanation?: string | null;
}

export interface Role {
  id: string;
  description?: string;
  example_sentence?: string;
  instantiation_type_ids: number[]; // Changed from string[] to number[]
  main: boolean;
  role_type: RoleType;
}

export interface RoleGroup {
  id: string;
  description?: string | null;
  require_at_least_one: boolean;
  role_ids: string[]; // IDs of roles in this group
}

export interface GraphNode {
  id: string;
  numericId: string; // The database BigInt ID as string (for pending changes lookup)
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
  vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null;
  frame_id?: string | null;
  frame?: Frame | null;
  roles?: Role[];
  role_groups?: RoleGroup[];
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
  // Common relation fields
  parents: GraphNode[];
  children: GraphNode[];
  entails: GraphNode[];
  causes: GraphNode[];
  alsoSee: GraphNode[];
  // Pending changes info (optional, included when there are uncommitted changes)
  pending?: PendingChangeInfo | null;
}

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
  pos?: string;
  limit?: number;
}

export interface PaginatedSearchResult {
  entries: Verb[];
  total: number;
  hasMore: boolean;
}

export interface VerbWithRelations extends Verb {
  sourceRelations: VerbRelationWithEntries[];
  targetRelations: VerbRelationWithEntries[];
}

export interface VerbRelationWithEntries extends VerbRelation {
  source?: Verb;
  target?: Verb;
}

export interface DatabaseStats {
  totalEntries: number;
  totalRelations: number;
  entriesByPos: Record<string, number>;
  relationsByType: Record<string, number>;
}

export interface BreadcrumbItem {
  id: string;
  legacy_id: string;
  lemma: string;
  gloss: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  
  // Basic filters (legacy)
  pos?: string;
  lexfile?: string;
  frame_id?: string; // Comma-separated frame IDs
  // AI jobs filters
  flaggedByJobId?: string;
  
  // Advanced filters
  gloss?: string;
  lemmas?: string;
  examples?: string;
  // Note: frames filter removed - verbs table only has frame_id (BigInt), not frames array
  flaggedReason?: string;
  unverifiableReason?: string;
  
  // Boolean filters
  isMwe?: boolean;
  flagged?: boolean;
  verifiable?: boolean;
  
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
  
  // Frame-specific text filters
  label?: string;
  definition?: string;
  short_definition?: string;
  prototypical_synset?: string;
  
  // Date filters
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

/**
 * Paginated result with pending change info attached to each entity.
 */
export interface PaginatedResultWithPending<T> {
  data: WithPendingInfo<T>[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface TableEntry {
  id: string;
  numericId: string; // The database BigInt ID as string (for pending changes lookup)
  legacy_id: string;
  lemmas: string[];
  src_lemmas: string[];
  gloss: string;
  pos: string;
  lexfile: string;
  // Verb-specific fields
  frame_id?: string | null;
  frame?: string | null; // Frame name (e.g., "SPEAK")
  vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null;
  roles?: Role[];
  role_groups?: RoleGroup[];
  // Noun-specific fields
  isMwe?: boolean;
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
  examples: string[];
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  parentsCount: number;
  childrenCount: number;
  createdAt: Date;
  updatedAt: Date;
  // Pending changes info (optional, included when there are uncommitted changes)
  pending?: PendingChangeInfo | null;
}

export const POS_LABELS = {
  'n': 'Noun',
  'v': 'Verb',
  'a': 'Adjective',
  'r': 'Adverb',
  's': 'Satellite Adjective',
  'f': 'Frame'
} as const;

export const RELATION_LABELS = {
  [RelationType.HYPERNYM]: 'Hypernym',
  [RelationType.HYPONYM]: 'Hyponym',
  [RelationType.ALSO_SEE]: 'Also See',
  [RelationType.CAUSES]: 'Causes',
  [RelationType.ENTAILS]: 'Entails'
} as const;

// Recipes graph types
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
  bindKind: 'role' | 'variable' | 'constant';
  // For role-to-role bindings
  entryRoleLabel?: string;
  // For role-to-variable bindings
  variableTypeLabel?: string;
  variableKey?: string; // Key from recipe_variables
  // For role-to-constant bindings
  constant?: unknown;
  // Indicates this is a discovered variable (role must be NULL)
  discovered?: boolean;
  // Noun code for noun-based bindings (from recipe_variables.noun_id)
  nounCode?: string;
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
  predicate_ids: string[]; // IDs of predicates in this group
}

// Logic AST types
export type LogicNodeKind = 'and' | 'or' | 'not' | 'leaf' | 'enables' | 'causes' | 'precedes' | 'starts' | 'ends' | 'during' | 'co_temporal';

export interface LogicNode {
  id: string;
  recipe_id: string;
  kind: LogicNodeKind;
  description?: string | null;
  // For leaf nodes only
  target_predicate_id?: string | null;
  target_predicate?: RecipePredicateNode | null;
  // Child nodes (from edges)
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
  noun_id?: string | null;
  noun_code?: string | null;
  noun_gloss?: string | null;
  default_value?: unknown;
}

export interface Recipe {
  id: string;
  label?: string | null;
  description?: string | null;
  example?: string | null;
  is_default: boolean;
  predicates: RecipePredicateNode[];
  predicate_groups: PredicateGroup[]; // Kept for backwards compatibility during transition
  relations: RecipePredicateEdge[];
  preconditions: RecipePrecondition[];
  variables: RecipeVariable[];
  // New: logic tree root
  logic_root?: LogicNode | null;
}

export interface EntryRecipes {
  entryId: string;
  recipes: Recipe[];
}

// Role precedence order - higher number = higher precedence
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

// ============================================
// Pending Change Types (for API responses)
// ============================================

export type PendingChangeOperation = 'create' | 'update' | 'delete';

/**
 * Information about a pending field change.
 * Serializable version for API responses.
 */
export interface PendingFieldChange {
  field_change_id: string;
  old_value: unknown;
  new_value: unknown;
  status: 'pending' | 'approved' | 'rejected';
}

/**
 * Metadata about pending changes on an entity.
 * Attached to API responses when there are uncommitted changes.
 */
export interface PendingChangeInfo {
  /** The type of pending operation */
  operation: PendingChangeOperation;
  /** The changeset ID (as string for JSON serialization) */
  changeset_id: string;
  /** Map of field names to their pending change info */
  pending_fields: Record<string, PendingFieldChange>;
}

/**
 * Wrapper type for entities that may have pending changes.
 * Used in paginated responses and graph data.
 */
export interface WithPendingInfo<T> {
  /** The entity data (with pending values applied for preview) */
  data: T;
  /** Pending change metadata, or null if no pending changes */
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

export interface FrameGraphVerb {
  id: string;
  code: string;
  gloss: string;
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
  gloss?: string | null; // definition
  short_definition?: string | null;
  prototypical_synset: string;
  roles: FrameGraphRole[];
  verbs: FrameGraphVerb[];
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

export interface FrameRecipeVerb {
  id: string;
  code: string;
  lemmas: string[];
  gloss: string;
  vendler_class: 'state' | 'activity' | 'accomplishment' | 'achievement' | null;
  roles: Array<{
    id: string;
    role_type: {
      id: string;
      code: string;
      label: string;
    };
    description: string | null;
    main: boolean;
    example_sentence: string | null;
  }>;
  role_groups: Array<{
    id: string;
    description: string | null;
    require_at_least_one: boolean;
    role_ids: string[];
  }>;
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
    prototypical_synset: string;
    flagged: boolean | null;
    flagged_reason: string | null;
  };
  roles: FrameRecipeRole[];
  verbs: FrameRecipeVerb[];
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

// Helper function to sort roles by precedence
export function sortRolesByPrecedence<T extends { role_type: { label: string }; main?: boolean | null }>(roles: T[]): T[] {
  return [...roles].sort((a, b) => {
    // First, sort by main (main roles first)
    const mainA = a.main ?? false;
    const mainB = b.main ?? false;
    
    if (mainA !== mainB) {
      return mainB ? 1 : -1; // main roles (true) come first
    }
    
    // Then sort by precedence (descending)
    const roleA = a.role_type?.label || '';
    const roleB = b.role_type?.label || '';
    
    const precedenceA = ROLE_PRECEDENCE[roleA] ?? -999;
    const precedenceB = ROLE_PRECEDENCE[roleB] ?? -999;
    
    if (precedenceA !== precedenceB) {
      return precedenceB - precedenceA;
    }
    
    // Finally, sort by label (ascending) for ties
    return roleA.localeCompare(roleB);
  });
}