import type { DataTableMode } from './types';

export interface FilterState {
  // Text filters
  gloss?: string;
  lemmas?: string;
  examples?: string;
  frames?: string;
  flaggedReason?: string;
  unverifiableReason?: string;

  // Categorical filters
  pos?: string;
  lexfile?: string;
  frame_id?: string; // Comma-separated frame IDs
  super_frame_id?: string; // Parent super-frame ID (frames table)
  // AI jobs filters
  flaggedByJobId?: string;

  // Boolean filters
  isMwe?: boolean;
  flagged?: boolean;
  verifiable?: boolean;
  excludeNullFrame?: boolean;

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

  // Frame-specific text filters
  label?: string;
  definition?: string;
  short_definition?: string;
}

export const DEFAULT_LEXICAL_POS = ['verb', 'noun', 'adjective', 'adverb'] as const;

export function getDefaultFilters(mode: DataTableMode): FilterState {
  if (mode === 'lexical_units') {
    return { excludeNullFrame: true };
  }
  return {};
}

function normalizeEmptyValue(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  if (typeof value === 'number' && Number.isNaN(value)) return undefined;
  return value;
}

function normalizePosValue(value: unknown): string | undefined {
  const normalized = normalizeEmptyValue(value);
  if (normalized === undefined) return undefined;
  if (typeof normalized !== 'string') return undefined;

  // Special sentinel meaning "no POS selected"
  if (normalized === 'none') return 'none';

  const selected = normalized
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  // Treat "all 4 selected" as the default (unset)
  const selectedSet = new Set(selected);
  const isAllSelected = DEFAULT_LEXICAL_POS.every(p => selectedSet.has(p));
  if (isAllSelected) return undefined;

  return selected.length > 0 ? selected.join(',') : 'none';
}

export function toDeltaFilters(mode: DataTableMode, next: FilterState): FilterState {
  const defaults = getDefaultFilters(mode);
  const delta: FilterState = {};

  (Object.entries(next) as Array<[keyof FilterState, unknown]>).forEach(([key, rawValue]) => {
    let value: unknown = rawValue;

    if (key === 'pos') {
      value = normalizePosValue(rawValue);
    } else {
      value = normalizeEmptyValue(rawValue);
    }

    if (value === undefined) return;

    const defaultValue = (defaults as Record<string, unknown>)[String(key)];
    if (defaultValue !== undefined && Object.is(defaultValue, value)) {
      return;
    }

    (delta as Record<string, unknown>)[String(key)] = value;
  });

  return delta;
}

export function toEffectiveFilters(mode: DataTableMode, state: FilterState): FilterState {
  const delta = toDeltaFilters(mode, state);
  return { ...getDefaultFilters(mode), ...delta };
}

