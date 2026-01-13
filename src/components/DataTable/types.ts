import { TableEntry, Frame } from '@/lib/types';

export type DataTableMode = 'lexical_units' | 'frames' | 'super_frames' | 'frames_only';

export interface DataTableProps {
  onRowClick?: (entry: TableEntry | Frame) => void;
  onEditClick?: (entry: TableEntry | Frame) => void;
  searchQuery?: string;
  className?: string;
  mode?: DataTableMode;
  refreshTrigger?: number;
}

export interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

export interface ModerationModalState {
  isOpen: boolean;
  action: 'flag' | 'unflag' | 'forbid' | 'allow' | null;
  reason: string;
}

export interface EditingState {
  entryId: string | null;
  field: string | null;
  value: string;
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  entryId: string | null;
}

export interface FrameOption {
  id: string;
  code: string | null;
  label: string;
}

export interface ModerationState {
  allFlagged: boolean;
  noneFlagged: boolean;
  allUnverifiable: boolean;
  noneUnverifiable: boolean;
}

// Re-export commonly used types
export type { TableEntry, Frame, PaginatedResult, PaginationParams } from '@/lib/types';
export type { FilterState } from '@/components/FilterPanel';
export type { ColumnConfig, ColumnVisibilityState } from '@/components/ColumnVisibilityPanel';
