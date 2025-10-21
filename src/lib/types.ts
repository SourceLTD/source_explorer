export interface Verb {
  id: string;
  code?: string; // Human-readable code (e.g., "aphorize.v.01")
  legacy_id: string;
  gloss: string;
  pos: string;
  lexfile: string;
  isMwe: boolean;
  transitive?: boolean;
  lemmas: string[];
  src_lemmas: string[];
  particles: string[];
  examples: string[];
  flagged?: boolean;
  flaggedReason?: string;
  forbidden?: boolean;
  forbiddenReason?: string;
  frame_id?: string | null;
  vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null;
  legal_constraints?: string[];
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
  forbidden?: boolean;
  forbiddenReason?: string;
  legal_constraints?: string[];
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
  forbidden?: boolean;
  forbiddenReason?: string;
  legal_constraints?: string[];
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

export interface Frame {
  id: string;
  code?: string; // Human-readable code (e.g., "extend.vf")
  framebank_id: string;
  frame_name: string;
  definition: string;
  short_definition: string;
  is_supporting_frame: boolean;
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
  legacy_id: string;
  lemmas: string[];
  src_lemmas: string[];
  gloss: string;
  legal_gloss?: string | null;
  legal_constraints: string[];
  pos: string;
  lexfile: string;
  examples: string[];
  flagged?: boolean;
  flaggedReason?: string;
  forbidden?: boolean;
  forbiddenReason?: string;
  // Verb-specific fields
  frame_id?: string | null;
  vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null;
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
}

export interface SearchResult {
  id: string;
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
  
  // Advanced filters
  gloss?: string;
  lemmas?: string;
  examples?: string;
  particles?: string;
  frames?: string;
  
  // Boolean filters
  isMwe?: boolean;
  transitive?: boolean;
  flagged?: boolean;
  forbidden?: boolean;
  
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

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface TableEntry {
  id: string;
  legacy_id: string;
  lemmas: string[];
  src_lemmas: string[];
  gloss: string;
  pos: string;
  lexfile: string;
  isMwe: boolean;
  // Verb-specific fields
  transitive?: boolean;
  particles: string[];
  frame_id?: string | null;
  frame?: string | null; // Frame name (e.g., "SPEAK")
  vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null;
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
  // Common fields
  examples: string[];
  flagged?: boolean;
  flaggedReason?: string;
  forbidden?: boolean;
  forbiddenReason?: string;
  legal_constraints?: string[];
  parentsCount: number;
  childrenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export const POS_LABELS = {
  'n': 'Noun',
  'v': 'Verb',
  'a': 'Adjective',
  'r': 'Adverb',
  's': 'Satellite Adjective'
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
  // For role-to-constant bindings
  constant?: unknown;
  // Indicates this is a discovered variable (role must be NULL)
  discovered?: boolean;
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
export type LogicNodeKind = 'and' | 'or' | 'not' | 'leaf';

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
  target_recipe_predicate_id?: string | null;
  condition_params?: unknown;
  description?: string | null;
  error_message?: string | null;
}

export interface Recipe {
  id: string;
  label?: string | null;
  description?: string | null;
  is_default: boolean;
  predicates: RecipePredicateNode[];
  predicate_groups: PredicateGroup[]; // Kept for backwards compatibility during transition
  relations: RecipePredicateEdge[];
  preconditions: RecipePrecondition[];
  // New: logic tree root
  logic_root?: LogicNode | null;
}

export interface EntryRecipes {
  entryId: string;
  recipes: Recipe[];
}

// Role precedence order - higher number = higher precedence
export const ROLE_PRECEDENCE: Record<string, number> = {
  'AGENT': 28,
  'SPEECH_TOPIC': 27,
  'REPORTED_SPEECH': 26,
  'DIRECT_SPEECH': 25,
  'RECIPIENT': 24,
  'CO_AGENT': 23,
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

// Helper function to sort roles by precedence
export function sortRolesByPrecedence<T extends { role_type: { label: string }; main?: boolean }>(roles: T[]): T[] {
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