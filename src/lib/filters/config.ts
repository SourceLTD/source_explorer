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

export function getFieldConfigsForPos(pos: string): FieldConfig[] {
  // Support for frames remains separate
  if (pos === 'frames') {
    return [
      { key: 'label', label: 'Frame Name', type: 'text', db: 'label', operators: textOps },
      { key: 'definition', label: 'Definition', type: 'text', db: 'definition', operators: textOps },
      { key: 'short_definition', label: 'Short Definition', type: 'text', db: 'short_definition', operators: textOps },
      { key: 'flagged_reason', label: 'Flagged Reason', type: 'text', db: 'flagged_reason', operators: textOps },
      { key: 'unverifiable_reason', label: 'Unverifiable Reason', type: 'text', db: 'unverifiable_reason', operators: textOps },
      { key: 'flagged', label: 'Flagged', type: 'boolean', db: 'flagged', operators: booleanOps },
      { key: 'verifiable', label: 'Verifiable', type: 'boolean', db: 'verifiable', operators: booleanOps },
      { key: 'created_at', label: 'Created At', type: 'date', db: 'created_at', operators: dateOps },
      { key: 'updated_at', label: 'Updated At', type: 'date', db: 'updated_at', operators: dateOps },
      { key: 'childrenCount', label: 'Children Count', type: 'computed_number', operators: computedNumberOps },
    ];
  }

  // All other POS types now use the unified lexical_units config
  return [
    { key: 'pos', label: 'Part of Speech', type: 'enum', db: 'pos', operators: enumOps },
    { key: 'code', label: 'Code', type: 'enum', db: 'code', operators: codeOps },
    { key: 'gloss', label: 'Gloss', type: 'text', db: 'gloss', operators: textOps },
    { key: 'lemmas', label: 'Lemmas', type: 'string_array', db: 'lemmas', operators: arrayOps },
    { key: 'src_lemmas', label: 'Source Lemmas', type: 'string_array', db: 'src_lemmas', operators: arrayOps },
    { key: 'examples', label: 'Examples', type: 'string_array', db: 'examples', operators: arrayOps },
    { key: 'flagged_reason', label: 'Flagged Reason', type: 'text', db: 'flagged_reason', operators: textOps },
    { key: 'unverifiable_reason', label: 'Unverifiable Reason', type: 'text', db: 'unverifiable_reason', operators: textOps },
    { key: 'lexfile', label: 'Lexfile', type: 'enum', db: 'lexfile', operators: enumOps },
    { key: 'frame_id', label: 'Frame', type: 'frame', db: 'frame_id', operators: frameOps },
    { key: 'flagged', label: 'Flagged', type: 'boolean', db: 'flagged', operators: booleanOps },
    { key: 'verifiable', label: 'Verifiable', type: 'boolean', db: 'verifiable', operators: booleanOps },
    { key: 'is_mwe', label: 'Is MWE', type: 'boolean', db: 'is_mwe', operators: booleanOps },
    { key: 'vendler_class', label: 'Vendler Class', type: 'enum', db: 'vendler_class', operators: enumOps },
    { key: 'gradable', label: 'Gradable', type: 'boolean', db: 'gradable', operators: booleanOps },
    { key: 'created_at', label: 'Created At', type: 'date', db: 'created_at', operators: dateOps },
    { key: 'updated_at', label: 'Updated At', type: 'date', db: 'updated_at', operators: dateOps },
    { key: 'parentsCount', label: 'Parents Count', type: 'computed_number', operators: computedNumberOps },
    { key: 'childrenCount', label: 'Children Count', type: 'computed_number', operators: computedNumberOps },
  ];
}
