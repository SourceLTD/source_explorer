'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { TableEntry, Frame } from '@/lib/types';
import { showGlobalAlert } from '@/lib/alerts';
import { api } from '@/lib/api-client';
import Pagination from '@/components/Pagination';
import LoadingSpinner from '@/components/LoadingSpinner';
import AIJobsOverlay from '@/components/AIJobsOverlay';
import { useTableSelection } from '@/hooks/useTableSelection';

import { useDataTableState } from './hooks';
import { DataTableToolbar } from './DataTableToolbar';
import { DataTableBody } from './DataTableBody';
import { ModerationModal, FrameChangeModal } from './DataTableModals';
import { ContextMenu } from './ContextMenu';
import AIAgentQuickEditModal from '@/components/AIAgentQuickEditModal';
import {
  DataTableProps,
  ModerationModalState,
  EditingState,
  ContextMenuState,
  FrameOption,
  ModerationState,
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
  const selection = useTableSelection<TableEntry | Frame>({
    pageItems: tableState.data?.data || [],
  });

  // Local state for modals and UI
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
  
  // AI Agent Quick Edit modal state
  const [aiQuickEditEntry, setAiQuickEditEntry] = useState<TableEntry | Frame | null>(null);
  
  // Track submitted quick edit job IDs for background polling
  const quickEditJobIdsRef = useRef<Set<string>>(new Set());
  const [isPollingQuickEditJobs, setIsPollingQuickEditJobs] = useState(false);
  
  // Moderation loading state
  const [isModerationLoading, setIsModerationLoading] = useState(false);
  
  // Frame modal state
  const [isFrameModalOpen, setIsFrameModalOpen] = useState(false);
  const [frameOptions, setFrameOptions] = useState<FrameOption[]>([]);
  const [frameOptionsLoading, setFrameOptionsLoading] = useState(false);
  const [frameOptionsError, setFrameOptionsError] = useState<string | null>(null);
  const [selectedFrameValue, setSelectedFrameValue] = useState<string>('');
  const [frameSearchQuery, setFrameSearchQuery] = useState('');
  const [isFrameUpdating, setIsFrameUpdating] = useState(false);

  // Selected entries on current page (for modals)
  const selectedEntriesOnCurrentPage = useMemo(() => {
    if (!tableState.data?.data || selection.selectedCount === 0) {
      return [];
    }
    return tableState.data.data.filter(entry => selection.selectedIds.has(entry.id));
  }, [tableState.data, selection.selectedIds, selection.selectedCount]);

  // Filtered frame options based on search
  const filteredFrameOptions = useMemo(() => {
    if (!frameSearchQuery.trim()) {
      return frameOptions;
    }
    const query = frameSearchQuery.trim().toLowerCase();
    return frameOptions.filter(frame => {
      return frame.label.toLowerCase().includes(query);
    });
  }, [frameOptions, frameSearchQuery]);

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

  // Calculate moderation states of selected entries
  const getSelectionModerationState = useCallback((): ModerationState => {
    if (selectedEntriesOnCurrentPage.length === 0) {
      return { allFlagged: false, noneFlagged: false, allUnverifiable: false, noneUnverifiable: false };
    }

    const moderatableEntries = selectedEntriesOnCurrentPage.filter((entry): entry is TableEntry => 'flagged' in entry);
    
    if (moderatableEntries.length === 0) {
      return { allFlagged: false, noneFlagged: true, allUnverifiable: false, noneUnverifiable: true };
    }

    const allFlagged = moderatableEntries.every(entry => entry.flagged);
    const noneFlagged = moderatableEntries.every(entry => !entry.flagged);
    const allUnverifiable = moderatableEntries.every(entry => entry.verifiable === false);
    const noneUnverifiable = moderatableEntries.every(entry => entry.verifiable !== false);
    
    return { allFlagged, noneFlagged, allUnverifiable, noneUnverifiable };
  }, [selectedEntriesOnCurrentPage]);

  // Moderation handlers
  const handleModerationUpdate = async (updates: { 
    flagged?: boolean; 
    flaggedReason?: string;
    verifiable?: boolean;
    unverifiableReason?: string;
  }) => {
    if (selection.selectedCount === 0) return;

    const selectedCount = selection.selectedCount;
    setIsModerationLoading(true);

    try {
      const response = await fetch(`${tableState.apiPrefix}/moderation`, {
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
      const actualCount = result.updatedCount || result.count || result.staged_count || 0;

      await tableState.fetchData();
      selection.clearSelection();
      setIsModerationLoading(false);
      setModerationModal({ isOpen: false, action: null, reason: '' });

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

      setIsModerationLoading(false);
      setModerationModal({ isOpen: false, action: null, reason: '' });
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
      verifiable?: boolean;
      unverifiableReason?: string;
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

    handleModerationUpdate(updates);
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
      const actualCount = result.updatedCount || result.count || 0;

      const chosenFrame =
        normalizedFrameValue === null
          ? null
          : frameOptions.find(frame => frame.id === normalizedFrameValue) ?? null;

      await tableState.fetchData();

      selection.clearSelection();
      setIsFrameModalOpen(false);
      setSelectedFrameValue('');
      setFrameSearchQuery('');
      setFrameOptionsError(null);

      const frameName = chosenFrame ? chosenFrame.label : 'No frame';
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
      const response = await fetch(`${tableState.apiPrefix}/${editing.entryId}`, {
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

      // Refresh data
      await tableState.fetchData();
      handleCancelEdit();
    } catch (error) {
      console.error('Error updating entry:', error);
    }
  };

  // Context menu handlers
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
    
    // Set selection to just this entry using the hook
    selection.clearSelection();
    selection.toggleSelect(contextMenu.entryId);
    
    // Close context menu
    setContextMenu({ isOpen: false, x: 0, y: 0, entryId: null });
    
    // Open moderation modal
    handleOpenModerationModal(action);
  };

  const handleCloseContextMenu = () => {
    setContextMenu({ isOpen: false, x: 0, y: 0, entryId: null });
  };

  // AI Agent Quick Edit handlers
  const handleAIClick = (entry: TableEntry | Frame) => {
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
  const contextMenuEntry = contextMenu.entryId 
    ? tableState.data?.data.find(e => e.id === contextMenu.entryId) || null
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
        moderationState={getSelectionModerationState()}
        onOpenModerationModal={handleOpenModerationModal}
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

      {/* Moderation Modal */}
      <ModerationModal
        isOpen={moderationModal.isOpen}
        modalState={moderationModal}
        selectedCount={selection.selectedCount}
        selectedEntriesOnPage={selectedEntriesOnCurrentPage}
        isLoading={isModerationLoading}
        onClose={handleCloseModerationModal}
        onConfirm={handleConfirmModeration}
        onReasonChange={(reason) => setModerationModal(prev => ({ ...prev, reason }))}
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
    </div>
  );
}

// Re-export types for consumers
export type { DataTableProps, DataTableMode } from './types';
export type { DataTableMode as Mode } from './config';

