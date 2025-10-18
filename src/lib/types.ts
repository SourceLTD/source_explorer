export interface LexicalEntry {
  id: string;
  legacy_id: string;
  gloss: string;
  pos: string;
  lexfile: string;
  isMwe: boolean;
  transitive?: boolean;
  lemmas: string[];
  src_lemmas: string[];
  particles: string[];
  frames: string[];
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

export interface EntryRelation {
  sourceId: string;
  targetId: string;
  type: RelationType;
  source?: LexicalEntry;
  target?: LexicalEntry;
}

export enum RelationType {
  ALSO_SEE = 'also_see',
  CAUSES = 'causes',
  ENTAILS = 'entails',
  HYPERNYM = 'hypernym',
  HYPONYM = 'hyponym',
}

export interface EntryWithRelations extends LexicalEntry {
  sourceRelations: EntryRelation[];
  targetRelations: EntryRelation[];
}

export interface Frame {
  id: string;
  framebank_id: string;
  frame_name: string;
  definition: string;
  short_definition: string;
  is_supporting_frame: boolean;
}

export interface RoleType {
  id: string;
  label: string;
  generic_description: string;
  explanation?: string | null;
}

export interface Role {
  id: string;
  description?: string;
  example_sentence?: string;
  instantiation_type_ids: string[];
  main: boolean;
  role_type: RoleType;
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
  frame_id?: string | null;
  vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null;
  frame?: Frame | null;
  roles?: Role[];
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
  entries: LexicalEntry[];
  total: number;
  hasMore: boolean;
}

export interface LexicalEntryWithRelations extends LexicalEntry {
  sourceRelations: EntryRelationWithEntries[];
  targetRelations: EntryRelationWithEntries[];
}

export interface EntryRelationWithEntries extends EntryRelation {
  source?: LexicalEntry;
  target?: LexicalEntry;
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
  transitive?: boolean;
  particles: string[];
  frames: string[];
  examples: string[];
  flagged?: boolean;
  flaggedReason?: string;
  forbidden?: boolean;
  forbiddenReason?: string;
  frame_id?: string | null;
  vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null;
  legal_constraints?: string[];
  roles?: Role[];
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
}

export interface RecipePredicateNode {
  id: string;
  alias?: string | null;
  position?: number | null;
  optional?: boolean;
  negated?: boolean;
  lexical: GraphNode;
  roleMappings: RecipePredicateRoleMapping[];
}

export interface RecipePredicateEdge {
  sourcePredicateId: string;
  targetPredicateId: string;
  relation_type: RecipeRelationType;
}

export interface Recipe {
  id: string;
  label?: string | null;
  description?: string | null;
  is_default: boolean;
  predicates: RecipePredicateNode[];
  relations: RecipePredicateEdge[];
}

export interface EntryRecipes {
  entryId: string;
  recipes: Recipe[];
}

// Role precedence order - higher number = higher precedence
export const ROLE_PRECEDENCE: Record<string, number> = {
  'AGENT': 24,
  'CO_AGENT': 23,
  'TOPIC': 22,
  'THEME': 21,
  'CO_THEME': 20,
  'PATIENT': 19,
  'EXPERIENCER': 18,
  'RECIPIENT': 17,
  'INSTRUMENT': 16,
  'SOURCE': 15,
  'DESTINATION': 14,
  'BENEFICIARY': 13,
  'EXTENT': 12,
  'GOAL': 11,
  'TIME': 10,
  'LOCATION': 9,
  'STIMULUS': 8,
  'CO_PATIENT': 7,
  'PURPOSE': 6,
  'CAUSE': 5,
  'RESULT': 4,
  'PRODUCT': 3,
  'MATERIAL': 2,
  'ATTRIBUTE': 1,
  'VALUE': 0,
  'ASSET': -1,
  'IDIOM': -2
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