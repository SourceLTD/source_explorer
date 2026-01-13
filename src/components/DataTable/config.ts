import { ColumnConfig, ColumnVisibilityState } from '@/components/ColumnVisibilityPanel';
import type { DataTableMode } from './types';
export type { DataTableMode };

/**
 * Unified Lexical Units default columns
 * Combines fields from all POS types.
 */
export const LEXICAL_UNITS_DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: true, sortable: true },
  { key: 'legacy_id', label: 'Legacy ID', visible: false, sortable: true },
  { key: 'pos', label: 'Part of Speech', visible: true, sortable: true },
  { key: 'frame', label: 'Frame Code', visible: true, sortable: true },
  { key: 'lemmas', label: 'Lemmas', visible: true, sortable: true },
  { key: 'gloss', label: 'Gloss', visible: true, sortable: true },
  { key: 'lexfile', label: 'Lexfile', visible: false, sortable: true },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: false, sortable: false },
  { key: 'verifiable', label: 'Verifiable', visible: true, sortable: true },
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
  { key: 'label', label: 'Frame Name', visible: true, sortable: true },
  { key: 'definition', label: 'Definition', visible: true, sortable: false },
  { key: 'short_definition', label: 'Short Definition', visible: false, sortable: false },
  { key: 'prototypical_synset', label: 'Prototypical Synset', visible: true, sortable: true },
  { key: 'frame_roles', label: 'Frame Roles', visible: true, sortable: false },
  { key: 'roles_count', label: 'Roles', visible: false, sortable: false },
  { key: 'lexical_units_count', label: 'Words', visible: true, sortable: false },
  { key: 'lexical_entries', label: 'Lexical Entries', visible: true, sortable: false },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: false, sortable: false },
  { key: 'verifiable', label: 'Verifiable', visible: true, sortable: true },
  { key: 'unverifiableReason', label: 'Unverifiable Reason', visible: false, sortable: false },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
  { key: 'actions', label: 'Actions', visible: true, sortable: false },
];

// Super Frames columns
export const SUPER_FRAMES_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: false, sortable: true },
  { key: 'code', label: 'Code', visible: true, sortable: true },
  { key: 'label', label: 'Frame Name', visible: true, sortable: true },
  { key: 'definition', label: 'Definition', visible: true, sortable: false },
  { key: 'short_definition', label: 'Short Definition', visible: false, sortable: false },
  { key: 'prototypical_synset', label: 'Prototypical Synset', visible: true, sortable: true },
  { key: 'frame_roles', label: 'Frame Roles', visible: true, sortable: false },
  { key: 'roles_count', label: 'Roles', visible: false, sortable: false },
  { key: 'subframes_count', label: 'Sub-frames', visible: true, sortable: false },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: false, sortable: false },
  { key: 'verifiable', label: 'Verifiable', visible: true, sortable: true },
  { key: 'unverifiableReason', label: 'Unverifiable Reason', visible: false, sortable: false },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
  { key: 'actions', label: 'Actions', visible: true, sortable: false },
];

// Frames-only columns (standard frames)
export const FRAMES_ONLY_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: false, sortable: true },
  { key: 'code', label: 'Code', visible: true, sortable: true },
  { key: 'label', label: 'Frame Name', visible: true, sortable: true },
  { key: 'definition', label: 'Definition', visible: true, sortable: false },
  { key: 'short_definition', label: 'Short Definition', visible: false, sortable: false },
  { key: 'prototypical_synset', label: 'Prototypical Synset', visible: true, sortable: true },
  { key: 'lexical_units_count', label: 'Words', visible: true, sortable: false },
  { key: 'lexical_entries', label: 'Lexical Entries', visible: true, sortable: false },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: false, sortable: false },
  { key: 'verifiable', label: 'Verifiable', visible: true, sortable: true },
  { key: 'unverifiableReason', label: 'Unverifiable Reason', visible: false, sortable: false },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
  { key: 'actions', label: 'Actions', visible: true, sortable: false },
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
  actions: 80,
  // Frame columns
  code: 150,
  label: 200,
  definition: 350,
  short_definition: 250,
  prototypical_synset: 180,
  frame_roles: 250,
  roles_count: 80,
  lexical_units_count: 80,
  lexical_entries: 250,
  subframes_count: 100,
};

/**
 * Get the columns configuration for a specific mode
 */
export function getColumnsForMode(mode: DataTableMode): ColumnConfig[] {
  switch (mode) {
    case 'super_frames':
      return SUPER_FRAMES_COLUMNS;
    case 'frames_only':
      return FRAMES_ONLY_COLUMNS;
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
export function getDefaultVisibility(mode?: DataTableMode): ColumnVisibilityState {
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
  mode?: DataTableMode
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
export function getApiPrefix(mode: DataTableMode): string {
  if (mode === 'frames' || mode === 'super_frames' || mode === 'frames_only') return '/api/frames';
  return '/api/lexical-units';
}

/**
 * Get the graph base path
 */
export function getGraphBasePath(mode: DataTableMode): string {
  if (mode === 'frames' || mode === 'super_frames' || mode === 'frames_only') return '/graph/frames';
  return '/table'; // Default to table if graph mode is not supported
}

/**
 * Map column keys to actual field names for pending change detection
 */
export const FIELD_NAME_MAP: Record<string, string> = {
  'frame': 'frame_id',
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
