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
import { Modal, EmptyState, ConflictDialog } from './ui';
import type { ConflictError } from './ui';
import { useTableSelection } from '@/hooks/useTableSelection';
import { refreshPendingChangesCount } from '@/hooks/usePendingChangesCount';
import ContextSection from '@/components/pending/ContextSection';

// --- Types ---

interface FieldChange {
  id: string;
  changeset_id: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  old_display?: string;
  new_display?: string;
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
  changesets: Changeset[];
}

interface LlmJobGroup {
  type: 'llm_job';
  llm_job_id: string;
  llm_job: {
    id: string;
    label: string | null;
    status: string;
    submitted_by: string | null;
  } | null;
  changesets_by_type: ChangesetsByType[];
  total_changesets: number;
}

interface ManualGroup {
  type: 'manual';
  created_by: string;
  changesets_by_type: ChangesetsByType[];
  total_changesets: number;
}

type ChangeGroup = LlmJobGroup | ManualGroup;

interface PendingChangesData {
  groups: ChangeGroup[];
  total_pending_changesets: number;
}

interface FlatChangeset extends Omit<Changeset, 'field_changes'> {
  entity_display: string;
  group_label: string;
  group_source: string;
  group_id: string | null;
  field_count: number;
  field_changes: FieldChange[];
}

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

function parseFrameRolesFieldName(fieldName: string): { roleType: string; field: string } | null {
  if (!fieldName.startsWith('frame_roles.')) return null;
  const parts = fieldName.split('.');
  if (parts.length < 3) return null;
  const roleType = parts[1];
  const field = parts.slice(2).join('.');
  if (!roleType || !field) return null;
  return { roleType, field };
}

function formatFieldName(fieldName: string, opts?: { short?: boolean }): string {
  const parsed = parseFrameRolesFieldName(fieldName);
  if (!parsed) return fieldName;
  if (opts?.short) {
    return parsed.field === '__exists' ? 'role' : parsed.field;
  }
  if (parsed.field === '__exists') {
    return `frame_roles ▸ ${parsed.roleType} ▸ role`;
  }
  return `frame_roles ▸ ${parsed.roleType} ▸ ${parsed.field}`;
}

function formatFieldChangeValue(fc: FieldChange, which: 'old' | 'new'): string {
  const parsed = parseFrameRolesFieldName(fc.field_name);
  if (parsed?.field === '__exists') {
    const oldExists = typeof fc.old_value === 'boolean' ? fc.old_value : Boolean(fc.old_value);
    const newExists = typeof fc.new_value === 'boolean' ? fc.new_value : Boolean(fc.new_value);
    if (which === 'old') return oldExists ? 'present' : 'absent';
    if (!oldExists && newExists) return 'added';
    if (oldExists && !newExists) return 'removed';
    return newExists ? 'present' : 'absent';
  }
  const display = which === 'old' ? fc.old_display : fc.new_display;
  if (typeof display === 'string' && display.trim() !== '') return display;
  return formatValue(which === 'old' ? fc.old_value : fc.new_value);
}

function getEntityDisplayName(changeset: Changeset): string {
  const snapshot = changeset.before_snapshot || changeset.after_snapshot;
  if (snapshot) {
    // For frames, show label (id); for verbs/nouns/adjectives/adverbs, show code
    if (changeset.entity_type === 'frame') {
      const label = snapshot.label;
      const id = changeset.entity_id;
      if (label && id) {
        const truncatedLabel = String(label).substring(0, 25) + (String(label).length > 25 ? '...' : '');
        return `${truncatedLabel} (${id})`;
      } else if (label) {
        return `${String(label).substring(0, 30)}${String(label).length > 30 ? '...' : ''}`;
      }
    } else {
      // verbs, nouns, adjectives, adverbs - use code
      const code = snapshot.code;
      if (code) return `${String(code).substring(0, 30)}${String(code).length > 30 ? '...' : ''}`;
    }
  }
  return changeset.entity_id ? `#${changeset.entity_id}` : 'New';
}

function getOperationColor(operation: string): string {
  switch (operation) {
    case 'create': return 'bg-green-100 text-green-800';
    case 'update': return 'bg-blue-100 text-blue-600';
    case 'delete': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatUserName(user: string | null): string {
  if (!user) return 'Unknown';
  if (user === 'current-user') return 'Current user';
  if (user === 'system:llm-agent') return 'LLM Agent';
  if (user.includes('@')) return capitalizeFirst(user.split('@')[0]);
  return capitalizeFirst(user);
}

function getInitials(user: string | null): string {
  const formatted = formatUserName(user);
  if (formatted === 'System' || formatted === 'LLM Agent') return formatted[0];
  if (formatted === 'unknown') return '?';
  return formatted.slice(0, 2).toUpperCase();
}

// --- Column Configuration ---

const COLUMNS: ColumnConfig[] = [
  { key: 'type', label: 'Type', visible: true },
  { key: 'entity', label: 'Entity', visible: true },
  { key: 'op', label: 'Op', visible: true },
  { key: 'changes', label: 'Changes', visible: true },
  { key: 'source', label: 'Source / Job', visible: true },
  { key: 'author', label: 'Author', visible: true },
  { key: 'date', label: 'Date', visible: true },
];

// Default column widths
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  type: 80,
  entity: 180,
  op: 70,
  changes: 500,
  source: 150,
  author: 50,
  date: 100,
};

function getDefaultVisibility(): ColumnVisibilityState {
  const visibility: ColumnVisibilityState = {};
  COLUMNS.forEach(col => {
    visibility[col.key] = col.visible;
  });
  return visibility;
}

// --- Component ---

export default function PendingChangesList({ onRefresh }: PendingChangesListProps) {
  const [data, setData] = useState<PendingChangesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [committingAction, setCommittingAction] = useState<'commit' | 'reject' | null>(null);
  const isCommitting = committingAction !== null;
  const [error, setError] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [unreadChangesetIds, setUnreadChangesetIds] = useState<Set<string>>(new Set());
  const [unreadKey, setUnreadKey] = useState(0);
  const [selectedDetail, setSelectedDetail] = useState<FlatChangeset | null>(null);
  const [detailTab, setDetailTab] = useState<'review' | 'discussion'>('review');
  const [filter, setFilter] = useState<PendingChangesFilter>(defaultFilter);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [isPageSizeSelectorOpen, setIsPageSizeSelectorOpen] = useState(false);
  const jobDropdownContainerRef = useRef<HTMLDivElement>(null);
  
  // Column visibility and width state
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pending-changes-column-visibility');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Handle migration from old format (which had nested views)
          if (parsed.changesets) {
            return parsed.changesets;
          }
          return parsed;
        } catch {}
      }
    }
    return getDefaultVisibility();
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
  
  // Conflict dialog state
  const [conflictDialog, setConflictDialog] = useState<{
    isOpen: boolean;
    errors: ConflictError[];
    changesetId: string | null;
    entityDisplay: string | null;
  }>({ isOpen: false, errors: [], changesetId: null, entityDisplay: null });
  const [isDiscarding, setIsDiscarding] = useState(false);
  
  // Track field change statuses in the detail modal (for optimistic updates)
  const [detailFieldChanges, setDetailFieldChanges] = useState<FieldChange[]>([]);
  const [isUpdatingField, setIsUpdatingField] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/changesets/pending');
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
      data.groups.forEach(group => {
        group.changesets_by_type.forEach(et => {
          et.changesets.forEach(cs => allChangesetIds.push(cs.id));
        });
      });
      fetchUnreadStatus(allChangesetIds);
    }
  }, [data, fetchUnreadStatus]);

  // Sync detail field changes when selectedDetail changes
  useEffect(() => {
    if (selectedDetail) {
      setDetailFieldChanges(selectedDetail.field_changes);
      setDetailTab('review');
    } else {
      setDetailFieldChanges([]);
    }
  }, [selectedDetail]);

  // Handler for updating individual field change status
  const handleFieldChangeStatus = async (fieldChangeId: string, status: 'approved' | 'rejected') => {
    if (!selectedDetail) return;
    
    setIsUpdatingField(fieldChangeId);
    try {
      const response = await fetch(`/api/changesets/${selectedDetail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_change_id: fieldChangeId, status }),
      });
      
      if (!response.ok) throw new Error('Failed to update field change');
      
      const result = await response.json();
      
      // Update local state optimistically
      setDetailFieldChanges(prev => 
        prev.map(fc => 
          fc.id === fieldChangeId 
            ? { ...fc, status } 
            : fc
        )
      );
      
      // If changeset was auto-discarded (all fields rejected), close modal and refresh
      if (result.changeset_discarded) {
        setSelectedDetail(null);
        await fetchData();
        refreshPendingChangesCount();
      }
    } catch (err) {
      console.error('Failed to update field change:', err);
    } finally {
      setIsUpdatingField(null);
    }
  };

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

  const flatChangesets = useMemo(() => {
    const sets: FlatChangeset[] = [];

    if (!data) return sets;

    const processChangeset = (cs: Changeset, group?: ChangeGroup) => {
      // Skip changesets with no field changes - nothing to review
      // UNLESS it's a delete or create operation (these have no field_changes by design)
      if (!cs.field_changes || cs.field_changes.length === 0) {
        if (cs.operation !== 'delete' && cs.operation !== 'create') {
          return;
        }
      }

      const entityDisplay = getEntityDisplayName(cs);
      let groupLabel: string;
      let groupSource: string;
      let groupId: string | null;
      
      if (group) {
        if (group.type === 'llm_job') {
          groupLabel = group.llm_job?.label || `LLM Job ${group.llm_job_id}`;
          groupSource = 'llm_job';
          groupId = group.llm_job_id;
        } else {
          groupLabel = `${formatUserName(group.created_by)}'s manual work`;
          groupSource = 'manual';
          groupId = group.created_by;
        }
      } else {
        groupLabel = 'Manual work';
        groupSource = 'manual';
        groupId = null;
      }

      // Count pending field changes for display
      const pendingFieldCount = cs.field_changes.filter(fc => fc.status === 'pending').length;
      sets.push({
        ...cs,
        entity_display: entityDisplay,
        group_label: groupLabel,
        group_source: groupSource,
        group_id: groupId,
        field_count: pendingFieldCount,
      });
    };

    // Process all groups (both LLM jobs and manual user groups)
    data.groups.forEach(group => {
      group.changesets_by_type.forEach(et => {
        et.changesets.forEach(cs => processChangeset(cs, group));
      });
    });

    return sets;
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
      if (cs.group_id && cs.group_source === 'llm_job') {
        if (!jobs.some(j => j.id === cs.group_id)) {
          jobs.push({ id: cs.group_id!, label: cs.group_label });
        }
      }
    });

    return {
      entityTypes: Array.from(entityTypes).sort(),
      operations: Array.from(operations).sort(),
      sources: Array.from(sources).sort(),
      jobs,
    };
  }, [flatChangesets]);

  const filteredJobs = useMemo(() => {
    if (!jobSearchQuery) return filterOptions.jobs;
    const query = jobSearchQuery.toLowerCase();
    return filterOptions.jobs.filter(job => {
      if (filter.jobIds.includes(job.id)) return true;
      return job.label.toLowerCase().includes(query) || job.id.includes(query);
    });
  }, [filterOptions.jobs, jobSearchQuery, filter.jobIds]);

  // --- Filtered List ---
  const filteredChangesets = useMemo(() => {
    return flatChangesets.filter(cs => {
      // Text search
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const fieldMatches = cs.field_changes.some(fc => 
          formatFieldName(fc.field_name).toLowerCase().includes(searchLower) ||
          fc.field_name.toLowerCase().includes(searchLower) ||
          formatFieldChangeValue(fc, 'old').toLowerCase().includes(searchLower) ||
          formatFieldChangeValue(fc, 'new').toLowerCase().includes(searchLower)
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

  const hasActiveFilters = filter.search || filter.entityTypes.length > 0 || filter.operations.length > 0 || filter.sources.length > 0 || filter.jobIds.length > 0;
  const activeFilterCount = (filter.search ? 1 : 0) + filter.entityTypes.length + filter.operations.length + filter.sources.length + filter.jobIds.length;

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [filter]);

  // Close job dropdown on outside click (mimics the lexical-units FilterPanel "Frame ID" UX)
  useEffect(() => {
    if (!jobDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        jobDropdownContainerRef.current &&
        !jobDropdownContainerRef.current.contains(event.target as Node)
      ) {
        setJobDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [jobDropdownOpen]);

  // --- Paginated List ---
  const paginatedChangesets = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredChangesets.slice(start, start + pageSize);
  }, [filteredChangesets, page, pageSize]);

  // Pagination info
  const totalItems = filteredChangesets.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  // --- Selection Hook ---
  const selection = useTableSelection({
    pageItems: paginatedChangesets,
  });

  // --- Column Visibility & Resizing ---

  const currentColumns = useMemo(() => {
    return COLUMNS.map(col => ({
      ...col,
      visible: columnVisibility[col.key] ?? col.visible,
    }));
  }, [columnVisibility]);

  const visibleColumns = useMemo(() => {
    return currentColumns.filter(col => col.visible);
  }, [currentColumns]);

  const handleColumnVisibilityChange = useCallback((newVisibility: ColumnVisibilityState) => {
    setColumnVisibility(newVisibility);
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('pending-changes-column-visibility', JSON.stringify(newVisibility));
    }
  }, []);

  const handleResetColumnVisibility = useCallback(() => {
    const defaultVis = getDefaultVisibility();
    setColumnVisibility(defaultVis);
  }, []);

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

  // Render cell content based on column key
  const renderCellContent = useCallback((columnKey: string, cs: FlatChangeset) => {
    switch (columnKey) {
      case 'type':
        return <span className="text-xs font-semibold text-gray-500 uppercase">{cs.entity_type}</span>;
      case 'entity':
        return <span className="text-sm font-medium text-gray-900">{cs.entity_display}</span>;
      case 'op':
        return (
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getOperationColor(cs.operation)}`}>
            {cs.operation}
          </span>
        );
      case 'changes':
        // Handle delete operations - show what's being deleted
        if (cs.operation === 'delete') {
          const snapshot = cs.before_snapshot;
          return (
            <div className="space-y-1">
              <span className="text-xs text-red-600 font-semibold">Entire entity will be deleted</span>
              {snapshot && (
                <div className="text-xs text-gray-500 mt-1">
                  {Object.entries(snapshot)
                    .filter(([key]) => !['id', 'created_at', 'updated_at', 'version', 'deleted'].includes(key))
                    .slice(0, 4)
                    .map(([key, value]) => (
                      <div key={key} className="truncate">
                        <span className="font-mono text-gray-400">{key}:</span>{' '}
                        <span className="text-gray-500">{formatValue(value)}</span>
                      </div>
                    ))}
                  {Object.keys(snapshot).filter(k => !['id', 'created_at', 'updated_at', 'version', 'deleted'].includes(k)).length > 4 && (
                    <span className="text-gray-400">...</span>
                  )}
                </div>
              )}
            </div>
          );
        }
        
        // Handle create operations - show what's being created
        if (cs.operation === 'create') {
          const snapshot = cs.after_snapshot;
          return (
            <div className="space-y-1">
              <span className="text-xs text-green-600 font-semibold">New entity will be created</span>
              {snapshot && (
                <div className="text-xs text-gray-500 mt-1">
                  {Object.entries(snapshot)
                    .filter(([key]) => !['id', 'created_at', 'updated_at', 'version', 'deleted'].includes(key))
                    .slice(0, 4)
                    .map(([key, value]) => (
                      <div key={key} className="truncate">
                        <span className="font-mono text-gray-400">{key}:</span>{' '}
                        <span className="text-gray-900">{formatValue(value)}</span>
                      </div>
                    ))}
                  {Object.keys(snapshot).filter(k => !['id', 'created_at', 'updated_at', 'version', 'deleted'].includes(k)).length > 4 && (
                    <span className="text-gray-400">...</span>
                  )}
                </div>
              )}
            </div>
          );
        }
        
        // Handle update operations with field changes
        const pendingChanges = cs.field_changes.filter(f => f.status === 'pending');
        const approvedCount = cs.field_changes.filter(f => f.status === 'approved').length;
        const rejectedCount = cs.field_changes.filter(f => f.status === 'rejected').length;
        return (
          <div className="space-y-1">
            {/* Show counts of approved/rejected if any */}
            {(approvedCount > 0 || rejectedCount > 0) && (
              <div className="flex gap-2 text-[10px] mb-1">
                {approvedCount > 0 && (
                  <span className="text-green-600 font-medium">{approvedCount} approved</span>
                )}
                {rejectedCount > 0 && (
                  <span className="text-red-600 font-medium">{rejectedCount} rejected</span>
                )}
              </div>
            )}
            {/* Only show pending field changes */}
            {pendingChanges.map(f => (
              <div key={f.id} className="flex items-baseline gap-2 text-xs">
                <span className="font-mono text-blue-600 flex-shrink-0">{formatFieldName(f.field_name)}</span>
                <span className="text-gray-400 line-through whitespace-pre-wrap break-words">{formatFieldChangeValue(f, 'old')}</span>
                <span className="text-gray-300 flex-shrink-0">→</span>
                <span className="text-gray-900 whitespace-pre-wrap break-words">{formatFieldChangeValue(f, 'new')}</span>
              </div>
            ))}
            {pendingChanges.length === 0 && (approvedCount > 0 || rejectedCount > 0) && (
              <span className="text-xs text-gray-400 italic">All fields reviewed</span>
            )}
          </div>
        );
      case 'source':
        return (
          <div className="flex flex-col">
            <span className="text-sm text-gray-700">{cs.group_label}</span>
            {cs.group_source && (
              <span className="text-[10px] text-gray-400 uppercase">{cs.group_source}</span>
            )}
          </div>
        );
      case 'author':
        return (
          <div className="flex justify-start">
            <div 
              className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold shadow-sm"
              title={formatUserName(cs.created_by)}
            >
              {getInitials(cs.created_by)}
            </div>
          </div>
        );
      case 'date':
        return <span className="text-sm text-gray-500">{new Date(cs.created_at).toLocaleDateString()}</span>;
      default:
        return null;
    }
  }, []);

  // --- Actions ---

  const commitChangeset = async (changesetId: string, entityDisplay?: string): Promise<{ success: boolean; conflict?: boolean }> => {
    try {
      const response = await fetch(`/api/changesets/${changesetId}/commit`, {
        method: 'POST',
      });
      
      if (response.status === 409) {
        // Version conflict
        const result = await response.json();
        setConflictDialog({
          isOpen: true,
          errors: result.errors || [],
          changesetId,
          entityDisplay: entityDisplay || null,
        });
        return { success: false, conflict: true };
      }
      
      if (!response.ok) throw new Error('Failed to commit');
      return { success: true };
    } catch (err) {
      console.error(err);
      return { success: false };
    }
  };

  const handleSingleCommit = async (id: string) => {
    setCommittingAction('commit');
    const changeset = flatChangesets.find(cs => cs.id === id);
    try {
      await fetch(`/api/changesets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_all' }),
      });
      const result = await commitChangeset(id, changeset?.entity_display);
      if (result.conflict) {
        // Conflict dialog is shown, don't refresh data yet
        setCommittingAction(null);
        return;
      }
    } catch (err) {
      console.error(err);
    }
    await fetchData();
    refreshPendingChangesCount();
    setCommittingAction(null);
  };

  const handleBulkCommit = async () => {
    setCommittingAction('commit');
    const ids = Array.from(selection.selectedIds);
    
    try {
      const response = await fetch('/api/changesets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'approve_and_commit' }),
      });
      
      if (response.status === 409) {
        // Version conflict
        const result = await response.json();
        if (result.conflict) {
          const conflictedChangeset = flatChangesets.find(cs => cs.id === result.conflict.changeset_id);
          setConflictDialog({
            isOpen: true,
            errors: result.conflict.errors || [],
            changesetId: result.conflict.changeset_id,
            entityDisplay: conflictedChangeset?.entity_display || null,
          });
        }
        setCommittingAction(null);
        return;
      }
      
      if (!response.ok) throw new Error('Failed to commit');
    } catch (err) {
      console.error('Bulk commit failed:', err);
    }
    
    selection.clearSelection();
    await fetchData();
    refreshPendingChangesCount();
    setCommittingAction(null);
  };

  const handleBulkReject = async () => {
    setCommittingAction('reject');
    const ids = Array.from(selection.selectedIds);
    
    try {
      await fetch('/api/changesets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'reject' }),
      });
    } catch (err) {
      console.error('Bulk reject failed:', err);
    }
    
    selection.clearSelection();
    await fetchData();
    refreshPendingChangesCount();
    setCommittingAction(null);
  };

  const handleSingleReject = async (id: string) => {
    setCommittingAction('reject');
    try {
      const changeset = flatChangesets.find(cs => cs.id === id);
      // For DELETE/CREATE operations, discard the changeset entirely
      if (changeset && (changeset.operation === 'delete' || changeset.operation === 'create')) {
        await fetch(`/api/changesets/${id}`, {
          method: 'DELETE',
        });
      } else {
        await fetch(`/api/changesets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject_all' }),
        });
      }
    } catch (err) {
      console.error('Failed to reject:', err);
    }
    await fetchData();
    refreshPendingChangesCount();
    setCommittingAction(null);
  };

  // --- Conflict Dialog Handlers ---
  
  const handleCloseConflictDialog = () => {
    setConflictDialog({ isOpen: false, errors: [], changesetId: null, entityDisplay: null });
    // Refresh data to show updated state
    fetchData();
  };

  const handleDiscardConflictedChangeset = async () => {
    if (!conflictDialog.changesetId) return;
    
    setIsDiscarding(true);
    try {
      const response = await fetch(`/api/changesets/${conflictDialog.changesetId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to discard changeset');
      
      // Close dialog and refresh
      setConflictDialog({ isOpen: false, errors: [], changesetId: null, entityDisplay: null });
      await fetchData();
      refreshPendingChangesCount();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to discard changeset:', err);
    } finally {
      setIsDiscarding(false);
    }
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
                        <span className="font-mono text-blue-600 font-medium min-w-[120px] flex-shrink-0">{formatFieldName(fc.field_name)}</span>
                        <span className="text-gray-400 line-through break-all">
                          {formatFieldChangeValue(fc, 'old')}
                        </span>
                        <span className="text-gray-400 flex-shrink-0">→</span>
                        <span className="text-gray-900 font-medium break-all">
                          {formatFieldChangeValue(fc, 'new')}
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
          customHeader={
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <span>{selectedDetail.entity_display}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${getOperationColor(selectedDetail.operation)}`}>
                  {selectedDetail.operation}
                </span>
              </h3>
            </div>
          }
          maxWidth="wide"
          footer={
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {formatUserName(selectedDetail.created_by)} · {new Date(selectedDetail.created_at).toLocaleDateString()}
              </span>
              <div className="flex items-center gap-2">
                {selectedDetail.operation === 'update' && (
                  <button
                    onClick={async () => {
                      await handleSingleReject(selectedDetail.id);
                      setSelectedDetail(null);
                    }}
                    disabled={isCommitting}
                    className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Reject All
                  </button>
                )}
                <button
                  onClick={() => {
                    handleSingleCommit(selectedDetail.id);
                    setSelectedDetail(null);
                  }}
                  disabled={isCommitting || (selectedDetail.operation === 'update' && detailFieldChanges.every(fc => fc.status === 'rejected'))}
                  className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {selectedDetail.operation === 'update' 
                    ? `Commit${detailFieldChanges.filter(fc => fc.status === 'approved').length > 0 ? ` (${detailFieldChanges.filter(fc => fc.status === 'approved').length})` : ''}`
                    : 'Commit'
                  }
                </button>
              </div>
            </div>
          }
        >
          <div className="px-5 py-4">
            {/* Tabs */}
            <div className="mb-4 border-b border-gray-200">
              <nav className="-mb-px flex items-center gap-6">
                <button
                  type="button"
                  onClick={() => setDetailTab('review')}
                  className={`py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                    detailTab === 'review'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Review
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('discussion')}
                  className={`py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                    detailTab === 'discussion'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Discussion
                </button>
              </nav>
            </div>

            {detailTab === 'discussion' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">Discussion</div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDetail(null);
                      setExpandedComments(selectedDetail.id);
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                  >
                    Open pop-out discussion
                  </button>
                </div>
                <ChangeCommentsBoard changesetId={selectedDetail.id} maxHeight={520} />
              </div>
            ) : (
              <div className="space-y-6">
                <ContextSection
                  entityType={selectedDetail.entity_type}
                  operation={selectedDetail.operation}
                  entityId={selectedDetail.entity_id}
                  beforeSnapshot={selectedDetail.before_snapshot}
                  afterSnapshot={selectedDetail.after_snapshot}
                  fieldChanges={detailFieldChanges}
                />

                <div className="space-y-3">
                  <div className="text-sm font-semibold text-gray-900">Changes</div>

                  {/* Handle delete operation */}
                  {selectedDetail.operation === 'delete' && (() => {
                    const snapshot = selectedDetail.before_snapshot;
                    return (
                      <div className="space-y-3">
                        <div className="text-sm text-red-600 font-semibold">This entity will be permanently deleted</div>
                        {snapshot && (
                          <div className="space-y-2 text-sm">
                            {Object.entries(snapshot)
                              .filter(([key]) => !['id', 'created_at', 'updated_at', 'version', 'deleted'].includes(key))
                              .map(([key, value]) => (
                                <div key={key} className="flex items-baseline gap-3">
                                  <span className="font-mono text-gray-500 w-28 flex-shrink-0 truncate">{key}</span>
                                  <span className="text-gray-600 break-all">{formatValue(value)}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  
                  {/* Handle create operation */}
                  {selectedDetail.operation === 'create' && (() => {
                    const snapshot = selectedDetail.after_snapshot;
                    return (
                      <div className="space-y-3">
                        <div className="text-sm text-green-600 font-semibold">New entity will be created</div>
                        {snapshot && (
                          <div className="space-y-2 text-sm">
                            {Object.entries(snapshot)
                              .filter(([key]) => !['id', 'created_at', 'updated_at', 'version', 'deleted'].includes(key))
                              .map(([key, value]) => (
                                <div key={key} className="flex items-baseline gap-3">
                                  <span className="font-mono text-gray-500 w-28 flex-shrink-0 truncate">{key}</span>
                                  <span className="text-gray-900 break-all">{formatValue(value)}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  
                  {/* Handle update operation with field changes */}
                  {selectedDetail.operation === 'update' && (
                    <div className="space-y-3">
                      {(() => {
                        const frameRoleGroups = new Map<string, FieldChange[]>();
                        const otherChanges: FieldChange[] = [];

                        for (const fc of detailFieldChanges) {
                          const parsed = parseFrameRolesFieldName(fc.field_name);
                          if (parsed) {
                            if (!frameRoleGroups.has(parsed.roleType)) frameRoleGroups.set(parsed.roleType, []);
                            frameRoleGroups.get(parsed.roleType)!.push(fc);
                          } else {
                            otherChanges.push(fc);
                          }
                        }

                        const roleFieldOrder = ['__exists', 'label', 'description', 'notes', 'main', 'examples'];
                        const sortRoleFieldChanges = (a: FieldChange, b: FieldChange) => {
                          const aParsed = parseFrameRolesFieldName(a.field_name);
                          const bParsed = parseFrameRolesFieldName(b.field_name);
                          const aField = aParsed?.field ?? '';
                          const bField = bParsed?.field ?? '';
                          const aIdx = roleFieldOrder.indexOf(aField);
                          const bIdx = roleFieldOrder.indexOf(bField);
                          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
                        };

                        const renderFieldChangeCard = (fc: FieldChange, displayName: string) => (
                          <div 
                            key={fc.id} 
                            className={`p-3 rounded-lg border ${
                              fc.status === 'approved' 
                                ? 'bg-green-50 border-green-200' 
                                : fc.status === 'rejected' 
                                ? 'bg-red-50 border-red-200' 
                                : 'bg-gray-50 border-gray-200'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-mono text-blue-600 font-medium text-sm">{displayName}</span>
                              <div className="flex items-center gap-2">
                                {fc.status !== 'pending' && (
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    fc.status === 'approved' 
                                      ? 'bg-green-100 text-green-700' 
                                      : 'bg-red-100 text-red-700'
                                  }`}>
                                    {fc.status}
                                  </span>
                                )}
                                <button
                                  onClick={() => handleFieldChangeStatus(fc.id, 'approved')}
                                  disabled={isUpdatingField === fc.id || fc.status === 'approved'}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    fc.status === 'approved'
                                      ? 'bg-green-200 text-green-700 cursor-default'
                                      : 'text-green-600 hover:bg-green-100 disabled:opacity-50'
                                  }`}
                                  title="Approve this change"
                                >
                                  <CheckIcon className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleFieldChangeStatus(fc.id, 'rejected')}
                                  disabled={isUpdatingField === fc.id || fc.status === 'rejected'}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    fc.status === 'rejected'
                                      ? 'bg-red-200 text-red-700 cursor-default'
                                      : 'text-red-600 hover:bg-red-100 disabled:opacity-50'
                                  }`}
                                  title="Reject this change"
                                >
                                  <XMarkIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-start gap-3 text-sm">
                              <div className="flex-1 min-w-0">
                                <span className="text-xs text-gray-500 block mb-1">Current:</span>
                                <span className="text-gray-500 line-through break-all">{formatFieldChangeValue(fc, 'old')}</span>
                              </div>
                              <span className="text-gray-300 flex-shrink-0 mt-5">→</span>
                              <div className="flex-1 min-w-0">
                                <span className="text-xs text-gray-500 block mb-1">New:</span>
                                <span className="text-gray-900 break-all">{formatFieldChangeValue(fc, 'new')}</span>
                              </div>
                            </div>
                          </div>
                        );

                        return (
                          <>
                            {otherChanges.map(fc => renderFieldChangeCard(fc, formatFieldName(fc.field_name)))}
                            {Array.from(frameRoleGroups.entries())
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([roleType, changes]) => (
                                <div key={roleType} className="p-3 rounded-lg border border-gray-200 bg-white">
                                  <div className="mb-2 text-xs font-semibold text-gray-700">frame_roles ▸ {roleType}</div>
                                  <div className="space-y-3">
                                    {changes
                                      .slice()
                                      .sort(sortRoleFieldChanges)
                                      .map(fc => renderFieldChangeCard(fc, formatFieldName(fc.field_name, { short: true })))}
                                  </div>
                                </div>
                              ))}
                          </>
                        );
                      })()}
                      
                      {/* Summary of decisions */}
                      {detailFieldChanges.length > 0 && (
                        <div className="pt-3 border-t border-gray-200 text-sm text-gray-500">
                          {(() => {
                            const approved = detailFieldChanges.filter(fc => fc.status === 'approved').length;
                            const rejected = detailFieldChanges.filter(fc => fc.status === 'rejected').length;
                            const pending = detailFieldChanges.filter(fc => fc.status === 'pending').length;
                            return (
                              <span>
                                {approved > 0 && <span className="text-green-600">{approved} approved</span>}
                                {approved > 0 && (rejected > 0 || pending > 0) && ', '}
                                {rejected > 0 && <span className="text-red-600">{rejected} rejected</span>}
                                {rejected > 0 && pending > 0 && ', '}
                                {pending > 0 && <span className="text-gray-600">{pending} pending</span>}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Table Container - matching DataTable styling */}
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Toolbar - matching DataTable layout */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          {/* Header Row */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Pending Changes</h2>
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
                    hasActiveFilters ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white text-gray-700'
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
                            className="text-sm text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
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
                                  ? 'bg-blue-100 text-blue-600 border border-blue-200'
                                  : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                              }`}
                            >
                              {et}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Operation Filter */}
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
                                  : op === 'update' ? 'bg-blue-100 text-blue-600 border border-blue-200'
                                  : 'bg-red-100 text-red-800 border border-red-200'
                                  : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                              }`}
                            >
                              {op}
                            </button>
                          ))}
                        </div>
                      </div>

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
                      {filterOptions.jobs.length > 0 && (
                        <div className="relative" ref={jobDropdownContainerRef}>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Job</label>
                          <input
                            type="text"
                            value={jobSearchQuery}
                            onChange={(e) => setJobSearchQuery(e.target.value)}
                            onFocus={() => setJobDropdownOpen(true)}
                            placeholder="Search jobs..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 mb-2"
                          />
                          {jobDropdownOpen && (
                            <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-xl bg-white">
                              {filteredJobs.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-gray-500">No jobs found</div>
                              ) : (
                                filteredJobs.map((job) => (
                                  <label
                                    key={job.id}
                                    className="flex items-start px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={filter.jobIds.includes(job.id)}
                                      onChange={() =>
                                        setFilter((f) => ({
                                          ...f,
                                          jobIds: f.jobIds.includes(job.id)
                                            ? f.jobIds.filter((id) => id !== job.id)
                                            : [...f.jobIds, job.id],
                                        }))
                                      }
                                      className="mt-0.5 mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-gray-900 truncate">{job.label}</div>
                                      <div className="text-xs text-gray-500 font-mono truncate">{job.id}</div>
                                    </div>
                                  </label>
                                ))
                              )}
                            </div>
                          )}
                          {filter.jobIds.length > 0 && (
                            <div className="mt-2 text-xs text-gray-600">
                              {filter.jobIds.length} job{filter.jobIds.length !== 1 ? 's' : ''} selected
                            </div>
                          )}
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
                            Showing {paginatedChangesets.length} of {flatChangesets.length} rows
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
                    {committingAction === 'commit' ? (
                      <LoadingSpinner size="sm" noPadding />
                    ) : (
                      <CheckIcon className="w-4 h-4" />
                    )}
                    Commit
                  </button>
                  <button
                    onClick={handleBulkReject}
                    disabled={isCommitting}
                    className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-red-700 bg-red-100 border border-red-200 rounded-xl hover:bg-red-200 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {committingAction === 'reject' ? (
                      <LoadingSpinner size="sm" noPadding />
                    ) : (
                      <XMarkIcon className="w-4 h-4" />
                    )}
                    Reject
                  </button>
                  <button
                    onClick={() => selection.clearSelection()}
                    disabled={isCommitting}
                    className="text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer disabled:opacity-50"
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
        {isCommitting ? (
          <div className="p-8 text-center">
            <LoadingSpinner size="page" label="Processing changes..." className="py-20" />
          </div>
        ) : !hasPending ? (
          <EmptyState
            icon={<CheckCircleIcon className="h-24 w-24 mx-auto mb-4" />}
            title="All Clear!"
            description="No pending changes to review."
          />
        ) : paginatedChangesets.length === 0 ? (
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
                  <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 text-left bg-gray-50" style={{ width: '100px' }}>Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedChangesets.map((item) => {
                  const isSelected = selection.isSelected(item.id);

                  return (
                    <tr 
                      key={item.id} 
                      className={`${isSelected ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'} transition-colors cursor-pointer`}
                      onClick={() => setSelectedDetail(item)}
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
                      <td className="px-4 py-4 text-left align-top" style={{ width: '100px' }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-start gap-1">
                          {/* Comments Button */}
                          <button
                            onClick={() => setExpandedComments(item.id)}
                            className={`p-1.5 rounded-lg transition-colors relative ${
                              unreadChangesetIds.has(item.id)
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                            }`}
                            title="Discussion"
                          >
                            <ChatBubbleLeftIcon className="w-5 h-5" />
                            {unreadChangesetIds.has(item.id) && (
                              <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-white" />
                            )}
                          </button>
                          <button
                            onClick={() => handleSingleCommit(item.id)}
                            disabled={isCommitting}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Commit"
                          >
                            <CheckIcon className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleSingleReject(item.id)}
                            disabled={isCommitting}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
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
          itemLabel="rows"
        />
      </div>

      {/* Conflict Dialog */}
      <ConflictDialog
        isOpen={conflictDialog.isOpen}
        onClose={handleCloseConflictDialog}
        onDiscard={handleDiscardConflictedChangeset}
        errors={conflictDialog.errors}
        entityDisplay={conflictDialog.entityDisplay || undefined}
        loading={isDiscarding}
      />
    </div>
  );
}
