import { TableLexicalUnit, Frame } from '@/lib/types';

export type DataTableMode = 'lexical_units' | 'frames' | 'super_frames' | 'frames_only';

export interface DataTableProps {
  onRowClick?: (entry: TableLexicalUnit | Frame) => void;
  onEditClick?: (entry: TableLexicalUnit | Frame) => void;
  searchQuery?: string;
  className?: string;
  mode?: DataTableMode;
  refreshTrigger?: number;
}

export interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

export interface FlagModalState {
  isOpen: boolean;
  action: 'flag' | 'unflag' | 'forbid' | 'allow' | null;
  reason: string;
}

export interface EditingState {
  unitId: string | null;
  field: string | null;
  value: string;
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  unitId: string | null;
}

export interface FrameOption {
  id: string;
  code: string | null;
  label: string;
}

export interface FlagState {
  allFlagged: boolean;
  noneFlagged: boolean;
  allUnverifiable: boolean;
  noneUnverifiable: boolean;
}

// Re-export commonly used types
export type { TableLexicalUnit, Frame, PaginatedResult, PaginationParams } from '@/lib/types';
export type { FilterState } from './filterState';
export type { ColumnConfig, ColumnVisibilityState } from '@/components/ColumnVisibilityPanel';
