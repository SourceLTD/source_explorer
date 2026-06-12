'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { TableLexicalUnit, Concept } from '@/lib/types';
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
import { FlagModal, ConceptChangeModal } from './DataTableModals';
import { ContextMenu } from './ContextMenu';
import { CopyFieldSelector } from './CopyFieldSelector';
import AIAgentQuickEditModal from '@/components/AIAgentQuickEditModal';
import { getColumnsForMode, hasNestedFields, NESTED_FIELD_CONFIGS } from './config';
import {
  DataTableProps,
  DataTableEntry,
  FlagModalState,
  EditingState,
  ContextMenuState,
  ConceptOption,
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
  const searchParams = useSearchParams();
  
  // Use our custom hook for data table state management
  const tableState = useDataTableState({
    mode,
    searchQuery,
    refreshTrigger,
  });

  // Get highlightId from URL params for row highlighting
  // Track if we've already shown the highlight animation to avoid re-triggering
  const highlightIdFromUrl = searchParams.get('highlightId');
  const [hasHighlighted, setHasHighlighted] = useState(false);
  
  // Reset hasHighlighted when URL highlightId changes (new navigation)
  const prevHighlightIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (highlightIdFromUrl !== prevHighlightIdRef.current) {
      prevHighlightIdRef.current = highlightIdFromUrl;
      setHasHighlighted(false);
    }
  }, [highlightIdFromUrl]);

  // Only pass highlightId if we haven't shown the animation yet
  const activeHighlightId = hasHighlighted ? null : highlightIdFromUrl;

  // Handler called when highlight animation completes - just mark as done, don't modify URL
  const handleHighlightComplete = useCallback(() => {
    setHasHighlighted(true);
  }, []);

  // Use the existing useTableSelection hook for selection management
  const selection = useTableSelection<DataTableEntry>({
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
  // ----------------------------------------------------------------------
  // DEPRECATED: AI batch flagging + AI Quick Edit feature
  //
  // The trigger buttons for these features have been removed from the table
  // UI. The state, handlers, modals, hooks, API routes, and polling logic
  // are intentionally retained as deprecated infrastructure so the feature
  // can be reintroduced without rebuilding it. As long as no UI element
  // sets `isAIOverlayOpen` to true or assigns a value to `aiQuickEditEntry`,
  // the modals stay closed and no jobs are submitted from this surface.
  // ----------------------------------------------------------------------
  const [isAIOverlayOpen, setIsAIOverlayOpen] = useState(false);
  const [pendingAIJobs, setPendingAIJobs] = useState(0);

  const [aiQuickEditEntry, setAiQuickEditEntry] = useState<TableLexicalUnit | Concept | null>(null);

  const quickEditJobIdsRef = useRef<Set<string>>(new Set());
  const [isPollingQuickEditJobs, setIsPollingQuickEditJobs] = useState(false);
  
  // Flag loading state
  const [isFlagLoading, setIsFlagLoading] = useState(false);
  
  // Concept modal state
  const [isConceptModalOpen, setIsConceptModalOpen] = useState(false);
  const [conceptOptions, setConceptOptions] = useState<ConceptOption[]>([]);
  const [conceptOptionsLoading, setConceptOptionsLoading] = useState(false);
  const [conceptOptionsError, setConceptOptionsError] = useState<string | null>(null);
  const [selectedConceptValue, setSelectedConceptValue] = useState<string>('');
  const [conceptSearchQuery, setConceptSearchQuery] = useState('');
  const [isConceptUpdating, setIsConceptUpdating] = useState(false);

  // Copy field selector state
  const copyFieldSelection = useCopyFieldSelection(mode);
  const [copyMenuState, setCopyMenuState] = useState<{
    isOpen: boolean;
    entry: DataTableEntry | null;
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

  const selectedFlaggableEntriesOnCurrentPage = useMemo(
    () => selectedEntriesOnCurrentPage.filter((entry): entry is TableLexicalUnit | Concept => 'flagged' in entry),
    [selectedEntriesOnCurrentPage]
  );

  // Subscribe to job completion broadcasts from other tabs and same-tab events
  // This ensures all DataTable instances refresh when ANY AI job completes
  useJobCompletionBroadcast(
    mode,
    tableState.fetchData,
    isAIOverlayOpen // Don't poll when overlay is open - it handles polling itself
  );

  // Filtered concept options based on search
  const filteredConceptOptions = useMemo(() => {
    if (!conceptSearchQuery.trim()) {
      return conceptOptions;
    }
    const query = conceptSearchQuery.trim().toLowerCase();
    return conceptOptions.filter(concept => {
      return (
        concept.label.toLowerCase().includes(query) ||
        (concept.code?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [conceptOptions, conceptSearchQuery]);

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
    if (mode === 'senses' || mode === 'referents') {
      setPendingAIJobs(0);
      return;
    }

    try {
      const response = await api.get<{ jobs: Array<{ status: string }> }>(`/api/llm-jobs?entityType=${mode}`);
      const pending = response.jobs?.filter(job => job.status === 'queued' || job.status === 'running').length ?? 0;
      setPendingAIJobs(pending);
    } catch (error) {
      console.warn('Failed to load pending AI jobs', error);
    }
  }, [mode]);

  // Fetch concept options
  const fetchConceptOptions = useCallback(async (search?: string) => {
    if (mode !== 'lexical_units') {
      return;
    }

    setConceptOptionsLoading(true);
    setConceptOptionsError(null);

    try {
      const queryParams = new URLSearchParams();
      if (search) queryParams.set('search', search);
      queryParams.set('limit', '100');

      const response = await fetch(`/api/concepts?${queryParams.toString()}`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load concepts');
      }

      const concepts: ConceptOption[] = await response.json();
      setConceptOptions(concepts);
    } catch (error) {
      setConceptOptionsError(error instanceof Error ? error.message : 'Failed to load concepts');
    } finally {
      setConceptOptionsLoading(false);
    }
  }, [mode]);

  // Load concept options when modal opens or search query changes
  useEffect(() => {
    if (!isConceptModalOpen || mode !== 'lexical_units') {
      return;
    }

    const debounceTimer = setTimeout(() => {
      void fetchConceptOptions(conceptSearchQuery);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [fetchConceptOptions, conceptSearchQuery, isConceptModalOpen, mode]);

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
        updates.flaggedReason = reason.trim() || null as unknown as string;
        break;
      case 'unflag':
        updates.flagged = false;
        updates.flaggedReason = reason.trim() || null as unknown as string;
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

  // Concept modal handlers
  const handleOpenConceptModal = () => {
    if (mode !== 'lexical_units') {
      return;
    }
    setConceptOptionsError(null);
    setSelectedConceptValue('');
    setConceptSearchQuery('');
    setIsConceptModalOpen(true);
  };

  const handleCloseConceptModal = () => {
    if (isConceptUpdating) {
      return;
    }
    setIsConceptModalOpen(false);
    setSelectedConceptValue('');
    setConceptSearchQuery('');
    setConceptOptionsError(null);
  };

  const handleConfirmConceptChange = async () => {
    if (selection.selectedCount === 0 || mode !== 'lexical_units') {
      return;
    }

    const normalizedConceptValue =
      selectedConceptValue === ''
        ? undefined
        : selectedConceptValue === '__CLEAR__'
          ? null
          : selectedConceptValue;

    if (normalizedConceptValue === undefined) {
      setConceptOptionsError('Please select a concept before confirming');
      return;
    }

    const selectedCount = selection.selectedCount;
    setIsConceptUpdating(true);
    setConceptOptionsError(null);

    try {
      const response = await fetch(`${tableState.apiPrefix}/concept`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: Array.from(selection.selectedIds),
          conceptId: normalizedConceptValue,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error ?? 'Failed to update concepts');
      }

      const result = await response.json();
      const actualCount = result.updatedCount || result.updated_count || result.count || 0;

      const chosenConcept =
        normalizedConceptValue === null
          ? null
          : conceptOptions.find(concept => concept.id === normalizedConceptValue) ?? null;

      await tableState.fetchData();
      refreshPendingChangesCount();

      selection.clearSelection();
      setIsConceptModalOpen(false);
      setSelectedConceptValue('');
      setConceptSearchQuery('');
      setConceptOptionsError(null);

      const conceptName = chosenConcept ? (chosenConcept.code?.trim() || chosenConcept.label) : 'No concept';
      const action = normalizedConceptValue === null ? 'cleared concepts for' : `updated to ${conceptName} for`;
      
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to update concepts';
      setConceptOptionsError(errorMessage);
      
      showGlobalAlert({
        type: 'error',
        title: 'Error',
        message: errorMessage,
        durationMs: 6000
      });
    } finally {
      setIsConceptUpdating(false);
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
  const handleAIClick = (entry: DataTableEntry) => {
    if (!('flagged' in entry)) {
      return;
    }
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

  // Format an array item (like a property or lexical_unit) using selected sub-fields
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
    entry: DataTableEntry, 
    columnKey: string,
    selectedNestedFields?: string[]
  ): string => {
    const value = (entry as unknown as Record<string, unknown>)[columnKey];
    
    if (value === null || value === undefined) {
      return '—';
    }
    
    // Handle nested columns with sub-field selection
    if (hasNestedFields(columnKey) && selectedNestedFields && selectedNestedFields.length > 0) {
      if (columnKey === 'properties' && 'properties' in entry) {
        const properties = entry.properties as unknown as Array<Record<string, unknown>>;
        if (!properties || properties.length === 0) return '—';
        
        return properties.map(prop => formatArrayItem(prop, selectedNestedFields)).join('\n  - ');
      }
      
      if (columnKey === 'lexical_units' && 'lexical_units' in entry) {
        const lexData = entry.lexical_units as unknown as { entries: Array<Record<string, unknown>> };
        if (!lexData?.entries || lexData.entries.length === 0) return '—';
        
        return lexData.entries.map(lex => formatArrayItem(lex, selectedNestedFields)).join('\n  - ');
      }
    }
    
    // Fallback for nested columns without sub-field selection
    if (columnKey === 'properties' && 'properties' in entry) {
      const properties = entry.properties as unknown as Array<{ label?: string | null }>;
      if (!properties || properties.length === 0) return '—';
      return properties.map(r => r.label || '—').filter(Boolean).join(', ');
    }
    
    if (columnKey === 'lexical_units' && 'lexical_units' in entry) {
      const lexData = entry.lexical_units as unknown as { entries: Array<{ gloss: string; lemmas?: string[] }> };
      if (!lexData?.entries || lexData.entries.length === 0) return '—';
      return lexData.entries.map(e => {
        const lemmas = e.lemmas?.join(', ') || '';
        return lemmas ? `${lemmas}: ${e.gloss}` : e.gloss;
      }).join('; ');
    }
    
    // Standard value formatting
    return formatSingleValue(value);
  }, [formatArrayItem, formatSingleValue]);

  const handleCopyClick = useCallback((entry: DataTableEntry) => {
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

  const handleCopyLongPress = useCallback((entry: DataTableEntry, buttonEl: HTMLButtonElement) => {
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

  const handleRowClick = useCallback((entry: DataTableEntry) => {
    // Senses and referents are read-only and not edited via these handlers.
    if ('conceptWarning' in entry || 'canonical_label' in entry) {
      return;
    }
    onRowClick?.(entry);
  }, [onRowClick]);

  const handleEditEntryClick = useCallback((entry: DataTableEntry) => {
    // Senses and referents are read-only and not edited via these handlers.
    if ('conceptWarning' in entry || 'canonical_label' in entry) {
      return;
    }
    onEditClick?.(entry);
  }, [onEditClick]);

  // Loading state
  if (tableState.loading && !tableState.data) {
    return (
      <div className={`bg-white rounded-xl border border-gray-200 flex flex-col flex-1 min-h-0 ${className || ''}`}>
        <div className="p-8 text-center">
          <LoadingSpinner size="page" label="Loading entries..." className="py-20" />
        </div>
      </div>
    );
  }

  // Error state
  if (tableState.error) {
    return (
      <div className={`bg-white rounded-xl border border-gray-200 flex flex-col flex-1 min-h-0 ${className || ''}`}>
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
    <div className={`bg-white rounded-xl border border-gray-200 flex flex-col flex-1 min-h-0 ${className || ''} ${tableState.isResizing ? 'select-none' : ''}`}>
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
        selectedCount={mode === 'senses' || mode === 'referents' ? 0 : selection.selectedCount}
        flagState={getSelectionFlagState()}
        onOpenFlagModal={handleOpenFlagModal}
        onOpenConceptModal={handleOpenConceptModal}
        isPageSizePanelOpen={tableState.isPageSizePanelOpen}
        onPageSizePanelToggle={() => tableState.setIsPageSizePanelOpen(!tableState.isPageSizePanelOpen)}
        pageSize={tableState.pageSize}
        onPageSizeChange={tableState.handlePageSizeChange}
        totalItems={tableState.data?.total}
      />

      {/* Table */}
      <div className="overflow-x-auto relative flex-1 min-h-0 overflow-y-auto bg-gray-50">
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
          highlightId={activeHighlightId}
          onSort={tableState.handleSort}
          onRowClick={handleRowClick}
          onEditClick={handleEditEntryClick}
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
          onHighlightComplete={handleHighlightComplete}
        />
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={tableState.currentPage}
        totalPages={tableState.data?.totalPages || 1}
        totalItems={tableState.data?.total || 0}
        pageSize={tableState.data?.limit || tableState.pageSize}
        onPageChange={tableState.handlePageChange}
        loading={tableState.loading}
        itemLabel={mode === 'referents' ? 'referents' : mode === 'senses' ? 'senses' : 'entries'}
      />

      {/* Context Menu */}
      {mode !== 'senses' && mode !== 'referents' && (
        <ContextMenu
          contextMenu={contextMenu}
          entry={contextMenuEntry as TableLexicalUnit | Concept | null}
          mode={mode}
          onClose={handleCloseContextMenu}
          onAction={handleContextMenuAction}
        />
      )}

      {/* Flag Modal */}
      <FlagModal
        isOpen={flagModal.isOpen}
        modalState={flagModal}
        selectedCount={selection.selectedCount}
        selectedEntriesOnPage={selectedFlaggableEntriesOnCurrentPage}
        isLoading={isFlagLoading}
        onClose={handleCloseFlagModal}
        onConfirm={handleConfirmFlag}
        onReasonChange={(reason) => setFlagModal(prev => ({ ...prev, reason }))}
      />

      {/* Concept Change Modal */}
      {mode === 'lexical_units' && (
        <ConceptChangeModal
          isOpen={isConceptModalOpen}
          selectedCount={selection.selectedCount}
          selectedEntriesOnCurrentPage={selectedFlaggableEntriesOnCurrentPage}
          conceptOptions={conceptOptions}
          filteredConceptOptions={filteredConceptOptions}
          conceptOptionsLoading={conceptOptionsLoading}
          conceptOptionsError={conceptOptionsError}
          selectedConceptValue={selectedConceptValue}
          conceptSearchQuery={conceptSearchQuery}
          isConceptUpdating={isConceptUpdating}
          onClose={handleCloseConceptModal}
          onConfirm={handleConfirmConceptChange}
          onConceptValueChange={setSelectedConceptValue}
          onSearchQueryChange={setConceptSearchQuery}
          onClearError={() => setConceptOptionsError(null)}
          onRetryLoad={fetchConceptOptions}
        />
      )}

      {/* AI Jobs Overlay */}
      {mode !== 'senses' && mode !== 'referents' && (
        <AIJobsOverlay
          isOpen={isAIOverlayOpen}
          onClose={() => setIsAIOverlayOpen(false)}
          mode={mode}
          selectedIds={Array.from(selection.selectedIds)}
          onJobsUpdated={setPendingAIJobs}
          onJobCompleted={tableState.fetchData}
        />
      )}

      {/* AI Agent Quick Edit Modal */}
      {aiQuickEditEntry && mode !== 'senses' && mode !== 'referents' && (
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

