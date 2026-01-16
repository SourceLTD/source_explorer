import type { DataTableMode } from '@/components/DataTable/types';

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

const LU_ITEM_FIELDS = [
  { key: 'code', label: 'Code (e.g., say.v.01)' },
  { key: 'pos', label: 'Part of Speech' },
  { key: 'gloss', label: 'Gloss/Definition' },
  { key: 'lemmas', label: 'Lemmas (comma-separated list)' },
  { key: 'examples', label: 'Examples (array)' },
  { key: 'flagged', label: 'Is Flagged (boolean)' },
];

// Child frame fields for superframes
const CHILD_FRAME_ITEM_FIELDS = [
  { key: 'id', label: 'Frame ID' },
  { key: 'label', label: 'Frame Label' },
  { key: 'definition', label: 'Frame Definition' },
  { key: 'short_definition', label: 'Frame Short Definition' },
  { key: 'roles_count', label: 'Number of Roles' },
  { key: 'lexical_units_count', label: 'Number of Lexical Units' },
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
    key: 'frame.lexical_units',
    label: 'Frame Lexical Units (iterable)',
    category: 'iterable',
    itemFields: LU_ITEM_FIELDS,
    exampleLoop: '{% for lu in frame.lexical_units %}\n- {{ lu.code }} ({{ lu.pos }}): {{ lu.gloss }}\n{% endfor %}',
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

// Frame-specific variables (regular frames with lexical units)
const FRAME_VARIABLES: VariableDefinition[] = [
  { key: 'id', label: 'Id', category: 'basic' },
  { key: 'code', label: 'Code', category: 'basic' },
  { key: 'pos', label: 'Pos', category: 'computed' },
  { key: 'label', label: 'Label', category: 'basic' },
  { key: 'definition', label: 'Definition', category: 'basic' },
  { key: 'short_definition', label: 'Short Definition', category: 'basic' },
  { key: 'flagged', label: 'Flagged', category: 'basic' },
  { key: 'flagged_reason', label: 'Flagged Reason', category: 'basic' },
  { key: 'verifiable', label: 'Verifiable', category: 'basic' },
  { key: 'unverifiable_reason', label: 'Unverifiable Reason', category: 'basic' },
  { key: 'roles_count', label: 'Roles Count', category: 'computed' },
  { key: 'lexical_units_count', label: 'Lexical Units Count', category: 'computed' },
  // Iterable collections for {% for %} loops (when targeting frames directly)
  {
    key: 'roles',
    label: 'Frame Roles (iterable)',
    category: 'iterable',
    itemFields: ROLE_ITEM_FIELDS,
    exampleLoop: '{% for role in roles %}\n{{ role.type }}: {{ role.description }}\n{% endfor %}',
  } as IterableVariableDefinition,
  {
    key: 'lexical_units',
    label: 'Frame Lexical Units (iterable)',
    category: 'iterable',
    itemFields: LU_ITEM_FIELDS,
    exampleLoop: '{% for lu in lexical_units %}\n- {{ lu.code }} ({{ lu.pos }}): {{ lu.gloss }}\n{% endfor %}',
  } as IterableVariableDefinition,
];

// Superframe-specific variables (frames that contain other frames, not lexical units)
const SUPERFRAME_VARIABLES: VariableDefinition[] = [
  { key: 'id', label: 'Id', category: 'basic' },
  { key: 'code', label: 'Code', category: 'basic' },
  { key: 'pos', label: 'Pos', category: 'computed' },
  { key: 'label', label: 'Label', category: 'basic' },
  { key: 'definition', label: 'Definition', category: 'basic' },
  { key: 'short_definition', label: 'Short Definition', category: 'basic' },
  { key: 'roles', label: 'Roles', category: 'basic' },
  { key: 'flagged', label: 'Flagged', category: 'basic' },
  { key: 'flagged_reason', label: 'Flagged Reason', category: 'basic' },
  { key: 'verifiable', label: 'Verifiable', category: 'basic' },
  { key: 'unverifiable_reason', label: 'Unverifiable Reason', category: 'basic' },
  { key: 'roles_count', label: 'Roles Count', category: 'computed' },
  { key: 'child_frames_count', label: 'Child Frames Count', category: 'computed' },
  // Iterable collections for {% for %} loops
  {
    key: 'roles',
    label: 'Superframe Roles (iterable)',
    category: 'iterable',
    itemFields: ROLE_ITEM_FIELDS,
    exampleLoop: '{% for role in roles %}\n{{ role.type }}: {{ role.description }}\n{% endfor %}',
  } as IterableVariableDefinition,
  {
    key: 'child_frames',
    label: 'Child Frames (iterable)',
    category: 'iterable',
    itemFields: CHILD_FRAME_ITEM_FIELDS,
    exampleLoop: '{% for frame in child_frames %}\n- {{ frame.label }}: {{ frame.definition }}\n{% endfor %}',
  } as IterableVariableDefinition,
];

/**
 * Get available variables for a specific entity type
 */
export function getVariablesForEntityType(entityType: DataTableMode, isSuperFrame?: boolean): VariableDefinition[] {
  switch (entityType) {
    case 'lexical_units':
      // Return combined variables for all lexical units
      return Array.from(new Map([
        ...VERB_VARIABLES,
        ...NOUN_VARIABLES,
        ...ADJECTIVE_VARIABLES,
        ...ADVERB_VARIABLES
      ].map(v => [v.key, v])).values());
    case 'frames':
    case 'frames_only':
      // Return superframe or regular frame variables based on flag
      return isSuperFrame ? SUPERFRAME_VARIABLES : FRAME_VARIABLES;
    case 'super_frames':
      return SUPERFRAME_VARIABLES;
    default:
      return COMMON_VARIABLES;
  }
}

/**
 * Get available variables for a specific lexical POS.
 */
export function getVariablesForLexicalPos(pos: 'verb' | 'noun' | 'adjective' | 'adverb' | 'lexical_units'): VariableDefinition[] {
  switch (pos) {
    case 'verb':
      return VERB_VARIABLES;
    case 'noun':
      return NOUN_VARIABLES;
    case 'adjective':
      return ADJECTIVE_VARIABLES;
    case 'adverb':
      return ADVERB_VARIABLES;
    default:
      return getVariablesForEntityType('lexical_units');
  }
}

/**
 * Get variables specifically for superframes
 */
export function getSuperframeVariables(): VariableDefinition[] {
  return SUPERFRAME_VARIABLES;
}

/**
 * Get only iterable variables for a specific entity type
 */
export function getIterableVariablesForEntityType(entityType: DataTableMode, isSuperFrame?: boolean): IterableVariableDefinition[] {
  return getVariablesForEntityType(entityType, isSuperFrame).filter(isIterableVariable);
}

/**
 * Get a map of all variables by entity type
 */
export function getAllEntityVariables(): Record<string, VariableDefinition[]> {
  return {
    lexical_units: getVariablesForEntityType('lexical_units'),
    frames: FRAME_VARIABLES,
    super_frames: SUPERFRAME_VARIABLES,
  };
}
