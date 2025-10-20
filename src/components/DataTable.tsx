'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { TableEntry, PaginatedResult, PaginationParams, POS_LABELS, VerbRelation } from '@/lib/types';
import FilterPanel, { FilterState } from './FilterPanel';
import ColumnVisibilityPanel, { ColumnConfig, ColumnVisibilityState } from './ColumnVisibilityPanel';

interface DataTableProps {
  onRowClick?: (entry: TableEntry) => void;
  searchQuery?: string;
  className?: string;
}

interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

interface SelectionState {
  selectedIds: Set<string>;
  selectAll: boolean;
}

interface ColumnWidthState {
  [columnKey: string]: number;
}

interface ModerationModalState {
  isOpen: boolean;
  action: 'flag' | 'unflag' | 'forbid' | 'allow' | null;
  reason: string;
}

interface EditingState {
  entryId: string | null;
  field: string | null;
  value: string;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  entryId: string | null;
}

// Define all available columns with their configurations
const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: true, sortable: true },
  { key: 'legacy_id', label: 'Legacy ID', visible: false, sortable: true },
  { key: 'frame', label: 'Frame', visible: true, sortable: true },
  { key: 'lemmas', label: 'Lemmas', visible: true, sortable: true },
  { key: 'gloss', label: 'Definition', visible: true, sortable: true },
  { key: 'pos', label: 'Part of Speech', visible: false, sortable: true },
  { key: 'lexfile', label: 'Lexfile', visible: true, sortable: true },
  { key: 'isMwe', label: 'Multi-word Expression', visible: false, sortable: true },
  { key: 'transitive', label: 'Transitive', visible: false, sortable: true },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: false, sortable: false },
  { key: 'forbidden', label: 'Forbidden', visible: false, sortable: true },
  { key: 'forbiddenReason', label: 'Forbidden Reason', visible: false, sortable: false },
  { key: 'particles', label: 'Particles', visible: false, sortable: false },
  { key: 'examples', label: 'Examples', visible: false, sortable: false },
  { key: 'vendler_class', label: 'Vendler Class', visible: false, sortable: true },
  { key: 'legal_constraints', label: 'Legal Constraints', visible: false, sortable: false },
  { key: 'roles', label: 'Roles', visible: false, sortable: false },
  { key: 'parentsCount', label: 'Parents', visible: true, sortable: true },
  { key: 'childrenCount', label: 'Children', visible: true, sortable: true },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
];

// Default column widths in pixels
const DEFAULT_COLUMN_WIDTHS: ColumnWidthState = {
  id: 120,
  legacy_id: 150,
  frame: 150,
  lemmas: 150,
  gloss: 300,
  pos: 120,
  lexfile: 120,
  isMwe: 100,
  transitive: 100,
  flagged: 100,
  flaggedReason: 250,
  forbidden: 100,
  forbiddenReason: 250,
  particles: 120,
  examples: 250,
  vendler_class: 150,
  legal_constraints: 200,
  roles: 250,
  parentsCount: 150,
  childrenCount: 150,
  createdAt: 100,
  updatedAt: 100,
};

const getDefaultVisibility = (): ColumnVisibilityState => {
  const visibility: ColumnVisibilityState = {};
  DEFAULT_COLUMNS.forEach(col => {
    visibility[col.key] = col.visible;
  });
  return visibility;
};

const getDefaultColumnWidths = (): ColumnWidthState => {
  return { ...DEFAULT_COLUMN_WIDTHS };
};

export default function DataTable({ onRowClick, searchQuery, className }: DataTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isInitialized, setIsInitialized] = useState(false);

  // Helper function to parse URL params on mount
  const getInitialStateFromURL = useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    
    // Parse filters
    const filters: FilterState = {};
    
    // Parse text filters
    ['gloss', 'lemmas', 'examples', 'particles', 'frames'].forEach(key => {
      const value = params.get(key);
      if (value !== null) {
        filters[key as 'gloss' | 'lemmas' | 'examples' | 'particles' | 'frames'] = value;
      }
    });
    
    // Parse categorical filters
    ['pos', 'lexfile', 'frame_id'].forEach(key => {
      const value = params.get(key);
      if (value !== null) {
        filters[key as 'pos' | 'lexfile' | 'frame_id'] = value;
      }
    });
    
    // Parse boolean filters
    ['isMwe', 'transitive', 'flagged', 'forbidden'].forEach(key => {
      const value = params.get(key);
      if (value !== null) {
        filters[key as 'isMwe' | 'transitive' | 'flagged' | 'forbidden'] = value === 'true';
      }
    });
    
    // Parse numeric filters
    ['parentsCountMin', 'parentsCountMax', 'childrenCountMin', 'childrenCountMax'].forEach(key => {
      const value = params.get(key);
      if (value !== null) {
        filters[key as 'parentsCountMin' | 'parentsCountMax' | 'childrenCountMin' | 'childrenCountMax'] = parseInt(value);
      }
    });
    
    // Parse date filters
    ['createdAfter', 'createdBefore', 'updatedAfter', 'updatedBefore'].forEach(key => {
      const value = params.get(key);
      if (value !== null) {
        filters[key as 'createdAfter' | 'createdBefore' | 'updatedAfter' | 'updatedBefore'] = value;
      }
    });

    // Parse column visibility
    const columnsParam = params.get('columns');
    let columnVisibility: ColumnVisibilityState | null = null;
    if (columnsParam) {
      try {
        columnVisibility = JSON.parse(decodeURIComponent(columnsParam));
      } catch {
        // Fallback to default
      }
    }

    // Parse sort state
    const sortBy = params.get('sortBy') || 'id';
    const sortOrder = (params.get('sortOrder') as 'asc' | 'desc') || 'asc';

    // Parse pagination
    const page = parseInt(params.get('page') || '1');
    const limit = parseInt(params.get('limit') || '10');

    return {
      filters,
      columnVisibility,
      sortState: { field: sortBy, order: sortOrder },
      currentPage: page,
      pageSize: limit
    };
  }, [searchParams]);

  const initialState = getInitialStateFromURL();

  const [data, setData] = useState<PaginatedResult<TableEntry> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(initialState.currentPage);
  const [pageSize, setPageSize] = useState(initialState.pageSize);
  const [sortState, setSortState] = useState<SortState>(initialState.sortState);
  const [filters, setFilters] = useState<FilterState>(initialState.filters);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [selection, setSelection] = useState<SelectionState>({
    selectedIds: new Set(),
    selectAll: false,
  });
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(() => {
    // First try URL params
    if (initialState.columnVisibility) {
      return initialState.columnVisibility;
    }
    // Then try localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('table-column-visibility');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return getDefaultVisibility();
        }
      }
    }
    return getDefaultVisibility();
  });
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<ColumnWidthState>(() => {
    // Try to load from localStorage, fallback to defaults
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('table-column-widths');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return getDefaultColumnWidths();
        }
      }
    }
    return getDefaultColumnWidths();
  });
  const [isResizing, setIsResizing] = useState(false);
  const [, setResizingColumn] = useState<string | null>(null);
  const [relationsData, setRelationsData] = useState<Record<string, { parents: string[]; children: string[] }>>({});
  const [moderationModal, setModerationModal] = useState<ModerationModalState>({
    isOpen: false,
    action: null,
    reason: ''
  });
  const [editing, setEditing] = useState<EditingState>({
    entryId: null,
    field: null,
    value: ''
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    entryId: null
  });

  // Mark as initialized after first render
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.isOpen) {
        setContextMenu({ isOpen: false, x: 0, y: 0, entryId: null });
      }
    };

    if (contextMenu.isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.isOpen]);

  // Update URL params when state changes (but not on initial load)
  useEffect(() => {
    if (!isInitialized) return;

    const params = new URLSearchParams();
    
    // Add filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });

    // Add column visibility (only if different from default)
    const defaultVisibility = getDefaultVisibility();
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
    if (pageSize !== 10) {
      params.set('limit', String(pageSize));
    }

    // Update URL without causing navigation
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [isInitialized, filters, columnVisibility, sortState, currentPage, pageSize, pathname, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params: PaginationParams = {
        page: currentPage,
        limit: pageSize,
        sortBy: sortState.field,
        sortOrder: sortState.order,
        search: searchQuery || undefined,
        ...filters,
      };

      const queryParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, value.toString());
        }
      });

      const response = await fetch(`/api/entries/paginated?${queryParams}`);
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const result: PaginatedResult<TableEntry> = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, sortState, searchQuery, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleSort = (field: string) => {
    setSortState(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }));
    setCurrentPage(1);
  };

  const handleFiltersChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleClearAllFilters = () => {
    setFilters({});
    setCurrentPage(1);
  };

  const handleColumnVisibilityChange = (newVisibility: ColumnVisibilityState) => {
    setColumnVisibility(newVisibility);
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('table-column-visibility', JSON.stringify(newVisibility));
    }
  };

  const handleResetColumns = () => {
    const defaultVisibility = getDefaultVisibility();
    setColumnVisibility(defaultVisibility);
    if (typeof window !== 'undefined') {
      localStorage.setItem('table-column-visibility', JSON.stringify(defaultVisibility));
    }
  };

  const handleColumnWidthChange = (columnKey: string, width: number) => {
    const newWidths = { ...columnWidths, [columnKey]: Math.max(50, width) }; // Minimum width of 50px
    setColumnWidths(newWidths);
    if (typeof window !== 'undefined') {
      localStorage.setItem('table-column-widths', JSON.stringify(newWidths));
    }
  };

  const handleResetColumnWidths = () => {
    const defaultWidths = getDefaultColumnWidths();
    setColumnWidths(defaultWidths);
    if (typeof window !== 'undefined') {
      localStorage.setItem('table-column-widths', JSON.stringify(defaultWidths));
    }
  };

  const handleMouseDown = (columnKey: string, e: React.MouseEvent) => {
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
  };

  // Get current column configurations with visibility state
  const currentColumns = DEFAULT_COLUMNS.map(col => ({
    ...col,
    visible: columnVisibility[col.key] ?? col.visible
  }));

  const visibleColumns = currentColumns.filter(col => col.visible);

  // Fetch relations data for entries when parents or children columns are visible
  const fetchRelationsForEntry = useCallback(async (entryId: string): Promise<{ parents: string[]; children: string[] }> => {
    if (relationsData[entryId]) {
      return relationsData[entryId];
    }

    try {
      const response = await fetch(`/api/entries/${entryId}/relations`);
      if (!response.ok) {
        throw new Error('Failed to fetch relations');
      }
      const data = await response.json();
      
      // Extract parent IDs (hypernyms - more general concepts this entry points to)
      const parents = data.sourceRelations
        .filter((rel: VerbRelation) => rel.type === 'hypernym')
        .map((rel: VerbRelation) => rel.target?.id)
        .filter(Boolean);
      
      // Extract children IDs (hyponyms - more specific concepts that point to this entry)
      const children = data.targetRelations
        .filter((rel: VerbRelation) => rel.type === 'hypernym')
        .map((rel: VerbRelation) => rel.source?.id)
        .filter(Boolean);
      
      const result = { parents, children };
      setRelationsData(prev => ({ ...prev, [entryId]: result }));
      return result;
    } catch (error) {
      console.error('Error fetching relations:', error);
      const result = { parents: [], children: [] };
      setRelationsData(prev => ({ ...prev, [entryId]: result }));
      return result;
    }
  }, [relationsData]);

  // Preload relations data when parents or children columns become visible
  useEffect(() => {
    const needsParents = visibleColumns.some(col => col.key === 'parentsCount');
    const needsChildren = visibleColumns.some(col => col.key === 'childrenCount');
    
    if ((needsParents || needsChildren) && data?.data) {
      data.data.forEach(entry => {
        if (!relationsData[entry.id]) {
          fetchRelationsForEntry(entry.id);
        }
      });
    }
  }, [visibleColumns, data, relationsData, fetchRelationsForEntry]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const handleSelectAll = () => {
    if (!data) return;
    
    setSelection(prev => {
      const newSelectAll = !prev.selectAll;
      const newSelectedIds = new Set<string>();
      
      if (newSelectAll) {
        data.data.forEach(entry => newSelectedIds.add(entry.id));
      }
      
      return {
        selectAll: newSelectAll,
        selectedIds: newSelectedIds,
      };
    });
  };

  const handleSelectRow = (entryId: string) => {
    setSelection(prev => {
      const newSelectedIds = new Set(prev.selectedIds);
      
      if (newSelectedIds.has(entryId)) {
        newSelectedIds.delete(entryId);
      } else {
        newSelectedIds.add(entryId);
      }
      
      const allCurrentPageSelected = data?.data.every(entry => 
        newSelectedIds.has(entry.id)
      ) || false;
      
      return {
        selectedIds: newSelectedIds,
        selectAll: allCurrentPageSelected && newSelectedIds.size > 0,
      };
    });
  };

  const handleModerationUpdate = async (updates: { 
    flagged?: boolean; 
    flaggedReason?: string;
    forbidden?: boolean;
    forbiddenReason?: string;
  }) => {
    if (selection.selectedIds.size === 0) return;

    try {
      const response = await fetch('/api/entries/moderation', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: Array.from(selection.selectedIds),
          updates
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update entries');
      }

      // Update only the specific entries in local state
      setData(prevData => {
        if (!prevData) return prevData;
        return {
          ...prevData,
          data: prevData.data.map(entry => {
            if (selection.selectedIds.has(entry.id)) {
              return { ...entry, ...updates };
            }
            return entry;
          })
        };
      });
      
      // Clear selection
      setSelection({ selectedIds: new Set(), selectAll: false });

      // Close modal and reset
      setModerationModal({ isOpen: false, action: null, reason: '' });

      // Show success message (you could add a toast notification here)
      console.log('Successfully updated entries');
    } catch (error) {
      console.error('Error updating entries:', error);
      // You could add error notification here
    }
  };

  const handleOpenModerationModal = (action: 'flag' | 'unflag' | 'forbid' | 'allow') => {
    setModerationModal({ isOpen: true, action, reason: '' });
  };

  const handleCloseModerationModal = () => {
    setModerationModal({ isOpen: false, action: null, reason: '' });
  };

  const handleConfirmModeration = () => {
    const { action, reason } = moderationModal;
    
    if (!action) return;

    const updates: {
      flagged?: boolean;
      flaggedReason?: string;
      forbidden?: boolean;
      forbiddenReason?: string;
    } = {};

    switch (action) {
      case 'flag':
        updates.flagged = true;
        if (reason.trim()) {
          updates.flaggedReason = reason.trim();
        }
        break;
      case 'unflag':
        updates.flagged = false;
        updates.flaggedReason = null as unknown as string;
        break;
      case 'forbid':
        updates.forbidden = true;
        if (reason.trim()) {
          updates.forbiddenReason = reason.trim();
        }
        break;
      case 'allow':
        updates.forbidden = false;
        updates.forbiddenReason = null as unknown as string;
        break;
    }

    handleModerationUpdate(updates);
  };

  const handleStartEdit = (entryId: string, field: string, currentValue: string) => {
    setEditing({
      entryId,
      field,
      value: currentValue
    });
  };

  const handleCancelEdit = () => {
    setEditing({
      entryId: null,
      field: null,
      value: ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editing.entryId || !editing.field) return;

    try {
      const response = await fetch(`/api/entries/${editing.entryId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          [editing.field]: editing.value
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update entry');
      }

      // Update only the specific entry in local state
      setData(prevData => {
        if (!prevData) return prevData;
        return {
          ...prevData,
          data: prevData.data.map(entry => 
            entry.id === editing.entryId
              ? { ...entry, [editing.field!]: editing.value }
              : entry
          )
        };
      });
      
      // Clear editing state
      handleCancelEdit();

      console.log('Successfully updated entry');
    } catch (error) {
      console.error('Error updating entry:', error);
      // You could add error notification here
    }
  };

  const handleContextMenu = (e: React.MouseEvent, entryId: string) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      entryId
    });
  };

  const handleContextMenuAction = (action: 'flag' | 'unflag' | 'forbid' | 'allow') => {
    if (!contextMenu.entryId) return;
    
    // Set selection to just this entry
    setSelection({
      selectedIds: new Set([contextMenu.entryId]),
      selectAll: false
    });
    
    // Close context menu
    setContextMenu({ isOpen: false, x: 0, y: 0, entryId: null });
    
    // Open moderation modal
    handleOpenModerationModal(action);
  };

  // Calculate moderation states of selected entries
  const getSelectionModerationState = () => {
    if (!data || selection.selectedIds.size === 0) {
      return { allFlagged: false, noneFlagged: true, allForbidden: false, noneForbidden: true };
    }
    
    const selectedEntries = data.data.filter(entry => selection.selectedIds.has(entry.id));
    
    const allFlagged = selectedEntries.every(entry => entry.flagged);
    const noneFlagged = selectedEntries.every(entry => !entry.flagged);
    const allForbidden = selectedEntries.every(entry => entry.forbidden);
    const noneForbidden = selectedEntries.every(entry => !entry.forbidden);
    
    return { allFlagged, noneFlagged, allForbidden, noneForbidden };
  };

  const getSortIcon = (field: string) => {
    if (sortState.field !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }

    return sortState.order === 'asc' ? (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString();
  };

  const renderCellContent = (entry: TableEntry, columnKey: string) => {
    const entryRelations = relationsData[entry.id];
    switch (columnKey) {
      case 'lemmas':
        // Display regular lemmas first, then src_lemmas in bold at the end
        const allLemmas = entry.lemmas || [];
        const srcLemmas = entry.src_lemmas || [];
        const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
        const displayLemmas = [...regularLemmas, ...srcLemmas];
        
        return (
          <div className="flex flex-wrap gap-1">
            {displayLemmas.map((lemma, idx) => {
              const isSrcLemma = srcLemmas.includes(lemma);
              return (
                <span 
                  key={idx}
                  className={`inline-block px-2 py-1 text-xs rounded ${
                    isSrcLemma 
                      ? 'bg-blue-100 text-blue-800 font-bold' 
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {lemma}
                </span>
              );
            })}
          </div>
        );
      case 'gloss':
        const isEditingThisGloss = editing.entryId === entry.id && editing.field === 'gloss';
        
        if (isEditingThisGloss) {
          return (
            <div className="relative">
              <textarea
                value={editing.value}
                onChange={(e) => setEditing(prev => ({ ...prev, value: e.target.value }))}
                onBlur={handleSaveEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  } else if (e.key === 'Escape') {
                    handleCancelEdit();
                  }
                }}
                autoFocus
                className="w-full px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
              />
              <div className="text-xs text-gray-500 mt-1">
                Press Enter to save, Esc to cancel
              </div>
            </div>
          );
        }
        
        return (
          <div 
            className="text-sm text-gray-900 cursor-text hover:bg-blue-50 px-2 py-1 rounded transition-colors" 
            title={`Double-click to edit\n\n${entry.gloss}`}
            onDoubleClick={() => handleStartEdit(entry.id, 'gloss', entry.gloss)}
          >
            {truncateText(entry.gloss, 150)}
          </div>
        );
      case 'pos':
        return (
          <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded font-medium">
            {POS_LABELS[entry.pos as keyof typeof POS_LABELS] || entry.pos}
          </span>
        );
      case 'lexfile':
        return <span className="text-xs text-gray-500">{entry.lexfile.replace(/^verb\./, '')}</span>;
      case 'frame':
        if (!entry.frame) {
          return <span className="text-gray-400 text-sm">—</span>;
        }
        return (
          <span className="inline-block px-2 py-1 text-xs bg-indigo-100 text-indigo-800 rounded font-medium uppercase">
            {entry.frame}
          </span>
        );
      case 'isMwe':
        return (
          <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${
            entry.isMwe 
              ? 'bg-purple-100 text-purple-800' 
              : 'bg-gray-100 text-gray-600'
          }`}>
            {entry.isMwe ? 'Yes' : 'No'}
          </span>
        );
      case 'transitive':
        if (entry.transitive === null || entry.transitive === undefined) {
          return <span className="text-gray-400 text-sm">N/A</span>;
        }
        return (
          <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${
            entry.transitive 
              ? 'bg-blue-100 text-blue-800' 
              : 'bg-gray-100 text-gray-600'
          }`}>
            {entry.transitive ? 'Yes' : 'No'}
          </span>
        );
      case 'flagged':
        if (entry.flagged === null || entry.flagged === undefined) {
          return <span className="text-gray-400 text-sm">N/A</span>;
        }
        return (
          <div className="flex items-center gap-1">
            <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${
              entry.flagged 
                ? 'bg-orange-100 text-orange-800' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {entry.flagged ? 'Yes' : 'No'}
            </span>
            {entry.flagged && entry.flaggedReason && (
              <div className="group relative">
                <svg className="w-4 h-4 text-orange-600 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="absolute left-0 top-6 hidden group-hover:block z-50 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                  {entry.flaggedReason}
                </div>
              </div>
            )}
          </div>
        );
      case 'forbidden':
        if (entry.forbidden === null || entry.forbidden === undefined) {
          return <span className="text-gray-400 text-sm">N/A</span>;
        }
        return (
          <div className="flex items-center gap-1">
            <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${
              entry.forbidden 
                ? 'bg-red-100 text-red-800' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {entry.forbidden ? 'Yes' : 'No'}
            </span>
            {entry.forbidden && entry.forbiddenReason && (
              <div className="group relative">
                <svg className="w-4 h-4 text-red-600 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="absolute left-0 top-6 hidden group-hover:block z-50 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                  {entry.forbiddenReason}
                </div>
              </div>
            )}
          </div>
        );
      case 'flaggedReason':
        if (!entry.flaggedReason) {
          return <span className="text-gray-400 text-sm">None</span>;
        }
        return (
          <div className="text-sm text-gray-700 break-words">
            {entry.flaggedReason}
          </div>
        );
      case 'forbiddenReason':
        if (!entry.forbiddenReason) {
          return <span className="text-gray-400 text-sm">None</span>;
        }
        return (
          <div className="text-sm text-gray-700 break-words">
            {entry.forbiddenReason}
          </div>
        );
      case 'particles':
        if (!entry.particles || entry.particles.length === 0) {
          return <span className="text-gray-400 text-sm">None</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {entry.particles.slice(0, 2).map((particle, idx) => (
              <span 
                key={idx}
                className="inline-block px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded"
              >
                {particle}
              </span>
            ))}
            {entry.particles.length > 2 && (
              <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                +{entry.particles.length - 2}
              </span>
            )}
          </div>
        );
      case 'examples':
        if (!entry.examples || entry.examples.length === 0) {
          return <span className="text-gray-400 text-sm">None</span>;
        }
        return (
          <div className="space-y-1 text-xs text-gray-700 max-w-md">
            {entry.examples.map((example, idx) => (
              <div key={idx} className="leading-relaxed">
                <span className="text-gray-400 mr-1">{idx + 1}.</span>
                {example}
              </div>
            ))}
          </div>
        );
      case 'parentsCount':
        if (!entryRelations?.parents || entryRelations.parents.length === 0) {
          return <span className="text-gray-400 text-sm">None</span>;
        }
        return (
          <div className="space-y-1 text-xs text-gray-700 max-w-sm">
            {entryRelations.parents.map((parentId, idx) => (
              <div key={idx} className="font-mono text-blue-600">
                {parentId}
              </div>
            ))}
          </div>
        );
      case 'childrenCount':
        if (!entryRelations?.children || entryRelations.children.length === 0) {
          return <span className="text-gray-400 text-sm">None</span>;
        }
        return (
          <div className="space-y-1 text-xs text-gray-700 max-w-sm">
            {entryRelations.children.map((childId, idx) => (
              <div key={idx} className="font-mono text-green-600">
                {childId}
              </div>
            ))}
          </div>
        );
      case 'frame_id':
        if (!entry.frame_id) {
          return <span className="text-gray-400 text-sm">None</span>;
        }
        return <span className="text-sm font-mono text-purple-600">{entry.frame_id}</span>;
      case 'vendler_class':
        if (!entry.vendler_class) {
          return <span className="text-gray-400 text-sm">None</span>;
        }
        const vendlerColors: Record<string, string> = {
          state: 'bg-blue-100 text-blue-800',
          activity: 'bg-green-100 text-green-800',
          accomplishment: 'bg-orange-100 text-orange-800',
          achievement: 'bg-red-100 text-red-800',
        };
        const colorClass = vendlerColors[entry.vendler_class] || 'bg-gray-100 text-gray-800';
        return (
          <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${colorClass}`}>
            {entry.vendler_class}
          </span>
        );
      case 'legal_constraints':
        if (!entry.legal_constraints || entry.legal_constraints.length === 0) {
          return <span className="text-gray-400 text-sm">None</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {entry.legal_constraints.slice(0, 3).map((constraint, idx) => (
              <span 
                key={idx}
                className="inline-block px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded"
                title={constraint}
              >
                {constraint.length > 20 ? constraint.substring(0, 20) + '...' : constraint}
              </span>
            ))}
            {entry.legal_constraints.length > 3 && (
              <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                +{entry.legal_constraints.length - 3}
              </span>
            )}
          </div>
        );
      case 'roles':
        if (!entry.roles || entry.roles.length === 0) {
          return <span className="text-gray-400 text-sm">None</span>;
        }
        
        // Create a map of role IDs to check which roles are in groups
        const rolesInGroups = new Set<string>();
        const roleGroups = entry.role_groups || [];
        roleGroups.forEach(group => {
          group.role_ids.forEach(roleId => rolesInGroups.add(roleId));
        });
        
        // Separate roles that are not in groups
        const ungroupedRoles = entry.roles.filter(role => !rolesInGroups.has(role.id));
        
        return (
          <div className="space-y-1 text-xs">
            {/* Render ungrouped roles */}
            {ungroupedRoles.map((role, idx) => (
              <div key={`role-${idx}`} className="flex items-start gap-1">
                <span className={`inline-block px-2 py-1 rounded font-medium ${
                  role.main 
                    ? 'bg-indigo-100 text-indigo-800' 
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {role.role_type.label}
                </span>
                {role.description && (
                  <span className="text-gray-600 text-xs" title={role.description}>
                    {role.description.length > 30 ? role.description.substring(0, 30) + '...' : role.description}
                  </span>
                )}
              </div>
            ))}
            
            {/* Render role groups with OR indicators */}
            {roleGroups.map((group, groupIdx) => {
              const groupRoles = entry.roles!.filter(role => group.role_ids.includes(role.id));
              if (groupRoles.length === 0) return null;
              
              return (
                <div 
                  key={`group-${groupIdx}`} 
                  className="border border-black rounded px-2 py-1 bg-gray-50"
                  title={group.description || 'OR group: one of these roles is required'}
                >
                  {groupRoles.map((role, roleIdx) => (
                    <React.Fragment key={`group-${groupIdx}-role-${roleIdx}`}>
                      {roleIdx > 0 && (
                        <span className="mx-1 text-xs font-bold text-gray-700">OR</span>
                      )}
                      <span className={`inline-block px-2 py-1 rounded font-medium ${
                        role.main 
                          ? 'bg-indigo-100 text-indigo-800' 
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {role.role_type.label}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              );
            })}
          </div>
        );
      case 'id':
        return <span className="text-sm font-mono text-blue-600">{entry.id}</span>;
      case 'legacy_id':
        return <span className="text-sm font-mono text-gray-600">{entry.legacy_id}</span>;
      case 'createdAt':
        return <span className="text-xs text-gray-500">{formatDate(entry.createdAt)}</span>;
      case 'updatedAt':
        return <span className="text-xs text-gray-500">{formatDate(entry.updatedAt)}</span>;
      default:
        return <span className="text-sm text-gray-900">{String((entry as unknown as Record<string, unknown>)[columnKey] || '')}</span>;
    }
  };

  const getColumnWidth = (columnKey: string) => {
    const width = columnWidths[columnKey] || DEFAULT_COLUMN_WIDTHS[columnKey] || 150;
    return `${width}px`;
  };

  const getRowBackgroundColor = (entry: TableEntry, isSelected: boolean, isHovered: boolean = false) => {
    // Priority: Selection > Forbidden > Flagged > Default
    if (isSelected) {
      return 'bg-blue-50';
    }
    
    if (entry.forbidden) {
      return isHovered ? 'hover:bg-red-200' : '';
    }
    
    if (entry.flagged) {
      return isHovered ? 'hover:bg-blue-200' : '';
    }
    
    return 'hover:bg-gray-50';
  };

  const getRowInlineStyles = (entry: TableEntry, isSelected: boolean) => {
    if (isSelected) {
      return {};
    }
    
    // When both forbidden and flagged, use red background with blue left border
    if (entry.forbidden && entry.flagged) {
      return { 
        backgroundColor: '#ffc7ce',
        borderLeft: '4px solid #3b82f6'
      };
    }
    
    if (entry.forbidden) {
      return { backgroundColor: '#ffc7ce' };
    }
    
    if (entry.flagged) {
      return { backgroundColor: '#add8ff' };
    }
    
    return {};
  };

  if (loading && !data) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className || ''}`}>
        <div className="p-8 text-center">
          <div className="animate-spin h-12 w-12 border-2 border-gray-300 border-t-blue-600 rounded-full mx-auto mb-4"></div>
          <p className="text-gray-500">Loading entries...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className || ''}`}>
        <div className="p-8 text-center text-red-600">
          <svg className="h-12 w-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p>Error loading data: {error}</p>
          <button 
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className || ''}`}>
        <div className="p-8 text-center text-gray-400">
          <svg className="h-24 w-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>No entries found</p>
          {(searchQuery || Object.keys(filters).length > 0) && (
            <p className="text-sm mt-2">Try adjusting your search or filters</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className || ''} ${isResizing ? 'select-none' : ''}`}>
      {/* Filters and Controls */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        {/* Row Status Legend */}
        <div className="mb-3 flex items-center gap-4 text-xs">
          <span className="font-medium text-gray-600">Row Colors:</span>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 rounded" style={{ backgroundColor: '#add8ff' }}></div>
            <span className="text-gray-600">Flagged</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 rounded" style={{ backgroundColor: '#ffc7ce' }}></div>
            <span className="text-gray-600">Forbidden</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-6 h-4 rounded" style={{ backgroundColor: '#ffc7ce', borderLeft: '3px solid #3b82f6' }}></div>
            <span className="text-gray-600">Both (blue left border)</span>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <FilterPanel
                isOpen={isFilterPanelOpen}
                onToggle={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                filters={filters}
                onFiltersChange={handleFiltersChange}
                onClearAll={handleClearAllFilters}
              />
            </div>
            <div className="relative">
              <ColumnVisibilityPanel
                isOpen={isColumnPanelOpen}
                onToggle={() => setIsColumnPanelOpen(!isColumnPanelOpen)}
                columns={currentColumns}
                onColumnVisibilityChange={handleColumnVisibilityChange}
                onResetToDefaults={handleResetColumns}
              />
            </div>
            <button
              onClick={handleResetColumnWidths}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
              title="Reset column widths to defaults"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12V10m0 0l3 3m-3-3l-3 3" />
              </svg>
              Reset Widths
            </button>
            
            {/* Moderation Actions */}
            {selection.selectedIds.size > 0 && (() => {
              const { allFlagged, noneFlagged, allForbidden, noneForbidden } = getSelectionModerationState();
              const mixedFlagged = !allFlagged && !noneFlagged;
              const mixedForbidden = !allForbidden && !noneForbidden;
              
              return (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    {selection.selectedIds.size} selected
                  </span>
                  <div className="h-4 w-px bg-gray-300"></div>
                  
                  {/* Flagged Actions */}
                  {(noneFlagged || mixedFlagged) && (
                    <button
                      onClick={() => handleOpenModerationModal('flag')}
                      className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-orange-700 bg-orange-100 border border-orange-200 rounded-md hover:bg-orange-200 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 2H21l-3 6 3 6h-8.5l-1-2H5a2 2 0 00-2 2zm9-13.5V9" />
                      </svg>
                      Mark Flagged
                    </button>
                  )}
                  {(allFlagged || mixedFlagged) && (
                    <button
                      onClick={() => handleOpenModerationModal('unflag')}
                      className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Unflag
                    </button>
                  )}
                  
                  {/* Forbidden Actions */}
                  {(noneForbidden || mixedForbidden) && (
                    <button
                      onClick={() => handleOpenModerationModal('forbid')}
                      className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-red-700 bg-red-100 border border-red-200 rounded-md hover:bg-red-200 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                      </svg>
                      Mark Forbidden
                    </button>
                  )}
                  {(allForbidden || mixedForbidden) && (
                    <button
                      onClick={() => handleOpenModerationModal('allow')}
                      className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-green-700 bg-green-100 border border-green-200 rounded-md hover:bg-green-200 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Allow
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Show:</label>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
              className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto relative">
        {loading && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
            <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
          </div>
        )}
        <table className="w-full" style={{ tableLayout: 'fixed' }}>
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left w-12" style={{ width: '48px' }}>
                <input
                  type="checkbox"
                  checked={selection.selectAll}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              {visibleColumns.map((column) => (
                <th 
                  key={column.key}
                  className="relative px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200"
                  style={{ width: getColumnWidth(column.key), minWidth: '50px' }}
              >
                <div 
                  className={`flex items-center gap-2 ${column.sortable ? 'cursor-pointer hover:bg-gray-100 rounded px-1 py-1' : ''}`}
                  onClick={column.sortable ? () => handleSort(column.key) : undefined}
                >
                    {column.label}
                    {column.sortable && getSortIcon(column.key)}
                </div>
                {/* Resize handle */}
                <div
                  className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-200 bg-transparent group"
                  onMouseDown={(e) => handleMouseDown(column.key, e)}
                >
                  <div className="w-px h-full bg-gray-300 group-hover:bg-blue-400 ml-auto"></div>
                </div>
              </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.data.map((entry) => {
              const isSelected = selection.selectedIds.has(entry.id);
              return (
              <tr
                key={entry.id}
                className={`${getRowBackgroundColor(entry, isSelected)} ${isSelected ? 'bg-blue-50' : ''}`}
                style={getRowInlineStyles(entry, isSelected)}
                onContextMenu={(e) => handleContextMenu(e, entry.id)}
              >
                <td className="px-4 py-4 whitespace-nowrap w-12" style={{ width: '48px' }}>
                  <input
                    type="checkbox"
                    checked={selection.selectedIds.has(entry.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSelectRow(entry.id);
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                {visibleColumns.map((column) => {
                  const isClickable = onRowClick && column.key !== 'isMwe' && column.key !== 'transitive' && column.key !== 'gloss';
                  const allowsWrap = ['gloss', 'examples', 'parentsCount', 'childrenCount', 'legal_constraints', 'roles', 'flaggedReason', 'forbiddenReason'].includes(column.key);
                  const cellClassName = `px-4 py-4 ${allowsWrap ? 'break-words' : 'whitespace-nowrap'} ${isClickable ? 'cursor-pointer' : ''} align-top border-r border-gray-200`;
                  
                  return (
                    <td 
                      key={column.key}
                      className={cellClassName}
                      style={{ width: getColumnWidth(column.key), minWidth: '50px' }}
                      onClick={isClickable ? () => onRowClick?.(entry) : undefined}
                    >
                      {renderCellContent(entry, column.key)}
                </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="text-sm text-gray-700">
          Showing {((data.page - 1) * data.limit) + 1} to {Math.min(data.page * data.limit, data.total)} of {data.total} entries
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePageChange(data.page - 1)}
            disabled={!data.hasPrev || loading}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed bg-white text-gray-700 cursor-pointer"
          >
            Previous
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, data.totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(data.totalPages - 4, data.page - 2)) + i;
              if (pageNum > data.totalPages) return null;
              
              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  disabled={loading}
                  className={`px-4 py-2 text-sm font-semibold border-gray-300 rounded-md min-w-[40px] ${
                    pageNum === data.page
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                  } disabled:opacity-50 transition-colors cursor-pointer`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => handlePageChange(data.page + 1)}
            disabled={!data.hasNext || loading}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed bg-white text-gray-700 cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu.isOpen && contextMenu.entryId && (() => {
        const entry = data?.data.find(e => e.id === contextMenu.entryId);
        if (!entry) return null;

        return (
          <div
            className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 min-w-48"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Entry info header */}
            <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
              <div className="text-xs font-mono text-blue-600">{entry.id}</div>
              <div className="text-xs text-gray-600 mt-1 truncate max-w-xs">
                {entry.gloss.substring(0, 50)}{entry.gloss.length > 50 ? '...' : ''}
              </div>
            </div>

            {/* Menu items */}
            <div className="py-1">
              <button
                onClick={() => {
                  setContextMenu({ isOpen: false, x: 0, y: 0, entryId: null });
                  router.push(`/graph?entry=${entry.id}`);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-800 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Open in Graph Mode
              </button>

              <div className="border-t border-gray-200 my-1"></div>

              {!entry.flagged ? (
                <button
                  onClick={() => handleContextMenuAction('flag')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-800 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 2H21l-3 6 3 6h-8.5l-1-2H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                  Flag Entry
                </button>
              ) : (
                <button
                  onClick={() => handleContextMenuAction('unflag')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Unflag Entry
                </button>
              )}

              {!entry.forbidden ? (
                <button
                  onClick={() => handleContextMenuAction('forbid')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-800 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                  </svg>
                  Mark as Forbidden
                </button>
              ) : (
                <button
                  onClick={() => handleContextMenuAction('allow')}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-green-50 hover:text-green-800 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Allow Entry
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Moderation Modal */}
      {moderationModal.isOpen && (() => {
        const selectedEntries = data?.data.filter(entry => selection.selectedIds.has(entry.id)) || [];
        const existingReasons = {
          flagged: selectedEntries
            .filter(e => e.flagged && e.flaggedReason)
            .map(e => ({ id: e.id, reason: e.flaggedReason! })),
          forbidden: selectedEntries
            .filter(e => e.forbidden && e.forbiddenReason)
            .map(e => ({ id: e.id, reason: e.forbiddenReason! }))
        };
        
        return (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div 
              className="absolute inset-0"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
              onClick={handleCloseModerationModal}
            ></div>
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto relative z-10">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {moderationModal.action === 'flag' && 'Flag Entries'}
                  {moderationModal.action === 'unflag' && 'Unflag Entries'}
                  {moderationModal.action === 'forbid' && 'Mark as Forbidden'}
                  {moderationModal.action === 'allow' && 'Allow Entries'}
                </h3>
                
                <p className="text-sm text-gray-600 mb-4">
                  You are about to {moderationModal.action} {selection.selectedIds.size} {selection.selectedIds.size === 1 ? 'entry' : 'entries'}.
                </p>

                {/* Show existing reasons */}
                {moderationModal.action === 'unflag' && existingReasons.flagged.length > 0 && (
                  <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                    <h4 className="text-sm font-medium text-orange-900 mb-2">Existing Flag Reasons:</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {existingReasons.flagged.map(({ id, reason }) => (
                        <div key={id} className="text-xs text-orange-800">
                          <span className="font-mono text-orange-600">{id}:</span> {reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {moderationModal.action === 'allow' && existingReasons.forbidden.length > 0 && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <h4 className="text-sm font-medium text-red-900 mb-2">Existing Forbidden Reasons:</h4>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {existingReasons.forbidden.map(({ id, reason }) => (
                        <div key={id} className="text-xs text-red-800">
                          <span className="font-mono text-red-600">{id}:</span> {reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(moderationModal.action === 'flag' || moderationModal.action === 'forbid') && (
                  <div className="mb-4">
                    <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
                      Reason (optional)
                    </label>
                    <textarea
                      id="reason"
                      value={moderationModal.reason}
                      onChange={(e) => setModerationModal(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder={`Enter reason for ${moderationModal.action === 'flag' ? 'flagging' : 'marking as forbidden'}...`}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={4}
                    />
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    onClick={handleCloseModerationModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    Cancel
                  </button>
                <button
                  onClick={handleConfirmModeration}
                  className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 cursor-pointer ${
                    moderationModal.action === 'flag' 
                      ? 'bg-orange-600 hover:bg-orange-700 text-white focus:ring-orange-500'
                      : moderationModal.action === 'forbid'
                      ? 'text-gray-900 focus:ring-red-300'
                      : 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500'
                  }`}
                  style={moderationModal.action === 'forbid' ? {
                    backgroundColor: '#ff8799',
                    borderColor: '#ff8799'
                  } : {}}
                  onMouseEnter={(e) => {
                    if (moderationModal.action === 'forbid') {
                      e.currentTarget.style.backgroundColor = '#ff6b81';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (moderationModal.action === 'forbid') {
                      e.currentTarget.style.backgroundColor = '#ff8799';
                    }
                  }}
                >
                  Confirm
                </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}