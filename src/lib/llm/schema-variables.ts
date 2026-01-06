/**
 * Dynamic variable definitions for each entity type based on Prisma schema
 * These variables can be used in AI prompt templates
 */

export interface VariableDefinition {
  key: string;
  label: string;
  category?: 'basic' | 'relation' | 'computed';
}

// Common variables for all entity types
const COMMON_VARIABLES: VariableDefinition[] = [
  { key: 'id', label: 'Entry ID (code)', category: 'basic' },
  { key: 'code', label: 'Lexical Code', category: 'basic' },
  { key: 'pos', label: 'Part of Speech', category: 'computed' },
  { key: 'gloss', label: 'Definition / Gloss', category: 'basic' },
  { key: 'lemmas', label: 'Lemmas (comma separated)', category: 'basic' },
  { key: 'lemmas_json', label: 'Lemmas JSON', category: 'computed' },
  { key: 'examples', label: 'Examples (newline separated)', category: 'basic' },
  { key: 'examples_json', label: 'Examples JSON', category: 'computed' },
  { key: 'flagged', label: 'Current flagged state', category: 'basic' },
  { key: 'flagged_reason', label: 'Existing flagged reason', category: 'basic' },
  { key: 'lexfile', label: 'Lexfile', category: 'basic' },
];

// Verb-specific variables
const VERB_VARIABLES: VariableDefinition[] = [
  ...COMMON_VARIABLES,
  { key: 'frame_name', label: 'Frame name', category: 'relation' },
  { key: 'frame_definition', label: 'Frame definition', category: 'relation' },
  { key: 'vendler_class', label: 'Vendler class', category: 'basic' },
  { key: 'concrete', label: 'Concrete', category: 'basic' },
  { key: 'legal_gloss', label: 'Legal gloss', category: 'basic' },
  { key: 'roles_count', label: 'Number of roles', category: 'computed' },
  { key: 'recipes_count', label: 'Number of recipes', category: 'computed' },
  // Frame fields (accessible via frame.* notation)
  { key: 'frame.id', label: 'Frame ID', category: 'relation' },
  { key: 'frame.frame_name', label: 'Frame Name', category: 'relation' },
  { key: 'frame.definition', label: 'Frame Definition', category: 'relation' },
  { key: 'frame.short_definition', label: 'Frame Short Definition', category: 'relation' },
  { key: 'frame.prototypical_synset', label: 'Frame Prototypical Synset', category: 'relation' },
  { key: 'frame.roles', label: 'Frame Roles (formatted list)', category: 'relation' },
];

// Noun-specific variables
const NOUN_VARIABLES: VariableDefinition[] = [
  ...COMMON_VARIABLES,
  { key: 'countable', label: 'Countable', category: 'basic' },
  { key: 'proper', label: 'Proper noun', category: 'basic' },
  { key: 'collective', label: 'Collective', category: 'basic' },
  { key: 'concrete', label: 'Concrete', category: 'basic' },
  { key: 'is_mwe', label: 'Is multi-word expression', category: 'basic' },
  { key: 'legal_gloss', label: 'Legal gloss', category: 'basic' },
  { key: 'hypernyms', label: 'Hypernyms (parent nouns)', category: 'relation' },
  { key: 'hyponyms', label: 'Hyponyms (child nouns)', category: 'relation' },
];

// Adjective-specific variables
const ADJECTIVE_VARIABLES: VariableDefinition[] = [
  ...COMMON_VARIABLES,
  { key: 'gradable', label: 'Gradable', category: 'basic' },
  { key: 'predicative', label: 'Predicative', category: 'basic' },
  { key: 'attributive', label: 'Attributive', category: 'basic' },
  { key: 'subjective', label: 'Subjective', category: 'basic' },
  { key: 'relational', label: 'Relational', category: 'basic' },
  { key: 'is_satellite', label: 'Is satellite', category: 'basic' },
  { key: 'is_mwe', label: 'Is multi-word expression', category: 'basic' },
  { key: 'legal_gloss', label: 'Legal gloss', category: 'basic' },
  { key: 'similar_to', label: 'Similar adjectives', category: 'relation' },
  { key: 'antonyms', label: 'Antonyms', category: 'relation' },
];

// Adverb-specific variables
const ADVERB_VARIABLES: VariableDefinition[] = [
  ...COMMON_VARIABLES,
  { key: 'gradable', label: 'Gradable', category: 'basic' },
  { key: 'is_mwe', label: 'Is multi-word expression', category: 'basic' },
  { key: 'legal_gloss', label: 'Legal gloss', category: 'basic' },
  { key: 'similar_to', label: 'Similar adverbs', category: 'relation' },
  { key: 'antonyms', label: 'Antonyms', category: 'relation' },
];

// Frame-specific variables
const FRAME_VARIABLES: VariableDefinition[] = [
  { key: 'id', label: 'Frame ID', category: 'basic' },
  { key: 'pos', label: 'Part of Speech', category: 'computed' },
  { key: 'frame_name', label: 'Frame Name', category: 'basic' },
  { key: 'definition', label: 'Definition', category: 'basic' },
  { key: 'short_definition', label: 'Short Definition', category: 'basic' },
  { key: 'prototypical_synset', label: 'Prototypical Synset', category: 'basic' },
  { key: 'flagged', label: 'Current flagged state', category: 'basic' },
  { key: 'flagged_reason', label: 'Existing flagged reason', category: 'basic' },
  { key: 'forbidden', label: 'Current forbidden state', category: 'basic' },
  { key: 'forbidden_reason', label: 'Existing forbidden reason', category: 'basic' },
  { key: 'roles_count', label: 'Number of roles', category: 'computed' },
  { key: 'verbs_count', label: 'Number of verbs', category: 'computed' },
  { key: 'roles', label: 'Role types (comma separated)', category: 'relation' },
  { key: 'verbs', label: 'Associated verbs (comma separated)', category: 'relation' },
];

/**
 * Get available variables for a specific entity type
 */
export function getVariablesForEntityType(entityType: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames'): VariableDefinition[] {
  switch (entityType) {
    case 'verbs':
      return VERB_VARIABLES;
    case 'nouns':
      return NOUN_VARIABLES;
    case 'adjectives':
      return ADJECTIVE_VARIABLES;
    case 'adverbs':
      return ADVERB_VARIABLES;
    case 'frames':
      return FRAME_VARIABLES;
    default:
      return COMMON_VARIABLES;
  }
}

/**
 * Get a map of all variables by entity type
 */
export function getAllEntityVariables(): Record<string, VariableDefinition[]> {
  return {
    verbs: VERB_VARIABLES,
    nouns: NOUN_VARIABLES,
    adjectives: ADJECTIVE_VARIABLES,
    adverbs: ADVERB_VARIABLES,
    frames: FRAME_VARIABLES,
  };
}

