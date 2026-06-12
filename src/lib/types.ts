// ============================================
// Part of Speech Types
// ============================================

export type PartOfSpeech = 'verb' | 'noun' | 'adjective' | 'adverb';

// Legacy type for backward compatibility - maps to table name style
export type LexicalType = 'lexical_units';

export type VendlerClass = 'state' | 'activity' | 'accomplishment' | 'achievement';

export type StateKind = 'dimension' | 'grade' | 'taxon';

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
  senses?: SenseWithConcept[];
  concept_id?: string | null;
  concept_ids?: string[];
  concept?: Concept | null;
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
// Concept Types
// ============================================

export interface ConceptProperty {
  id: string;
  description?: string | null;
  notes?: string | null;
  main?: boolean | null;
  examples?: string[];
  example_sentence?: string | null;
  label?: string | null;
  fillers?: unknown;
}

export interface PropertyGroup {
  id: string;
  description?: string | null;
  role_ids: string[];
  require_at_least_one?: boolean;
}

// Lexical unit snippet for displaying in the concepts table
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

export interface Concept {
  id: string;
  label: string;
  definition?: string | null;
  short_definition?: string | null;
  classifier_guidance?: string | null;
  code?: string | null;
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  createdAt: Date;
  updatedAt: Date;
  properties?: ConceptProperty[];
  properties_count?: number;
  /** Distinct lexical units reachable through senses (via sense_concepts). */
  lexical_units_count?: number;
  /** Number of senses linked to this concept. */
  senses_count?: number;
  /** Number of senses linked to this concept that ALSO link to another concept (>1). */
  sensesWithMultipleConcepts?: number;
  lexical_units?: LexicalUnitsSample;
  pending?: PendingChangeInfo | null;
  archetype?: string | null;
  subtype?: string | null;
  state_kind?: StateKind | null;
  disable_healthcheck?: boolean;
  vendler?: string | null;
  multi_perspective?: boolean | null;
  wikidata_id?: string | null;
  recipe?: ConceptRecipe | null;
}

export type ConceptRecipe = Record<string, unknown>;

// ============================================
// Concept Sense Types
// ============================================

/**
 * Indicates an anomaly in a sense's concept linkage.
 * - 'none': the sense is linked to zero concepts
 * - 'multiple': the sense is linked to more than one concept
 * - null: exactly one concept (the happy path)
 */
export type SenseWarning = 'none' | 'multiple' | null;

export interface SenseConceptRef {
  id: string;
  label: string;
  code: string | null;
}

/**
 * A sense row — the intermediate entity between a lexical_unit and a concept.
 * Carries its own POS/definition/archetype/... and is expected to link to exactly
 * one concept in practice.
 */
export interface Sense {
  id: string;
  pos: string;
  definition: string;
  archetype: string;
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
 * Sense with its linked concepts. `concept` is the canonical single concept
 * (first entry of `concepts`), `concepts` is the raw list (for drilldown / warning UX),
 * and `conceptWarning` signals when the 1:1 invariant is violated.
 */
export interface SenseWithConcept extends Sense {
  concept: SenseConceptRef | null;
  concepts: SenseConceptRef[];
  conceptWarning: SenseWarning;
}

export interface SenseLexicalUnitSnippet {
  id: string;
  code: string;
  lemmas: string[];
  src_lemmas: string[];
  pos: string;
  gloss: string;
}

export interface SenseTableRow extends Omit<SenseWithConcept, 'createdAt' | 'updatedAt'> {
  createdAt: string | null;
  updatedAt: string | null;
  lexical_units: {
    entries: SenseLexicalUnitSnippet[];
    totalCount: number;
    hasMore: boolean;
  };
  lexical_units_count: number;
  pending?: PendingChangeInfo | null;
}

/**
 * A referent row — a stable named entity sitting between concepts and claims.
 * Typed by a concept (`type_concept`), optionally scoped to a knowledge graph,
 * and carrying aliases and external ids aggregated from its child tables.
 */
export interface ReferentExternalId {
  vocabulary: string;
  external_id: string;
}

export interface ReferentTableRow {
  id: string;
  canonical_label: string;
  type_concept: { id: string; label: string; code: string | null } | null;
  knowledge_graph: { id: string; label: string } | null;
  aliases: string[];
  external_ids: ReferentExternalId[];
  metadata: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
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

  // Senses chain — each sense links to zero-or-more concepts;
  // the 1:1 happy path is surfaced as `concept` and anomalies via `conceptWarning`.
  senses?: SenseWithConcept[];
  // Legacy/derived: kept for UI backward compatibility.
  concept_id?: string | null;
  concept_ids?: string[];
  concept?: Concept | null;

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

  // Property fields
  properties?: ConceptProperty[];
  property_groups?: PropertyGroup[];
  
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
  conceptDefinition?: string | null;
  archetype?: string | null;
}

export interface SearchOptions {
  query: string;
  pos?: PartOfSpeech | PartOfSpeech[];
  limit?: number;
}

// ============================================
// Unified (cross-entity) search
// ============================================

/** The four entity types reachable from the global navbar search. */
export type SearchEntityType = 'concept' | 'sense' | 'referent' | 'claim';

/**
 * A single normalized result from the unified search endpoint. Every searcher
 * (concepts/senses/referents/claims) maps its rows into this shape, building a
 * ready-to-navigate `href` server-side so the client just calls router.push.
 */
export interface UnifiedSearchResult {
  type: SearchEntityType;
  id: string;
  label: string; // primary line
  sublabel?: string; // secondary line (definition / gloss / alias / concept·referent)
  badge?: string; // pos / archetype / vocabulary / graph name
  href: string; // ready-to-navigate URL (built server-side)
}

/** Unscoped response: results grouped by entity type. */
export type UnifiedSearchGroups = Record<SearchEntityType, UnifiedSearchResult[]>;

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
  // Senses for this entry (canonical source of concept info going forward).
  senses?: SenseWithConcept[];
  // Count of senses with conceptWarning !== null — for row-level flagging.
  anomalousSenseCount?: number;
  // Legacy/derived from senses for backward compat.
  concept_id?: string | null;
  concept_ids?: string[];
  concept?: string | null;
  concepts?: SenseConceptRef[];

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
  concept_id?: string;
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
  excludeNullConcept?: boolean;
  
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

export interface ConceptPaginationParams {
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
  'f': 'Concept'
};

/**
 * Compact POS chip labels for tight UI surfaces (sense list rows, graph
 * nodes, tag pills). The DB stores the long form (`part_of_speech` enum:
 * `verb / noun / adjective / adverb`); these abbreviations are display-
 * only and intentionally mirror the legacy `n / v / adj / adv` values
 * that sense chips rendered prior to the standardization
 * migration, so visual real estate and reviewer recognition are
 * preserved. Fall back to `pos.toUpperCase()` for any unknown value.
 */
export const POS_SHORT_LABEL: Record<string, string> = {
  verb: 'V',
  noun: 'N',
  adjective: 'ADJ',
  adverb: 'ADV',
};

export function posShortLabel(pos: string | null | undefined): string {
  if (!pos) return '';
  return POS_SHORT_LABEL[pos] ?? pos.toUpperCase();
}

/** Canonical display order for POS when listing senses. */
export const POS_ORDER: Record<string, number> = {
  verb: 0,
  noun: 1,
  adjective: 2,
  adverb: 3,
};

/** Sort comparator: verb → noun → adjective → adverb, unknowns last. */
export function compareSensesByPos<T extends { pos?: string | null }>(a: T, b: T): number {
  const aRank = a.pos != null ? (POS_ORDER[a.pos] ?? 99) : 99;
  const bRank = b.pos != null ? (POS_ORDER[b.pos] ?? 99) : 99;
  return aRank - bRank;
}

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
// Concept Graph Types
// ============================================

export type ConceptRelationType = 'parent_of';

/**
 * Allowed filler for a concept's property — either a primitive type
 * (`string`, `number`, ...) or a reference to a specific concept whose
 * instances may fill the slot. Derived from `property_filler_constraints`
 * joined with `filler_types` and the referenced `concepts` row.
 */
export interface FillerConstraint {
  filler_type_id: number;
  filler_type_label: string;
  concept_id: string | null;
  concept_label: string | null;
}

export interface ConceptGraphProperty {
  id: string;
  concept_id: string;
  description: string | null;
  notes: string | null;
  main: boolean | null;
  examples: string[];
  label: string | null;
  fillers?: unknown;
  filler_constraints?: FillerConstraint[];
}

export interface ConceptGraphLexicalUnit {
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
 * A sense attached to a concept, with its expected-single linkage back to that concept
 * (`conceptWarning !== null` means the sense links to zero or multiple concepts — render
 * a warning). `lexical_units` lists the LUs attached to this sense.
 */
export interface ConceptGraphSense {
  id: string;
  pos: string;
  definition: string;
  archetype: string;
  lemmas?: string[];
  confidence: string | null;
  type_dispute: string | null;
  causative: boolean | null;
  inchoative: boolean | null;
  perspectival: boolean | null;
  concepts: SenseConceptRef[];
  conceptWarning: SenseWarning;
  lexical_units: ConceptGraphLexicalUnit[];
}

export interface ConceptGraphRelation {
  id?: string;
  type: ConceptRelationType;
  locked?: boolean;
  direction: 'incoming' | 'outgoing';
  target?: {
    id: string;
    label: string;
    short_definition?: string | null;
    descendant_count?: number;
    state_kind?: StateKind | null;
  };
  source?: {
    id: string;
    label: string;
    short_definition?: string | null;
    descendant_count?: number;
    state_kind?: StateKind | null;
  };
}

export interface ConceptGraphNode {
  id: string;
  numericId: string;
  pos: 'concepts';
  label: string;
  gloss?: string | null;
  short_definition?: string | null;
  classifier_guidance?: string | null;
  properties: ConceptGraphProperty[];
  // Senses attached to this concept (senses-first view); each sense carries its LUs.
  senses: ConceptGraphSense[];
  // Flattened de-duplicated LUs across all senses — kept for legacy UI paths.
  lexical_units: ConceptGraphLexicalUnit[];
  relations: ConceptGraphRelation[];
  flagged?: boolean;
  flaggedReason?: string;
  verifiable?: boolean;
  unverifiableReason?: string;
  pending?: PendingChangeInfo | null;
  archetype?: string | null;
  vendler?: string | null;
  multi_perspective?: boolean | null;
  wikidata_id?: string | null;
  state_kind?: StateKind | null;
  recipe?: ConceptRecipe | null;
  recipe_graph?: RecipeGraph | null;
}

export interface ConceptRecipeProperty {
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

export interface ConceptRecipeLexicalUnit {
  id: string;
  code: string;
  pos: PartOfSpeech;
  lemmas: string[];
  gloss: string;
  vendler_class: VendlerClass | null;
}

export interface ConceptRecipeRelatedConcept {
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

export interface ConceptRecipeSense {
  id: string;
  pos: string;
  definition: string;
  archetype: string;
  confidence: string | null;
  type_dispute: string | null;
  causative: boolean | null;
  inchoative: boolean | null;
  perspectival: boolean | null;
  conceptWarning: SenseWarning;
  lexical_units: ConceptRecipeLexicalUnit[];
}

export interface ConceptRecipeData {
  concept: {
    id: string;
    label: string;
    definition?: string | null;
    short_definition?: string | null;
    classifier_guidance?: string | null;
    flagged: boolean | null;
    flagged_reason: string | null;
    archetype?: string | null;
    subtype?: string | null;
    disable_healthcheck?: boolean;
    vendler?: string | null;
    multi_perspective?: boolean | null;
    wikidata_id?: string | null;
    recipe?: ConceptRecipe | null;
  };
  properties: ConceptRecipeProperty[];
  senses: ConceptRecipeSense[];
  lexical_units: ConceptRecipeLexicalUnit[];
  relations: {
    parent_of: ConceptRecipeRelatedConcept[];
    child_of: ConceptRecipeRelatedConcept[];
  };
}

// ============================================
// Property Type Acronyms (max 4 characters)
// ============================================

export const PROPERTY_TYPE_ACRONYMS: Record<string, string> = {
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

export function getPropertyTypeAcronym(roleTypeLabel: string): string {
  return PROPERTY_TYPE_ACRONYMS[roleTypeLabel] || roleTypeLabel.substring(0, 5).toUpperCase();
}

// Property Precedence (for concept properties display)
// ============================================

export const PROPERTY_PRECEDENCE: Record<string, number> = {
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

export function sortPropertiesByPrecedence<T extends { label?: string | null; main?: boolean | null }>(roles: T[]): T[] {
  return [...roles].sort((a, b) => {
    const mainA = a.main ?? false;
    const mainB = b.main ?? false;
    
    if (mainA !== mainB) {
      return mainB ? 1 : -1;
    }
    
    const roleA = a.label || '';
    const roleB = b.label || '';
    
    const precedenceA = PROPERTY_PRECEDENCE[roleA] ?? -999;
    const precedenceB = PROPERTY_PRECEDENCE[roleB] ?? -999;
    
    if (precedenceA !== precedenceB) {
      return precedenceB - precedenceA;
    }
    
    return roleA.localeCompare(roleB);
  });
}

// ============================================
// Deprecated Aliases (for backward compatibility)
// ============================================

/** @deprecated Use PropertyGroup */
export type RoleGroup = PropertyGroup;
/** @deprecated Use PROPERTY_TYPE_ACRONYMS */
export const ROLE_TYPE_ACRONYMS = PROPERTY_TYPE_ACRONYMS;
/** @deprecated Use getPropertyTypeAcronym */
export const getRoleTypeAcronym = getPropertyTypeAcronym;
/** @deprecated Use PROPERTY_PRECEDENCE */
export const ROLE_PRECEDENCE = PROPERTY_PRECEDENCE;
/** @deprecated Use sortPropertiesByPrecedence */
export const sortRolesByPrecedence = sortPropertiesByPrecedence;
