'use client';

import React from 'react';
import { SparklesIcon, FlagIcon } from '@heroicons/react/24/outline';
import FilterPanel from '@/components/FilterPanel';
import type { FilterState } from './filterState';
import ColumnVisibilityPanel, { ColumnConfig, ColumnVisibilityState } from '@/components/ColumnVisibilityPanel';
import PageSizeSelector from '@/components/PageSizeSelector';
import { DataTableMode } from './config';
import { FlagState } from './types';

interface DataTableToolbarProps {
  mode: DataTableMode;
  
  // Filters
  isFilterPanelOpen: boolean;
  onFilterPanelToggle: () => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClearAllFilters: () => void;
  
  // Column visibility
  isColumnPanelOpen: boolean;
  onColumnPanelToggle: () => void;
  columns: ColumnConfig[];
  columnVisibility: ColumnVisibilityState;
  onColumnVisibilityChange: (visibility: ColumnVisibilityState) => void;
  onResetColumns: () => void;
  
  // Column widths
  onResetColumnWidths: () => void;
  
  // AI Jobs
  pendingAIJobs: number;
  onOpenAIOverlay: () => void;
  
  // Selection & Flags
  selectedCount: number;
  flagState: FlagState;
  onOpenFlagModal: (action: 'flag' | 'unflag' | 'forbid' | 'allow') => void;
  onOpenFrameModal: () => void;
  
  // Page size
  isPageSizePanelOpen: boolean;
  onPageSizePanelToggle: () => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  totalItems?: number;
}

function RowStatusLegend() {
  return (
    <div className="mb-3 flex items-center gap-4 text-xs">
      <span className="font-medium text-gray-600">Row Colors:</span>
      <div className="flex items-center gap-1">
        <div className="w-6 h-4 rounded bg-red-100"></div>
        <span className="text-gray-600">Pending Deletion</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-6 h-4 rounded bg-orange-100"></div>
        <span className="text-gray-600">Pending Update</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-6 h-4 rounded bg-green-100"></div>
        <span className="text-gray-600">Pending Creation</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-6 h-4 rounded" style={{ backgroundColor: '#add8ff' }}></div>
        <span className="text-gray-600">Flagged</span>
      </div>
    </div>
  );
}

interface FlagActionsProps {
  mode: DataTableMode;
  selectedCount: number;
  flagState: FlagState;
  onOpenFlagModal: (action: 'flag' | 'unflag' | 'forbid' | 'allow') => void;
  onOpenFrameModal: () => void;
}

function FlagActions({
  mode,
  selectedCount,
  flagState,
  onOpenFlagModal,
  onOpenFrameModal,
}: FlagActionsProps) {
  const { allFlagged, noneFlagged, allUnverifiable, noneUnverifiable } = flagState;
  const mixedFlagged = !allFlagged && !noneFlagged;
  const mixedUnverifiable = !allUnverifiable && !noneUnverifiable;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">
        {selectedCount} selected
      </span>
      <div className="h-4 w-px bg-gray-300"></div>
      
      {/* Flagged Actions */}
      {(noneFlagged || mixedFlagged) && (
        <button
          onClick={() => onOpenFlagModal('flag')}
          className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-blue-700 bg-blue-100 border border-blue-200 rounded-xl hover:bg-blue-200 transition-colors cursor-pointer"
        >
          <FlagIcon className="w-4 h-4" />
          Mark Flagged
        </button>
      )}
      {(allFlagged || mixedFlagged) && (
        <button
          onClick={() => onOpenFlagModal('unflag')}
          className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Unflag
        </button>
      )}
      
      {/* Verifiable Actions */}
      {(noneUnverifiable || mixedUnverifiable) && (
        <button
          onClick={() => onOpenFlagModal('forbid')}
          className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-xl hover:bg-gray-200 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
          </svg>
          Mark Unverifiable
        </button>
      )}
      {(allUnverifiable || mixedUnverifiable) && (
        <button
          onClick={() => onOpenFlagModal('allow')}
          className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-green-700 bg-green-100 border border-green-200 rounded-xl hover:bg-green-200 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Mark Verifiable
        </button>
      )}
      {mode === 'lexical_units' && (
        <button
          onClick={onOpenFrameModal}
          className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-blue-600 bg-blue-100 border border-blue-200 rounded-xl hover:bg-blue-200 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h11m-2-3 3 3-3 3M20 17H9m2-3-3 3 3 3" />
          </svg>
          Change Frame
        </button>
      )}
    </div>
  );
}

export function DataTableToolbar({
  mode,
  isFilterPanelOpen,
  onFilterPanelToggle,
  filters,
  onFiltersChange,
  onClearAllFilters,
  isColumnPanelOpen,
  onColumnPanelToggle,
  columns,
  columnVisibility,
  onColumnVisibilityChange,
  onResetColumns,
  onResetColumnWidths,
  pendingAIJobs,
  onOpenAIOverlay,
  selectedCount,
  flagState,
  onOpenFlagModal,
  onOpenFrameModal,
  isPageSizePanelOpen,
  onPageSizePanelToggle,
  pageSize,
  onPageSizeChange,
  totalItems,
}: DataTableToolbarProps) {
  // Filter out actions column from column visibility panel
  const columnsForPanel = columns.filter(col => col.key !== 'actions');

  return (
    <div className="p-4 border-b border-gray-200 bg-gray-50">
      <RowStatusLegend />
      
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <FilterPanel
              isOpen={isFilterPanelOpen}
              onToggle={onFilterPanelToggle}
              filters={filters}
              onFiltersChange={onFiltersChange}
              onClearAll={onClearAllFilters}
              mode={mode}
            />
          </div>
          <div className="relative">
            <ColumnVisibilityPanel
              isOpen={isColumnPanelOpen}
              onToggle={onColumnPanelToggle}
              columns={columnsForPanel}
              onColumnVisibilityChange={onColumnVisibilityChange}
              onResetToDefaults={onResetColumns}
            />
          </div>
          <button
            onClick={onResetColumnWidths}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
            title="Reset column widths to defaults"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12V10m0 0l3 3m-3-3l-3 3" />
            </svg>
            Reset Widths
          </button>
          <button
            onClick={onOpenAIOverlay}
            className="relative inline-flex items-center gap-2 rounded-xl px-3 py-2 text-white transition-colors hover:brightness-110 focus:outline-none focus:ring-2 bg-gradient-to-r from-blue-500 to-blue-600 focus:ring-blue-500 cursor-pointer"
            title="Open AI batch flagging"
            aria-label="Open AI batch flagging"
            type="button"
          >
            <SparklesIcon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            {pendingAIJobs > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                {pendingAIJobs > 99 ? '99+' : pendingAIJobs}
              </span>
            )}
          </button>
          
          {/* Flag Actions */}
          {selectedCount > 0 && (
            <FlagActions
              mode={mode}
              selectedCount={selectedCount}
              flagState={flagState}
              onOpenFlagModal={onOpenFlagModal}
              onOpenFrameModal={onOpenFrameModal}
            />
          )}
        </div>

        <PageSizeSelector
          isOpen={isPageSizePanelOpen}
          onToggle={onPageSizePanelToggle}
          pageSize={pageSize}
          onPageSizeChange={onPageSizeChange}
          totalItems={totalItems}
        />
      </div>
    </div>
  );
}

