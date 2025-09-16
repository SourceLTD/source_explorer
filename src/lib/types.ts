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
  parents: GraphNode[];
  children: GraphNode[];
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