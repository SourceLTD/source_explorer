/**
 * Entity Configuration System
 * 
 * Defines the differences between verbs/nouns/adjectives/adverbs
 * to enable a unified database query layer.
 */

import type { LexicalType } from '../types';

/**
 * Configuration for relation counting in the paginated queries
 */
export interface RelationCountConfig {
  /** The relation table name in Prisma */
  sourceRelation: string;
  targetRelation: string;
  /** The relation type to filter by for parentsCount (source relation) */
  sourceCountType: string;
  /** The relation type to filter by for childrenCount (target relation) */
  targetCountType: string;
}

/**
 * Type-specific field configuration
 */
export interface TypeSpecificFieldConfig {
  /** Database column name */
  dbColumn: string;
  /** Output field name */
  outputField: string;
  /** Whether this is a boolean field */
  isBoolean?: boolean;
  /** Default value if null */
  defaultValue?: unknown;
}

/**
 * Configuration defining the unique characteristics of each entity type
 */
export interface EntityConfig {
  /** The Prisma model name (e.g., 'verbs', 'nouns') */
  tableName: 'verbs' | 'nouns' | 'adjectives' | 'adverbs';
  
  /** POS code (e.g., 'v', 'n', 'a', 'r') */
  posCode: string;
  
  /** Whether this table has a 'deleted' column */
  hasDeleted: boolean;
  
  /** Whether this entity has frame_id (only verbs) */
  hasFrameId: boolean;
  
  /** Whether this entity has roles (only verbs) */
  hasRoles: boolean;
  
  /** Whether this entity has a vendler_class field (only verbs) */
  hasVendlerClass: boolean;
  
  /** Whether this entity has is_mwe field */
  hasIsMwe: boolean;
  
  /** Configuration for counting relations */
  relationConfig: RelationCountConfig;
  
  /** Type-specific fields to include in results */
  typeSpecificFields: TypeSpecificFieldConfig[];
  
  /** Database date column naming (verbs use camelCase, others use snake_case) */
  dateColumnStyle: 'camelCase' | 'snake_case';
}

/**
 * Entity configurations for all lexical types
 */
export const ENTITY_CONFIGS: Record<LexicalType, EntityConfig> = {
  verbs: {
    tableName: 'verbs',
    posCode: 'v',
    hasDeleted: true,
    hasFrameId: true,
    hasRoles: true,
    hasVendlerClass: true,
    hasIsMwe: false,
    relationConfig: {
      sourceRelation: 'verb_relations_verb_relations_source_idToverbs',
      targetRelation: 'verb_relations_verb_relations_target_idToverbs',
      sourceCountType: 'hypernym',
      targetCountType: 'hypernym',
    },
    typeSpecificFields: [
      { dbColumn: 'vendler_class', outputField: 'vendler_class', defaultValue: null },
    ],
    dateColumnStyle: 'camelCase',
  },
  
  nouns: {
    tableName: 'nouns',
    posCode: 'n',
    hasDeleted: false,
    hasFrameId: false,
    hasRoles: false,
    hasVendlerClass: false,
    hasIsMwe: true,
    relationConfig: {
      sourceRelation: 'noun_relations_noun_relations_source_idTonouns',
      targetRelation: 'noun_relations_noun_relations_target_idTonouns',
      sourceCountType: 'hypernym',
      targetCountType: 'hyponym',
    },
    typeSpecificFields: [
      { dbColumn: 'is_mwe', outputField: 'isMwe', isBoolean: true, defaultValue: false },
      { dbColumn: 'countable', outputField: 'countable', isBoolean: true },
      { dbColumn: 'proper', outputField: 'proper', isBoolean: true },
      { dbColumn: 'collective', outputField: 'collective', isBoolean: true },
      { dbColumn: 'concrete', outputField: 'concrete', isBoolean: true },
      { dbColumn: 'predicate', outputField: 'predicate', isBoolean: true },
    ],
    dateColumnStyle: 'snake_case',
  },
  
  adjectives: {
    tableName: 'adjectives',
    posCode: 'a',
    hasDeleted: false,
    hasFrameId: false,
    hasRoles: false,
    hasVendlerClass: false,
    hasIsMwe: true,
    relationConfig: {
      sourceRelation: 'adjective_relations_adjective_relations_source_idToadjectives',
      targetRelation: 'adjective_relations_adjective_relations_target_idToadjectives',
      sourceCountType: 'similar',
      targetCountType: 'similar',
    },
    typeSpecificFields: [
      { dbColumn: 'is_mwe', outputField: 'isMwe', isBoolean: true, defaultValue: false },
      { dbColumn: 'is_satellite', outputField: 'isSatellite', isBoolean: true },
      { dbColumn: 'gradable', outputField: 'gradable', isBoolean: true },
      { dbColumn: 'predicative', outputField: 'predicative', isBoolean: true },
      { dbColumn: 'attributive', outputField: 'attributive', isBoolean: true },
      { dbColumn: 'subjective', outputField: 'subjective', isBoolean: true },
      { dbColumn: 'relational', outputField: 'relational', isBoolean: true },
    ],
    dateColumnStyle: 'snake_case',
  },
  
  adverbs: {
    tableName: 'adverbs',
    posCode: 'r',
    hasDeleted: false,
    hasFrameId: false,
    hasRoles: false,
    hasVendlerClass: false,
    hasIsMwe: true,
    relationConfig: {
      sourceRelation: 'adverb_relations_adverb_relations_source_idToadverbs',
      targetRelation: 'adverb_relations_adverb_relations_target_idToadverbs',
      sourceCountType: 'similar',
      targetCountType: 'similar',
    },
    typeSpecificFields: [
      { dbColumn: 'is_mwe', outputField: 'isMwe', isBoolean: true, defaultValue: false },
      { dbColumn: 'gradable', outputField: 'gradable', isBoolean: true },
    ],
    dateColumnStyle: 'snake_case',
  },
};

/**
 * Get entity configuration by lexical type
 */
export function getEntityConfig(lexicalType: LexicalType): EntityConfig {
  return ENTITY_CONFIGS[lexicalType];
}

/**
 * Type guard for valid lexical types
 */
export function isValidLexicalType(type: string): type is LexicalType {
  return type === 'verbs' || type === 'nouns' || type === 'adjectives' || type === 'adverbs';
}

