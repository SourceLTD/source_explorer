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
      // Use yellow for per-field update highlighting (distinct from the orange row-level highlight)
      return 'ring-2 ring-yellow-400 ring-inset bg-yellow-100';
  }
}

/**
 * Frame role changes are represented as granular `frame_roles.<ROLETYPE>.*` fields, but are
 * still part of an entity-level UPDATE changeset. For role-level highlighting we keep the
 * classic orange "update" styling (instead of yellow).
 */
export function getFrameRolePendingCellClasses(operation: PendingChangeOperation): string {
  switch (operation) {
    case 'create':
      return getPendingCellClasses('create');
    case 'delete':
      // No strikethrough for deleted role previews (we still want the old values readable).
      return 'ring-2 ring-red-400 ring-inset bg-red-200';
    case 'update':
    default:
      // Match the app-wide "update" orange shade used elsewhere (e.g. row-level update highlight).
      return 'ring-2 ring-orange-400 ring-inset bg-orange-100';
  }
}

export type FrameRoleChangeSummary = {
  created: string[];
  updated: string[];
  deleted: string[];
};

export type FrameRoleSnapshot = {
  roleType: string;
  label: string | null;
  description: string | null;
  notes: string | null;
  main: boolean;
  examples: string[];
};

function isTruthyBoolean(v: unknown): boolean {
  return v === true || v === 1 || v === 'true';
}

function asNullableString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

/**
 * Reconstruct the OLD (pre-change) values for a specific frame role from pending fields.
 * Useful for displaying deletions, since deleted roles are removed from the preview `frame_roles` array.
 */
export function getFrameRoleOldSnapshot(
  pending: PendingChangeInfo | null | undefined,
  roleTypeLabel: string
): FrameRoleSnapshot | null {
  if (!pending?.pending_fields) return null;
  if (!roleTypeLabel) return null;

  const key = (field: string) => `frame_roles.${roleTypeLabel}.${field}`;
  const fields = pending.pending_fields;

  const label = fields[key('label')] ? asNullableString(fields[key('label')].old_value) : null;
  const description = fields[key('description')] ? asNullableString(fields[key('description')].old_value) : null;
  const notes = fields[key('notes')] ? asNullableString(fields[key('notes')].old_value) : null;
  const main = fields[key('main')] ? isTruthyBoolean(fields[key('main')].old_value) : false;
  const examples = fields[key('examples')] ? asStringArray(fields[key('examples')].old_value) : [];

  return { roleType: roleTypeLabel, label, description, notes, main, examples };
}

/**
 * Determine whether a specific frame role (by role type label) is being created/updated/deleted.
 */
export function getFrameRoleOperation(
  pending: PendingChangeInfo | null | undefined,
  roleTypeLabel: string
): PendingChangeOperation | null {
  if (!pending?.pending_fields) return null;
  if (!roleTypeLabel) return null;

  const existsKey = `frame_roles.${roleTypeLabel}.__exists`;
  const existsChange = pending.pending_fields[existsKey];

  if (existsChange) {
    const oldExists = isTruthyBoolean(existsChange.old_value);
    const newExists = isTruthyBoolean(existsChange.new_value);
    if (!oldExists && newExists) return 'create';
    if (oldExists && !newExists) return 'delete';
  }

  const prefix = `frame_roles.${roleTypeLabel}.`;
  const hasAnyRoleSubfieldChange = Object.keys(pending.pending_fields).some((k) => (
    k.startsWith(prefix) && k !== existsKey
  ));
  return hasAnyRoleSubfieldChange ? 'update' : null;
}

/**
 * Summarize create/update/delete operations across all frame roles in a changeset.
 */
export function getFrameRoleChangeSummary(
  pending: PendingChangeInfo | null | undefined
): FrameRoleChangeSummary {
  if (!pending?.pending_fields) {
    return { created: [], updated: [], deleted: [] };
  }

  const roleTypes = new Set<string>();
  for (const key of Object.keys(pending.pending_fields)) {
    if (!key.startsWith('frame_roles.')) continue;
    const parts = key.split('.');
    if (parts.length < 3) continue;
    const roleType = parts[1];
    if (roleType) roleTypes.add(roleType);
  }

  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];

  for (const rt of Array.from(roleTypes).sort((a, b) => a.localeCompare(b))) {
    const op = getFrameRoleOperation(pending, rt);
    if (op === 'create') created.push(rt);
    else if (op === 'delete') deleted.push(rt);
    else if (op === 'update') updated.push(rt);
  }

  return { created, updated, deleted };
}

/**
 * Choose a single operation to represent the `frame_roles` field at the cell/section level.
 * Priority: delete > create > update.
 */
export function getFrameRolesAggregateOperation(
  pending: PendingChangeInfo | null | undefined
): PendingChangeOperation | null {
  const summary = getFrameRoleChangeSummary(pending);
  if (summary.deleted.length > 0) return 'delete';
  if (summary.created.length > 0) return 'create';
  if (summary.updated.length > 0) return 'update';
  return null;
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
  children?: React.ReactNode;
  /** Optional additional className */
  className?: string;
  /** Whether this is a table cell (uses different styling) */
  isTableCell?: boolean;
  /** Optional override for styling operation (useful for nested granular fields like frame_roles.*). */
  operationOverride?: PendingChangeOperation;
  /** Optional override for CSS class mapping by operation. */
  getCellClasses?: (operation: PendingChangeOperation) => string;
  /**
   * Optional formatter override for values shown in the click-to-open tooltip.
   * Useful for foreign keys like `frame_id` / `super_frame_id` to show codes instead of raw ids.
   */
  formatTooltipValue?: (value: unknown, which: 'old' | 'new') => string | null | undefined;
}

/**
 * Wraps content to show pending change highlighting for a specific field.
 * Shows a tooltip with change details on click.
 */
export function PendingFieldIndicator({
  fieldName,
  pending,
  children = null,
  className = '',
  isTableCell = false,
  operationOverride,
  getCellClasses,
  formatTooltipValue,
}: PendingFieldIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Check if this field has a pending change.
  // Some complex fields (e.g. frame_roles) are stored as granular sub-field changes like
  // "frame_roles.ASSET.description" rather than a single "frame_roles" change.
  const pendingFields = pending?.pending_fields ?? {};
  const directChange = pendingFields[fieldName] ?? null;
  const prefix = `${fieldName}.`;
  const subfieldKeys = directChange
    ? []
    : Object.keys(pendingFields).filter((k) => k.startsWith(prefix));
  const hasPendingChange = !!directChange || subfieldKeys.length > 0;
  const operation = operationOverride ?? pending?.operation ?? 'update';

  // Tooltip handling:
  // - Exact field change: show it.
  // - Single subfield change: show that subfield's change.
  // - Multiple subfield changes: still highlight, but don't show a tooltip (too noisy).
  const tooltipFieldName =
    directChange
      ? fieldName
      : (subfieldKeys.length === 1 ? subfieldKeys[0] : null);
  const tooltipChange =
    directChange
      ? directChange
      : (subfieldKeys.length === 1 ? pendingFields[subfieldKeys[0]] : null);
  const canShowTooltip = !!tooltipFieldName && !!tooltipChange;

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!canShowTooltip) return;
    
    e.stopPropagation();
    
    if (wrapperRef.current) {
      setAnchorRect(wrapperRef.current.getBoundingClientRect());
      setShowTooltip(true);
    }
  }, [canShowTooltip]);

  const handleClose = useCallback(() => {
    setShowTooltip(false);
    setAnchorRect(null);
  }, []);

  if (!hasPendingChange) {
    return <>{children}</>;
  }

  const classesFn = getCellClasses ?? getPendingCellClasses;
  const cellClasses = isTableCell 
    ? classesFn(operation)
    : `inline-block rounded px-1 ${classesFn(operation)}`;

  return (
    <>
      <div
        ref={wrapperRef}
        onClick={handleClick}
        className={`${cellClasses} ${canShowTooltip ? 'cursor-pointer' : 'cursor-default'} ${className}`}
        title={
          canShowTooltip
            ? `Pending ${operation}: Click for details`
            : `Pending ${operation}: ${subfieldKeys.length} field change${subfieldKeys.length === 1 ? '' : 's'}`
        }
      >
        {children}
      </div>
      {showTooltip && canShowTooltip && typeof window !== 'undefined' && createPortal(
        <ChangeTooltip
          fieldName={tooltipFieldName!}
          change={tooltipChange!}
          operation={operation}
          formatValueOverride={formatTooltipValue}
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

