import { ColumnConfig, ColumnVisibilityState } from '@/components/ColumnVisibilityPanel';

// Verbs default columns
export const VERBS_DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: true, sortable: true },
  { key: 'legacy_id', label: 'Legacy ID', visible: false, sortable: true },
  { key: 'frame', label: 'Frame', visible: false, sortable: true },
  { key: 'lemmas', label: 'Lemmas', visible: true, sortable: true },
  { key: 'gloss', label: 'Definition', visible: true, sortable: true },
  { key: 'pos', label: 'Part of Speech', visible: false, sortable: true },
  { key: 'lexfile', label: 'Lexfile', visible: false, sortable: true },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: false, sortable: false },
  { key: 'verifiable', label: 'Verifiable', visible: true, sortable: true },
  { key: 'unverifiableReason', label: 'Unverifiable Reason', visible: false, sortable: false },
  { key: 'examples', label: 'Examples', visible: true, sortable: false },
  { key: 'vendler_class', label: 'Vendler Class', visible: false, sortable: true },
  { key: 'roles', label: 'Roles', visible: false, sortable: false },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
  { key: 'actions', label: 'Actions', visible: true, sortable: false },
];

// Nouns and Adjectives default columns (no frame, vendler_class, roles)
export const NOUNS_ADJECTIVES_DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: true, sortable: true },
  { key: 'legacy_id', label: 'Legacy ID', visible: false, sortable: true },
  { key: 'frame', label: 'Frame', visible: false, sortable: true },
  { key: 'lemmas', label: 'Lemmas', visible: true, sortable: true },
  { key: 'gloss', label: 'Definition', visible: true, sortable: true },
  { key: 'pos', label: 'Part of Speech', visible: false, sortable: true },
  { key: 'lexfile', label: 'Lexfile', visible: false, sortable: true },
  { key: 'isMwe', label: 'Multi-word Expression', visible: false, sortable: true },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: false, sortable: false },
  { key: 'verifiable', label: 'Verifiable', visible: true, sortable: true },
  { key: 'unverifiableReason', label: 'Unverifiable Reason', visible: false, sortable: false },
  { key: 'examples', label: 'Examples', visible: true, sortable: false },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
  { key: 'actions', label: 'Actions', visible: true, sortable: false },
];

// Adverbs-specific columns
export const ADVERBS_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: true, sortable: true },
  { key: 'legacy_id', label: 'Legacy ID', visible: false, sortable: true },
  { key: 'frame', label: 'Frame', visible: false, sortable: true },
  { key: 'lemmas', label: 'Lemmas', visible: true, sortable: true },
  { key: 'gloss', label: 'Definition', visible: true, sortable: true },
  { key: 'pos', label: 'Part of Speech', visible: false, sortable: true },
  { key: 'lexfile', label: 'Lexfile', visible: false, sortable: true },
  { key: 'isMwe', label: 'Multi-word Expression', visible: false, sortable: true },
  { key: 'gradable', label: 'Gradable', visible: false, sortable: true },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: false, sortable: false },
  { key: 'verifiable', label: 'Verifiable', visible: true, sortable: true },
  { key: 'unverifiableReason', label: 'Unverifiable Reason', visible: false, sortable: false },
  { key: 'examples', label: 'Examples', visible: true, sortable: false },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
  { key: 'actions', label: 'Actions', visible: true, sortable: false },
];

// Frames-specific columns
export const FRAMES_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: false, sortable: true },
  { key: 'label', label: 'Frame Name', visible: true, sortable: true },
  { key: 'definition', label: 'Definition', visible: true, sortable: false },
  { key: 'short_definition', label: 'Short Definition', visible: false, sortable: false },
  { key: 'prototypical_synset', label: 'Prototypical Synset', visible: true, sortable: true },
  { key: 'frame_roles', label: 'Frame Roles', visible: true, sortable: false },
  { key: 'roles_count', label: 'Roles', visible: false, sortable: false },
  { key: 'verbs_count', label: 'Verbs', visible: true, sortable: false },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: false, sortable: false },
  { key: 'verifiable', label: 'Verifiable', visible: true, sortable: true },
  { key: 'unverifiableReason', label: 'Unverifiable Reason', visible: false, sortable: false },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
  { key: 'actions', label: 'Actions', visible: true, sortable: false },
];

// Default column widths in pixels
export const DEFAULT_COLUMN_WIDTHS: ColumnWidthState = {
  id: 120,
  legacy_id: 150,
  frame: 150,
  lemmas: 150,
  gloss: 300,
  pos: 120,
  lexfile: 120,
  isMwe: 100,
  flagged: 100,
  flaggedReason: 250,
  verifiable: 100,
  unverifiableReason: 250,
  examples: 250,
  vendler_class: 150,
  roles: 250,
  createdAt: 100,
  updatedAt: 100,
  actions: 80,
  // Frame columns
  label: 200,
  definition: 350,
  short_definition: 250,
  prototypical_synset: 180,
  frame_roles: 250,
  roles_count: 80,
  verbs_count: 80,
};

export type DataTableMode = 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames';

export interface ColumnWidthState {
  [columnKey: string]: number;
}

/**
 * Get the columns configuration for a specific mode
 */
export function getColumnsForMode(mode: DataTableMode): ColumnConfig[] {
  switch (mode) {
    case 'frames':
      return FRAMES_COLUMNS;
    case 'adverbs':
      return ADVERBS_COLUMNS;
    case 'nouns':
    case 'adjectives':
      return NOUNS_ADJECTIVES_DEFAULT_COLUMNS;
    default:
      return VERBS_DEFAULT_COLUMNS;
  }
}

/**
 * Get the default column visibility state for a specific mode
 */
export function getDefaultVisibility(mode?: DataTableMode): ColumnVisibilityState {
  const visibility: ColumnVisibilityState = {};
  const columns = getColumnsForMode(mode || 'verbs');
  
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
 * Sanitize column visibility state to ensure it matches valid columns for the mode
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
 * Get the API prefix for a specific mode
 */
export function getApiPrefix(mode: DataTableMode): string {
  switch (mode) {
    case 'nouns':
      return '/api/nouns';
    case 'adjectives':
      return '/api/adjectives';
    case 'adverbs':
      return '/api/adverbs';
    case 'frames':
      return '/api/frames';
    default:
      return '/api/verbs';
  }
}

/**
 * Get the graph base path for a specific mode
 */
export function getGraphBasePath(mode: DataTableMode): string {
  switch (mode) {
    case 'nouns':
      return '/graph/nouns';
    case 'adjectives':
      return '/graph/adjectives';
    case 'adverbs':
      return '/graph/adverbs';
    case 'frames':
      return '/graph/frames';
    default:
      return '/graph';
  }
}

/**
 * Map column keys to actual field names for pending change detection
 */
export const FIELD_NAME_MAP: Record<string, string> = {
  'frame': 'frame_id',
  'label': 'label',
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
};

