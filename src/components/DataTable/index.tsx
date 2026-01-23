'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { TableLexicalUnit, Frame } from '@/lib/types';
import { showGlobalAlert } from '@/lib/alerts';
import { api } from '@/lib/api-client';
import Pagination from '@/components/Pagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import AIJobsOverlay from '@/components/AIJobsOverlay';
import { useTableSelection } from '@/hooks/useTableSelection';
import { refreshPendingChangesCount } from '@/hooks/usePendingChangesCount';
import { useJobCompletionBroadcast } from '@/hooks/useJobCompletionBroadcast';

import { useDataTableState, useCopyFieldSelection } from './hooks';
import { DataTableToolbar } from './DataTableToolbar';
import { DataTableBody } from './DataTableBody';
import { FlagModal, FrameChangeModal } from './DataTableModals';
import { ContextMenu } from './ContextMenu';
import { CopyFieldSelector } from './CopyFieldSelector';
import AIAgentQuickEditModal from '@/components/AIAgentQuickEditModal';
import { getColumnsForMode, hasNestedFields, NESTED_FIELD_CONFIGS } from './config';
import {
  DataTableProps,
  FlagModalState,
  EditingState,
  ContextMenuState,
  FrameOption,
  FlagState,
} from './types';

export default function DataTable({
  onRowClick,
  onEditClick,
  searchQuery,
  className,
  mode = 'lexical_units',
  refreshTrigger,
}: DataTableProps) {
  // Use our custom hook for data table state management
  const tableState = useDataTableState({
    mode,
    searchQuery,
    refreshTrigger,
  });

  // Use the existing useTableSelection hook for selection management
  const selection = useTableSelection<TableLexicalUnit | Frame>({
    pageItems: tableState.data?.data || [],
  });

  // Local state for modals and UI
  const [flagModal, setFlagModal] = useState<FlagModalState>({
    isOpen: false,
    action: null,
    reason: ''
  });
  const [editing, setEditing] = useState<EditingState>({
    unitId: null,
    field: null,
    value: ''
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    unitId: null
  });
  const [isAIOverlayOpen, setIsAIOverlayOpen] = useState(false);
  const [pendingAIJobs, setPendingAIJobs] = useState(0);
  
  // AI Agent Quick Edit modal state
  const [aiQuickEditEntry, setAiQuickEditEntry] = useState<TableLexicalUnit | Frame | null>(null);
  
  // Track submitted quick edit job IDs for background polling
  const quickEditJobIdsRef = useRef<Set<string>>(new Set());
  const [isPollingQuickEditJobs, setIsPollingQuickEditJobs] = useState(false);
  
  // Flag loading state
  const [isFlagLoading, setIsFlagLoading] = useState(false);
  
  // Frame modal state
  const [isFrameModalOpen, setIsFrameModalOpen] = useState(false);
  const [frameOptions, setFrameOptions] = useState<FrameOption[]>([]);
  const [frameOptionsLoading, setFrameOptionsLoading] = useState(false);
  const [frameOptionsError, setFrameOptionsError] = useState<string | null>(null);
  const [selectedFrameValue, setSelectedFrameValue] = useState<string>('');
  const [frameSearchQuery, setFrameSearchQuery] = useState('');
  const [isFrameUpdating, setIsFrameUpdating] = useState(false);

  // Copy field selector state
  const copyFieldSelection = useCopyFieldSelection(mode);
  const [copyMenuState, setCopyMenuState] = useState<{
    isOpen: boolean;
    entry: TableLexicalUnit | Frame | null;
    anchorEl: HTMLElement | null;
  }>({
    isOpen: false,
    entry: null,
    anchorEl: null,
  });

  // Selected entries on current page (for modals)
  const selectedEntriesOnCurrentPage = useMemo(() => {
    if (!tableState.data?.data || selection.selectedCount === 0) {
      return [];
    }
    return tableState.data.data.filter(entry => selection.selectedIds.has(entry.id));
  }, [tableState.data, selection.selectedIds, selection.selectedCount]);

  // Subscribe to job completion broadcasts from other tabs and same-tab events
  // This ensures all DataTable instances refresh when ANY AI job completes
  useJobCompletionBroadcast(
    mode,
    tableState.fetchData,
    isAIOverlayOpen // Don't poll when overlay is open - it handles polling itself
  );

  // Filtered frame options based on search
  const filteredFrameOptions = useMemo(() => {
    if (!frameSearchQuery.trim()) {
      return frameOptions;
    }
    const query = frameSearchQuery.trim().toLowerCase();
    return frameOptions.filter(frame => {
      return (
        frame.label.toLowerCase().includes(query) ||
        (frame.code?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [frameOptions, frameSearchQuery]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.isOpen) {
        setContextMenu({ isOpen: false, x: 0, y: 0, unitId: null });
      }
    };

    if (contextMenu.isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu.isOpen]);

  // Fetch pending AI jobs (filtered by current mode)
  const fetchPendingAIJobs = useCallback(async () => {
    try {
      const response = await api.get<{ jobs: Array<{ status: string }> }>(`/api/llm-jobs?entityType=${mode}`);
      const pending = response.jobs?.filter(job => job.status === 'queued' || job.status === 'running').length ?? 0;
      setPendingAIJobs(pending);
    } catch (error) {
      console.warn('Failed to load pending AI jobs', error);
    }
  }, [mode]);

  // Fetch frame options
  const fetchFrameOptions = useCallback(async (search?: string) => {
    if (mode !== 'lexical_units') {
      return;
    }

    setFrameOptionsLoading(true);
    setFrameOptionsError(null);

    try {
      const queryParams = new URLSearchParams();
      if (search) queryParams.set('search', search);
      queryParams.set('limit', '100');

      const response = await fetch(`/api/frames?${queryParams.toString()}`, { cache: 'no-store' });
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

  // Load frame options when modal opens or search query changes
  useEffect(() => {
    if (!isFrameModalOpen || mode !== 'lexical_units') {
      return;
    }

    const debounceTimer = setTimeout(() => {
      void fetchFrameOptions(frameSearchQuery);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [fetchFrameOptions, frameSearchQuery, isFrameModalOpen, mode]);

  // Load pending AI jobs on mount and poll
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

  // Poll for quick edit job completion and refresh data when done
  useEffect(() => {
    // Only poll if we're actively tracking jobs
    if (!isPollingQuickEditJobs) return;

    const pollQuickEditJobs = async () => {
      const jobIds = Array.from(quickEditJobIdsRef.current);
      
      // If no jobs left, stop polling
      if (jobIds.length === 0) {
        setIsPollingQuickEditJobs(false);
        return;
      }
      
      for (const jobId of jobIds) {
        try {
          const response = await api.get<{ status: string }>(`/api/llm-jobs/${jobId}`);
          
          if (response.status === 'completed' || response.status === 'cancelled') {
            // Remove from tracking
            quickEditJobIdsRef.current.delete(jobId);
            
            // Refresh table data
            await tableState.fetchData();
            
            // Update pending AI jobs count
            await fetchPendingAIJobs();
          }
        } catch (error) {
          // Job not found or error - remove from tracking
          console.warn(`Failed to poll quick edit job ${jobId}:`, error);
          quickEditJobIdsRef.current.delete(jobId);
        }
      }
      
      // Stop polling if all jobs are done
      if (quickEditJobIdsRef.current.size === 0) {
        setIsPollingQuickEditJobs(false);
      }
    };

    // Poll immediately and then every 3 seconds
    void pollQuickEditJobs();
    const interval = setInterval(pollQuickEditJobs, 3000);
    
    return () => clearInterval(interval);
  }, [isPollingQuickEditJobs, tableState.fetchData, fetchPendingAIJobs]);

  // Clear selection when mode changes
  useEffect(() => {
    selection.clearSelection();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate flag states of selected entries
  const getSelectionFlagState = useCallback((): FlagState => {
    if (selectedEntriesOnCurrentPage.length === 0) {
      return { allFlagged: false, noneFlagged: false, allUnverifiable: false, noneUnverifiable: false };
    }

    const flaggableEntries = selectedEntriesOnCurrentPage.filter((entry): entry is TableLexicalUnit => 'flagged' in entry);
    
    if (flaggableEntries.length === 0) {
      return { allFlagged: false, noneFlagged: true, allUnverifiable: false, noneUnverifiable: true };
    }

    const allFlagged = flaggableEntries.every(entry => entry.flagged);
    const noneFlagged = flaggableEntries.every(entry => !entry.flagged);
    const allUnverifiable = flaggableEntries.every(entry => entry.verifiable === false);
    const noneUnverifiable = flaggableEntries.every(entry => entry.verifiable !== false);
    
    return { allFlagged, noneFlagged, allUnverifiable, noneUnverifiable };
  }, [selectedEntriesOnCurrentPage]);

  // Flag handlers
  const handleFlagUpdate = async (updates: { 
    flagged?: boolean; 
    flaggedReason?: string;
    verifiable?: boolean;
    unverifiableReason?: string;
  }) => {
    if (selection.selectedCount === 0) return;

    const selectedCount = selection.selectedCount;
    setIsFlagLoading(true);

    try {
      const response = await fetch(`${tableState.apiPrefix}/flag`, {
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
        const errorData = await response.json().catch(() => ({ error: 'Failed to update entries' }));
        throw new Error(errorData.error || 'Failed to update entries');
      }

      const result = await response.json();
      const actualCount = result.updatedCount || result.updated_count || result.count || result.staged_count || 0;

      await tableState.fetchData();
      refreshPendingChangesCount();
      selection.clearSelection();
      setIsFlagLoading(false);
      setFlagModal({ isOpen: false, action: null, reason: '' });

      const action = updates.verifiable === false ? 'marked unverifiable' : 
                    updates.verifiable === true ? 'marked verifiable' :
                    updates.flagged === true ? 'flagged' :
                    updates.flagged === false ? 'unflagged' : 'updated';

      if (actualCount === selectedCount) {
        showGlobalAlert({
          type: 'success',
          title: 'Success',
          message: `Successfully ${action} ${actualCount} ${actualCount === 1 ? 'entry' : 'entries'}.`,
          durationMs: 4000
        });
      } else if (actualCount > 0) {
        showGlobalAlert({
          type: 'warning',
          title: 'Partial Update',
          message: `Only ${actualCount} of ${selectedCount} selected ${selectedCount === 1 ? 'entry was' : 'entries were'} ${action}. Some entries may not exist or are no longer accessible.`,
          durationMs: 6000
        });
      } else {
        showGlobalAlert({
          type: 'error',
          title: 'Update Failed',
          message: `No entries were ${action}. The selected entries may not exist or are no longer accessible.`,
          durationMs: 6000
        });
      }
    } catch (error) {
      console.error('Error updating entries:', error);
      
      showGlobalAlert({
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred while updating entries.',
        durationMs: 6000
      });

      setIsFlagLoading(false);
      setFlagModal({ isOpen: false, action: null, reason: '' });
    }
  };

  const handleOpenFlagModal = (action: 'flag' | 'unflag' | 'forbid' | 'allow') => {
    setFlagModal({ isOpen: true, action, reason: '' });
  };

  const handleCloseFlagModal = () => {
    setFlagModal({ isOpen: false, action: null, reason: '' });
  };

  const handleConfirmFlag = () => {
    const { action, reason } = flagModal;
    
    if (!action) return;

    const updates: {
      flagged?: boolean;
      flaggedReason?: string;
      verifiable?: boolean;
      unverifiableReason?: string;
    } = {};

    switch (action) {
      case 'flag':
        updates.flagged = true;
        updates.flaggedReason = null as unknown as string;
        break;
      case 'unflag':
        updates.flagged = false;
        updates.flaggedReason = null as unknown as string;
        break;
      case 'forbid':
        updates.verifiable = false;
        if (reason.trim()) {
          updates.unverifiableReason = reason.trim();
        }
        break;
      case 'allow':
        updates.verifiable = true;
        updates.unverifiableReason = null as unknown as string;
        break;
    }

    handleFlagUpdate(updates);
  };

  // Frame modal handlers
  const handleOpenFrameModal = () => {
    if (mode !== 'lexical_units') {
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
    if (selection.selectedCount === 0 || mode !== 'lexical_units') {
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

    const selectedCount = selection.selectedCount;
    setIsFrameUpdating(true);
    setFrameOptionsError(null);

    try {
      const response = await fetch(`${tableState.apiPrefix}/frame`, {
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

      const result = await response.json();
      const actualCount = result.updatedCount || result.updated_count || result.count || 0;

      const chosenFrame =
        normalizedFrameValue === null
          ? null
          : frameOptions.find(frame => frame.id === normalizedFrameValue) ?? null;

      await tableState.fetchData();
      refreshPendingChangesCount();

      selection.clearSelection();
      setIsFrameModalOpen(false);
      setSelectedFrameValue('');
      setFrameSearchQuery('');
      setFrameOptionsError(null);

      const frameName = chosenFrame ? (chosenFrame.code?.trim() || chosenFrame.label) : 'No frame';
      const action = normalizedFrameValue === null ? 'cleared frames for' : `updated to ${frameName} for`;
      
      if (actualCount === selectedCount) {
        showGlobalAlert({
          type: 'success',
          title: 'Success',
          message: `Successfully ${action} ${actualCount} ${actualCount === 1 ? 'entry' : 'entries'}.`,
          durationMs: 4000
        });
      } else if (actualCount > 0) {
        showGlobalAlert({
          type: 'warning',
          title: 'Partial Update',
          message: `Only ${actualCount} of ${selectedCount} selected ${selectedCount === 1 ? 'entry was' : 'entries were'} updated. Some entries may not exist or are no longer accessible.`,
          durationMs: 6000
        });
      } else {
        showGlobalAlert({
          type: 'error',
          title: 'Update Failed',
          message: `No entries were updated. The selected entries may not exist or are no longer accessible.`,
          durationMs: 6000
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update frames';
      setFrameOptionsError(errorMessage);
      
      showGlobalAlert({
        type: 'error',
        title: 'Error',
        message: errorMessage,
        durationMs: 6000
      });
    } finally {
      setIsFrameUpdating(false);
    }
  };

  // Editing handlers
  const handleStartEdit = (unitId: string, field: string, currentValue: string) => {
    setEditing({
      unitId,
      field,
      value: currentValue
    });
  };

  const handleCancelEdit = () => {
    setEditing({
      unitId: null,
      field: null,
      value: ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editing.unitId || !editing.field) return;

    try {
      const response = await fetch(`${tableState.apiPrefix}/${editing.unitId}`, {
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

      // Refresh data and pending changes count
      await tableState.fetchData();
      refreshPendingChangesCount();
      handleCancelEdit();
    } catch (error) {
      console.error('Error updating entry:', error);
    }
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, unitId: string) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      unitId
    });
  };

  const handleContextMenuAction = (action: 'flag' | 'unflag' | 'forbid' | 'allow') => {
    if (!contextMenu.unitId) return;
    
    // Set selection to just this entry using the hook
    selection.clearSelection();
    selection.toggleSelect(contextMenu.unitId);
    
    // Close context menu
    setContextMenu({ isOpen: false, x: 0, y: 0, unitId: null });
    
    // Open flag modal
    handleOpenFlagModal(action);
  };

  const handleCloseContextMenu = () => {
    setContextMenu({ isOpen: false, x: 0, y: 0, unitId: null });
  };

  // AI Agent Quick Edit handlers
  const handleAIClick = (entry: TableLexicalUnit | Frame) => {
    setAiQuickEditEntry(entry);
  };

  const handleCloseAIQuickEdit = () => {
    setAiQuickEditEntry(null);
  };

  const handleAIQuickEditJobSubmitted = useCallback((jobId: string) => {
    // Add job ID to tracking set for background polling
    quickEditJobIdsRef.current.add(jobId);
    // Start polling if not already polling
    setIsPollingQuickEditJobs(true);
    // Close the modal
    setAiQuickEditEntry(null);
  }, []);

  // Copy handlers
  
  // Helper to get a nested value from an object using dot notation
  const getNestedValue = useCallback((obj: Record<string, unknown>, path: string): unknown => {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }, []);

  // Format a single value for display
  const formatSingleValue = useCallback((value: unknown): string => {
    if (value === null || value === undefined) {
      return '—';
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }, []);

  // Format an array item (like a frame_role or lexical_entry) using selected sub-fields
  const formatArrayItem = useCallback((item: Record<string, unknown>, selectedSubFields: string[]): string => {
    if (selectedSubFields.length === 0) {
      return '—';
    }
    
    const parts = selectedSubFields.map(subField => {
      const value = getNestedValue(item, subField);
      return formatSingleValue(value);
    }).filter(v => v !== '—');
    
    return parts.join(' | ') || '—';
  }, [getNestedValue, formatSingleValue]);

  // Format an entire column value, handling nested objects with selected sub-fields
  const formatEntryValue = useCallback((
    entry: TableLexicalUnit | Frame, 
    columnKey: string,
    selectedNestedFields?: string[]
  ): string => {
    const value = (entry as unknown as Record<string, unknown>)[columnKey];
    
    if (value === null || value === undefined) {
      return '—';
    }
    
    // Handle nested columns with sub-field selection
    if (hasNestedFields(columnKey) && selectedNestedFields && selectedNestedFields.length > 0) {
      if (columnKey === 'frame_roles' && 'frame_roles' in entry) {
        const roles = entry.frame_roles as unknown as Array<Record<string, unknown>>;
        if (!roles || roles.length === 0) return '—';
        
        return roles.map(role => formatArrayItem(role, selectedNestedFields)).join('\n  - ');
      }
      
      if (columnKey === 'lexical_entries' && 'lexical_entries' in entry) {
        const lexData = entry.lexical_entries as unknown as { entries: Array<Record<string, unknown>> };
        if (!lexData?.entries || lexData.entries.length === 0) return '—';
        
        return lexData.entries.map(lex => formatArrayItem(lex, selectedNestedFields)).join('\n  - ');
      }
    }
    
    // Fallback for nested columns without sub-field selection
    if (columnKey === 'frame_roles' && 'frame_roles' in entry) {
      const roles = entry.frame_roles as unknown as Array<{ label?: string | null; role_type?: { label: string } }>;
      if (!roles || roles.length === 0) return '—';
      return roles.map(r => r.label || r.role_type?.label || '—').filter(Boolean).join(', ');
    }
    
    if (columnKey === 'lexical_entries' && 'lexical_entries' in entry) {
      const lexData = entry.lexical_entries as unknown as { entries: Array<{ gloss: string; lemmas?: string[] }> };
      if (!lexData?.entries || lexData.entries.length === 0) return '—';
      return lexData.entries.map(e => {
        const lemmas = e.lemmas?.join(', ') || '';
        return lemmas ? `${lemmas}: ${e.gloss}` : e.gloss;
      }).join('; ');
    }
    
    // Standard value formatting
    return formatSingleValue(value);
  }, [formatArrayItem, formatSingleValue]);

  const handleCopyClick = useCallback((entry: TableLexicalUnit | Frame) => {
    const columns = getColumnsForMode(mode).filter(col => col.key !== 'actions');
    const selectedFieldKeys = copyFieldSelection.getSelectedFieldKeys();
    
    // If no fields selected, use all visible columns
    const fieldsToCopy = selectedFieldKeys.length > 0 
      ? columns.filter(col => selectedFieldKeys.includes(col.key))
      : columns.filter(col => col.visible);
    
    const lines = fieldsToCopy.map(col => {
      // Get selected nested fields for this column if it has nested config
      const selectedNestedFields = hasNestedFields(col.key) 
        ? copyFieldSelection.getSelectedNestedFieldKeys(col.key)
        : undefined;
      
      const value = formatEntryValue(entry, col.key, selectedNestedFields);
      
      // For nested fields with multi-line output, format nicely
      if (value.includes('\n')) {
        return `${col.label}:\n  - ${value}`;
      }
      return `${col.label}: ${value}`;
    });
    
    const textToCopy = lines.join('\n');
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      showGlobalAlert({
        type: 'success',
        title: 'Copied',
        message: 'Entry copied to clipboard',
        durationMs: 2000
      });
    }).catch((err) => {
      console.error('Failed to copy:', err);
      showGlobalAlert({
        type: 'error',
        title: 'Copy Failed',
        message: 'Failed to copy to clipboard',
        durationMs: 3000
      });
    });
  }, [mode, copyFieldSelection, formatEntryValue]);

  const handleCopyLongPress = useCallback((entry: TableLexicalUnit | Frame, buttonEl: HTMLButtonElement) => {
    setCopyMenuState({
      isOpen: true,
      entry,
      anchorEl: buttonEl,
    });
  }, []);

  const handleCloseCopyMenu = useCallback(() => {
    setCopyMenuState({
      isOpen: false,
      entry: null,
      anchorEl: null,
    });
  }, []);

  // Get current columns with actions visible if onEditClick is provided
  const currentColumnsWithActions = useMemo(() => {
    return tableState.currentColumns.map(col => ({
      ...col,
      visible: col.key === 'actions' && onEditClick ? true : col.visible
    }));
  }, [tableState.currentColumns, onEditClick]);

  const visibleColumnsWithActions = useMemo(() => {
    return currentColumnsWithActions.filter(col => col.visible);
  }, [currentColumnsWithActions]);

  // Loading state
  if (tableState.loading && !tableState.data) {
    return (
      <div className={`bg-white rounded-xl border border-gray-200 ${className || ''}`}>
        <div className="p-8 text-center">
          <LoadingSpinner size="page" label="Loading entries..." className="py-20" />
        </div>
      </div>
    );
  }

  // Error state
  if (tableState.error) {
    return (
      <div className={`bg-white rounded-xl border border-gray-200 ${className || ''}`}>
        <div className="p-8 text-center text-red-600">
          <ExclamationTriangleIcon className="h-12 w-12 mx-auto mb-4" />
          <p>Error loading data: {tableState.error}</p>
          <button 
            onClick={tableState.fetchData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer flex items-center gap-2 mx-auto"
          >
            {tableState.loading && <LoadingSpinner size="sm" className="text-white" noPadding />}
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Get context menu entry
  const contextMenuEntry = contextMenu.unitId 
    ? tableState.data?.data.find(e => e.id === contextMenu.unitId) || null
    : null;

  return (
    <div className={`bg-white rounded-xl border border-gray-200 ${className || ''} ${tableState.isResizing ? 'select-none' : ''}`}>
      {/* Toolbar */}
      <DataTableToolbar
        mode={mode}
        isFilterPanelOpen={tableState.isFilterPanelOpen}
        onFilterPanelToggle={() => tableState.setIsFilterPanelOpen(!tableState.isFilterPanelOpen)}
        filters={tableState.filters}
        onFiltersChange={tableState.handleFiltersChange}
        onClearAllFilters={tableState.handleClearAllFilters}
        isColumnPanelOpen={tableState.isColumnPanelOpen}
        onColumnPanelToggle={() => tableState.setIsColumnPanelOpen(!tableState.isColumnPanelOpen)}
        columns={currentColumnsWithActions}
        columnVisibility={tableState.columnVisibility}
        onColumnVisibilityChange={tableState.handleColumnVisibilityChange}
        onResetColumns={tableState.handleResetColumns}
        onResetColumnWidths={tableState.handleResetColumnWidths}
        pendingAIJobs={pendingAIJobs}
        onOpenAIOverlay={() => setIsAIOverlayOpen(true)}
        selectedCount={selection.selectedCount}
        flagState={getSelectionFlagState()}
        onOpenFlagModal={handleOpenFlagModal}
        onOpenFrameModal={handleOpenFrameModal}
        isPageSizePanelOpen={tableState.isPageSizePanelOpen}
        onPageSizePanelToggle={() => tableState.setIsPageSizePanelOpen(!tableState.isPageSizePanelOpen)}
        pageSize={tableState.pageSize}
        onPageSizeChange={tableState.handlePageSizeChange}
        totalItems={tableState.data?.total}
      />

      {/* Table */}
      <div className="overflow-x-auto relative h-[calc(100vh-300px)] overflow-y-auto bg-gray-50">
        {tableState.loading && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
            <LoadingSpinner size="page" />
          </div>
        )}
        <DataTableBody
          data={tableState.data?.data || null}
          visibleColumns={visibleColumnsWithActions}
          mode={mode}
          sortState={tableState.sortState}
          selectedIds={selection.selectedIds}
          editing={editing}
          filters={tableState.filters}
          searchQuery={searchQuery}
          isResizing={tableState.isResizing}
          onSort={tableState.handleSort}
          onRowClick={onRowClick}
          onEditClick={onEditClick}
          onAIClick={handleAIClick}
          onCopyClick={handleCopyClick}
          onCopyLongPress={handleCopyLongPress}
          onSelectAll={selection.toggleSelectAll}
          onSelectRow={selection.toggleSelect}
          onContextMenu={handleContextMenu}
          onStartEdit={handleStartEdit}
          onEditChange={(value) => setEditing(prev => ({ ...prev, value }))}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          onMouseDown={tableState.handleMouseDown}
          getColumnWidth={tableState.getColumnWidth}
          selectAll={selection.selectAll}
        />
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={tableState.data?.page || 1}
        totalPages={tableState.data?.totalPages || 1}
        totalItems={tableState.data?.total || 0}
        pageSize={tableState.data?.limit || tableState.pageSize}
        onPageChange={tableState.handlePageChange}
        loading={tableState.loading}
        itemLabel="entries"
      />

      {/* Context Menu */}
      <ContextMenu
        contextMenu={contextMenu}
        entry={contextMenuEntry}
        mode={mode}
        onClose={handleCloseContextMenu}
        onAction={handleContextMenuAction}
      />

      {/* Flag Modal */}
      <FlagModal
        isOpen={flagModal.isOpen}
        modalState={flagModal}
        selectedCount={selection.selectedCount}
        selectedEntriesOnPage={selectedEntriesOnCurrentPage}
        isLoading={isFlagLoading}
        onClose={handleCloseFlagModal}
        onConfirm={handleConfirmFlag}
        onReasonChange={(reason) => setFlagModal(prev => ({ ...prev, reason }))}
      />

      {/* Frame Change Modal */}
      {mode === 'lexical_units' && (
        <FrameChangeModal
          isOpen={isFrameModalOpen}
          selectedCount={selection.selectedCount}
          selectedEntriesOnCurrentPage={selectedEntriesOnCurrentPage}
          frameOptions={frameOptions}
          filteredFrameOptions={filteredFrameOptions}
          frameOptionsLoading={frameOptionsLoading}
          frameOptionsError={frameOptionsError}
          selectedFrameValue={selectedFrameValue}
          frameSearchQuery={frameSearchQuery}
          isFrameUpdating={isFrameUpdating}
          onClose={handleCloseFrameModal}
          onConfirm={handleConfirmFrameChange}
          onFrameValueChange={setSelectedFrameValue}
          onSearchQueryChange={setFrameSearchQuery}
          onClearError={() => setFrameOptionsError(null)}
          onRetryLoad={fetchFrameOptions}
        />
      )}

      {/* AI Jobs Overlay */}
      <AIJobsOverlay
        isOpen={isAIOverlayOpen}
        onClose={() => setIsAIOverlayOpen(false)}
        mode={mode}
        selectedIds={Array.from(selection.selectedIds)}
        onJobsUpdated={setPendingAIJobs}
        onJobCompleted={tableState.fetchData}
      />

      {/* AI Agent Quick Edit Modal */}
      {aiQuickEditEntry && (
        <AIAgentQuickEditModal
          isOpen={!!aiQuickEditEntry}
          onClose={handleCloseAIQuickEdit}
          entry={aiQuickEditEntry}
          mode={mode}
          onJobSubmitted={handleAIQuickEditJobSubmitted}
        />
      )}

      {/* Copy Field Selector */}
      <CopyFieldSelector
        isOpen={copyMenuState.isOpen}
        onClose={handleCloseCopyMenu}
        anchorEl={copyMenuState.anchorEl}
        mode={mode}
        selectedFields={copyFieldSelection.selectedFields}
        onToggleField={copyFieldSelection.toggleField}
        onToggleNestedField={copyFieldSelection.toggleNestedField}
        onSelectAll={copyFieldSelection.selectAll}
        onClearAll={copyFieldSelection.clearAll}
        onSelectAllNestedFields={copyFieldSelection.selectAllNestedFields}
        onClearAllNestedFields={copyFieldSelection.clearAllNestedFields}
      />
    </div>
  );
}

// Re-export types for consumers
export type { DataTableProps, DataTableMode } from './types';
export type { DataTableMode as Mode } from './config';

