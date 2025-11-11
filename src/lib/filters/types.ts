// Shared boolean filter AST and operator/type definitions

// Core AST types
export type BooleanFilterNode = BooleanFilterGroup | BooleanFilterRule;

export interface BooleanFilterGroup {
  kind: 'group';
  op: 'and' | 'or';
  children: BooleanFilterNode[];
}

export interface BooleanFilterRule {
  kind: 'rule';
  field: string; // field key from config
  operator: string; // operator key defined for the field
  // Single or multi-value depending on operator
  value?: unknown;
  // Optional second value for between-style operators
  value2?: unknown;
}

// Field metadata
export type FieldType =
  | 'text'
  | 'string_array'
  | 'enum'
  | 'boolean'
  | 'number'
  | 'date'
  | 'frame'
  | 'computed_number';

export interface FieldOperator {
  key: string; // e.g., 'contains', 'in', 'gte'
  label: string;
  // For UI hints
  requiresArray?: boolean; // value should be array
  requiresSecondValue?: boolean; // for between
}

export interface FieldConfig {
  key: string; // field key used in rules
  label: string;
  type: FieldType;
  db?: string; // prisma field name when applicable (snake_case etc.)
  operators: FieldOperator[];
}

export interface PostFilterCondition {
  field: 'parentsCount' | 'childrenCount';
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';
  value: number;
  value2?: number;
}

export interface TranslateResult {
  // Prisma where input (type depends on POS model)
  where: Record<string, unknown>;
  // Computed numeric filters to apply after query
  computedFilters: PostFilterCondition[];
}

export function createEmptyGroup(): BooleanFilterGroup {
  return { kind: 'group', op: 'and', children: [] };
}


