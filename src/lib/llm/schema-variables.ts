/**
 * Dynamic variable definitions for each entity type based on Prisma schema
 * These variables can be used in AI prompt templates
 */

export interface VariableDefinition {
  key: string;
  label: string;
  category?: 'basic' | 'relation' | 'computed' | 'iterable' | 'loop';
}

/**
 * Extended variable definition for iterable collections (used in {% for %} loops)
 */
export interface IterableVariableDefinition extends VariableDefinition {
  category: 'iterable';
  /** Available fields when iterating over this collection */
  itemFields: Array<{ key: string; label: string }>;
  /** Example loop syntax for documentation */
  exampleLoop: string;
}

/**
 * Type guard to check if a variable is iterable
 */
export function isIterableVariable(v: VariableDefinition): v is IterableVariableDefinition {
  return v.category === 'iterable' && 'itemFields' in v;
}

// Subfield definitions for iterable collections
const ROLE_ITEM_FIELDS = [
  { key: 'type', label: 'Role Type (e.g., AGENT, PATIENT)' },
  { key: 'code', label: 'Role Type Code' },
  { key: 'description', label: 'Role Description' },
  { key: 'examples', label: 'Role Examples (array)' },
  { key: 'label', label: 'Role Label' },
  { key: 'main', label: 'Is Main Role (boolean)' },
];

const VERB_ITEM_FIELDS = [
  { key: 'code', label: 'Verb Code (e.g., say.v.01)' },
  { key: 'gloss', label: 'Verb Gloss/Definition' },
  { key: 'lemmas', label: 'Verb Lemmas (array)' },
  { key: 'examples', label: 'Verb Examples (array)' },
  { key: 'flagged', label: 'Is Flagged (boolean)' },
];

const NOUN_ITEM_FIELDS = [
  { key: 'code', label: 'Noun Code (e.g., dog.n.01)' },
  { key: 'gloss', label: 'Noun Gloss/Definition' },
  { key: 'lemmas', label: 'Noun Lemmas (array)' },
  { key: 'examples', label: 'Noun Examples (array)' },
  { key: 'flagged', label: 'Is Flagged (boolean)' },
];

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
  // Frame fields (accessible via frame.* notation for simple interpolation)
  { key: 'frame.id', label: 'Frame Id', category: 'relation' },
  { key: 'frame.label', label: 'Frame Label', category: 'relation' },
  { key: 'frame.definition', label: 'Frame Definition', category: 'relation' },
  { key: 'frame.short_definition', label: 'Frame Short Definition', category: 'relation' },
  { key: 'frame.prototypical_synset', label: 'Frame Prototypical Synset', category: 'relation' },
  { key: 'frame.roles', label: 'Frame Roles (formatted string)', category: 'relation' },
  // Iterable collections for {% for %} loops
  {
    key: 'frame.roles',
    label: 'Frame Roles (iterable)',
    category: 'iterable',
    itemFields: ROLE_ITEM_FIELDS,
    exampleLoop: '{% for role in frame.roles %}\n{{ role.type }}: {{ role.description }}\n{% endfor %}',
  } as IterableVariableDefinition,
  {
    key: 'frame.verbs',
    label: 'Frame Verbs (iterable)',
    category: 'iterable',
    itemFields: VERB_ITEM_FIELDS,
    exampleLoop: '{% for verb in frame.verbs %}\n- {{ verb.code }}: {{ verb.gloss }}\n{% endfor %}',
  } as IterableVariableDefinition,
  {
    key: 'frame.nouns',
    label: 'Frame Nouns (iterable)',
    category: 'iterable',
    itemFields: NOUN_ITEM_FIELDS,
    exampleLoop: '{% for noun in frame.nouns %}\n- {{ noun.code }}: {{ noun.gloss }}\n{% endfor %}',
  } as IterableVariableDefinition,
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
  { key: 'verifiable', label: 'Verifiable', category: 'basic' },
  { key: 'unverifiable_reason', label: 'Unverifiable Reason', category: 'basic' },
  { key: 'roles_count', label: 'Roles Count', category: 'computed' },
  { key: 'verbs_count', label: 'Verbs Count', category: 'computed' },
  // Iterable collections for {% for %} loops (when targeting frames directly)
  {
    key: 'roles',
    label: 'Frame Roles (iterable)',
    category: 'iterable',
    itemFields: ROLE_ITEM_FIELDS,
    exampleLoop: '{% for role in roles %}\n{{ role.type }}: {{ role.description }}\n{% endfor %}',
  } as IterableVariableDefinition,
  {
    key: 'verbs',
    label: 'Frame Verbs (iterable)',
    category: 'iterable',
    itemFields: VERB_ITEM_FIELDS,
    exampleLoop: '{% for verb in verbs %}\n- {{ verb.code }}: {{ verb.gloss }}\n{% endfor %}',
  } as IterableVariableDefinition,
  {
    key: 'nouns',
    label: 'Frame Nouns (iterable)',
    category: 'iterable',
    itemFields: NOUN_ITEM_FIELDS,
    exampleLoop: '{% for noun in nouns %}\n- {{ noun.code }}: {{ noun.gloss }}\n{% endfor %}',
  } as IterableVariableDefinition,
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
 * Get only iterable variables for a specific entity type
 */
export function getIterableVariablesForEntityType(entityType: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames'): IterableVariableDefinition[] {
  return getVariablesForEntityType(entityType).filter(isIterableVariable);
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
