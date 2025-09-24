'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TableEntry, PaginatedResult, PaginationParams, POS_LABELS, EntryRelation } from '@/lib/types';
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

// Define all available columns with their configurations
const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'lemmas', label: 'Lemmas', visible: true, sortable: true },
  { key: 'gloss', label: 'Definition', visible: true, sortable: true },
  { key: 'pos', label: 'Part of Speech', visible: false, sortable: true },
  { key: 'lexfile', label: 'Lexfile', visible: true, sortable: true },
  { key: 'isMwe', label: 'Multi-word Expression', visible: false, sortable: true },
  { key: 'transitive', label: 'Transitive', visible: false, sortable: true },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'forbidden', label: 'Forbidden', visible: false, sortable: true },
  { key: 'particles', label: 'Particles', visible: false, sortable: false },
  { key: 'frames', label: 'Frames', visible: false, sortable: false },
  { key: 'examples', label: 'Examples', visible: false, sortable: false },
  { key: 'parentsCount', label: 'Parents', visible: true, sortable: true },
  { key: 'childrenCount', label: 'Children', visible: true, sortable: true },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
];

// Default column widths in pixels
const DEFAULT_COLUMN_WIDTHS: ColumnWidthState = {
  lemmas: 150,
  gloss: 300,
  pos: 120,
  lexfile: 120,
  isMwe: 100,
  transitive: 100,
  flagged: 100,
  forbidden: 100,
  particles: 120,
  frames: 100,
  examples: 250,
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
  const [data, setData] = useState<PaginatedResult<TableEntry> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortState, setSortState] = useState<SortState>({ field: 'id', order: 'asc' });
  const [filters, setFilters] = useState<FilterState>({});
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [selection, setSelection] = useState<SelectionState>({
    selectedIds: new Set(),
    selectAll: false,
  });
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(() => {
    // Try to load from localStorage, fallback to defaults
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
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [relationsData, setRelationsData] = useState<Record<string, { parents: string[]; children: string[] }>>({});

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
        .filter((rel: EntryRelation) => rel.type === 'hypernym')
        .map((rel: EntryRelation) => rel.target?.id)
        .filter(Boolean);
      
      // Extract children IDs (hyponyms - more specific concepts that point to this entry)
      const children = data.targetRelations
        .filter((rel: EntryRelation) => rel.type === 'hypernym')
        .map((rel: EntryRelation) => rel.source?.id)
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

  const handleModerationUpdate = async (updates: { flagged?: boolean; forbidden?: boolean }) => {
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

      // Refresh the data to show updated status
      await fetchData();
      
      // Clear selection
      setSelection({ selectedIds: new Set(), selectAll: false });

      // Show success message (you could add a toast notification here)
      console.log('Successfully updated entries');
    } catch (error) {
      console.error('Error updating entries:', error);
      // You could add error notification here
    }
  };

  const handleToggleFlagged = () => {
    // For bulk operations, we'll set flagged to true for all selected items
    // Users can manually unflag individual items if needed
    handleModerationUpdate({ flagged: true });
  };

  const handleToggleForbidden = () => {
    // For bulk operations, we'll set forbidden to true for all selected items
    // Users can manually allow individual items if needed
    handleModerationUpdate({ forbidden: true });
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
        return (
          <div className="flex flex-wrap gap-1">
            {entry.lemmas.slice(0, 3).map((lemma, idx) => (
              <span 
                key={idx}
                className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
              >
                {lemma}
              </span>
            ))}
            {entry.lemmas.length > 3 && (
              <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                +{entry.lemmas.length - 3}
              </span>
            )}
          </div>
        );
      case 'gloss':
        return (
          <div className="text-sm text-gray-900" title={entry.gloss}>
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
          <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${
            entry.flagged 
              ? 'bg-orange-100 text-orange-800' 
              : 'bg-gray-100 text-gray-600'
          }`}>
            {entry.flagged ? 'Yes' : 'No'}
          </span>
        );
      case 'forbidden':
        if (entry.forbidden === null || entry.forbidden === undefined) {
          return <span className="text-gray-400 text-sm">N/A</span>;
        }
        return (
          <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${
            entry.forbidden 
              ? 'bg-red-100 text-red-800' 
              : 'bg-gray-100 text-gray-600'
          }`}>
            {entry.forbidden ? 'Yes' : 'No'}
          </span>
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
      case 'frames':
        if (!entry.frames || entry.frames.length === 0) {
          return <span className="text-gray-400 text-sm">None</span>;
        }
        return (
          <div className="text-xs text-gray-600" title={entry.frames.join(', ')}>
            {entry.frames.length} frame{entry.frames.length !== 1 ? 's' : ''}
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
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
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
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-4">
            <FilterPanel
              isOpen={isFilterPanelOpen}
              onToggle={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onClearAll={handleClearAllFilters}
            />
            <ColumnVisibilityPanel
              isOpen={isColumnPanelOpen}
              onToggle={() => setIsColumnPanelOpen(!isColumnPanelOpen)}
              columns={currentColumns}
              onColumnVisibilityChange={handleColumnVisibilityChange}
              onResetToDefaults={handleResetColumns}
            />
            <button
              onClick={handleResetColumnWidths}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              title="Reset column widths to defaults"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12V10m0 0l3 3m-3-3l-3 3" />
              </svg>
              Reset Widths
            </button>
            
            {/* Moderation Actions */}
            {selection.selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {selection.selectedIds.size} selected
                </span>
                <div className="h-4 w-px bg-gray-300"></div>
                <button
                  onClick={handleToggleFlagged}
                  className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 2H21l-3 6 3 6h-8.5l-1-2H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                  Mark Flagged
                </button>
                <button
                  onClick={handleToggleForbidden}
                  className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                  </svg>
                  Mark Forbidden
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Show:</label>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
              className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
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
                  const isClickable = onRowClick && column.key !== 'isMwe' && column.key !== 'transitive';
                  const allowsWrap = ['gloss', 'examples', 'frames', 'parentsCount', 'childrenCount'].includes(column.key);
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
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed bg-white text-gray-700"
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
                  } disabled:opacity-50 transition-colors`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => handlePageChange(data.page + 1)}
            disabled={!data.hasNext || loading}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed bg-white text-gray-700"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}