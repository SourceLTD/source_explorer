'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { PaginatedResult, PaginationParams, TableLexicalUnit, Frame } from '@/lib/types';
import type { FilterState } from '../filterState';
import { toDeltaFilters, toEffectiveFilters } from '../filterState';
import { ColumnVisibilityState } from '@/components/ColumnVisibilityPanel';
import {
  DataTableMode,
  ColumnWidthState,
  getColumnsForMode,
  getDefaultVisibility,
  getDefaultColumnWidths,
  sanitizeColumnVisibility,
  getApiPrefix,
  DEFAULT_COLUMN_WIDTHS,
} from '../config';
import { SortState } from '../types';

export interface UseDataTableStateOptions {
  mode: DataTableMode;
  searchQuery?: string;
  refreshTrigger?: number;
}

export interface UseDataTableStateReturn {
  // Data
  data: PaginatedResult<TableLexicalUnit | Frame> | null;
  loading: boolean;
  error: string | null;
  fetchData: () => Promise<void>;
  
  // Pagination
  currentPage: number;
  pageSize: number;
  handlePageChange: (page: number) => void;
  handlePageSizeChange: (size: number) => void;
  
  // Sorting
  sortState: SortState;
  handleSort: (field: string) => void;
  
  // Filters
  filters: FilterState;
  handleFiltersChange: (newFilters: FilterState) => void;
  handleClearAllFilters: () => void;
  isFilterPanelOpen: boolean;
  setIsFilterPanelOpen: (open: boolean) => void;
  
  // Column visibility
  columnVisibility: ColumnVisibilityState;
  handleColumnVisibilityChange: (newVisibility: ColumnVisibilityState) => void;
  handleResetColumns: () => void;
  isColumnPanelOpen: boolean;
  setIsColumnPanelOpen: (open: boolean) => void;
  visibleColumns: Array<{ key: string; label: string; visible: boolean; sortable?: boolean }>;
  currentColumns: Array<{ key: string; label: string; visible: boolean; sortable?: boolean }>;
  
  // Column widths
  columnWidths: ColumnWidthState;
  handleColumnWidthChange: (columnKey: string, width: number) => void;
  handleResetColumnWidths: () => void;
  handleMouseDown: (columnKey: string, e: React.MouseEvent) => void;
  isResizing: boolean;
  getColumnWidth: (columnKey: string) => string;
  
  // Page size panel
  isPageSizePanelOpen: boolean;
  setIsPageSizePanelOpen: (open: boolean) => void;
  
  // Misc
  isInitialized: boolean;
  apiPrefix: string;
}

/**
 * Parse URL parameters to extract initial state
 */
function parseURLParams(
  searchParams: URLSearchParams,
  mode: DataTableMode
): {
  filters: FilterState;
  columnVisibility: ColumnVisibilityState | null;
  sortState: SortState;
  currentPage: number;
  pageSize: number;
} {
  // Parse filters
  const filters: FilterState = {};
  
  // Parse text filters
  ['gloss', 'lemmas', 'examples', 'frames', 'flaggedReason', 'unverifiableReason', 'label', 'definition', 'short_definition'].forEach(key => {
    const value = searchParams.get(key);
    if (value !== null) {
      filters[key as 'gloss' | 'lemmas' | 'examples' | 'frames' | 'flaggedReason' | 'unverifiableReason' | 'label' | 'definition' | 'short_definition'] = value;
    }
  });
  
  // Parse categorical filters
  ['pos', 'lexfile', 'frame_id', 'super_frame_id', 'flaggedByJobId'].forEach(key => {
    const value = searchParams.get(key);
    if (value !== null) {
      filters[key as 'pos' | 'lexfile' | 'frame_id' | 'super_frame_id' | 'flaggedByJobId'] = value;
    }
  });
  
  // Parse boolean filters
  ['isMwe', 'flagged', 'verifiable', 'pendingCreate', 'pendingUpdate', 'pendingDelete', 'excludeNullFrame'].forEach(key => {
    const value = searchParams.get(key);
    if (value !== null) {
      filters[key as 'isMwe' | 'flagged' | 'verifiable' | 'pendingCreate' | 'pendingUpdate' | 'pendingDelete' | 'excludeNullFrame'] = value === 'true';
    }
  });
  
  // Parse numeric filters
  ['parentsCountMin', 'parentsCountMax', 'childrenCountMin', 'childrenCountMax'].forEach(key => {
    const value = searchParams.get(key);
    if (value !== null) {
      filters[key as 'parentsCountMin' | 'parentsCountMax' | 'childrenCountMin' | 'childrenCountMax'] = parseInt(value);
    }
  });

  const childrenCountOp = searchParams.get('childrenCountOp');
  if (childrenCountOp) {
    filters.childrenCountOp = childrenCountOp as FilterState['childrenCountOp'];
  }

  const childrenCountValue = searchParams.get('childrenCountValue');
  if (childrenCountValue !== null) {
    filters.childrenCountValue = parseInt(childrenCountValue);
  }
  
  // Parse date filters
  ['createdAfter', 'createdBefore', 'updatedAfter', 'updatedBefore'].forEach(key => {
    const value = searchParams.get(key);
    if (value !== null) {
      filters[key as 'createdAfter' | 'createdBefore' | 'updatedAfter' | 'updatedBefore'] = value;
    }
  });

  // Parse column visibility
  const columnsParam = searchParams.get('columns');
  let columnVisibility: ColumnVisibilityState | null = null;
  if (columnsParam && columnsParam !== 'default') {
    try {
      columnVisibility = JSON.parse(decodeURIComponent(columnsParam));
    } catch {
      // Fallback to default
    }
  }

  // Parse sort state with validation for the current mode
  const rawSortBy = searchParams.get('sortBy') || 'id';
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc';
  
  // Validate and map sortBy for the current mode
  let sortBy = rawSortBy;
  const modeColumns = getColumnsForMode(mode);
  const validColumnKeys = modeColumns.map(col => col.key);
  
  // Map between mode-specific column names
  if (mode === 'frames' && rawSortBy === 'gloss') {
    sortBy = 'label';
  } else if (mode !== 'frames' && rawSortBy === 'short_definition') {
    sortBy = 'gloss';
  } else if (!validColumnKeys.includes(sortBy)) {
    // If column doesn't exist in current mode, use a safe default
    sortBy = mode === 'frames' ? 'label' : 'id';
  }

  // Parse pagination
  const page = parseInt(searchParams.get('page') || '1');
  const limitParam = parseInt(searchParams.get('limit') || '100');
  // Validate limit: must be a valid number between 1-100
  const limit = (!isNaN(limitParam) && limitParam >= 1 && limitParam <= 100) 
    ? limitParam 
    : 100;

  return {
    filters,
    columnVisibility,
    sortState: { field: sortBy, order: sortOrder },
    currentPage: page,
    pageSize: limit
  };
}

export function useDataTableState({
  mode,
  searchQuery,
  refreshTrigger,
}: UseDataTableStateOptions): UseDataTableStateReturn {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [isInitialized, setIsInitialized] = useState(false);
  const prevModeRef = useRef(mode);
  const apiPrefix = useMemo(() => getApiPrefix(mode), [mode]);
  
  // Get initial state from URL params
  const getInitialStateFromURL = useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    return parseURLParams(params, mode);
  }, [searchParams, mode]);

  const initialState = getInitialStateFromURL();

  // Data state
  const [data, setData] = useState<PaginatedResult<TableLexicalUnit | Frame> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(initialState.currentPage);
  const [pageSize, setPageSize] = useState(initialState.pageSize);
  
  // Sort state
  const [sortState, setSortState] = useState<SortState>(initialState.sortState);
  
  // Filter state
  const [filters, setFilters] = useState<FilterState>(() => toDeltaFilters(mode, initialState.filters));
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  
  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(() => {
    if (initialState.columnVisibility) {
      return sanitizeColumnVisibility(initialState.columnVisibility, mode);
    }
    return getDefaultVisibility(mode);
  });
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  
  // Column width state
  const [columnWidths, setColumnWidths] = useState<ColumnWidthState>(getDefaultColumnWidths());
  const [isResizing, setIsResizing] = useState(false);
  const [, setResizingColumn] = useState<string | null>(null);
  
  // Page size panel state
  const [isPageSizePanelOpen, setIsPageSizePanelOpen] = useState(false);

  // Get current column configurations with visibility state
  const currentColumns = useMemo(() => {
    return getColumnsForMode(mode).map(col => ({
      ...col,
      visible: columnVisibility[col.key] ?? col.visible
    }));
  }, [mode, columnVisibility]);

  const visibleColumns = useMemo(() => {
    return currentColumns.filter(col => col.visible);
  }, [currentColumns]);

  // Keep filters in sync with external URL updates (e.g., deep links from other components)
  useEffect(() => {
    const flaggedByJobIdParam = searchParams?.get('flaggedByJobId') ?? undefined;

    setFilters(prev => {
      const currentValue = prev.flaggedByJobId ?? undefined;

      if (flaggedByJobIdParam) {
        const hasOtherActiveFilters = Object.entries(prev).some(
          ([key, value]) => key !== 'flaggedByJobId' && value !== undefined && value !== ''
        );

        if (!hasOtherActiveFilters && currentValue === flaggedByJobIdParam) {
          return prev;
        }

        return { flaggedByJobId: flaggedByJobIdParam };
      }

      if (currentValue === undefined) {
        return prev;
      }

      const { flaggedByJobId: _unused, ...rest } = prev;
      void _unused;
      return rest;
    });
  }, [searchParams]);

  // Mark as initialized after first render
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Load column widths from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    const saved = localStorage.getItem('table-column-widths-v2');
    if (saved) {
      try {
        setColumnWidths(JSON.parse(saved));
      } catch {
        // Invalid JSON, keep defaults
      }
    }
  }, []);

  // Load column visibility from localStorage after mount (avoids hydration mismatch)
  // Only if not set via URL params
  useEffect(() => {
    if (!initialState.columnVisibility) {
      const saved = localStorage.getItem('table-column-visibility-v2');
      if (saved) {
        try {
          setColumnVisibility(sanitizeColumnVisibility(JSON.parse(saved), mode));
        } catch {
          // Invalid JSON, keep defaults
        }
      }
    }
  }, [initialState.columnVisibility, mode]);

  // Reset state when mode changes
  useEffect(() => {
    if (!isInitialized) return;
    
    // Only reset if mode actually changed
    if (prevModeRef.current === mode) return;
    
    // Update the ref
    prevModeRef.current = mode;
    
    // Re-read state from URL params when mode changes
    const params = new URLSearchParams(searchParams?.toString() || '');
    const newState = parseURLParams(params, mode);
    
    // Reset filters to URL state or empty
    setFilters(toDeltaFilters(mode, newState.filters));
    
    // Reset column visibility to URL state or default for the new mode
    const newColumnVisibility = newState.columnVisibility || getDefaultVisibility(mode);
    setColumnVisibility(sanitizeColumnVisibility(newColumnVisibility, mode));
    
    // Reset sort state with validated/mapped column
    setSortState(newState.sortState);
    
    // Reset pagination
    setCurrentPage(newState.currentPage);
    setPageSize(newState.pageSize);
  }, [mode, isInitialized, searchParams]);

  // Update URL params when state changes (but not on initial load)
  useEffect(() => {
    if (!isInitialized) return;

    const params = new URLSearchParams(searchParams?.toString() || '');
    
    // Remove DataTable-managed params to rebuild them
    const managedParams = [
      'gloss', 'lemmas', 'examples', 'frames', 'flaggedReason', 'unverifiableReason', 'label', 'definition', 'short_definition',
      'pos', 'lexfile', 'frame_id', 'super_frame_id', 'flaggedByJobId',
      'isMwe', 'flagged', 'verifiable', 'excludeNullFrame',
      'pendingCreate', 'pendingUpdate', 'pendingDelete',
      'parentsCountMin', 'parentsCountMax', 'childrenCountMin', 'childrenCountMax',
      'childrenCountOp', 'childrenCountValue',
      'createdAfter', 'createdBefore', 'updatedAfter', 'updatedBefore',
      'columns', 'sortBy', 'sortOrder', 'page', 'limit'
    ];
    managedParams.forEach(param => params.delete(param));
    
    // Add filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });

    // Add column visibility (only if different from default)
    const defaultVisibility = getDefaultVisibility(mode);
    const hasNonDefaultColumns = Object.entries(columnVisibility).some(
      ([key, value]) => value !== defaultVisibility[key]
    );
    if (hasNonDefaultColumns) {
      params.set('columns', encodeURIComponent(JSON.stringify(columnVisibility)));
    }

    // Add sort state (only if different from default)
    if (sortState.field !== 'id' || sortState.order !== 'asc') {
      params.set('sortBy', sortState.field);
      params.set('sortOrder', sortState.order);
    }

    // Add pagination (only if different from default)
    if (currentPage !== 1) {
      params.set('page', String(currentPage));
    }
    // Validate pageSize before writing to URL
    const validPageSize = (!isNaN(pageSize) && (pageSize === -1 || (pageSize >= 1 && pageSize <= 100))) 
      ? pageSize 
      : 100;
    if (validPageSize !== 100) {
      params.set('limit', String(validPageSize));
    }

    // Update URL without causing navigation
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [isInitialized, filters, columnVisibility, sortState, currentPage, pageSize, pathname, router, searchParams, mode]);

  // Data fetching
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Validate sortBy for the current mode to prevent race conditions
      const modeColumns = getColumnsForMode(mode);
      const validColumnKeys = modeColumns.map(col => col.key);
      
      // Use a safe default if sortBy is invalid for current mode
      const safeSortBy = validColumnKeys.includes(sortState.field) 
        ? sortState.field 
        : (mode === 'frames' ? 'label' : 'id');
      
      const effectiveFilters = toEffectiveFilters(mode, filters);
      const params: PaginationParams = {
        page: currentPage,
        limit: pageSize,
        sortBy: safeSortBy,
        sortOrder: sortState.order,
        search: searchQuery || undefined,
        isSuperFrame: mode === 'super_frames' ? 'true' : (mode === 'frames_only' ? 'false' : undefined),
        ...effectiveFilters,
      };

      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, value.toString());
        }
      });

      const response = await fetch(`${apiPrefix}/paginated?${queryParams}`);
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const result: PaginatedResult<TableLexicalUnit> = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, sortState, searchQuery, filters, apiPrefix, mode]);

  // Fetch data when dependencies change
  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Handlers
  const handleSort = useCallback((field: string) => {
    setSortState(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }));
    setCurrentPage(1);
  }, []);

  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    setFilters(toDeltaFilters(mode, newFilters));
    setCurrentPage(1);
    // Reset to default page size (100) if currently showing all
    if (pageSize === -1) {
      setPageSize(100);
    }
  }, [mode, pageSize]);

  const handleClearAllFilters = useCallback(() => {
    setFilters({});
    setCurrentPage(1);
  }, []);

  const handleColumnVisibilityChange = useCallback((newVisibility: ColumnVisibilityState) => {
    const sanitizedVisibility = sanitizeColumnVisibility(newVisibility, mode);
    setColumnVisibility(sanitizedVisibility);
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('table-column-visibility-v2', JSON.stringify(sanitizedVisibility));
    }
  }, [mode]);

  const handleResetColumns = useCallback(() => {
    const defaultVisibility = getDefaultVisibility(mode);
    setColumnVisibility(defaultVisibility);
    if (typeof window !== 'undefined') {
      localStorage.setItem('table-column-visibility-v2', JSON.stringify(defaultVisibility));
    }
  }, [mode]);

  const handleColumnWidthChange = useCallback((columnKey: string, width: number) => {
    const newWidths = { ...columnWidths, [columnKey]: Math.max(50, width) }; // Minimum width of 50px
    setColumnWidths(newWidths);
    if (typeof window !== 'undefined') {
      localStorage.setItem('table-column-widths-v2', JSON.stringify(newWidths));
    }
  }, [columnWidths]);

  const handleResetColumnWidths = useCallback(() => {
    const defaultWidths = getDefaultColumnWidths();
    setColumnWidths(defaultWidths);
    if (typeof window !== 'undefined') {
      localStorage.setItem('table-column-widths-v2', JSON.stringify(defaultWidths));
    }
  }, []);

  const handleMouseDown = useCallback((columnKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setResizingColumn(columnKey);
    
    const startX = e.clientX;
    const startWidth = columnWidths[columnKey] || DEFAULT_COLUMN_WIDTHS[columnKey] || 150;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = startWidth + diff;
      handleColumnWidthChange(columnKey, newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizingColumn(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [columnWidths, handleColumnWidthChange]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  const getColumnWidth = useCallback((columnKey: string) => {
    const width = columnWidths[columnKey] || DEFAULT_COLUMN_WIDTHS[columnKey] || 150;
    return `${width}px`;
  }, [columnWidths]);

  return {
    // Data
    data,
    loading,
    error,
    fetchData,
    
    // Pagination
    currentPage,
    pageSize,
    handlePageChange,
    handlePageSizeChange,
    
    // Sorting
    sortState,
    handleSort,
    
    // Filters
    filters,
    handleFiltersChange,
    handleClearAllFilters,
    isFilterPanelOpen,
    setIsFilterPanelOpen,
    
    // Column visibility
    columnVisibility,
    handleColumnVisibilityChange,
    handleResetColumns,
    isColumnPanelOpen,
    setIsColumnPanelOpen,
    visibleColumns,
    currentColumns,
    
    // Column widths
    columnWidths,
    handleColumnWidthChange,
    handleResetColumnWidths,
    handleMouseDown,
    isResizing,
    getColumnWidth,
    
    // Page size panel
    isPageSizePanelOpen,
    setIsPageSizePanelOpen,
    
    // Misc
    isInitialized,
    apiPrefix,
  };
}

