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
  { key: 'id', label: 'Id', category: 'basic' },
  { key: 'code', label: 'Code', category: 'basic' },
  { key: 'pos', label: 'Pos', category: 'computed' },
  { key: 'gloss', label: 'Gloss', category: 'basic' },
  { key: 'lemmas', label: 'Lemmas', category: 'basic' },
  { key: 'lemmas_json', label: 'Lemmas Json', category: 'computed' },
  { key: 'examples', label: 'Examples', category: 'basic' },
  { key: 'examples_json', label: 'Examples Json', category: 'computed' },
  { key: 'flagged', label: 'Flagged', category: 'basic' },
  { key: 'flagged_reason', label: 'Flagged Reason', category: 'basic' },
  { key: 'lexfile', label: 'Lexfile', category: 'basic' },
];

// Verb-specific variables
const VERB_VARIABLES: VariableDefinition[] = [
  ...COMMON_VARIABLES,
  { key: 'frame_id', label: 'Frame Id', category: 'basic' },
  { key: 'label', label: 'Label', category: 'relation' },
  { key: 'frame_definition', label: 'Frame Definition', category: 'relation' },
  { key: 'vendler_class', label: 'Vendler Class', category: 'basic' },
  { key: 'concrete', label: 'Concrete', category: 'basic' },
  { key: 'legal_gloss', label: 'Legal Gloss', category: 'basic' },
  { key: 'roles_count', label: 'Roles Count', category: 'computed' },
  { key: 'recipes_count', label: 'Recipes Count', category: 'computed' },
  // Frame fields (accessible via frame.* notation)
  { key: 'frame.id', label: 'Frame Id', category: 'relation' },
  { key: 'frame.label', label: 'Frame Label', category: 'relation' },
  { key: 'frame.definition', label: 'Frame Definition', category: 'relation' },
  { key: 'frame.short_definition', label: 'Frame Short Definition', category: 'relation' },
  { key: 'frame.prototypical_synset', label: 'Frame Prototypical Synset', category: 'relation' },
  { key: 'frame.roles', label: 'Frame Roles', category: 'relation' },
];

// Noun-specific variables
const NOUN_VARIABLES: VariableDefinition[] = [
  ...COMMON_VARIABLES,
  { key: 'frame_id', label: 'Frame Id', category: 'basic' },
  { key: 'countable', label: 'Countable', category: 'basic' },
  { key: 'proper', label: 'Proper', category: 'basic' },
  { key: 'collective', label: 'Collective', category: 'basic' },
  { key: 'concrete', label: 'Concrete', category: 'basic' },
  { key: 'is_mwe', label: 'Is Mwe', category: 'basic' },
  { key: 'legal_gloss', label: 'Legal Gloss', category: 'basic' },
  { key: 'hypernyms', label: 'Hypernyms', category: 'relation' },
  { key: 'hyponyms', label: 'Hyponyms', category: 'relation' },
];

// Adjective-specific variables
const ADJECTIVE_VARIABLES: VariableDefinition[] = [
  ...COMMON_VARIABLES,
  { key: 'frame_id', label: 'Frame Id', category: 'basic' },
  { key: 'gradable', label: 'Gradable', category: 'basic' },
  { key: 'predicative', label: 'Predicative', category: 'basic' },
  { key: 'attributive', label: 'Attributive', category: 'basic' },
  { key: 'subjective', label: 'Subjective', category: 'basic' },
  { key: 'relational', label: 'Relational', category: 'basic' },
  { key: 'is_satellite', label: 'Is Satellite', category: 'basic' },
  { key: 'is_mwe', label: 'Is Mwe', category: 'basic' },
  { key: 'legal_gloss', label: 'Legal Gloss', category: 'basic' },
  { key: 'similar_to', label: 'Similar To', category: 'relation' },
  { key: 'antonyms', label: 'Antonyms', category: 'relation' },
];

// Adverb-specific variables
const ADVERB_VARIABLES: VariableDefinition[] = [
  ...COMMON_VARIABLES,
  { key: 'frame_id', label: 'Frame Id', category: 'basic' },
  { key: 'gradable', label: 'Gradable', category: 'basic' },
  { key: 'is_mwe', label: 'Is Mwe', category: 'basic' },
  { key: 'legal_gloss', label: 'Legal Gloss', category: 'basic' },
  { key: 'similar_to', label: 'Similar To', category: 'relation' },
  { key: 'antonyms', label: 'Antonyms', category: 'relation' },
];

// Frame-specific variables
const FRAME_VARIABLES: VariableDefinition[] = [
  { key: 'id', label: 'Id', category: 'basic' },
  { key: 'pos', label: 'Pos', category: 'computed' },
  { key: 'label', label: 'Label', category: 'basic' },
  { key: 'definition', label: 'Definition', category: 'basic' },
  { key: 'short_definition', label: 'Short Definition', category: 'basic' },
  { key: 'prototypical_synset', label: 'Prototypical Synset', category: 'basic' },
  { key: 'flagged', label: 'Flagged', category: 'basic' },
  { key: 'flagged_reason', label: 'Flagged Reason', category: 'basic' },
  { key: 'forbidden', label: 'Forbidden', category: 'basic' },
  { key: 'forbidden_reason', label: 'Forbidden Reason', category: 'basic' },
  { key: 'roles_count', label: 'Roles Count', category: 'computed' },
  { key: 'verbs_count', label: 'Verbs Count', category: 'computed' },
  { key: 'roles', label: 'Roles', category: 'relation' },
  { key: 'verbs', label: 'Verbs', category: 'relation' },
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
