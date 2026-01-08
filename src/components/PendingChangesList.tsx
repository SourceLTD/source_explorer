'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  XMarkIcon,
  CheckIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ChatBubbleLeftIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from './LoadingSpinner';
import UnreadCommentsPanel from './comments/UnreadCommentsPanel';
import ChangeCommentsBoard from './comments/ChangeCommentsBoard';
import PageSizeSelector from './PageSizeSelector';
import Pagination from './Pagination';
import ColumnVisibilityPanel, { ColumnConfig, ColumnVisibilityState } from './ColumnVisibilityPanel';
import { Modal, EmptyState } from './ui';
import { useTableSelection } from '@/hooks/useTableSelection';

// --- Types ---

interface FieldChange {
  id: string;
  changeset_id: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
}

interface Changeset {
  id: string;
  entity_type: string;
  entity_id: string | null;
  operation: 'create' | 'update' | 'delete';
  entity_version: number | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  status: string;
  created_by: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  comment: string | null;
  field_changes: FieldChange[];
}

interface ChangesetsByType {
  entity_type: string;
  count: number;
  changesets: Changeset[];
}

interface Changegroup {
  id: string;
  source: string;
  label: string | null;
  description: string | null;
  llm_job_id: string | null;
  llm_job: {
    id: string;
    label: string | null;
    status: string;
    submitted_by: string | null;
  } | null;
  status: string;
  created_by: string;
  created_at: string;
  committed_by: string | null;
  committed_at: string | null;
  total_changesets: number;
  approved_changesets: number;
  rejected_changesets: number;
  changesets_by_type: ChangesetsByType[];
}

interface PendingChangesData {
  changegroups: Changegroup[];
  ungrouped_changesets_by_type: ChangesetsByType[];
  total_pending_changesets: number;
  total_changegroups: number;
}

// Flat versions for the table
interface FlatFieldChange extends FieldChange {
  entity_type: string;
  entity_id: string | null;
  entity_display: string;
  operation: string;
  group_label: string;
  group_source: string;
  group_id: string | null;
  created_at: string;
  created_by: string;
}

interface FlatChangeset extends Omit<Changeset, 'field_changes'> {
  entity_display: string;
  group_label: string;
  group_source: string;
  group_id: string | null;
  field_count: number;
  field_changes: FieldChange[]; // Keep them for preview
}

interface FlatJob {
  id: string;
  label: string;
  source: string;
  description: string | null;
  llm_job_id: string | null;
  llm_job_label: string | null;
  status: string;
  created_by: string;
  created_at: string;
  total_changesets: number;
  approved_changesets: number;
  rejected_changesets: number;
  entity_types: string[];
  changesets: Changeset[];
}

type ViewGranularity = 'fields' | 'changesets' | 'jobs';

type DetailSelection = 
  | { type: 'field'; item: FlatFieldChange }
  | { type: 'changeset'; item: FlatChangeset }
  | { type: 'job'; item: FlatJob };

interface PendingChangesFilter {
  search: string;
  entityTypes: string[];
  operations: string[];
  sources: string[];
  jobIds: string[];
}

const defaultFilter: PendingChangesFilter = {
  search: '',
  entityTypes: [],
  operations: [],
  sources: [],
  jobIds: [],
};

interface PendingChangesListProps {
  onRefresh?: () => void;
}

// --- Helpers ---

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value) && value.length === 0) return 'empty list';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getEntityDisplayName(changeset: Changeset): string {
  const snapshot = changeset.before_snapshot || changeset.after_snapshot;
  if (snapshot) {
    const name = snapshot.word || snapshot.name || snapshot.code || snapshot.gloss || snapshot.label;
    if (name) return `"${String(name).substring(0, 30)}${String(name).length > 30 ? '...' : ''}"`;
  }
  return changeset.entity_id ? `#${changeset.entity_id}` : 'New';
}

function getOperationColor(operation: string): string {
  switch (operation) {
    case 'create': return 'bg-green-100 text-green-800';
    case 'update': return 'bg-blue-100 text-blue-800';
    case 'delete': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

function formatUserName(user: string | null): string {
  if (!user) return 'unknown';
  if (user === 'current-user') return 'current user';
  if (user === 'system:llm-agent') return 'LLM Agent';
  if (user.includes('@')) return user.split('@')[0];
  return user;
}

function getInitials(user: string | null): string {
  const formatted = formatUserName(user);
  if (formatted === 'System' || formatted === 'LLM Agent') return formatted[0];
  if (formatted === 'unknown') return '?';
  return formatted.slice(0, 2).toUpperCase();
}

// --- Column Configurations ---

// Fields view columns
const FIELDS_COLUMNS: ColumnConfig[] = [
  { key: 'type', label: 'Type', visible: true },
  { key: 'entity', label: 'Entity', visible: true },
  { key: 'op', label: 'Op', visible: true },
  { key: 'field', label: 'Field', visible: true },
  { key: 'oldValue', label: 'Old Value', visible: true },
  { key: 'newValue', label: 'New Value', visible: true },
  { key: 'source', label: 'Source / Job', visible: true },
  { key: 'author', label: 'Author', visible: true },
  { key: 'date', label: 'Date', visible: true },
];

// Changesets view columns
const CHANGESETS_COLUMNS: ColumnConfig[] = [
  { key: 'type', label: 'Type', visible: true },
  { key: 'entity', label: 'Entity', visible: true },
  { key: 'op', label: 'Op', visible: true },
  { key: 'changes', label: 'Changes', visible: true },
  { key: 'source', label: 'Source / Job', visible: true },
  { key: 'author', label: 'Author', visible: true },
  { key: 'date', label: 'Date', visible: true },
];

// Jobs view columns
const JOBS_COLUMNS: ColumnConfig[] = [
  { key: 'label', label: 'Job / Label', visible: true },
  { key: 'source', label: 'Source', visible: true },
  { key: 'entityTypes', label: 'Entity Types', visible: true },
  { key: 'rows', label: 'Rows', visible: true },
  { key: 'author', label: 'Author', visible: true },
  { key: 'date', label: 'Date', visible: true },
];

// Default column widths
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  type: 80,
  entity: 180,
  op: 70,
  field: 120,
  oldValue: 150,
  newValue: 150,
  changes: 500,
  source: 150,
  author: 50,
  date: 100,
  label: 200,
  entityTypes: 150,
  rows: 80,
};

function getDefaultVisibility(view: ViewGranularity): ColumnVisibilityState {
  const columns = view === 'fields' ? FIELDS_COLUMNS : view === 'changesets' ? CHANGESETS_COLUMNS : JOBS_COLUMNS;
  const visibility: ColumnVisibilityState = {};
  columns.forEach(col => {
    visibility[col.key] = col.visible;
  });
  return visibility;
}

// --- Component ---

export default function PendingChangesList({ onRefresh }: PendingChangesListProps) {
  const [data, setData] = useState<PendingChangesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewGranularity>('fields');
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [unreadChangesetIds, setUnreadChangesetIds] = useState<Set<string>>(new Set());
  const [unreadKey, setUnreadKey] = useState(0); // To force refresh of unread panel
  const [selectedDetail, setSelectedDetail] = useState<DetailSelection | null>(null);
  const [filter, setFilter] = useState<PendingChangesFilter>(defaultFilter);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [isPageSizeSelectorOpen, setIsPageSizeSelectorOpen] = useState(false);
  
  // Column visibility and width state
  const [columnVisibility, setColumnVisibility] = useState<Record<ViewGranularity, ColumnVisibilityState>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pending-changes-column-visibility');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return {
      fields: getDefaultVisibility('fields'),
      changesets: getDefaultVisibility('changesets'),
      jobs: getDefaultVisibility('jobs'),
    };
  });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pending-changes-column-widths');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return { ...DEFAULT_COLUMN_WIDTHS };
  });
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizingColumnRef = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/changegroups/pending');
      if (!response.ok) throw new Error('Failed to fetch pending changes');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch unread status for changesets
  const fetchUnreadStatus = useCallback(async (changesetIds: string[]) => {
    if (changesetIds.length === 0) return;
    try {
      const response = await fetch(`/api/comments/unread?changeset_ids=${changesetIds.join(',')}`);
      if (response.ok) {
        const data = await response.json();
        setUnreadChangesetIds(new Set(data.unread_changeset_ids || []));
      }
    } catch (err) {
      console.error('Failed to fetch unread status:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch unread status when data changes
  useEffect(() => {
    if (data) {
      const allChangesetIds: string[] = [];
      data.changegroups.forEach(cg => {
        cg.changesets_by_type.forEach(et => {
          et.changesets.forEach(cs => allChangesetIds.push(cs.id));
        });
      });
      data.ungrouped_changesets_by_type.forEach(et => {
        et.changesets.forEach(cs => allChangesetIds.push(cs.id));
      });
      fetchUnreadStatus(allChangesetIds);
    }
  }, [data, fetchUnreadStatus]);

  // Handle click on unread comment notification
  const handleUnreadChangesetClick = (changesetId: string) => {
    setExpandedComments(changesetId);
    // Remove from unread set locally
    setUnreadChangesetIds(prev => {
      const next = new Set(prev);
      next.delete(changesetId);
      return next;
    });
  };

  // --- Flattening Logic ---

  const { flatFieldChanges, flatChangesets, flatJobs } = useMemo(() => {
    const fields: FlatFieldChange[] = [];
    const sets: FlatChangeset[] = [];
    const jobs: FlatJob[] = [];

    if (!data) return { flatFieldChanges: fields, flatChangesets: sets, flatJobs: jobs };

    const processChangeset = (cs: Changeset, cg?: Changegroup) => {
      // Skip changesets with no field changes - nothing to review
      if (!cs.field_changes || cs.field_changes.length === 0) {
        return;
      }

      const entityDisplay = getEntityDisplayName(cs);
      const groupLabel = cg ? (cg.label || (cg.llm_job ? cg.llm_job.label || cg.llm_job.id : cg.source)) : 'Manual';
      const groupSource = cg ? cg.source : '';
      const groupId = cg ? cg.id : null;

      // Add to flatChangesets
      sets.push({
        ...cs,
        entity_display: entityDisplay,
        group_label: groupLabel,
        group_source: groupSource,
        group_id: groupId,
        field_count: cs.field_changes.length,
      });

      // Add to flatFieldChanges
      cs.field_changes.forEach(fc => {
        fields.push({
          ...fc,
          entity_type: cs.entity_type,
          entity_id: cs.entity_id,
          entity_display: entityDisplay,
          operation: cs.operation,
          group_label: groupLabel,
          group_source: groupSource,
          group_id: groupId,
          created_at: cs.created_at,
          created_by: cs.created_by,
        });
      });
    };

    // Process Changegroups
    data.changegroups.forEach(cg => {
      cg.changesets_by_type.forEach(et => {
        et.changesets.forEach(cs => processChangeset(cs, cg));
      });

      // Collect only changesets with field_changes for this job
      const reviewableChangesets: Changeset[] = [];
      const entityTypes = new Set<string>();
      cg.changesets_by_type.forEach(et => {
        et.changesets.forEach(cs => {
          if (cs.field_changes && cs.field_changes.length > 0) {
            reviewableChangesets.push(cs);
            entityTypes.add(et.entity_type);
          }
        });
      });

      // Only add job if it has reviewable changesets
      if (reviewableChangesets.length > 0) {
        jobs.push({
          id: cg.id,
          label: cg.label || (cg.llm_job ? cg.llm_job.label || cg.llm_job.id : cg.source),
          source: cg.source,
          description: cg.description,
          llm_job_id: cg.llm_job_id,
          llm_job_label: cg.llm_job?.label || null,
          status: cg.status,
          created_by: cg.created_by,
          created_at: cg.created_at,
          total_changesets: reviewableChangesets.length,
          approved_changesets: cg.approved_changesets,
          rejected_changesets: cg.rejected_changesets,
          entity_types: Array.from(entityTypes),
          changesets: reviewableChangesets,
        });
      }
    });

    // Process Ungrouped
    data.ungrouped_changesets_by_type.forEach(et => {
      et.changesets.forEach(cs => processChangeset(cs));
    });

    // Add ungrouped as a virtual job if there are any reviewable changesets
    const ungroupedChangesets: Changeset[] = [];
    const ungroupedEntityTypes = new Set<string>();
    data.ungrouped_changesets_by_type.forEach(et => {
      et.changesets.forEach(cs => {
        if (cs.field_changes && cs.field_changes.length > 0) {
          ungroupedChangesets.push(cs);
          ungroupedEntityTypes.add(et.entity_type);
        }
      });
    });
    if (ungroupedChangesets.length > 0) {
      jobs.push({
        id: 'ungrouped',
        label: 'Manual Changes',
        source: 'manual',
        description: null,
        llm_job_id: null,
        llm_job_label: null,
        status: 'pending',
        created_by: ungroupedChangesets[0]?.created_by || 'unknown',
        created_at: ungroupedChangesets[0]?.created_at || new Date().toISOString(),
        total_changesets: ungroupedChangesets.length,
        approved_changesets: 0,
        rejected_changesets: 0,
        entity_types: Array.from(ungroupedEntityTypes),
        changesets: ungroupedChangesets,
      });
    }

    return { flatFieldChanges: fields, flatChangesets: sets, flatJobs: jobs };
  }, [data]);

  // --- Filter Options ---
  const filterOptions = useMemo(() => {
    const entityTypes = new Set<string>();
    const operations = new Set<string>();
    const sources = new Set<string>();
    const jobs: Array<{ id: string; label: string }> = [];

    flatChangesets.forEach(cs => {
      entityTypes.add(cs.entity_type);
      operations.add(cs.operation);
      if (cs.group_source) sources.add(cs.group_source);
    });

    flatJobs.forEach(job => {
      sources.add(job.source);
      jobs.push({ id: job.id, label: job.label });
    });

    return {
      entityTypes: Array.from(entityTypes).sort(),
      operations: Array.from(operations).sort(),
      sources: Array.from(sources).sort(),
      jobs,
    };
  }, [flatChangesets, flatJobs]);

  // --- Filtered Lists ---
  const filteredFieldChanges = useMemo(() => {
    return flatFieldChanges.filter(fc => {
      // Text search
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const matches = 
          fc.entity_type.toLowerCase().includes(searchLower) ||
          fc.entity_display.toLowerCase().includes(searchLower) ||
          fc.field_name.toLowerCase().includes(searchLower) ||
          formatValue(fc.old_value).toLowerCase().includes(searchLower) ||
          formatValue(fc.new_value).toLowerCase().includes(searchLower) ||
          fc.group_label.toLowerCase().includes(searchLower);
        if (!matches) return false;
      }
      // Entity type filter
      if (filter.entityTypes.length > 0 && !filter.entityTypes.includes(fc.entity_type)) return false;
      // Operation filter
      if (filter.operations.length > 0 && !filter.operations.includes(fc.operation)) return false;
      // Source filter
      if (filter.sources.length > 0 && !filter.sources.includes(fc.group_source)) return false;
      // Job filter
      if (filter.jobIds.length > 0 && fc.group_id && !filter.jobIds.includes(fc.group_id)) return false;
      return true;
    });
  }, [flatFieldChanges, filter]);

  const filteredChangesets = useMemo(() => {
    return flatChangesets.filter(cs => {
      // Text search
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const fieldMatches = cs.field_changes.some(fc => 
          fc.field_name.toLowerCase().includes(searchLower) ||
          formatValue(fc.old_value).toLowerCase().includes(searchLower) ||
          formatValue(fc.new_value).toLowerCase().includes(searchLower)
        );
        const matches = 
          cs.entity_type.toLowerCase().includes(searchLower) ||
          cs.entity_display.toLowerCase().includes(searchLower) ||
          cs.group_label.toLowerCase().includes(searchLower) ||
          fieldMatches;
        if (!matches) return false;
      }
      // Entity type filter
      if (filter.entityTypes.length > 0 && !filter.entityTypes.includes(cs.entity_type)) return false;
      // Operation filter
      if (filter.operations.length > 0 && !filter.operations.includes(cs.operation)) return false;
      // Source filter
      if (filter.sources.length > 0 && !filter.sources.includes(cs.group_source)) return false;
      // Job filter
      if (filter.jobIds.length > 0 && cs.group_id && !filter.jobIds.includes(cs.group_id)) return false;
      return true;
    });
  }, [flatChangesets, filter]);

  const filteredJobs = useMemo(() => {
    return flatJobs.filter(job => {
      // Text search
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const matches = 
          job.label.toLowerCase().includes(searchLower) ||
          job.source.toLowerCase().includes(searchLower) ||
          (job.description?.toLowerCase().includes(searchLower) ?? false) ||
          job.entity_types.some(et => et.toLowerCase().includes(searchLower));
        if (!matches) return false;
      }
      // Entity type filter - job matches if any of its entity types match
      if (filter.entityTypes.length > 0 && !job.entity_types.some(et => filter.entityTypes.includes(et))) return false;
      // Source filter
      if (filter.sources.length > 0 && !filter.sources.includes(job.source)) return false;
      // Job filter
      if (filter.jobIds.length > 0 && !filter.jobIds.includes(job.id)) return false;
      return true;
    });
  }, [flatJobs, filter]);

  const hasActiveFilters = filter.search || filter.entityTypes.length > 0 || filter.operations.length > 0 || filter.sources.length > 0 || filter.jobIds.length > 0;
  const activeFilterCount = (filter.search ? 1 : 0) + filter.entityTypes.length + filter.operations.length + filter.sources.length + filter.jobIds.length;

  // Reset page when filters or view changes
  useEffect(() => {
    setPage(1);
  }, [filter, view]);

  // --- Paginated Lists ---
  const paginatedFieldChanges = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredFieldChanges.slice(start, start + pageSize);
  }, [filteredFieldChanges, page, pageSize]);

  const paginatedChangesets = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredChangesets.slice(start, start + pageSize);
  }, [filteredChangesets, page, pageSize]);

  const paginatedJobs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, page, pageSize]);

  // Pagination info
  const currentFilteredList = view === 'fields' ? filteredFieldChanges : view === 'changesets' ? filteredChangesets : filteredJobs;
  const totalItems = currentFilteredList.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  // Current page items for selection - cast to common base type for the hook
  const currentPageItems = useMemo((): Array<{ id: string }> => {
    return view === 'fields' ? paginatedFieldChanges : view === 'changesets' ? paginatedChangesets : paginatedJobs;
  }, [view, paginatedFieldChanges, paginatedChangesets, paginatedJobs]);

  // --- Selection Hook ---
  const selection = useTableSelection({
    pageItems: currentPageItems,
  });

  // Clear selection when view changes
  useEffect(() => {
    selection.clearSelection();
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Column Visibility & Resizing ---

  const currentColumns = useMemo(() => {
    const base = view === 'fields' ? FIELDS_COLUMNS : view === 'changesets' ? CHANGESETS_COLUMNS : JOBS_COLUMNS;
    const visibility = columnVisibility[view];
    return base.map(col => ({
      ...col,
      visible: visibility[col.key] ?? col.visible,
    }));
  }, [view, columnVisibility]);

  const visibleColumns = useMemo(() => {
    return currentColumns.filter(col => col.visible);
  }, [currentColumns]);

  const handleColumnVisibilityChange = useCallback((newVisibility: ColumnVisibilityState) => {
    setColumnVisibility(prev => ({
      ...prev,
      [view]: newVisibility,
    }));
    // Save to localStorage
    if (typeof window !== 'undefined') {
      const updated = { ...columnVisibility, [view]: newVisibility };
      localStorage.setItem('pending-changes-column-visibility', JSON.stringify(updated));
    }
  }, [view, columnVisibility]);

  const handleResetColumnVisibility = useCallback(() => {
    const defaultVis = getDefaultVisibility(view);
    setColumnVisibility(prev => ({
      ...prev,
      [view]: defaultVis,
    }));
  }, [view]);

  const handleColumnWidthChange = useCallback((columnKey: string, width: number) => {
    const newWidths = { ...columnWidths, [columnKey]: Math.max(50, width) };
    setColumnWidths(newWidths);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pending-changes-column-widths', JSON.stringify(newWidths));
    }
  }, [columnWidths]);

  const handleResetColumnWidths = useCallback(() => {
    setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pending-changes-column-widths');
    }
  }, []);

  const handleColumnResizeStart = useCallback((columnKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizingColumnRef.current = columnKey;

    const startX = e.clientX;
    const startWidth = columnWidths[columnKey] || DEFAULT_COLUMN_WIDTHS[columnKey] || 150;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      handleColumnWidthChange(columnKey, startWidth + diff);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizingColumnRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [columnWidths, handleColumnWidthChange]);

  const getColumnWidth = useCallback((columnKey: string) => {
    const width = columnWidths[columnKey] || DEFAULT_COLUMN_WIDTHS[columnKey] || 150;
    return `${width}px`;
  }, [columnWidths]);

  // Helper to check if a column is visible
  const isColumnVisible = useCallback((columnKey: string) => {
    return visibleColumns.some(col => col.key === columnKey);
  }, [visibleColumns]);

  // Render cell content based on column key and item
  const renderCellContent = useCallback((columnKey: string, item: FlatFieldChange | FlatChangeset | FlatJob) => {
    // Jobs view
    if (view === 'jobs') {
      const job = item as FlatJob;
      switch (columnKey) {
        case 'label':
          return (
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900">{job.label}</span>
              {job.description && (
                <span className="text-xs text-gray-500 truncate max-w-[200px]">{job.description}</span>
              )}
              {job.llm_job_id && (
                <span className="text-[10px] text-gray-400 font-mono">LLM Job: {job.llm_job_id.slice(0, 8)}...</span>
              )}
            </div>
          );
        case 'source':
          return <span className="text-xs font-semibold text-gray-500 uppercase">{job.source}</span>;
        case 'entityTypes':
          return (
            <div className="flex flex-wrap gap-1 max-w-[200px]">
              {job.entity_types.slice(0, 3).map(et => (
                <span key={et} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 uppercase">
                  {et}
                </span>
              ))}
              {job.entity_types.length > 3 && (
                <span className="text-[10px] text-gray-400">
                  +{job.entity_types.length - 3} more
                </span>
              )}
            </div>
          );
        case 'rows':
          return (
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900">{job.total_changesets}</span>
              {(job.approved_changesets > 0 || job.rejected_changesets > 0) && (
                <span className="text-[10px] text-gray-400">
                  {job.approved_changesets} approved, {job.rejected_changesets} rejected
                </span>
              )}
            </div>
          );
        case 'author':
          return (
            <div 
              className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold shadow-sm"
              title={formatUserName(job.created_by)}
            >
              {getInitials(job.created_by)}
            </div>
          );
        case 'date':
          return <span className="text-sm text-gray-500">{new Date(job.created_at).toLocaleDateString()}</span>;
        default:
          return null;
      }
    }

    // Fields and Changesets view
    const fc = item as FlatFieldChange | FlatChangeset;
    switch (columnKey) {
      case 'type':
        return <span className="text-xs font-semibold text-gray-500 uppercase">{fc.entity_type}</span>;
      case 'entity':
        return <span className="text-sm font-medium text-gray-900">{fc.entity_display}</span>;
      case 'op':
        return (
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getOperationColor(fc.operation)}`}>
            {fc.operation}
          </span>
        );
      case 'field':
        if (view === 'fields') {
          return <span className="text-sm font-mono text-blue-600 font-medium">{(item as FlatFieldChange).field_name}</span>;
        }
        return null;
      case 'oldValue':
        if (view === 'fields') {
          const val = formatValue((item as FlatFieldChange).old_value);
          return <span className="text-sm text-gray-500 truncate" title={val}>{val}</span>;
        }
        return null;
      case 'newValue':
        if (view === 'fields') {
          const val = formatValue((item as FlatFieldChange).new_value);
          return <span className="text-sm text-gray-900 font-medium truncate" title={val}>{val}</span>;
        }
        return null;
      case 'changes':
        if (view === 'changesets') {
          const cs = item as FlatChangeset;
          return (
            <div className="space-y-1">
              {cs.field_changes.map(f => (
                <div key={f.id} className="flex items-baseline gap-2 text-xs">
                  <span className="font-mono text-blue-600 flex-shrink-0">{f.field_name}</span>
                  <span className="text-gray-400 line-through whitespace-pre-wrap break-words">{formatValue(f.old_value)}</span>
                  <span className="text-gray-300 flex-shrink-0">→</span>
                  <span className="text-gray-900 whitespace-pre-wrap break-words">{formatValue(f.new_value)}</span>
                </div>
              ))}
            </div>
          );
        }
        return null;
      case 'source':
        return (
          <div className="flex flex-col">
            <span className="text-sm text-gray-700">{fc.group_label}</span>
            {fc.group_source && (
              <span className="text-[10px] text-gray-400 uppercase">{fc.group_source}</span>
            )}
          </div>
        );
      case 'author':
        return (
          <div 
            className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold shadow-sm"
            title={formatUserName(fc.created_by)}
          >
            {getInitials(fc.created_by)}
          </div>
        );
      case 'date':
        return <span className="text-sm text-gray-500">{new Date(fc.created_at).toLocaleDateString()}</span>;
      default:
        return null;
    }
  }, [view]);

  // --- Actions ---

  const updateFieldStatus = async (fieldChangeId: string, status: 'approved' | 'rejected') => {
    const fc = flatFieldChanges.find(x => x.id === fieldChangeId);
    if (!fc) return;

    // We need the changeset ID for the API call
    let changesetId = fc.changeset_id;

    try {
      const response = await fetch(`/api/changesets/${changesetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_change_id: fieldChangeId, status }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const commitChangeset = async (changesetId: string) => {
    try {
      const response = await fetch(`/api/changesets/${changesetId}/commit`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to commit');
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const commitChangegroup = async (changegroupId: string) => {
    try {
      const response = await fetch(`/api/changegroups/${changegroupId}/commit`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to commit changegroup');
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const handleSingleCommit = async (id: string) => {
    setIsCommitting(true);
    if (view === 'fields') {
      const success = await updateFieldStatus(id, 'approved');
      if (success) {
        // Find changeset to commit
        const fc = flatFieldChanges.find(x => x.id === id);
        if (fc) await commitChangeset(fc.changeset_id);
      }
    } else if (view === 'changesets') {
      // Approve all in changeset then commit
      try {
        await fetch(`/api/changesets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve_all' }),
        });
        await commitChangeset(id);
      } catch (err) {
        console.error(err);
      }
    } else if (view === 'jobs') {
      // Commit entire changegroup
      if (id === 'ungrouped') {
        // For ungrouped, commit each changeset individually
        const job = flatJobs.find(j => j.id === id);
        if (job) {
          for (const cs of job.changesets) {
            await fetch(`/api/changesets/${cs.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'approve_all' }),
            });
            await commitChangeset(cs.id);
          }
        }
      } else {
        await commitChangegroup(id);
      }
    }
    await fetchData();
    setIsCommitting(false);
  };

  const handleBulkCommit = async () => {
    setIsCommitting(true);
    const ids = Array.from(selection.selectedIds);
    for (const id of ids) {
      if (view === 'fields') {
        const fc = flatFieldChanges.find(x => x.id === id);
        if (fc) {
          await updateFieldStatus(id, 'approved');
          await commitChangeset(fc.changeset_id);
        }
      } else if (view === 'changesets') {
        await fetch(`/api/changesets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve_all' }),
        });
        await commitChangeset(id);
      } else if (view === 'jobs') {
        if (id === 'ungrouped') {
          const job = flatJobs.find(j => j.id === id);
          if (job) {
            for (const cs of job.changesets) {
              await fetch(`/api/changesets/${cs.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'approve_all' }),
              });
              await commitChangeset(cs.id);
            }
          }
        } else {
          await commitChangegroup(id);
        }
      }
    }
    selection.clearSelection();
    await fetchData();
    setIsCommitting(false);
  };

  const handleBulkReject = async () => {
    const ids = Array.from(selection.selectedIds);
    for (const id of ids) {
      if (view === 'fields') {
        await updateFieldStatus(id, 'rejected');
      } else if (view === 'changesets') {
        await fetch(`/api/changesets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject_all' }),
        });
      } else if (view === 'jobs') {
        // Reject all changesets in the job
        const job = flatJobs.find(j => j.id === id);
        if (job) {
          for (const cs of job.changesets) {
            await fetch(`/api/changesets/${cs.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'reject_all' }),
            });
          }
        }
      }
    }
    selection.clearSelection();
    await fetchData();
  };

  // --- Render ---

  if (isLoading && !data) {
    return <LoadingSpinner fullPage size="page" />;
  }

  if (error) {
    return (
      <div className="text-center py-24 bg-white rounded-2xl shadow-sm border border-gray-100">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={fetchData} className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
          Try Again
        </button>
      </div>
    );
  }

  const currentList = view === 'fields' ? paginatedFieldChanges : view === 'changesets' ? paginatedChangesets : paginatedJobs;
  const hasPending = data && data.total_pending_changesets > 0;

  return (
    <div className="space-y-6">
      {/* Unread Messages Panel */}
      <UnreadCommentsPanel 
        key={unreadKey}
        onChangesetClick={handleUnreadChangesetClick}
        onRefresh={() => setUnreadKey(k => k + 1)}
      />

      {/* Comments Modal/Drawer */}
      {expandedComments && (() => {
        const changeset = flatChangesets.find(cs => cs.id === expandedComments);
        return (
          <Modal
            isOpen={true}
            onClose={() => setExpandedComments(null)}
            title="Discussion"
            maxWidth="4xl"
            className="shadow-2xl"
            scrollable={false}
          >
            {/* Change Summary */}
            {changeset && (
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{changeset.entity_type}</span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getOperationColor(changeset.operation)}`}>
                    {changeset.operation}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{changeset.entity_display}</span>
                </div>
                
                {/* Field changes summary */}
                {changeset.field_changes.length > 0 && (
                  <div className="space-y-2">
                    {changeset.field_changes.slice(0, 4).map(fc => (
                      <div key={fc.id} className="flex items-start gap-3 text-sm">
                        <span className="font-mono text-blue-600 font-medium min-w-[120px] flex-shrink-0">{fc.field_name}</span>
                        <span className="text-gray-400 line-through break-all">
                          {formatValue(fc.old_value)}
                        </span>
                        <span className="text-gray-400 flex-shrink-0">→</span>
                        <span className="text-gray-900 font-medium break-all">
                          {formatValue(fc.new_value)}
                        </span>
                      </div>
                    ))}
                    {changeset.field_changes.length > 4 && (
                      <p className="text-xs text-gray-400">+{changeset.field_changes.length - 4} more fields</p>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Comments Board */}
            <div className="flex-1 overflow-hidden">
              <ChangeCommentsBoard 
                changesetId={expandedComments}
                maxHeight={450}
                onCommentsChange={() => {
                  // Refresh unread status
                  setUnreadKey(k => k + 1);
                }}
              />
            </div>
          </Modal>
        );
      })()}

      {/* Detail Modal */}
      {selectedDetail && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedDetail(null)}
          title={
            selectedDetail.type === 'field' 
              ? <span className="flex items-center gap-2">
                  <span className="font-mono text-blue-600">{(selectedDetail.item as FlatFieldChange).field_name}</span>
                  <span className="text-gray-400 font-normal">on</span>
                  <span>{(selectedDetail.item as FlatFieldChange).entity_display}</span>
                </span>
              : selectedDetail.type === 'changeset'
              ? <span className="flex items-center gap-2">
                  <span>{(selectedDetail.item as FlatChangeset).entity_display}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${getOperationColor((selectedDetail.item as FlatChangeset).operation)}`}>
                    {(selectedDetail.item as FlatChangeset).operation}
                  </span>
                </span>
              : (selectedDetail.item as FlatJob).label
          }
          maxWidth="lg"
          footer={
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {formatUserName(selectedDetail.item.created_by)} · {new Date(selectedDetail.item.created_at).toLocaleDateString()}
              </span>
              <button
                onClick={() => {
                  handleSingleCommit(selectedDetail.item.id);
                  setSelectedDetail(null);
                }}
                disabled={isCommitting}
                className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                Commit
              </button>
            </div>
          }
        >
          <div className="px-5 py-4">
            {selectedDetail.type === 'field' && (() => {
              const fc = selectedDetail.item;
              return (
                <div className="space-y-3">
                  <div className="text-sm text-gray-500 line-through">{formatValue(fc.old_value)}</div>
                  <div className="text-sm text-gray-900">{formatValue(fc.new_value)}</div>
                </div>
              );
            })()}

            {selectedDetail.type === 'changeset' && (() => {
              const cs = selectedDetail.item;
              return (
                <div className="space-y-2">
                  {cs.field_changes.map(fc => (
                    <div key={fc.id} className="flex items-baseline gap-3 text-sm">
                      <span className="font-mono text-blue-600 w-28 flex-shrink-0 truncate">{fc.field_name}</span>
                      <span className="text-gray-400 line-through truncate flex-1">{formatValue(fc.old_value)}</span>
                      <span className="text-gray-300">→</span>
                      <span className="text-gray-900 truncate flex-1">{formatValue(fc.new_value)}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {selectedDetail.type === 'job' && (() => {
              const job = selectedDetail.item;
              return (
                <div className="space-y-3">
                  <div className="text-sm text-gray-500">
                    {job.total_changesets} rows · {job.entity_types.join(', ')}
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {job.changesets.map(cs => (
                      <div key={cs.id} className="text-sm flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          cs.operation === 'create' ? 'bg-green-500' :
                          cs.operation === 'delete' ? 'bg-red-500' : 'bg-blue-500'
                        }`} />
                        <span className="text-gray-900 truncate">{getEntityDisplayName(cs)}</span>
                        <span className="text-gray-400 text-xs">{cs.field_changes.length} fields</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* Table Container - matching DataTable styling */}
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Toolbar - matching DataTable layout */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          {/* View Toggle Row */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-600 mr-2">View:</span>
              <div className="inline-flex rounded-xl border border-gray-300 bg-white overflow-hidden">
                <button
                  onClick={() => setView('fields')}
                  className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    view === 'fields'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Value
                </button>
                <button
                  onClick={() => setView('changesets')}
                  className={`px-4 py-2 text-sm font-medium border-l border-r border-gray-300 transition-colors cursor-pointer ${
                    view === 'changesets'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Row
                </button>
                <button
                  onClick={() => setView('jobs')}
                  className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    view === 'jobs'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Job
                </button>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              {hasActiveFilters ? (
                <>
                  <span className="font-medium text-blue-600">{totalItems}</span>
                  {' of '}
                </>
              ) : null}
              {data?.total_pending_changesets || 0} rows across {data?.total_changegroups || 0} groups
            </div>
          </div>

          {/* Main Controls Row */}
          <div className="flex flex-wrap gap-4 items-center justify-between">
            {/* Left side: Filters, Columns, Reset Widths */}
            <div className="flex items-center gap-3">
              {/* Filter Button with Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors cursor-pointer ${
                    hasActiveFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white text-gray-700'
                  }`}
                >
                  <FunnelIcon className="w-4 h-4" />
                  <span>Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5 min-w-[1.25rem] text-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                {/* Filter Dropdown Panel */}
                {isFilterOpen && (
                  <div className="absolute top-full left-0 mt-2 w-[32rem] bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FunnelIcon className="w-5 h-5 text-gray-600" />
                        <h3 className="font-semibold text-gray-900">Filters</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasActiveFilters && (
                          <button
                            onClick={() => setFilter(defaultFilter)}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                          >
                            Clear all
                          </button>
                        )}
                        <button
                          onClick={() => setIsFilterOpen(false)}
                          className="text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                          <XMarkIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Filter Content */}
                    <div className="max-h-[24rem] overflow-y-auto p-6 space-y-6">
                      {/* Entity Type Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Entity Type</label>
                        <div className="flex flex-wrap gap-2">
                          {filterOptions.entityTypes.map(et => (
                            <button
                              key={et}
                              onClick={() => setFilter(f => ({
                                ...f,
                                entityTypes: f.entityTypes.includes(et)
                                  ? f.entityTypes.filter(x => x !== et)
                                  : [...f.entityTypes, et]
                              }))}
                              className={`px-3 py-1 text-sm font-medium rounded-xl transition-colors cursor-pointer ${
                                filter.entityTypes.includes(et)
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                              }`}
                            >
                              {et}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Operation Filter */}
                      {view !== 'jobs' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Operation</label>
                          <div className="flex flex-wrap gap-2">
                            {filterOptions.operations.map(op => (
                              <button
                                key={op}
                                onClick={() => setFilter(f => ({
                                  ...f,
                                  operations: f.operations.includes(op)
                                    ? f.operations.filter(x => x !== op)
                                    : [...f.operations, op]
                                }))}
                                className={`px-3 py-1 text-sm font-medium rounded-xl transition-colors cursor-pointer ${
                                  filter.operations.includes(op)
                                    ? op === 'create' ? 'bg-green-100 text-green-800 border border-green-200'
                                    : op === 'update' ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : 'bg-red-100 text-red-800 border border-red-200'
                                    : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                                }`}
                              >
                                {op}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Source Filter */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
                        <div className="flex flex-wrap gap-2">
                          {filterOptions.sources.map(src => (
                            <button
                              key={src}
                              onClick={() => setFilter(f => ({
                                ...f,
                                sources: f.sources.includes(src)
                                  ? f.sources.filter(x => x !== src)
                                  : [...f.sources, src]
                              }))}
                              className={`px-3 py-1 text-sm font-medium rounded-xl transition-colors cursor-pointer ${
                                filter.sources.includes(src)
                                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                  : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                              }`}
                            >
                              {src}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Job Filter */}
                      {filterOptions.jobs.length > 0 && view !== 'jobs' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Job</label>
                          <select
                            value={filter.jobIds.length === 1 ? filter.jobIds[0] : ''}
                            onChange={(e) => setFilter(f => ({
                              ...f,
                              jobIds: e.target.value ? [e.target.value] : []
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                          >
                            <option value="">All jobs</option>
                            {filterOptions.jobs.map(job => (
                              <option key={job.id} value={job.id}>{job.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Footer with active filter count */}
                    {hasActiveFilters && (
                      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">
                            {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
                          </span>
                          <span className="text-sm text-gray-500">
                            Showing {currentList.length} of {view === 'fields' ? flatFieldChanges.length : view === 'changesets' ? flatChangesets.length : flatJobs.length} items
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Column Visibility */}
              <ColumnVisibilityPanel
                isOpen={isColumnPanelOpen}
                onToggle={() => setIsColumnPanelOpen(!isColumnPanelOpen)}
                columns={currentColumns}
                onColumnVisibilityChange={handleColumnVisibilityChange}
                onResetToDefaults={handleResetColumnVisibility}
              />

              {/* Reset Widths */}
              <button
                onClick={handleResetColumnWidths}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Reset Widths
              </button>
            </div>

            {/* Right side: Selection Actions, Search, Refresh, Show */}
            <div className="flex items-center gap-3">
              {/* Selection Actions */}
              {selection.selectedCount > 0 && (
                <div className="flex items-center gap-2 border-r border-gray-300 pr-3">
                  <span className="text-sm text-gray-600">{selection.selectedCount} selected</span>
                  <button
                    onClick={handleBulkCommit}
                    disabled={isCommitting}
                    className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-green-700 bg-green-100 border border-green-200 rounded-xl hover:bg-green-200 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <CheckIcon className="w-4 h-4" />
                    Commit
                  </button>
                  <button
                    onClick={handleBulkReject}
                    disabled={isCommitting}
                    className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-red-700 bg-red-100 border border-red-200 rounded-xl hover:bg-red-200 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <XMarkIcon className="w-4 h-4" />
                    Reject
                  </button>
                  <button
                    onClick={() => selection.clearSelection()}
                    className="text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Search Box */}
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search changes..."
                  value={filter.search}
                  onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))}
                  className="pl-9 pr-3 py-2 w-56 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                />
              </div>

              {/* Refresh Button */}
              <button
                onClick={fetchData}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer disabled:opacity-50"
                title="Refresh data"
              >
                {isLoading ? (
                  <LoadingSpinner size="sm" noPadding />
                ) : (
                  <ArrowPathIcon className="w-4 h-4" />
                )}
                Refresh
              </button>

              {/* Page Size Selector (Show) */}
              <PageSizeSelector
                isOpen={isPageSizeSelectorOpen}
                onToggle={() => setIsPageSizeSelectorOpen(!isPageSizeSelectorOpen)}
                pageSize={pageSize}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                totalItems={totalItems}
              />
            </div>
          </div>
        </div>

        {/* Table Content */}
        {!hasPending ? (
          <EmptyState
            icon={<CheckCircleIcon className="h-24 w-24 mx-auto mb-4" />}
            title="All Clear!"
            description="No pending changes to review."
          />
        ) : currentList.length === 0 ? (
          <EmptyState
            title="No matching changes"
            description="Try adjusting your filters"
          />
        ) : (
          <div className={`overflow-x-auto ${isResizing ? 'select-none' : ''}`}>
            <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 w-12 text-center border-b border-gray-200 bg-gray-50" style={{ width: '48px' }}>
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={selection.selectAll}
                      onChange={selection.toggleSelectAll}
                    />
                  </th>
                  {visibleColumns.map((column) => (
                    <th
                      key={column.key}
                      className="relative px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 border-r border-r-gray-100 bg-gray-50"
                      style={{ width: getColumnWidth(column.key), minWidth: '50px' }}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {column.label}
                      </div>
                      {/* Resize handle */}
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-200 bg-transparent group"
                        onMouseDown={(e) => handleColumnResizeStart(column.key, e)}
                      >
                        <div className="w-px h-full bg-gray-200 group-hover:bg-blue-400 ml-auto"></div>
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 text-right bg-gray-50" style={{ width: '100px' }}>Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentList.map((item) => {
                  const isSelected = selection.isSelected(item.id);
                  
                  // Unified rendering for all views using dynamic columns
                  const handleRowClick = () => {
                    if (view === 'jobs') {
                      setSelectedDetail({ type: 'job', item: item as FlatJob });
                    } else if (view === 'fields') {
                      setSelectedDetail({ type: 'field', item: item as FlatFieldChange });
                    } else {
                      setSelectedDetail({ type: 'changeset', item: item as FlatChangeset });
                    }
                  };

                  return (
                    <tr 
                      key={item.id} 
                      className={`${isSelected ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'} transition-colors cursor-pointer`}
                      onClick={handleRowClick}
                    >
                      <td className="px-4 py-4 whitespace-nowrap" style={{ width: '48px' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={isSelected}
                          onChange={() => selection.toggleSelect(item.id)}
                        />
                      </td>
                      {visibleColumns.map((column) => (
                        <td 
                          key={column.key} 
                          className="px-4 py-4 align-top overflow-hidden"
                          style={{ width: getColumnWidth(column.key), maxWidth: getColumnWidth(column.key) }}
                        >
                          {renderCellContent(column.key, item)}
                        </td>
                      ))}
                      <td className="px-4 py-4 text-right align-top" style={{ width: '100px' }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {/* Comments Button */}
                          {(() => {
                            // For fields view, use changeset_id; for changesets view, use item.id
                            const csId = view === 'fields' 
                              ? (item as FlatFieldChange).changeset_id 
                              : item.id;
                            return (
                              <button
                                onClick={() => setExpandedComments(csId)}
                                className={`p-1.5 rounded-lg transition-colors relative ${
                                  unreadChangesetIds.has(csId)
                                    ? 'text-amber-600 hover:bg-amber-50'
                                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                                }`}
                                title="Discussion"
                              >
                                <ChatBubbleLeftIcon className="w-5 h-5" />
                                {unreadChangesetIds.has(csId) && (
                                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-white" />
                                )}
                              </button>
                            );
                          })()}
                          <button
                            onClick={() => handleSingleCommit(item.id)}
                            disabled={isCommitting}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Commit"
                          >
                            <CheckIcon className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => { /* Implement single reject */ }}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Reject"
                          >
                            <XMarkIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
          loading={isLoading}
          itemLabel={view === 'fields' ? 'value changes' : view === 'changesets' ? 'rows' : 'jobs'}
        />
      </div>
    </div>
  );
}
