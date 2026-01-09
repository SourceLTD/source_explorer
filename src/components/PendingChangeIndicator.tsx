'use client';

import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PendingChangeInfo, PendingFieldChange, PendingChangeOperation } from '@/lib/types';
import ChangeTooltip from './ChangeTooltip';

// ============================================
// Styling utilities
// ============================================

/**
 * Get CSS classes for row-level highlighting based on operation type.
 */
export function getPendingRowClasses(operation: PendingChangeOperation): string {
  switch (operation) {
    case 'create':
      return 'bg-green-100 hover:bg-green-200';
    case 'delete':
      return 'bg-red-100 hover:bg-red-200 opacity-75';
    case 'update':
    default:
      return 'bg-orange-100 hover:bg-orange-200';
  }
}

/**
 * Get CSS classes for cell-level highlighting based on operation type.
 */
export function getPendingCellClasses(operation: PendingChangeOperation): string {
  switch (operation) {
    case 'create':
      return 'ring-2 ring-green-400 ring-inset bg-green-200';
    case 'delete':
      return 'ring-2 ring-red-400 ring-inset bg-red-200 line-through';
    case 'update':
    default:
      return 'ring-2 ring-orange-400 ring-inset bg-orange-200';
  }
}

/**
 * Get SVG stroke color for graph nodes based on operation type.
 */
export function getPendingNodeStroke(operation: PendingChangeOperation): string {
  switch (operation) {
    case 'create':
      return '#22c55e'; // green-500
    case 'delete':
      return '#ef4444'; // red-500
    case 'update':
    default:
      return '#f97316'; // orange-500
  }
}

/**
 * Get SVG fill color for graph nodes based on operation type.
 */
export function getPendingNodeFill(operation: PendingChangeOperation): string {
  switch (operation) {
    case 'create':
      return '#bbf7d0'; // green-200
    case 'delete':
      return '#fecaca'; // red-200
    case 'update':
    default:
      return '#fed7aa'; // orange-200
  }
}

// ============================================
// Components
// ============================================

interface PendingFieldIndicatorProps {
  /** The field name to check */
  fieldName: string;
  /** The pending change info from the entity */
  pending: PendingChangeInfo | null | undefined;
  /** The content to render */
  children: React.ReactNode;
  /** Optional additional className */
  className?: string;
  /** Whether this is a table cell (uses different styling) */
  isTableCell?: boolean;
}

/**
 * Wraps content to show pending change highlighting for a specific field.
 * Shows a tooltip with change details on click.
 */
export function PendingFieldIndicator({
  fieldName,
  pending,
  children,
  className = '',
  isTableCell = false,
}: PendingFieldIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Check if this field has a pending change
  const pendingField = pending?.pending_fields?.[fieldName];
  const hasPendingChange = !!pendingField;
  const operation = pending?.operation ?? 'update';

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!hasPendingChange) return;
    
    e.stopPropagation();
    
    if (wrapperRef.current) {
      setAnchorRect(wrapperRef.current.getBoundingClientRect());
      setShowTooltip(true);
    }
  }, [hasPendingChange]);

  const handleClose = useCallback(() => {
    setShowTooltip(false);
    setAnchorRect(null);
  }, []);

  if (!hasPendingChange) {
    return <>{children}</>;
  }

  const cellClasses = isTableCell 
    ? getPendingCellClasses(operation)
    : `inline-block rounded px-1 ${getPendingCellClasses(operation)}`;

  return (
    <>
      <div
        ref={wrapperRef}
        onClick={handleClick}
        className={`${cellClasses} cursor-pointer ${className}`}
        title={`Pending ${operation}: Click for details`}
      >
        {children}
      </div>
      {showTooltip && typeof window !== 'undefined' && createPortal(
        <ChangeTooltip
          fieldName={fieldName}
          change={pendingField}
          operation={operation}
          anchorRect={anchorRect}
          onClose={handleClose}
        />,
        document.body
      )}
    </>
  );
}

interface PendingRowIndicatorProps {
  /** The pending change info from the entity */
  pending: PendingChangeInfo | null | undefined;
  /** The content to render */
  children: React.ReactNode;
  /** Optional additional className */
  className?: string;
  /** Base className (will be replaced when pending) */
  baseClassName?: string;
}

/**
 * Wraps a row (tr) to show pending status via background color.
 * Does NOT show tooltip - use PendingFieldIndicator for individual fields.
 */
export function PendingRowIndicator({
  pending,
  children,
  className = '',
  baseClassName = 'bg-white',
}: PendingRowIndicatorProps) {
  const hasPending = !!pending;
  const operation = pending?.operation ?? 'update';

  const rowClasses = hasPending
    ? getPendingRowClasses(operation)
    : baseClassName;

  return (
    <div className={`${rowClasses} ${className}`}>
      {children}
    </div>
  );
}

interface PendingEntityBadgeProps {
  /** The pending change info from the entity */
  pending: PendingChangeInfo | null | undefined;
  /** Optional size */
  size?: 'sm' | 'md';
}

/**
 * A small badge indicating the pending operation type.
 * Useful for showing next to entity names or in headers.
 */
export function PendingEntityBadge({
  pending,
  size = 'sm',
}: PendingEntityBadgeProps) {
  if (!pending) return null;

  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';
  
  const badgeClasses = {
    create: 'bg-green-100 text-green-700 border-green-300',
    update: 'bg-orange-100 text-orange-700 border-orange-300',
    delete: 'bg-red-100 text-red-700 border-red-300',
  }[pending.operation];

  const label = {
    create: 'New',
    update: 'Modified',
    delete: 'Deleted',
  }[pending.operation];

  return (
    <span className={`${sizeClasses} ${badgeClasses} font-medium rounded border inline-flex items-center gap-1`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        pending.operation === 'create' ? 'bg-green-500' :
        pending.operation === 'delete' ? 'bg-red-500' :
        'bg-orange-500'
      }`} />
      {label}
    </span>
  );
}

// ============================================
// Utility hooks
// ============================================

/**
 * Hook to check if a specific field has a pending change.
 */
export function usePendingField(
  pending: PendingChangeInfo | null | undefined,
  fieldName: string
): { hasPending: boolean; change: PendingFieldChange | null; operation: PendingChangeOperation } {
  const change = pending?.pending_fields?.[fieldName] ?? null;
  return {
    hasPending: !!change,
    change,
    operation: pending?.operation ?? 'update',
  };
}

/**
 * Check if an entity has any pending changes.
 */
export function hasPendingChanges(pending: PendingChangeInfo | null | undefined): boolean {
  return !!pending;
}

/**
 * Get the count of pending field changes.
 */
export function getPendingFieldCount(pending: PendingChangeInfo | null | undefined): number {
  if (!pending?.pending_fields) return 0;
  return Object.keys(pending.pending_fields).length;
}

