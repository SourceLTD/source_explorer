'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { DataTableMode, getColumnsForMode, hasNestedFields, NESTED_FIELD_CONFIGS } from './config';
import { CopyFieldSelectionState } from './hooks/useCopyFieldSelection';

interface CopyFieldSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  mode: DataTableMode;
  selectedFields: CopyFieldSelectionState;
  onToggleField: (fieldKey: string) => void;
  onToggleNestedField: (columnKey: string, subFieldKey: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onSelectAllNestedFields: (columnKey: string) => void;
  onClearAllNestedFields: (columnKey: string) => void;
}

export function CopyFieldSelector({
  isOpen,
  onClose,
  anchorEl,
  mode,
  selectedFields,
  onToggleField,
  onToggleNestedField,
  onSelectAll,
  onClearAll,
  onSelectAllNestedFields,
  onClearAllNestedFields,
}: CopyFieldSelectorProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());

  // Click-outside handling
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        anchorEl &&
        !anchorEl.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    // Delay to prevent immediate close from the same click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, anchorEl]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset expanded state when closed
  useEffect(() => {
    if (!isOpen) {
      setExpandedColumns(new Set());
    }
  }, [isOpen]);

  if (!isOpen || !anchorEl) return null;

  // Get columns for current mode (excluding 'actions')
  const columns = getColumnsForMode(mode).filter(col => col.key !== 'actions');

  // Calculate position - show below and to the left of the anchor
  const rect = anchorEl.getBoundingClientRect();
  const style: React.CSSProperties = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    right: `${window.innerWidth - rect.right}px`,
    zIndex: 50,
  };

  // Count selected top-level fields
  const selectedCount = columns.filter(col => selectedFields[col.key]).length;

  const toggleExpanded = (columnKey: string) => {
    setExpandedColumns(prev => {
      const next = new Set(prev);
      if (next.has(columnKey)) {
        next.delete(columnKey);
      } else {
        next.add(columnKey);
      }
      return next;
    });
  };

  const getNestedFieldCount = (columnKey: string): { selected: number; total: number } => {
    const nestedConfig = NESTED_FIELD_CONFIGS[columnKey];
    if (!nestedConfig) return { selected: 0, total: 0 };
    
    const selected = nestedConfig.filter(sf => selectedFields[`${columnKey}.${sf.key}`]).length;
    return { selected, total: nestedConfig.length };
  };

  return (
    <div
      ref={panelRef}
      className="bg-white rounded-lg border border-gray-200 shadow-lg py-2 min-w-64 max-h-[28rem] overflow-auto"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-3 pb-2 border-b border-gray-100 mb-2">
        <div className="text-sm font-medium text-gray-700">Select fields to copy</div>
        <div className="text-xs text-gray-500 mt-0.5">
          {selectedCount} of {columns.length} fields selected
        </div>
      </div>

      {/* Select All / Clear All buttons */}
      <div className="px-3 pb-2 flex gap-2">
        <button
          onClick={onSelectAll}
          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
        >
          Select all
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={onClearAll}
          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
        >
          Clear all
        </button>
      </div>

      {/* Field checkboxes */}
      <div className="px-1">
        {columns.map(col => {
          const hasNested = hasNestedFields(col.key);
          const isExpanded = expandedColumns.has(col.key);
          const nestedConfig = hasNested ? NESTED_FIELD_CONFIGS[col.key] : null;
          const nestedCount = hasNested ? getNestedFieldCount(col.key) : null;

          return (
            <div key={col.key}>
              {/* Main field row */}
              <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-gray-50 rounded">
                {hasNested ? (
                  <button
                    onClick={() => toggleExpanded(col.key)}
                    className="p-0.5 hover:bg-gray-200 rounded"
                  >
                    {isExpanded ? (
                      <ChevronDownIcon className="w-3.5 h-3.5 text-gray-500" />
                    ) : (
                      <ChevronRightIcon className="w-3.5 h-3.5 text-gray-500" />
                    )}
                  </button>
                ) : (
                  <div className="w-4.5" /> // Spacer for alignment
                )}
                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedFields[col.key] ?? false}
                    onChange={() => onToggleField(col.key)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{col.label}</span>
                  {hasNested && nestedCount && (
                    <span className="text-xs text-gray-400">
                      ({nestedCount.selected}/{nestedCount.total})
                    </span>
                  )}
                </label>
              </div>

              {/* Nested fields (expandable) */}
              {hasNested && isExpanded && nestedConfig && (
                <div className="ml-6 border-l border-gray-200 pl-2 mb-1">
                  {/* Select/Clear all nested fields */}
                  <div className="flex gap-2 px-2 py-1">
                    <button
                      onClick={() => onSelectAllNestedFields(col.key)}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      All
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={() => onClearAllNestedFields(col.key)}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      None
                    </button>
                  </div>
                  {nestedConfig.map(subField => (
                    <label
                      key={subField.key}
                      className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFields[`${col.key}.${subField.key}`] ?? false}
                        onChange={() => onToggleNestedField(col.key, subField.key)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-600">{subField.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
