'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { TableEntry, PaginatedResult, PaginationParams, POS_LABELS, Frame } from '@/lib/types';
import FilterPanel, { FilterState } from './FilterPanel';
import ColumnVisibilityPanel, { ColumnConfig, ColumnVisibilityState } from './ColumnVisibilityPanel';
import PageSizeSelector from './PageSizeSelector';
import { api } from '@/lib/api-client';
import AIJobsOverlay from './AIJobsOverlay';
import { SparklesIcon } from '@heroicons/react/24/outline';

interface DataTableProps {
  onRowClick?: (entry: TableEntry | Frame) => void;
  onEditClick?: (entry: TableEntry | Frame) => void;
  searchQuery?: string;
  className?: string;
  mode?: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames';
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

interface FrameOption {
  id: string;
  code: string | null;
  frame_name: string;
}

// Define all available columns with their configurations
// Verbs default columns
const VERBS_DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: true, sortable: true },
  { key: 'legacy_id', label: 'Legacy ID', visible: false, sortable: true },
  { key: 'frame', label: 'Frame', visible: false, sortable: true },
  { key: 'lemmas', label: 'Lemmas', visible: true, sortable: true },
  { key: 'gloss', label: 'Definition', visible: true, sortable: true },
  { key: 'pos', label: 'Part of Speech', visible: false, sortable: true },
  { key: 'lexfile', label: 'Lexfile', visible: false, sortable: true },
  { key: 'isMwe', label: 'Multi-word Expression', visible: false, sortable: true },
  { key: 'transitive', label: 'Transitive', visible: false, sortable: true },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: true, sortable: false },
  { key: 'forbidden', label: 'Forbidden', visible: false, sortable: true },
  { key: 'forbiddenReason', label: 'Forbidden Reason', visible: true, sortable: false },
  { key: 'particles', label: 'Particles', visible: false, sortable: false },
  { key: 'examples', label: 'Examples', visible: true, sortable: false },
  { key: 'vendler_class', label: 'Vendler Class', visible: false, sortable: true },
  { key: 'legal_constraints', label: 'Legal Constraints', visible: false, sortable: false },
  { key: 'roles', label: 'Roles', visible: false, sortable: false },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
  { key: 'actions', label: 'Actions', visible: true, sortable: false },
];

// Nouns and Adjectives default columns (no frame, transitive, vendler_class, roles)
const NOUNS_ADJECTIVES_DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: true, sortable: true },
  { key: 'legacy_id', label: 'Legacy ID', visible: false, sortable: true },
  { key: 'lemmas', label: 'Lemmas', visible: true, sortable: true },
  { key: 'gloss', label: 'Definition', visible: true, sortable: true },
  { key: 'pos', label: 'Part of Speech', visible: false, sortable: true },
  { key: 'lexfile', label: 'Lexfile', visible: false, sortable: true },
  { key: 'isMwe', label: 'Multi-word Expression', visible: false, sortable: true },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: true, sortable: false },
  { key: 'forbidden', label: 'Forbidden', visible: false, sortable: true },
  { key: 'forbiddenReason', label: 'Forbidden Reason', visible: true, sortable: false },
  { key: 'examples', label: 'Examples', visible: true, sortable: false },
  { key: 'legal_constraints', label: 'Legal Constraints', visible: false, sortable: false },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
  { key: 'actions', label: 'Actions', visible: true, sortable: false },
];

// Adverbs-specific columns
const ADVERBS_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: true, sortable: true },
  { key: 'legacy_id', label: 'Legacy ID', visible: false, sortable: true },
  { key: 'lemmas', label: 'Lemmas', visible: true, sortable: true },
  { key: 'gloss', label: 'Definition', visible: true, sortable: true },
  { key: 'pos', label: 'Part of Speech', visible: false, sortable: true },
  { key: 'lexfile', label: 'Lexfile', visible: false, sortable: true },
  { key: 'isMwe', label: 'Multi-word Expression', visible: false, sortable: true },
  { key: 'gradable', label: 'Gradable', visible: false, sortable: true },
  { key: 'flagged', label: 'Flagged', visible: false, sortable: true },
  { key: 'flaggedReason', label: 'Flagged Reason', visible: true, sortable: false },
  { key: 'forbidden', label: 'Forbidden', visible: false, sortable: true },
  { key: 'forbiddenReason', label: 'Forbidden Reason', visible: true, sortable: false },
  { key: 'examples', label: 'Examples', visible: true, sortable: false },
  { key: 'legal_constraints', label: 'Legal Constraints', visible: false, sortable: false },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
  { key: 'actions', label: 'Actions', visible: true, sortable: false },
];

// Frames-specific columns
const FRAMES_COLUMNS: ColumnConfig[] = [
  { key: 'code', label: 'Code', visible: true, sortable: true },
  { key: 'frame_name', label: 'Frame Name', visible: true, sortable: true },
  { key: 'definition', label: 'Definition', visible: true, sortable: false },
  { key: 'short_definition', label: 'Short Definition', visible: true, sortable: false },
  { key: 'prototypical_synset', label: 'Prototypical Synset', visible: true, sortable: true },
  { key: 'is_supporting_frame', label: 'Supporting Frame', visible: false, sortable: true },
  { key: 'communication', label: 'Communication', visible: false, sortable: true },
  { key: 'frame_roles', label: 'Frame Roles', visible: true, sortable: false },
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
  createdAt: 100,
  updatedAt: 100,
  actions: 80,
  // Frame columns
  code: 120,
  frame_name: 200,
  definition: 350,
  short_definition: 250,
  prototypical_synset: 180,
  is_supporting_frame: 150,
  communication: 120,
  frame_roles: 250,
};

const getDefaultVisibility = (mode?: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames'): ColumnVisibilityState => {
  const visibility: ColumnVisibilityState = {};
  let columns: ColumnConfig[];
  
  if (mode === 'frames') {
    columns = FRAMES_COLUMNS;
  } else if (mode === 'adverbs') {
    columns = ADVERBS_COLUMNS;
  } else if (mode === 'nouns' || mode === 'adjectives') {
    columns = NOUNS_ADJECTIVES_DEFAULT_COLUMNS;
  } else {
    columns = VERBS_DEFAULT_COLUMNS;
  }
  
  columns.forEach(col => {
    visibility[col.key] = col.visible;
  });
  return visibility;
};

const getDefaultColumnWidths = (): ColumnWidthState => {
  return { ...DEFAULT_COLUMN_WIDTHS };
};

const sanitizeColumnVisibility = (visibility?: ColumnVisibilityState | null, mode?: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames'): ColumnVisibilityState => {
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
};

export default function DataTable({ onRowClick, onEditClick, searchQuery, className, mode = 'verbs' }: DataTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isInitialized, setIsInitialized] = useState(false);
  const prevModeRef = useRef(mode);
  const apiPrefix = useMemo(() => {
    if (mode === 'nouns') return '/api/nouns';
    if (mode === 'adjectives') return '/api/adjectives';
    if (mode === 'adverbs') return '/api/adverbs';
    if (mode === 'frames') return '/api/frames';
    return '/api/verbs';
  }, [mode]);
  const graphBasePath = useMemo(() => {
    if (mode === 'nouns') return '/graph/nouns';
    if (mode === 'adjectives') return '/graph/adjectives';
    if (mode === 'adverbs') return '/graph/adverbs';
    if (mode === 'frames') return '/graph/frames';
    return '/graph';
  }, [mode]);

  // Helper function to parse URL params on mount
  const getInitialStateFromURL = useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    
    // Parse filters
    const filters: FilterState = {};
    
    // Parse text filters
    ['gloss', 'lemmas', 'examples', 'particles', 'frames', 'flaggedReason', 'forbiddenReason'].forEach(key => {
      const value = params.get(key);
      if (value !== null) {
        filters[key as 'gloss' | 'lemmas' | 'examples' | 'particles' | 'frames' | 'flaggedReason' | 'forbiddenReason'] = value;
      }
    });
    
    // Parse categorical filters
    ['pos', 'lexfile', 'frame_id', 'flaggedByJobId'].forEach(key => {
      const value = params.get(key);
      if (value !== null) {
        filters[key as 'pos' | 'lexfile' | 'frame_id' | 'flaggedByJobId'] = value;
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
    if (columnsParam && columnsParam !== 'default') {
      try {
        columnVisibility = JSON.parse(decodeURIComponent(columnsParam));
      } catch {
        // Fallback to default
      }
    }
    // If columnsParam === 'default' or null, columnVisibility remains null (uses default)

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

  const [data, setData] = useState<PaginatedResult<TableEntry | Frame> | null>(null);
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
      return sanitizeColumnVisibility(initialState.columnVisibility, mode);
    }
    // Use defaults (localStorage will be loaded after mount to avoid hydration issues)
    return getDefaultVisibility(mode);
  });
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [isPageSizePanelOpen, setIsPageSizePanelOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<ColumnWidthState>(getDefaultColumnWidths());
  const [isResizing, setIsResizing] = useState(false);
  const [, setResizingColumn] = useState<string | null>(null);
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
  const [isAIOverlayOpen, setIsAIOverlayOpen] = useState(false);
  const [pendingAIJobs, setPendingAIJobs] = useState(0);
  const [isFrameModalOpen, setIsFrameModalOpen] = useState(false);
  const [frameOptions, setFrameOptions] = useState<FrameOption[]>([]);
  const [frameOptionsLoading, setFrameOptionsLoading] = useState(false);
  const [frameOptionsError, setFrameOptionsError] = useState<string | null>(null);
  const [selectedFrameValue, setSelectedFrameValue] = useState<string>('');
  const [frameSearchQuery, setFrameSearchQuery] = useState('');
  const [isFrameUpdating, setIsFrameUpdating] = useState(false);
  const selectedEntries = useMemo(() => {
    if (!data || selection.selectedIds.size === 0) {
      return [];
    }
    return data.data.filter(entry => selection.selectedIds.has(entry.id));
  }, [data, selection.selectedIds]);
  const filteredFrameOptions = useMemo(() => {
    if (!frameSearchQuery.trim()) {
      return frameOptions;
    }
    const query = frameSearchQuery.trim().toLowerCase();
    return frameOptions.filter(frame => {
      const nameMatch = frame.frame_name.toLowerCase().includes(query);
      const code = frame.code ? frame.code.toLowerCase() : '';
      return nameMatch || code.includes(query);
    });
  }, [frameOptions, frameSearchQuery]);

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
    
    // Parse filters
    const filters: FilterState = {};
    
    // Parse text filters
    ['gloss', 'lemmas', 'examples', 'particles', 'frames', 'flaggedReason', 'forbiddenReason'].forEach(key => {
      const value = params.get(key);
      if (value !== null) {
        filters[key as 'gloss' | 'lemmas' | 'examples' | 'particles' | 'frames' | 'flaggedReason' | 'forbiddenReason'] = value;
      }
    });
    
    // Parse categorical filters
    ['pos', 'lexfile', 'frame_id', 'flaggedByJobId'].forEach(key => {
      const value = params.get(key);
      if (value !== null) {
        filters[key as 'pos' | 'lexfile' | 'frame_id' | 'flaggedByJobId'] = value;
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
    if (columnsParam && columnsParam !== 'default') {
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
    
    // Reset filters to URL state or empty
    setFilters(filters);
    
    // Reset column visibility to URL state or default for the new mode
    const newColumnVisibility = columnVisibility || getDefaultVisibility(mode);
    setColumnVisibility(sanitizeColumnVisibility(newColumnVisibility, mode));
    
    // Reset sort state
    setSortState({ field: sortBy, order: sortOrder });
    
    // Reset pagination
    setCurrentPage(page);
    setPageSize(limit);
    
    // Clear selection
    setSelection({ selectedIds: new Set(), selectAll: false });
  }, [mode, isInitialized, searchParams]);

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

      const response = await fetch(`${apiPrefix}/paginated?${queryParams}`);
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
  }, [currentPage, pageSize, sortState, searchQuery, filters, apiPrefix]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchPendingAIJobs = useCallback(async () => {
    try {
      const response = await api.get<{ jobs: Array<{ status: string }> }>('/api/llm-jobs');
      const pending = response.jobs?.filter(job => job.status === 'queued' || job.status === 'running').length ?? 0;
      setPendingAIJobs(pending);
    } catch (error) {
      console.warn('Failed to load pending AI jobs', error);
    }
  }, []);

  const fetchFrameOptions = useCallback(async () => {
    if (mode !== 'verbs') {
      return;
    }

    setFrameOptionsLoading(true);
    setFrameOptionsError(null);

    try {
      const response = await fetch('/api/frames', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load frames');
      }

      const frames: FrameOption[] = await response.json();
      setFrameOptions(frames);
    } catch (error) {
      setFrameOptionsError(error instanceof Error ? error.message : 'Failed to load frames');
    } finally {
      setFrameOptionsLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void fetchPendingAIJobs();
  }, [fetchPendingAIJobs]);

  useEffect(() => {
    if (isAIOverlayOpen) return;
    const interval = setInterval(() => {
      void fetchPendingAIJobs();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchPendingAIJobs, isAIOverlayOpen]);

  useEffect(() => {
    if (!isFrameModalOpen || mode !== 'verbs') {
      return;
    }

    if (frameOptions.length > 0 || frameOptionsLoading || frameOptionsError) {
      return;
    }

    void fetchFrameOptions();
  }, [fetchFrameOptions, frameOptions.length, frameOptionsError, frameOptionsLoading, isFrameModalOpen, mode]);

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
    const sanitizedVisibility = sanitizeColumnVisibility(newVisibility, mode);
    setColumnVisibility(sanitizedVisibility);
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('table-column-visibility-v2', JSON.stringify(sanitizedVisibility));
    }
  };

  const handleResetColumns = () => {
    const defaultVisibility = getDefaultVisibility(mode);
    setColumnVisibility(defaultVisibility);
    if (typeof window !== 'undefined') {
      localStorage.setItem('table-column-visibility-v2', JSON.stringify(defaultVisibility));
    }
  };

  const handleColumnWidthChange = (columnKey: string, width: number) => {
    const newWidths = { ...columnWidths, [columnKey]: Math.max(50, width) }; // Minimum width of 50px
    setColumnWidths(newWidths);
    if (typeof window !== 'undefined') {
      localStorage.setItem('table-column-widths-v2', JSON.stringify(newWidths));
    }
  };

  const handleResetColumnWidths = () => {
    const defaultWidths = getDefaultColumnWidths();
    setColumnWidths(defaultWidths);
    if (typeof window !== 'undefined') {
      localStorage.setItem('table-column-widths-v2', JSON.stringify(defaultWidths));
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
  const getColumnsForMode = () => {
    if (mode === 'frames') return FRAMES_COLUMNS;
    if (mode === 'adverbs') return ADVERBS_COLUMNS;
    if (mode === 'nouns' || mode === 'adjectives') return NOUNS_ADJECTIVES_DEFAULT_COLUMNS;
    return VERBS_DEFAULT_COLUMNS;
  };

  const currentColumns = getColumnsForMode().map(col => ({
    ...col,
    // Always show actions column if onEditClick is provided (not available for frames)
    visible: col.key === 'actions' && onEditClick ? true : (columnVisibility[col.key] ?? col.visible)
  }));

  const visibleColumns = currentColumns.filter(col => col.visible);

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
      const response = await fetch(`${apiPrefix}/moderation`, {
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

  const handleOpenFrameModal = () => {
    if (mode !== 'verbs') {
      return;
    }
    setFrameOptionsError(null);
    setSelectedFrameValue('');
    setFrameSearchQuery('');
    setIsFrameModalOpen(true);
  };

  const handleCloseFrameModal = () => {
    if (isFrameUpdating) {
      return;
    }
    setIsFrameModalOpen(false);
    setSelectedFrameValue('');
    setFrameSearchQuery('');
    setFrameOptionsError(null);
  };

  const handleConfirmFrameChange = async () => {
    if (selection.selectedIds.size === 0 || mode !== 'verbs') {
      return;
    }

    const normalizedFrameValue =
      selectedFrameValue === ''
        ? undefined
        : selectedFrameValue === '__CLEAR__'
          ? null
          : selectedFrameValue;

    if (normalizedFrameValue === undefined) {
      setFrameOptionsError('Please select a frame before confirming');
      return;
    }

    setIsFrameUpdating(true);
    setFrameOptionsError(null);

    try {
      const response = await fetch(`${apiPrefix}/frame`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: Array.from(selection.selectedIds),
          frameId: normalizedFrameValue,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error ?? 'Failed to update frames');
      }

      const chosenFrame =
        normalizedFrameValue === null
          ? null
          : frameOptions.find(frame => frame.id === normalizedFrameValue) ?? null;

      setData(prevData => {
        if (!prevData) return prevData;
        return {
          ...prevData,
          data: prevData.data.map(entry => {
            if (!selection.selectedIds.has(entry.id)) {
              return entry;
            }
            return {
              ...entry,
              frame_id: normalizedFrameValue === null ? null : normalizedFrameValue,
              frame: chosenFrame ? chosenFrame.frame_name : null,
            };
          }),
        };
      });

      await fetchData();

      setSelection({ selectedIds: new Set(), selectAll: false });
      setIsFrameModalOpen(false);
      setSelectedFrameValue('');
      setFrameSearchQuery('');
      setFrameOptionsError(null);
    } catch (error) {
      setFrameOptionsError(error instanceof Error ? error.message : 'Failed to update frames');
    } finally {
      setIsFrameUpdating(false);
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
      const response = await fetch(`${apiPrefix}/${editing.entryId}`, {
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
    if (selectedEntries.length === 0) {
      return { allFlagged: false, noneFlagged: true, allForbidden: false, noneForbidden: true };
    }

    // Filter to only TableEntry items (frames don't have flagged/forbidden)
    const moderatableEntries = selectedEntries.filter((entry): entry is TableEntry => 'flagged' in entry);
    
    if (moderatableEntries.length === 0) {
      return { allFlagged: false, noneFlagged: true, allForbidden: false, noneForbidden: true };
    }

    const allFlagged = moderatableEntries.every(entry => entry.flagged);
    const noneFlagged = moderatableEntries.every(entry => !entry.flagged);
    const allForbidden = moderatableEntries.every(entry => entry.forbidden);
    const noneForbidden = moderatableEntries.every(entry => !entry.forbidden);
    
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

  const truncateText = (text: string | null | undefined, maxLength: number) => {
    if (!text) return '—';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Helper component for empty/null values
  const EmptyCell = () => <span className="text-gray-400 text-sm">—</span>;
  
  // Helper component for N/A values
  const NACell = () => <span className="text-gray-400 text-sm">N/A</span>;
  
  // Helper component for None values
  const NoneCell = () => <span className="text-gray-400 text-sm">None</span>;

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return '—';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '—';
    return dateObj.toLocaleDateString();
  };

  const renderCellContent = (entry: TableEntry | Frame, columnKey: string) => {
    // Type guard to check if entry is a Frame
    const isFrame = (e: TableEntry | Frame): e is Frame => {
      return mode === 'frames' && 'frame_name' in e;
    };

    // Handle frame-specific columns
    if (isFrame(entry)) {
      switch (columnKey) {
        case 'code':
          return <span className="text-sm font-mono text-blue-600 break-words">{entry.code || '—'}</span>;
        case 'frame_name':
          return <span className="inline-block max-w-full text-sm font-semibold text-gray-900 break-words">{entry.frame_name}</span>;
        case 'definition':
          return (
            <div className="text-sm text-gray-900 break-words max-w-full">
              {truncateText(entry.definition, 200)}
            </div>
          );
        case 'short_definition':
          return (
            <div className="text-sm text-gray-700 break-words max-w-full">
              {truncateText(entry.short_definition, 100)}
            </div>
          );
        case 'prototypical_synset':
          return (
            <span className="inline-block max-w-full text-sm font-mono text-blue-600 hover:text-blue-800 cursor-pointer break-words"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`${graphBasePath}?entry=${entry.prototypical_synset}`);
              }}
              title={`Click to view ${entry.prototypical_synset} in graph mode`}
            >
              {entry.prototypical_synset}
            </span>
          );
        case 'is_supporting_frame':
          return (
            <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${
              entry.is_supporting_frame 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {entry.is_supporting_frame ? 'Yes' : 'No'}
            </span>
          );
        case 'communication':
          if (entry.communication === null || entry.communication === undefined) {
            return <NACell />;
          }
          return (
            <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${
              entry.communication 
                ? 'bg-blue-100 text-blue-800' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {entry.communication ? 'Yes' : 'No'}
            </span>
          );
        case 'frame_roles':
          if (!entry.frame_roles || entry.frame_roles.length === 0) {
            return <EmptyCell />;
          }
          const roleLabels = entry.frame_roles.map(fr => fr.role_type.label).join(', ');
          return (
            <div className="flex flex-col gap-1 max-w-full" title={roleLabels}>
              <span className="text-xs text-gray-700">
                {entry.frame_roles.length} {entry.frame_roles.length === 1 ? 'role' : 'roles'}
              </span>
              <span className="text-xs text-gray-500 break-words">
                ({roleLabels})
              </span>
            </div>
          );
        case 'createdAt':
          return <span className="text-xs text-gray-500 break-words">{formatDate(entry.createdAt)}</span>;
        case 'updatedAt':
          return <span className="text-xs text-gray-500 break-words">{formatDate(entry.updatedAt)}</span>;
        default:
          return <span className="text-sm text-gray-900 break-words">{String((entry as unknown as Record<string, unknown>)[columnKey] || '')}</span>;
      }
    }

    // Handle TableEntry columns
    const tableEntry = entry as TableEntry;
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
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleStartEdit(entry.id, 'gloss', entry.gloss);
            }}
          >
            {truncateText(entry.gloss, 150)}
          </div>
        );
      case 'pos':
        if (isFrame(entry)) return <EmptyCell />;
        return (
          <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded font-medium">
            {POS_LABELS[entry.pos as keyof typeof POS_LABELS] || entry.pos}
          </span>
        );
      case 'lexfile':
        if (isFrame(entry)) return <EmptyCell />;
        return <span className="text-xs text-gray-500 break-words">{entry.lexfile?.replace(/^verb\./, '') || '—'}</span>;
      case 'frame':
        if (!entry.frame) {
          return <EmptyCell />;
        }
        return (
          <span className="inline-block max-w-full px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded font-medium uppercase break-words whitespace-normal">
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
          return <NACell />;
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
        if (isFrame(entry)) return <NACell />;
        if (entry.flagged === null || entry.flagged === undefined) {
          return <NACell />;
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
        if (isFrame(entry)) return <NACell />;
        if (entry.forbidden === null || entry.forbidden === undefined) {
          return <NACell />;
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
        if (isFrame(entry)) return <NACell />;
        if (!entry.flaggedReason) {
          return <span className="text-gray-400 text-xs">None</span>;
        }
        return (
          <div className="text-xs text-gray-700 break-words">
            {entry.flaggedReason}
          </div>
        );
      case 'forbiddenReason':
        if (isFrame(entry)) return <NACell />;
        if (!entry.forbiddenReason) {
          return <span className="text-gray-400 text-xs">None</span>;
        }
        return (
          <div className="text-xs text-gray-700 break-words">
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
          return <NoneCell />;
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
          return <NoneCell />;
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
          return <NoneCell />;
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
                    ? 'bg-blue-100 text-blue-800' 
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
                          ? 'bg-blue-100 text-blue-800' 
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
        return <span className="text-xs font-mono text-blue-600 break-words">{entry.id}</span>;
      case 'legacy_id':
        return <span className="text-sm font-mono text-gray-600 break-words">{entry.legacy_id}</span>;
      case 'createdAt':
        return <span className="text-xs text-gray-500 break-words">{formatDate(entry.createdAt)}</span>;
      case 'updatedAt':
        return <span className="text-xs text-gray-500 break-words">{formatDate(entry.updatedAt)}</span>;
      case 'actions':
        return (
          <div className="flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                console.log('Edit button clicked for entry:', entry.id);
                if (onEditClick) {
                  onEditClick(entry);
                } else {
                  console.warn('onEditClick is not defined');
                }
              }}
              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors cursor-pointer"
              title="Edit entry"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        );
      default:
        return <span className="text-sm text-gray-900 break-words">{String((entry as unknown as Record<string, unknown>)[columnKey] || '')}</span>;
    }
  };

  const getColumnWidth = (columnKey: string) => {
    const width = columnWidths[columnKey] || DEFAULT_COLUMN_WIDTHS[columnKey] || 150;
    return `${width}px`;
  };

  const getRowBackgroundColor = (entry: TableEntry | Frame, isSelected: boolean, isHovered: boolean = false) => {
    // Priority: Selection > Forbidden > Flagged > Default
    if (isSelected) {
      return 'bg-blue-50';
    }
    
    // Only TableEntry has flagged/forbidden properties
    if ('forbidden' in entry && entry.forbidden) {
      return isHovered ? 'hover:bg-red-200' : '';
    }
    
    if ('flagged' in entry && entry.flagged) {
      return isHovered ? 'hover:bg-blue-200' : '';
    }
    
    return 'hover:bg-gray-50';
  };

  const getRowInlineStyles = (entry: TableEntry | Frame, isSelected: boolean) => {
    if (isSelected) {
      return {};
    }
    
    // Only TableEntry has flagged/forbidden properties
    if (!('forbidden' in entry)) {
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

  // Don't return early for empty data - we want to keep the toolbar visible
  const hasData = data && data.data.length > 0;

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
                mode={mode}
              />
            </div>
            <div className="relative">
              <ColumnVisibilityPanel
                isOpen={isColumnPanelOpen}
                onToggle={() => setIsColumnPanelOpen(!isColumnPanelOpen)}
                columns={currentColumns.filter(col => col.key !== 'actions')}
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
            {mode !== 'frames' && (
              <button
                onClick={() => setIsAIOverlayOpen(true)}
                className="relative inline-flex items-center justify-center rounded-md bg-gradient-to-r from-blue-500 to-blue-600 px-3 py-2 text-white shadow-sm transition-colors hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                title="Open AI batch moderation"
                aria-label="Open AI batch moderation"
                type="button"
              >
                <SparklesIcon className="h-5 w-5" aria-hidden="true" />
                {pendingAIJobs > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                    {pendingAIJobs > 99 ? '99+' : pendingAIJobs}
                  </span>
                )}
              </button>
            )}
            
            {/* Moderation Actions */}
            {mode !== 'frames' && selection.selectedIds.size > 0 && (() => {
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
                  {mode === 'verbs' && (
                    <button
                      onClick={handleOpenFrameModal}
                      className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-blue-700 bg-blue-100 border border-blue-200 rounded-md hover:bg-blue-200 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h11m-2-3 3 3-3 3M20 17H9m2-3-3 3 3 3" />
                      </svg>
                      Change Frame
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          <PageSizeSelector
            isOpen={isPageSizePanelOpen}
            onToggle={() => setIsPageSizePanelOpen(!isPageSizePanelOpen)}
            pageSize={pageSize}
            onPageSizeChange={handlePageSizeChange}
            totalItems={data?.total}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto relative h-[calc(100vh-300px)] overflow-y-auto bg-gray-50">
        {loading && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
            <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
          </div>
        )}
        <table className="w-full" style={{ tableLayout: 'fixed' }}>
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-20">
            <tr>
              {mode !== 'frames' && (
                <th className="px-4 py-3 text-left w-12 bg-gray-50" style={{ width: '48px' }}>
                  <input
                    type="checkbox"
                    checked={selection.selectAll}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              {visibleColumns.map((column) => (
                <th 
                  key={column.key}
                  className="relative px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 bg-gray-50"
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
          <tbody className="bg-gray-50 divide-y divide-gray-200">
            {hasData ? (
              data.data.map((entry) => {
                const isSelected = selection.selectedIds.has(entry.id);
                return (
                <tr
                  key={entry.id}
                  className={`${getRowBackgroundColor(entry, isSelected)} ${isSelected ? 'bg-blue-50' : 'bg-white'}`}
                  style={getRowInlineStyles(entry, isSelected)}
                  onContextMenu={(e) => handleContextMenu(e, entry.id)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    handleSelectRow(entry.id);
                  }}
                >
                  {mode !== 'frames' && (
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
                  )}
                  {visibleColumns.map((column) => {
                    const isClickable = onRowClick && column.key !== 'isMwe' && column.key !== 'transitive' && column.key !== 'gloss' && column.key !== 'actions';
                    const cellClassName = `px-4 py-4 break-words ${isClickable ? 'cursor-pointer' : ''} align-top border-r border-gray-200`;
                    
                    return (
                      <td 
                        key={column.key}
                        className={cellClassName}
                        style={{ width: getColumnWidth(column.key), minWidth: '50px' }}
                        onClick={isClickable ? () => onRowClick?.(entry) : undefined}
                      >
                        <div className="max-w-full">
                          {renderCellContent(entry, column.key)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={visibleColumns.length + (mode !== 'frames' ? 1 : 0)} className="px-4 py-12 text-center">
                  <div className="text-gray-400">
                    <svg className="h-24 w-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-lg">No entries found</p>
                    {(searchQuery || Object.keys(filters).length > 0) && (
                      <p className="text-sm mt-2">Try adjusting your search or filters</p>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="text-sm text-gray-700">
          {hasData ? (
            <>Showing {((data.page - 1) * data.limit) + 1} to {Math.min(data.page * data.limit, data.total)} of {data.total} entries</>
          ) : (
            <>Showing 0 of {data?.total || 0} entries</>
          )}
        </div>
        
        {hasData && (
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
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.isOpen && contextMenu.entryId && (() => {
        const entry = data?.data.find(e => e.id === contextMenu.entryId);
        if (!entry) return null;

        // Check if entry is a Frame
        const isFrameEntry = mode === 'frames' && 'frame_name' in entry;
        const frameEntry = isFrameEntry ? entry as Frame : null;
        const tableEntry = !isFrameEntry ? entry as TableEntry : null;

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
              {frameEntry ? (
                <>
                  <div className="text-xs font-mono text-blue-600">{frameEntry.code || frameEntry.id}</div>
                  <div className="text-xs text-gray-600 mt-1 truncate max-w-xs">
                    {frameEntry.frame_name}
                  </div>
                </>
              ) : tableEntry ? (
                <>
                  <div className="text-xs font-mono text-blue-600">{tableEntry.id}</div>
                  <div className="text-xs text-gray-600 mt-1 truncate max-w-xs">
                    {tableEntry.gloss.substring(0, 50)}{tableEntry.gloss.length > 50 ? '...' : ''}
                  </div>
                </>
              ) : null}
            </div>

            {/* Menu items */}
            <div className="py-1">
              <button
                onClick={() => {
                  setContextMenu({ isOpen: false, x: 0, y: 0, entryId: null });
                  // For frames, navigate to prototypical_synset; for entries, navigate to the entry itself
                  const targetId = frameEntry ? frameEntry.prototypical_synset : (tableEntry?.id || '');
                  router.push(`${graphBasePath}?entry=${targetId}`);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-800 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {frameEntry ? 'Open Prototypical Synset in Graph Mode' : 'Open in Graph Mode'}
              </button>

              {/* Only show moderation actions for table entries, not frames */}
              {tableEntry && (
                <>
                  <div className="border-t border-gray-200 my-1"></div>

                  {!tableEntry.flagged ? (
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

              {!tableEntry.forbidden ? (
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
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Moderation Modal */}
      {moderationModal.isOpen && (() => {
        const selectedEntries = data?.data.filter(entry => selection.selectedIds.has(entry.id)) || [];
        // Filter to only TableEntry items (frames don't have flagged/forbidden)
        const moderatableEntries = selectedEntries.filter((e): e is TableEntry => 'flagged' in e);
        const existingReasons = {
          flagged: moderatableEntries
            .filter(e => e.flagged && e.flaggedReason)
            .map(e => ({ id: e.id, reason: e.flaggedReason! })),
          forbidden: moderatableEntries
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

      {isFrameModalOpen && mode === 'verbs' && (() => {
        const frameSummary = (() => {
          if (selectedEntries.length === 0) return [];
          const counts = new Map<string, { label: string; count: number }>();
          // Only verbs have frame property
          const verbEntries = selectedEntries.filter((e): e is TableEntry => 'frame' in e);
          verbEntries.forEach(entry => {
            const key = entry.frame ?? '__NONE__';
            const label = entry.frame ?? 'No frame assigned';
            const existing = counts.get(key);
            if (existing) {
              existing.count += 1;
            } else {
              counts.set(key, { label, count: 1 });
            }
          });
          return Array.from(counts.values()).sort((a, b) => b.count - a.count);
        })();

        return (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div
              className="absolute inset-0"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
              onClick={isFrameUpdating ? undefined : handleCloseFrameModal}
            ></div>
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto relative z-10">
              <div className="p-6 space-y-5">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900">Change Frame</h3>
                  <p className="text-sm text-gray-600">
                    You are about to update the frame for{' '}
                    <span className="font-medium text-gray-900">{selection.selectedIds.size}</span>{' '}
                    {selection.selectedIds.size === 1 ? 'entry' : 'entries'}.
                  </p>
                </div>

                {frameSummary.length > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <h4 className="text-xs font-semibold text-blue-900 uppercase tracking-wide mb-2">
                      Current Frame Breakdown
                    </h4>
                    <ul className="space-y-1 text-sm text-blue-900">
                      {frameSummary.map(({ label, count }) => (
                        <li key={`${label}-${count}`} className="flex justify-between">
                          <span>{label}</span>
                          <span className="font-medium">{count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label htmlFor="frame-search" className="block text-sm font-medium text-gray-700 mb-1">
                      Search frames
                    </label>
                    <input
                      id="frame-search"
                      type="text"
                      value={frameSearchQuery}
                      onChange={(e) => setFrameSearchQuery(e.target.value)}
                      placeholder="Filter by frame name or code..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
                    />
                  </div>

                  {frameOptionsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                      Loading frames...
                    </div>
                  ) : frameOptionsError ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 space-y-2">
                      <p>{frameOptionsError}</p>
                      <button
                        type="button"
                        onClick={() => void fetchFrameOptions()}
                        className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label htmlFor="frame-select" className="block text-sm font-medium text-gray-700">
                        New frame
                      </label>
                      <select
                        id="frame-select"
                        value={selectedFrameValue}
                        onChange={(e) => {
                          setFrameOptionsError(null);
                          setSelectedFrameValue(e.target.value);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900"
                      >
                        <option value="">Select a new frame…</option>
                        <option value="__CLEAR__">No frame (clear existing frame)</option>
                        {filteredFrameOptions.map(frame => (
                          <option key={frame.id} value={frame.id}>
                            {frame.frame_name}
                            {frame.code ? ` (${frame.code})` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500">
                        Selecting &quot;No frame&quot; will remove the frame assignment from all selected entries.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={handleCloseFrameModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isFrameUpdating}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmFrameChange}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isFrameUpdating || frameOptionsLoading || selectedFrameValue === ''}
                  >
                    {isFrameUpdating ? 'Applying...' : 'Apply Frame'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <AIJobsOverlay
        isOpen={isAIOverlayOpen}
        onClose={() => setIsAIOverlayOpen(false)}
        mode={mode}
        selectedIds={Array.from(selection.selectedIds)}
        onJobsUpdated={setPendingAIJobs}
      />
    </div>
  );
}