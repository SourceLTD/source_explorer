import { TableLexicalUnit, Concept, SenseTableRow, ReferentTableRow } from '@/lib/types';

export type DataTableMode = 'lexical_units' | 'concepts';
export type DataTableRenderMode = DataTableMode | 'senses' | 'referents';
export type DataTableEntry = TableLexicalUnit | Concept | SenseTableRow | ReferentTableRow;

export interface DataTableProps {
  onRowClick?: (entry: TableLexicalUnit | Concept) => void;
  onEditClick?: (entry: TableLexicalUnit | Concept) => void;
  searchQuery?: string;
  className?: string;
  mode?: DataTableRenderMode;
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

export interface ConceptOption {
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
export type { TableLexicalUnit, Concept, SenseTableRow, ReferentTableRow, PaginatedResult, PaginationParams } from '@/lib/types';
export type { FilterState } from './filterState';
export type { ColumnConfig, ColumnVisibilityState } from '@/components/ColumnVisibilityPanel';
