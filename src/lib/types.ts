export interface LexicalEntry {
  id: string;
  gloss: string;
  pos: string;
  lexfile: string;
  isMwe: boolean;
  transitive?: boolean;
  lemmas: string[];
  particles: string[];
  frames: string[];
  examples: string[];
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

export interface GraphNode {
  id: string;
  lemmas: string[];
  gloss: string;
  pos: string;
  examples: string[];
  parents: GraphNode[];
  children: GraphNode[];
  entails: GraphNode[];
  causes: GraphNode[];
  alsoSee: GraphNode[];
}

export interface SearchResult {
  id: string;
  lemmas: string[];
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
  lemma: string;
  gloss: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  pos?: string;
  lexfile?: string;
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
  lemmas: string[];
  gloss: string;
  pos: string;
  lexfile: string;
  isMwe: boolean;
  transitive?: boolean;
  examples: string[];
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