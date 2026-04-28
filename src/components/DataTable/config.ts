import { ColumnConfig, ColumnVisibilityState } from '@/components/ColumnVisibilityPanel';
import type { DataTableRenderMode } from './types';
export type { DataTableRenderMode as DataTableMode };

/**
 * Unified Lexical Units default columns
 * Combines fields from all POS types.
 */
export const LEXICAL_UNITS_DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: false, sortable: true },
  { key: 'legacy_id', label: 'Legacy ID', visible: false, sortable: true },
  { key: 'code', label: 'Code', visible: true, sortable: true },
  { key: 'pos', label: 'Part of Speech', visible: true, sortable: true },
  { key: 'frame', label: 'Frame Code', visible: true, sortable: false },
  { key: 'senses', label: 'Senses', visible: true, sortable: false },
  { key: 'lemmas', label: 'Lemmas', visible: true, sortable: true },
  { key: 'gloss', label: 'Gloss', visible: true, sortable: true },
  { key: 'lexfile', label: 'Lexfile', visible: false, sortable: true },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: false, sortable: false },
  { key: 'verifiable', label: 'Verifiable', visible: false, sortable: true },
  { key: 'unverifiableReason', label: 'Unverifiable Reason', visible: false, sortable: false },
  { key: 'examples', label: 'Examples', visible: true, sortable: false },
  { key: 'isMwe', label: 'MWE', visible: false, sortable: true },
  { key: 'vendler_class', label: 'Vendler Class', visible: false, sortable: true },
  { key: 'gradable', label: 'Gradable', visible: false, sortable: true },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
  { key: 'actions', label: 'Actions', visible: true, sortable: false },
];

// Frames-specific columns
export const FRAMES_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: false, sortable: true },
  { key: 'code', label: 'Code', visible: true, sortable: true },
  { key: 'label', label: 'Frame Name', visible: false, sortable: true },
  { key: 'definition', label: 'Definition', visible: true, sortable: false },
  { key: 'short_definition', label: 'Short Definition', visible: false, sortable: false },
  { key: 'frame_roles', label: 'Frame Roles', visible: true, sortable: false },
  { key: 'roles_count', label: 'Roles', visible: false, sortable: false },
  { key: 'lexical_units_count', label: 'Word Count', visible: false, sortable: false },
  { key: 'lexical_units', label: 'Words', visible: true, sortable: false },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: false, sortable: false },
  { key: 'verifiable', label: 'Verifiable', visible: true, sortable: true },
  { key: 'unverifiableReason', label: 'Unverifiable Reason', visible: false, sortable: false },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
  { key: 'frame_type', label: 'Frame Type', visible: false, sortable: false },
  { key: 'vendler', label: 'Vendler', visible: false, sortable: false },
  { key: 'multi_perspective', label: 'Multi-Perspective', visible: false, sortable: false },
  { key: 'wikidata_id', label: 'Wikidata ID', visible: false, sortable: false },
  { key: 'recipe', label: 'Recipe', visible: false, sortable: false },
  { key: 'actions', label: 'Actions', visible: true, sortable: false },
];

export const FRAME_SENSES_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: false, sortable: true },
  { key: 'pos', label: 'POS', visible: true, sortable: true },
  { key: 'lemmas', label: 'Lemmas', visible: true, sortable: false },
  { key: 'definition', label: 'Definition', visible: true, sortable: true },
  { key: 'frame_type', label: 'Frame Type', visible: true, sortable: true },
  { key: 'frame', label: 'Frame', visible: true, sortable: false },
  { key: 'lexical_units', label: 'Lexical Units', visible: true, sortable: false },
  { key: 'frameWarning', label: 'Warning', visible: true, sortable: false },
  { key: 'confidence', label: 'Confidence', visible: false, sortable: false },
  { key: 'causative', label: 'Causative', visible: false, sortable: true },
  { key: 'inchoative', label: 'Inchoative', visible: false, sortable: true },
  { key: 'perspectival', label: 'Perspectival', visible: false, sortable: true },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
  { key: 'actions', label: 'Actions', visible: false, sortable: false },
];


export interface ColumnWidthState {
  [columnKey: string]: number;
}

// Default column widths in pixels
export const DEFAULT_COLUMN_WIDTHS: ColumnWidthState = {
  id: 120,
  legacy_id: 150,
  pos: 100,
  frame: 150,
  senses: 320,
  lemmas: 150,
  gloss: 300,
  lexfile: 120,
  isMwe: 100,
  flagged: 100,
  flaggedReason: 250,
  verifiable: 100,
  unverifiableReason: 250,
  examples: 250,
  vendler_class: 150,
  gradable: 100,
  createdAt: 100,
  updatedAt: 100,
  actions: 110,
  // Frame columns
  code: 150,
  label: 200,
  definition: 350,
  short_definition: 250,
  frame_roles: 400,
  roles_count: 80,
  lexical_units_count: 80,
  lexical_units: 400,
  frameWarning: 120,
  confidence: 120,
  causative: 110,
  inchoative: 110,
  perspectival: 120,
  frame_type: 120,
  vendler: 120,
  multi_perspective: 120,
  wikidata_id: 150,
  recipe: 120,
};

/**
 * Get the columns configuration for a specific mode
 */
export function getColumnsForMode(mode: DataTableRenderMode): ColumnConfig[] {
  switch (mode) {
    case 'frame_senses':
      return FRAME_SENSES_COLUMNS;
    case 'frames':
      return FRAMES_COLUMNS;
    case 'lexical_units':
    default:
      return LEXICAL_UNITS_DEFAULT_COLUMNS;
  }
}

/**
 * Get the default column visibility state for a specific mode
 */
export function getDefaultVisibility(mode?: DataTableRenderMode): ColumnVisibilityState {
  const visibility: ColumnVisibilityState = {};
  const columns = getColumnsForMode(mode || 'lexical_units');
  
  columns.forEach(col => {
    visibility[col.key] = col.visible;
  });
  return visibility;
}

/**
 * Get the default column widths
 */
export function getDefaultColumnWidths(): ColumnWidthState {
  return { ...DEFAULT_COLUMN_WIDTHS };
}

/**
 * Sanitize column visibility state
 */
export function sanitizeColumnVisibility(
  visibility?: ColumnVisibilityState | null,
  mode?: DataTableRenderMode
): ColumnVisibilityState {
  const defaultVisibility = getDefaultVisibility(mode);
  if (!visibility) {
    return defaultVisibility;
  }

  const sanitized: ColumnVisibilityState = { ...defaultVisibility };
  Object.entries(visibility).forEach(([key, value]) => {
    if (key in defaultVisibility && typeof value === 'boolean') {
      sanitized[key] = value;
    }
  });

  return sanitized;
}

/**
 * Get the API prefix
 */
export function getApiPrefix(mode: DataTableRenderMode): string {
  if (mode === 'frame_senses') return '/api/frame-senses';
  if (mode === 'frames') return '/api/frames';
  return '/api/lexical-units';
}

/**
 * Get the graph base path
 */
export function getGraphBasePath(mode: DataTableRenderMode): string {
  if (mode === 'frames') return '/graph/frames';
  if (mode === 'frame_senses') return '/table';
  return '/table';
}

/**
 * Map column keys to actual field names for pending change detection
 */
export const FIELD_NAME_MAP: Record<string, string> = {
  // NB: `frame` is intentionally absent — frames are now edited via frame_senses,
  // not as a direct field on lexical_units. The `frame` column is read-only.
  'label': 'label',
  'code': 'code',
  'gloss': 'gloss',
  'lemmas': 'lemmas',
  'examples': 'examples',
  'flagged': 'flagged',
  'flaggedReason': 'flagged_reason',
  'verifiable': 'verifiable',
  'unverifiableReason': 'unverifiable_reason',
  'vendler_class': 'vendler_class',
  'definition': 'definition',
  'short_definition': 'short_definition',
  'isMwe': 'is_mwe',
  'gradable': 'gradable',
};

/**
 * Nested field configuration for complex columns
 * These define the sub-fields available for selection when copying
 */
export interface NestedFieldConfig {
  key: string;
  label: string;
  defaultSelected: boolean;
}

export interface NestedColumnConfig {
  columnKey: string;
  subFields: NestedFieldConfig[];
}

// Sub-fields for frame_roles column
export const FRAME_ROLES_SUBFIELDS: NestedFieldConfig[] = [
  { key: 'label', label: 'Label', defaultSelected: true },
  { key: 'description', label: 'Description', defaultSelected: true },
  { key: 'notes', label: 'Notes', defaultSelected: false },
  { key: 'main', label: 'Main Role', defaultSelected: false },
  { key: 'fillers', label: 'Fillers', defaultSelected: false },
  { key: 'examples', label: 'Examples', defaultSelected: false },
];

// Sub-fields for lexical_units column
export const LEXICAL_ENTRIES_SUBFIELDS: NestedFieldConfig[] = [
  { key: 'lemmas', label: 'Lemmas', defaultSelected: true },
  { key: 'gloss', label: 'Gloss', defaultSelected: true },
  { key: 'code', label: 'Code', defaultSelected: false },
  { key: 'pos', label: 'Part of Speech', defaultSelected: false },
  { key: 'src_lemmas', label: 'Source Lemmas', defaultSelected: false },
];

// Map of column keys to their nested field configurations
export const NESTED_FIELD_CONFIGS: Record<string, NestedFieldConfig[]> = {
  'frame_roles': FRAME_ROLES_SUBFIELDS,
  'lexical_units': LEXICAL_ENTRIES_SUBFIELDS,
};

/**
 * Check if a column has nested fields
 */
export function hasNestedFields(columnKey: string): boolean {
  return columnKey in NESTED_FIELD_CONFIGS;
}

/**
 * Get nested field config for a column
 */
export function getNestedFieldConfig(columnKey: string): NestedFieldConfig[] | null {
  return NESTED_FIELD_CONFIGS[columnKey] || null;
}
