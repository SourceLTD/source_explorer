/**
 * Entity Configuration System
 * 
 * Simplified configuration for the unified lexical_units table.
 * All POS types now use the same table with a `pos` discriminator.
 */

import type { PartOfSpeech } from '../types';

/**
 * Fields that are specific to certain POS types.
 * Used for filtering and display logic.
 */
export interface POSSpecificFields {
  /** Fields only relevant for this POS */
  fields: string[];
  /** Relation type used for parent count (hypernym for most) */
  parentRelationType: string;
  /** Relation type used for child count */
  childRelationType: string;
}

/**
 * POS-specific field configurations
 */
export const POS_FIELDS: Record<PartOfSpeech, POSSpecificFields> = {
  verb: {
    fields: ['vendler_class', 'created_from', 'concrete'],
    parentRelationType: 'hypernym',
    childRelationType: 'hyponym',
  },
  noun: {
    fields: ['countable', 'proper', 'collective', 'concrete', 'predicate', 'is_mwe'],
    parentRelationType: 'hypernym',
    childRelationType: 'hyponym',
  },
  adjective: {
    fields: ['is_satellite', 'gradable', 'predicative', 'attributive', 'subjective', 'relational', 'is_mwe'],
    parentRelationType: 'similar',
    childRelationType: 'similar',
  },
  adverb: {
    fields: ['gradable', 'is_mwe'],
    parentRelationType: 'similar',
    childRelationType: 'similar',
  },
};

/**
 * Common fields shared by all lexical units
 */
export const COMMON_FIELDS = [
  'id',
  'code',
  'legacy_id',
  'pos',
  'lemmas',
  'src_lemmas',
  'gloss',
  'lexfile',
  'examples',
  'flagged',
  'flagged_reason',
  'verifiable',
  'unverifiable_reason',
  'legal_gloss',
  'deleted',
  'deleted_at',
  'deleted_reason',
  'frame_id',
  'version',
  'created_at',
  'updated_at',
];

/**
 * All fields in the lexical_units table
 */
export const ALL_LEXICAL_UNIT_FIELDS = [
  ...COMMON_FIELDS,
  // Verb-specific
  'vendler_class',
  'created_from',
  // Noun-specific
  'countable',
  'proper',
  'collective',
  'predicate',
  // Shared
  'concrete',
  'is_mwe',
  // Adjective-specific
  'is_satellite',
  'predicative',
  'attributive',
  'subjective',
  'relational',
  // Adjective/Adverb
  'gradable',
];

/**
 * Field mappings from database columns to output field names
 */
export const FIELD_MAPPINGS: Record<string, string> = {
  'is_mwe': 'isMwe',
  'is_satellite': 'isSatellite',
  'flagged_reason': 'flaggedReason',
  'unverifiable_reason': 'unverifiableReason',
  'legal_gloss': 'legalGloss',
  'created_at': 'createdAt',
  'updated_at': 'updatedAt',
};

/**
 * Get the output field name for a database column
 */
export function getOutputFieldName(dbColumn: string): string {
  return FIELD_MAPPINGS[dbColumn] || dbColumn;
}

/**
 * Get POS-specific configuration
 */
export function getPOSConfig(pos: PartOfSpeech): POSSpecificFields {
  return POS_FIELDS[pos];
}

/**
 * Check if a field is relevant for a given POS
 */
export function isFieldRelevantForPOS(field: string, pos: PartOfSpeech): boolean {
  const config = POS_FIELDS[pos];
  return COMMON_FIELDS.includes(field) || config.fields.includes(field);
}

/**
 * Valid POS values
 */
export const VALID_POS_VALUES: PartOfSpeech[] = ['verb', 'noun', 'adjective', 'adverb'];

/**
 * Type guard for valid POS
 */
export function isValidPOS(pos: string): pos is PartOfSpeech {
  return VALID_POS_VALUES.includes(pos as PartOfSpeech);
}

/**
 * Parse POS filter from query params (can be single value or comma-separated)
 */
export function parsePOSFilter(pos: string | string[] | undefined): PartOfSpeech[] | undefined {
  if (!pos) return undefined;
  
  const values = Array.isArray(pos) ? pos : pos.split(',').map(p => p.trim());
  const validValues = values.filter(isValidPOS);
  
  return validValues.length > 0 ? validValues : undefined;
}
