import type { FieldConfig, FieldOperator } from './types';

const textOps: FieldOperator[] = [
  { key: 'contains', label: 'contains' },
  { key: 'not_contains', label: 'does not contain' },
  { key: 'starts_with', label: 'starts with' },
  { key: 'ends_with', label: 'ends with' },
];

const arrayOps: FieldOperator[] = [
  { key: 'has', label: 'has value' },
  { key: 'not_has', label: 'does not have value' },
  { key: 'hasSome', label: 'has any of', requiresArray: true },
  { key: 'hasEvery', label: 'has all of', requiresArray: true },
];

const enumOps: FieldOperator[] = [
  { key: 'equals', label: 'equals' },
  { key: 'in', label: 'in list', requiresArray: true },
  { key: 'not_in', label: 'not in list', requiresArray: true },
];

const codeOps: FieldOperator[] = [
  { key: 'equals', label: 'equals' },
  { key: 'in', label: 'in list', requiresArray: true },
];

const booleanOps: FieldOperator[] = [{ key: 'is', label: 'is' }];

const numberOps: FieldOperator[] = [
  { key: 'eq', label: '=' },
  { key: 'neq', label: '≠' },
  { key: 'gt', label: '>' },
  { key: 'gte', label: '≥' },
  { key: 'lt', label: '<' },
  { key: 'lte', label: '≤' },
  { key: 'between', label: 'between', requiresSecondValue: true },
];

const dateOps: FieldOperator[] = [
  { key: 'after', label: 'after' },
  { key: 'before', label: 'before' },
  { key: 'between', label: 'between', requiresSecondValue: true },
];

const frameOps: FieldOperator[] = [
  { key: 'equals', label: 'equals' },
  { key: 'in', label: 'in list', requiresArray: true },
];

const computedNumberOps = numberOps;

export function getFieldConfigsForPos(pos: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames'): FieldConfig[] {
  if (pos === 'verbs') {
    return [
      { key: 'code', label: 'Code', type: 'enum', db: 'code', operators: codeOps },
      { key: 'gloss', label: 'Gloss', type: 'text', db: 'gloss', operators: textOps },
      { key: 'lemmas', label: 'Lemmas', type: 'string_array', db: 'lemmas', operators: arrayOps },
      { key: 'src_lemmas', label: 'Source Lemmas', type: 'string_array', db: 'src_lemmas', operators: arrayOps },
      { key: 'examples', label: 'Examples', type: 'string_array', db: 'examples', operators: arrayOps },
      { key: 'particles', label: 'Particles', type: 'string_array', db: 'particles', operators: arrayOps },
      { key: 'flagged_reason', label: 'Flagged Reason', type: 'text', db: 'flagged_reason', operators: textOps },
      { key: 'forbidden_reason', label: 'Forbidden Reason', type: 'text', db: 'forbidden_reason', operators: textOps },
      { key: 'lexfile', label: 'Lexfile', type: 'enum', db: 'lexfile', operators: enumOps },
      { key: 'frame_id', label: 'Frame', type: 'frame', db: 'frame_id', operators: frameOps },
      { key: 'is_mwe', label: 'Is MWE', type: 'boolean', db: 'is_mwe', operators: booleanOps },
      { key: 'transitive', label: 'Transitive', type: 'boolean', db: 'transitive', operators: booleanOps },
      { key: 'flagged', label: 'Flagged', type: 'boolean', db: 'flagged', operators: booleanOps },
      { key: 'forbidden', label: 'Forbidden', type: 'boolean', db: 'forbidden', operators: booleanOps },
      { key: 'created_at', label: 'Created At', type: 'date', db: 'created_at', operators: dateOps },
      { key: 'updated_at', label: 'Updated At', type: 'date', db: 'updated_at', operators: dateOps },
      { key: 'parentsCount', label: 'Parents Count', type: 'computed_number', operators: computedNumberOps },
      { key: 'childrenCount', label: 'Children Count', type: 'computed_number', operators: computedNumberOps },
    ];
  }

  if (pos === 'nouns') {
    return [
      { key: 'code', label: 'Code', type: 'enum', db: 'code', operators: codeOps },
      { key: 'gloss', label: 'Gloss', type: 'text', db: 'gloss', operators: textOps },
      { key: 'lemmas', label: 'Lemmas', type: 'string_array', db: 'lemmas', operators: arrayOps },
      { key: 'examples', label: 'Examples', type: 'string_array', db: 'examples', operators: arrayOps },
      { key: 'flagged_reason', label: 'Flagged Reason', type: 'text', db: 'flagged_reason', operators: textOps },
      { key: 'forbidden_reason', label: 'Forbidden Reason', type: 'text', db: 'forbidden_reason', operators: textOps },
      { key: 'lexfile', label: 'Lexfile', type: 'enum', db: 'lexfile', operators: enumOps },
      { key: 'is_mwe', label: 'Is MWE', type: 'boolean', db: 'is_mwe', operators: booleanOps },
      { key: 'flagged', label: 'Flagged', type: 'boolean', db: 'flagged', operators: booleanOps },
      { key: 'forbidden', label: 'Forbidden', type: 'boolean', db: 'forbidden', operators: booleanOps },
      { key: 'countable', label: 'Countable', type: 'boolean', db: 'countable', operators: booleanOps },
      { key: 'proper', label: 'Proper', type: 'boolean', db: 'proper', operators: booleanOps },
      { key: 'collective', label: 'Collective', type: 'boolean', db: 'collective', operators: booleanOps },
      { key: 'concrete', label: 'Concrete', type: 'boolean', db: 'concrete', operators: booleanOps },
      { key: 'predicate', label: 'Predicate', type: 'boolean', db: 'predicate', operators: booleanOps },
      { key: 'created_at', label: 'Created At', type: 'date', db: 'created_at', operators: dateOps },
      { key: 'updated_at', label: 'Updated At', type: 'date', db: 'updated_at', operators: dateOps },
    ];
  }

  if (pos === 'adjectives') {
    return [
      { key: 'code', label: 'Code', type: 'enum', db: 'code', operators: codeOps },
      { key: 'gloss', label: 'Gloss', type: 'text', db: 'gloss', operators: textOps },
      { key: 'lemmas', label: 'Lemmas', type: 'string_array', db: 'lemmas', operators: arrayOps },
      { key: 'examples', label: 'Examples', type: 'string_array', db: 'examples', operators: arrayOps },
      { key: 'flagged_reason', label: 'Flagged Reason', type: 'text', db: 'flagged_reason', operators: textOps },
      { key: 'forbidden_reason', label: 'Forbidden Reason', type: 'text', db: 'forbidden_reason', operators: textOps },
      { key: 'lexfile', label: 'Lexfile', type: 'enum', db: 'lexfile', operators: enumOps },
      { key: 'is_mwe', label: 'Is MWE', type: 'boolean', db: 'is_mwe', operators: booleanOps },
      { key: 'flagged', label: 'Flagged', type: 'boolean', db: 'flagged', operators: booleanOps },
      { key: 'forbidden', label: 'Forbidden', type: 'boolean', db: 'forbidden', operators: booleanOps },
      { key: 'is_satellite', label: 'Satellite', type: 'boolean', db: 'is_satellite', operators: booleanOps },
      { key: 'gradable', label: 'Gradable', type: 'boolean', db: 'gradable', operators: booleanOps },
      { key: 'predicative', label: 'Predicative', type: 'boolean', db: 'predicative', operators: booleanOps },
      { key: 'attributive', label: 'Attributive', type: 'boolean', db: 'attributive', operators: booleanOps },
      { key: 'subjective', label: 'Subjective', type: 'boolean', db: 'subjective', operators: booleanOps },
      { key: 'relational', label: 'Relational', type: 'boolean', db: 'relational', operators: booleanOps },
      { key: 'created_at', label: 'Created At', type: 'date', db: 'created_at', operators: dateOps },
      { key: 'updated_at', label: 'Updated At', type: 'date', db: 'updated_at', operators: dateOps },
    ];
  }

  if (pos === 'adverbs') {
    return [
      { key: 'code', label: 'Code', type: 'enum', db: 'code', operators: codeOps },
      { key: 'gloss', label: 'Gloss', type: 'text', db: 'gloss', operators: textOps },
      { key: 'lemmas', label: 'Lemmas', type: 'string_array', db: 'lemmas', operators: arrayOps },
      { key: 'examples', label: 'Examples', type: 'string_array', db: 'examples', operators: arrayOps },
      { key: 'flagged_reason', label: 'Flagged Reason', type: 'text', db: 'flagged_reason', operators: textOps },
      { key: 'forbidden_reason', label: 'Forbidden Reason', type: 'text', db: 'forbidden_reason', operators: textOps },
      { key: 'lexfile', label: 'Lexfile', type: 'enum', db: 'lexfile', operators: enumOps },
      { key: 'is_mwe', label: 'Is MWE', type: 'boolean', db: 'is_mwe', operators: booleanOps },
      { key: 'flagged', label: 'Flagged', type: 'boolean', db: 'flagged', operators: booleanOps },
      { key: 'forbidden', label: 'Forbidden', type: 'boolean', db: 'forbidden', operators: booleanOps },
      { key: 'gradable', label: 'Gradable', type: 'boolean', db: 'gradable', operators: booleanOps },
      { key: 'created_at', label: 'Created At', type: 'date', db: 'created_at', operators: dateOps },
      { key: 'updated_at', label: 'Updated At', type: 'date', db: 'updated_at', operators: dateOps },
    ];
  }

  if (pos === 'frames') {
    return [
      { key: 'code', label: 'Code', type: 'enum', db: 'code', operators: codeOps },
      { key: 'frame_name', label: 'Frame Name', type: 'text', db: 'frame_name', operators: textOps },
      { key: 'definition', label: 'Definition', type: 'text', db: 'definition', operators: textOps },
      { key: 'short_definition', label: 'Short Definition', type: 'text', db: 'short_definition', operators: textOps },
      { key: 'prototypical_synset', label: 'Prototypical Synset', type: 'text', db: 'prototypical_synset', operators: textOps },
      { key: 'flagged_reason', label: 'Flagged Reason', type: 'text', db: 'flagged_reason', operators: textOps },
      { key: 'forbidden_reason', label: 'Forbidden Reason', type: 'text', db: 'forbidden_reason', operators: textOps },
      { key: 'is_supporting_frame', label: 'Is Supporting Frame', type: 'boolean', db: 'is_supporting_frame', operators: booleanOps },
      { key: 'communication', label: 'Communication', type: 'boolean', db: 'communication', operators: booleanOps },
      { key: 'flagged', label: 'Flagged', type: 'boolean', db: 'flagged', operators: booleanOps },
      { key: 'forbidden', label: 'Forbidden', type: 'boolean', db: 'forbidden', operators: booleanOps },
      { key: 'created_at', label: 'Created At', type: 'date', db: 'created_at', operators: dateOps },
      { key: 'updated_at', label: 'Updated At', type: 'date', db: 'updated_at', operators: dateOps },
    ];
  }

  // Default fallback
  return [];
}


