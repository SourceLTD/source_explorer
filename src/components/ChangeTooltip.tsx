'use client';

import React, { useEffect, useRef, useState } from 'react';
import { PendingFieldChange, PendingChangeOperation } from '@/lib/types';

interface ChangeTooltipProps {
  /** The field name being changed */
  fieldName: string;
  /** The pending change info */
  change: PendingFieldChange;
  /** The operation type (for styling) */
  operation: PendingChangeOperation;
  /** Position relative to anchor element */
  anchorRect: DOMRect | null;
  /** Callback to close the tooltip */
  onClose: () => void;
}

/**
 * Format a value for display in the tooltip.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '(empty)';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty list)';
    return value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * Get styles based on operation type.
 */
function getOperationStyles(operation: PendingChangeOperation) {
  switch (operation) {
    case 'create':
      return {
        borderColor: 'border-blue-400',
        bgColor: 'bg-blue-50',
        headerBg: 'bg-blue-100',
        label: 'New Field',
        labelColor: 'text-blue-700',
      };
    case 'delete':
      return {
        borderColor: 'border-red-400',
        bgColor: 'bg-red-50',
        headerBg: 'bg-red-100',
        label: 'Will be Deleted',
        labelColor: 'text-red-700',
      };
    case 'update':
    default:
      return {
        borderColor: 'border-green-400',
        bgColor: 'bg-green-50',
        headerBg: 'bg-green-100',
        label: 'Pending Change',
        labelColor: 'text-green-700',
      };
  }
}

export default function ChangeTooltip({
  fieldName,
  change,
  operation,
  anchorRect,
  onClose,
}: ChangeTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const styles = getOperationStyles(operation);

  // Calculate position when anchor changes
  useEffect(() => {
    if (!anchorRect || !tooltipRef.current) return;

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Try to position below the anchor
    let top = anchorRect.bottom + 8;
    let left = anchorRect.left + (anchorRect.width / 2) - (tooltipRect.width / 2);

    // Adjust if tooltip would go off-screen
    if (left < 8) left = 8;
    if (left + tooltipRect.width > viewportWidth - 8) {
      left = viewportWidth - tooltipRect.width - 8;
    }

    // If tooltip would go below viewport, position above anchor
    if (top + tooltipRect.height > viewportHeight - 8) {
      top = anchorRect.top - tooltipRect.height - 8;
    }

    setPosition({ top, left });
  }, [anchorRect]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  if (!anchorRect) return null;

  return (
    <div
      ref={tooltipRef}
      className={`fixed z-[9999] min-w-[200px] max-w-[400px] rounded-lg border-2 ${styles.borderColor} ${styles.bgColor} overflow-hidden`}
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      {/* Header */}
      <div className={`px-3 py-2 ${styles.headerBg} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold uppercase ${styles.labelColor}`}>
            {styles.label}
          </span>
          <span className="text-sm font-mono font-medium text-gray-800">
            {fieldName}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="px-3 py-2 space-y-2">
        {operation !== 'create' && (
          <div>
            <div className="text-xs text-gray-500 uppercase font-medium mb-1">Previous</div>
            <div className="text-sm text-gray-700 bg-white px-2 py-1 rounded border border-gray-200 line-through">
              {formatValue(change.old_value)}
            </div>
          </div>
        )}
        {operation !== 'delete' && (
          <div>
            <div className="text-xs text-gray-500 uppercase font-medium mb-1">New Value</div>
            <div className="text-sm text-gray-900 font-medium bg-white px-2 py-1 rounded border border-gray-200">
              {formatValue(change.new_value)}
            </div>
          </div>
        )}
        
        {/* Status badge */}
        <div className="pt-1 flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            change.status === 'approved' 
              ? 'bg-green-100 text-green-700'
              : change.status === 'rejected'
              ? 'bg-red-100 text-red-700'
              : 'bg-yellow-100 text-yellow-700'
          }`}>
            {change.status}
          </span>
        </div>
      </div>
    </div>
  );
}

