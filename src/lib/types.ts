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

export interface BreadcrumbItem {
  id: string;
  lemma: string;
  gloss: string;
}

export interface TableEntry {
  id: string;
  lemmas: string[];
  gloss: string;
  pos: string;
  lexfile: string;
  isMwe: boolean;
  transitive?: boolean;
  particles: string[];
  frames: string[];
  examples: string[];
  parentsCount: number;
  childrenCount: number;
  createdAt: Date;
  updatedAt: Date;
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

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  pos?: string;
  lexfile?: string;
  isMwe?: boolean;
  transitive?: boolean;
  hasParticles?: boolean;
  hasFrames?: boolean;
  hasExamples?: boolean;
  lemmaContains?: string;
  glossContains?: string;
  minParents?: number;
  maxParents?: number;
  minChildren?: number;
  maxChildren?: number;
  createdAfter?: string;
  createdBefore?: string;
}

export interface FilterConfig {
  type: 'text' | 'select' | 'boolean' | 'number' | 'date' | 'range';
  label: string;
  field: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

export const POS_LABELS: Record<string, string> = {
  'n': 'Noun',
  'v': 'Verb',
  'a': 'Adjective',
  'r': 'Adverb',
  's': 'Adjective Satellite',
};