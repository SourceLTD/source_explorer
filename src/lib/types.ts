import type { LexicalEntry, EntryRelation, RelationType } from '@prisma/client'

// Extended types for common use cases
export type LexicalEntryWithRelations = LexicalEntry & {
  sourceRelations: (EntryRelation & {
    target: LexicalEntry
  })[]
  targetRelations: (EntryRelation & {
    source: LexicalEntry
  })[]
}

export type EntryRelationWithEntries = EntryRelation & {
  source: LexicalEntry
  target: LexicalEntry
}

// Search and filter types
export interface SearchOptions {
  query: string
  pos?: string
  includeMwe?: boolean
  limit?: number
  offset?: number
}

export interface SearchResult {
  entries: LexicalEntry[]
  total: number
  hasMore: boolean
}

// Part of speech mappings
export const POS_LABELS: Record<string, string> = {
  'n': 'Noun',
  'v': 'Verb', 
  'a': 'Adjective',
  'r': 'Adverb',
  's': 'Satellite Adjective'
}

export const RELATION_LABELS: Record<RelationType, string> = {
  also_see: 'Also See',
  causes: 'Causes',
  entails: 'Entails',
  hypernym: 'Hypernym',
  hyponym: 'Hyponym'
}

// Database statistics type
export interface DatabaseStats {
  totalEntries: number
  totalRelations: number
  multiwordExpressions: number
  entriesByPos: Array<{
    pos: string
    count: number
  }>
  relationsByType: Array<{
    type: RelationType
    count: number
  }>
}

// Form input types
export interface CreateEntryInput {
  id: string
  gloss: string
  pos: string
  lexfile: string
  isMwe?: boolean
  transitive?: boolean
  lemmas?: string[]
  particles?: string[]
  frames?: string[]
  examples?: string[]
}

export interface UpdateEntryInput extends Partial<Omit<CreateEntryInput, 'id'>> {}

export interface CreateRelationInput {
  sourceId: string
  targetId: string
  type: RelationType
}