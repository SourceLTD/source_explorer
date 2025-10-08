'use client';

import React, { useRef, useEffect } from 'react';

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  sortable?: boolean;
}

export interface ColumnVisibilityState {
  [key: string]: boolean;
}

interface ColumnVisibilityPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  columns: ColumnConfig[];
  onColumnVisibilityChange: (visibility: ColumnVisibilityState) => void;
  onResetToDefaults: () => void;
}

export default function ColumnVisibilityPanel({
  isOpen,
  onToggle,
  columns,
  onColumnVisibilityChange,
  onResetToDefaults
}: ColumnVisibilityPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        if (isOpen) {
          onToggle();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onToggle]);

  const handleColumnToggle = (columnKey: string) => {
    const newVisibility: ColumnVisibilityState = {};
    columns.forEach(col => {
      newVisibility[col.key] = col.key === columnKey ? !col.visible : col.visible;
    });
    onColumnVisibilityChange(newVisibility);
  };

  const handleSelectAll = () => {
    const newVisibility: ColumnVisibilityState = {};
    columns.forEach(col => {
      newVisibility[col.key] = true;
    });
    onColumnVisibilityChange(newVisibility);
  };

  const handleSelectNone = () => {
    const newVisibility: ColumnVisibilityState = {};
    columns.forEach(col => {
      newVisibility[col.key] = false;
    });
    onColumnVisibilityChange(newVisibility);
  };

  const visibleCount = columns.filter(col => col.visible).length;
  const totalCount = columns.length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        Columns ({visibleCount}/{totalCount})
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Column Visibility</h3>
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                >
                  All
                </button>
                <span className="text-xs text-gray-400">|</span>
                <button
                  onClick={handleSelectNone}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                >
                  None
                </button>
                <span className="text-xs text-gray-400">|</span>
                <button
                  onClick={onResetToDefaults}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {columns.map((column) => (
                <label
                  key={column.key}
                  className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={column.visible}
                    onChange={() => handleColumnToggle(column.key)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">
                      {column.label}
                    </span>
                    {column.sortable && (
                      <span className="ml-2 text-xs text-gray-500">(sortable)</span>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                {visibleCount} of {totalCount} columns visible
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
