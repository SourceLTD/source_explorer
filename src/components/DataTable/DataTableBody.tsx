'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { TableEntry, Frame, POS_LABELS, PendingChangeInfo } from '@/lib/types';
import { ColumnConfig } from '@/components/ColumnVisibilityPanel';
import { CheckCircleIcon, XCircleIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { PendingFieldIndicator, getPendingRowClasses } from '@/components/PendingChangeIndicator';
import { EmptyState } from '@/components/ui';
import { DataTableMode, getGraphBasePath, FIELD_NAME_MAP } from './config';
import { SortState, EditingState, FilterState } from './types';

// Helper components for empty/null values
export const EmptyCell = () => <span className="text-gray-400 text-sm">—</span>;
export const NACell = () => <span className="text-gray-400 text-sm">N/A</span>;
export const NoneCell = () => <span className="text-gray-400 text-sm">None</span>;

export function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return '—';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '—';
  return dateObj.toLocaleDateString();
}

export function getRowBackgroundColor(entry: TableEntry | Frame, isSelected: boolean): string {
  const pending = (entry as TableEntry & { pending?: PendingChangeInfo | null }).pending;
  const isFlagged = 'flagged' in entry && entry.flagged;
  
  if (isSelected) {
    if (pending && isFlagged) {
      return '';
    }
    if (pending) {
      switch (pending.operation) {
        case 'create':
          return 'bg-green-200 hover:bg-green-300';
        case 'delete':
          return 'bg-red-200 hover:bg-red-300 opacity-75';
        case 'update':
        default:
          return 'bg-orange-200 hover:bg-orange-300';
      }
    }
    if (isFlagged) {
      return '';
    }
    return 'bg-blue-100 hover:bg-blue-200';
  }
  
  if (pending) {
    return getPendingRowClasses(pending.operation);
  }
  
  if (isFlagged) {
    return 'bg-white hover:bg-blue-200';
  }
  
  return 'bg-white hover:bg-gray-50';
}

export function getRowInlineStyles(entry: TableEntry | Frame, isSelected: boolean): React.CSSProperties {
  const pending = (entry as TableEntry & { pending?: PendingChangeInfo | null }).pending;
  const isFlagged = 'flagged' in entry && entry.flagged;
  
  if (isSelected) {
    if (pending && isFlagged) {
      const pendingSelectedBackgroundColors: Record<string, string> = {
        create: '#bbf7d0',
        update: '#fed7aa',
        delete: '#fecaca',
      };
      return { 
        backgroundColor: pendingSelectedBackgroundColors[pending.operation] || '#fed7aa',
        borderLeft: '4px solid #3b82f6'
      };
    }
    if (isFlagged) {
      return { backgroundColor: '#7cb8e8' };
    }
    return {};
  }
  
  if (pending && isFlagged) {
    const pendingBackgroundColors: Record<string, string> = {
      create: '#dcfce7',
      update: '#ffedd5',
      delete: '#fee2e2',
    };
    return { 
      backgroundColor: pendingBackgroundColors[pending.operation] || '#ffedd5',
      borderLeft: '4px solid #3b82f6'
    };
  }
  
  if (isFlagged) {
    return { backgroundColor: '#add8ff' };
  }
  
  return {};
}

interface SortIconProps {
  field: string;
  sortState: SortState;
}

export function SortIcon({ field, sortState }: SortIconProps) {
  if (sortState.field !== field) {
    return (
      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }

  return sortState.order === 'asc' ? (
    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

interface CellContentProps {
  entry: TableEntry | Frame;
  columnKey: string;
  mode: DataTableMode;
  editing: EditingState;
  onEditClick?: (entry: TableEntry | Frame) => void;
  onAIClick?: (entry: TableEntry | Frame) => void;
  onStartEdit: (entryId: string, field: string, currentValue: string) => void;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}

export function CellContent({
  entry,
  columnKey,
  mode,
  editing,
  onEditClick,
  onAIClick,
  onStartEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
}: CellContentProps) {
  const router = useRouter();
  const graphBasePath = getGraphBasePath(mode);

  const isFrame = (e: TableEntry | Frame): e is Frame => {
    return (mode === 'frames' || mode === 'super_frames' || mode === 'frames_only') && 'label' in e;
  };

  // Common styles
  const textContainerClasses = "text-sm text-gray-900 break-words max-w-full";

  if (isFrame(entry)) {
    switch (columnKey) {
      case 'id':
        return <span className="text-xs font-mono text-blue-600 break-words">{entry.id}</span>;
      case 'code': {
        const code = entry.code || '—';
        const dotIndex = code.indexOf('.');
        return (
          <span className="inline-block max-w-full text-sm font-mono text-gray-900 break-words">
            {dotIndex !== -1 ? (
              <>
                {code.substring(0, dotIndex + 1)}
                <span className="font-bold">{code.substring(dotIndex + 1)}</span>
              </>
            ) : code}
          </span>
        );
      }
      case 'label':
        return <span className="inline-block max-w-full text-sm font-semibold text-gray-900 break-words">{entry.label}</span>;
      case 'definition':
        return <div className={textContainerClasses}>{entry.definition || '—'}</div>;
      case 'short_definition':
        return <div className={textContainerClasses}>{entry.short_definition || '—'}</div>;
      case 'prototypical_synset':
        return <span className="text-sm font-medium text-gray-700">{entry.prototypical_synset}</span>;
      case 'lexical_units_count':
        return <div className="text-sm text-gray-600">{entry.lexical_units_count ?? 0}</div>;
      case 'subframes_count':
        return <div className="text-sm text-gray-600">{entry.subframes_count ?? 0}</div>;
      case 'frame_roles':
        return (
          <div className="flex flex-wrap gap-1">
            {entry.frame_roles?.map((role, idx) => (
              <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                  {role.role_type.label}
                </span>
            ))}
          </div>
        );
      case 'lexical_entries':
        if (!entry.lexical_entries || entry.lexical_entries.entries.length === 0) return <EmptyCell />;
        return (
          <div className="flex flex-wrap gap-1 max-w-full items-center">
            {entry.lexical_entries.entries.map((lexicalEntry, idx) => (
              <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                {lexicalEntry.lemmas[0]}
              </span>
            ))}
            {entry.lexical_entries.hasMore && (
              <span className="text-xs text-gray-400 font-medium ml-1">
                +{entry.lexical_entries.totalCount - 10} more
              </span>
            )}
          </div>
        );
      default:
        break;
    }
  } else {
    // Lexical Units handling
    const dbFieldName = FIELD_NAME_MAP[columnKey] || columnKey;
    const isEditingField = editing.entryId === entry.id && editing.field === dbFieldName;

    switch (columnKey) {
      case 'id':
        return (
          <div className="flex items-center gap-2 group">
            <span 
              className="text-xs font-mono text-blue-600 break-all cursor-pointer hover:underline"
              onClick={() => router.push(`${graphBasePath}/${entry.id}`)}
            >
              {entry.id}
            </span>
            <PendingFieldIndicator pending={entry.pending} fieldName="code" />
          </div>
        );
      case 'legacy_id':
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-mono break-all">{entry.legacy_id}</span>
            <PendingFieldIndicator pending={entry.pending} fieldName="legacy_id" />
          </div>
        );
      case 'pos':
        return (
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
              {POS_LABELS[entry.pos] || entry.pos}
            </span>
            <PendingFieldIndicator pending={entry.pending} fieldName="pos" />
          </div>
        );
      case 'frame': {
      const frameCode = entry.frame || entry.frame_id;
      const dotIndex = frameCode?.indexOf('.');
      
      return (
        <div className="flex items-center gap-2 group">
          {frameCode ? (
            <span 
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 cursor-pointer transition-colors"
              onClick={() => router.push(`/graph/frames/${entry.frame_id}`)}
            >
              {dotIndex !== undefined && dotIndex !== -1 ? (
                <>
                  {frameCode.substring(0, dotIndex + 1)}
                  <span className="font-bold">{frameCode.substring(dotIndex + 1)}</span>
                </>
              ) : frameCode}
            </span>
          ) : <NoneCell />}
          <PendingFieldIndicator pending={entry.pending} fieldName="frame_id" />
        </div>
      );
    }
    case 'lemmas':
      return (
          <div className="flex flex-wrap gap-1 items-center">
            {entry.lemmas.map((lemma, idx) => (
              <span key={idx} className="text-sm font-medium text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">
                {lemma}
              </span>
            ))}
            <PendingFieldIndicator pending={entry.pending} fieldName="lemmas" />
        </div>
      );
    case 'gloss':
        if (isEditingField) {
        return (
            <textarea
              className="w-full text-sm border-gray-300 rounded p-1"
              value={editing.value}
              onChange={(e) => onEditChange(e.target.value)}
              onBlur={onSaveEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSaveEdit();
                } else if (e.key === 'Escape') {
                  onCancelEdit();
                }
              }}
              autoFocus
            />
        );
      }
      return (
        <div 
            className="flex items-center gap-2 group cursor-pointer"
            onClick={() => onStartEdit(entry.id, 'gloss', entry.gloss)}
          >
            <span className="text-sm text-gray-900 break-words leading-relaxed">
          {truncateText(entry.gloss, 150)}
            </span>
            <PendingFieldIndicator pending={entry.pending} fieldName="gloss" />
        </div>
      );
      case 'vendler_class':
      return (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700 capitalize">{entry.vendler_class || '—'}</span>
            <PendingFieldIndicator pending={entry.pending} fieldName="vendler_class" />
          </div>
      );
    case 'isMwe':
      return (
          <div className="flex items-center gap-2">
            {entry.isMwe ? (
              <CheckCircleIcon className="w-5 h-5 text-green-500" />
            ) : <NACell />}
            <PendingFieldIndicator pending={entry.pending} fieldName="is_mwe" />
        </div>
      );
      case 'gradable':
      return (
          <div className="flex items-center gap-2">
            {entry.gradable ? (
              <CheckCircleIcon className="w-5 h-5 text-green-500" />
            ) : <NACell />}
            <PendingFieldIndicator pending={entry.pending} fieldName="gradable" />
        </div>
      );
    case 'examples':
      return (
          <div className="flex items-center gap-2 group">
            <div className="text-xs text-gray-600 space-y-1">
              {entry.examples.slice(0, 2).map((ex, idx) => (
                <div key={idx} className="italic line-clamp-2">"{ex}"</div>
              ))}
              {entry.examples.length > 2 && <div className="text-gray-400">+{entry.examples.length - 2} more</div>}
            </div>
            <PendingFieldIndicator pending={entry.pending} fieldName="examples" />
        </div>
      );
      default:
        break;
    }
  }

  // Handle columns common to both types
  switch (columnKey) {
    case 'flagged':
      return (
        <div className="flex items-center gap-2">
          {entry.flagged ? (
            <XCircleIcon className="w-5 h-5 text-red-500" />
          ) : (
            <CheckCircleIcon className="w-5 h-5 text-gray-300" />
          )}
          <PendingFieldIndicator pending={entry.pending} fieldName="flagged" />
        </div>
      );
    case 'verifiable':
      return (
        <div className="flex items-center gap-2">
          {entry.verifiable === false ? (
            <XCircleIcon className="w-5 h-5 text-orange-500" title="Unverifiable" />
          ) : (
            <CheckCircleIcon className="w-5 h-5 text-green-500" title="Verifiable" />
          )}
          <PendingFieldIndicator pending={entry.pending} fieldName="verifiable" />
        </div>
      );
    case 'createdAt':
      return <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(entry.createdAt)}</span>;
    case 'updatedAt':
      return <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(entry.updatedAt)}</span>;
    case 'actions':
      return (
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditClick?.(entry);
            }}
            className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
            title="Manual Edit"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAIClick?.(entry);
            }}
            className="p-1 text-gray-400 hover:text-purple-600 rounded hover:bg-purple-50"
            title="AI Polish"
          >
            <SparklesIcon className="w-5 h-5" />
          </button>
        </div>
      );
    default:
      return null;
  }
}

// ============================================
// Main Table Body Component
// ============================================

interface DataTableBodyProps {
  data: Array<TableEntry | Frame> | null;
  visibleColumns: ColumnConfig[];
  mode: DataTableMode;
  sortState: SortState;
  selectedIds: Set<string>;
  selectAll: boolean;
  editing: EditingState;
  filters: FilterState;
  searchQuery?: string;
  isResizing: boolean;
  onSort: (field: string) => void;
  onRowClick?: (entry: TableEntry | Frame) => void;
  onEditClick?: (entry: TableEntry | Frame) => void;
  onAIClick?: (entry: TableEntry | Frame) => void;
  onSelectAll: () => void;
  onSelectRow: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, entryId: string) => void;
  onStartEdit: (entryId: string, field: string, currentValue: string) => void;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onMouseDown: (columnKey: string, e: React.MouseEvent) => void;
  getColumnWidth: (columnKey: string) => string;
}

export function DataTableBody({
  data,
  visibleColumns,
  mode,
  sortState,
  selectedIds,
  selectAll,
  editing,
  filters,
  searchQuery,
  isResizing,
  onSort,
  onRowClick,
  onEditClick,
  onAIClick,
  onSelectAll,
  onSelectRow,
  onContextMenu,
  onStartEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onMouseDown,
  getColumnWidth,
}: DataTableBodyProps) {
  const rows = data ?? [];

  if (!data) {
    return null;
  }

  if (rows.length === 0) {
    return (
      <div className="p-8">
        <EmptyState
          title="No results"
          description={
            searchQuery
              ? `No matches found for "${searchQuery}".`
              : 'Try adjusting your filters.'
          }
        />
      </div>
    );
  }

  return (
    <table className="min-w-full border-collapse">
      <thead className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <tr>
          {/* Selection column */}
          <th className="px-3 py-3 text-left w-[44px]">
            <input
              type="checkbox"
              checked={selectAll}
              onChange={onSelectAll}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              disabled={isResizing}
            />
          </th>

          {visibleColumns.map(col => (
            <th
              key={col.key}
              className={`relative px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-l border-gray-100 ${
                col.sortable ? 'cursor-pointer select-none' : ''
              }`}
              style={{ width: getColumnWidth(col.key) }}
              onClick={() => col.sortable && onSort(col.key)}
            >
              <div className="flex items-center gap-2">
                <span>{col.label}</span>
                {col.sortable && <SortIcon field={col.key} sortState={sortState} />}
              </div>

              {/* Column resizer handle */}
              <div
                className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-blue-200"
                onMouseDown={(e) => onMouseDown(col.key, e)}
                onClick={(e) => e.stopPropagation()}
              />
            </th>
          ))}
        </tr>
      </thead>

      <tbody className="divide-y divide-gray-200 bg-white">
        {rows.map((entry) => {
          const isSelected = selectedIds.has(entry.id);
          const rowClass = getRowBackgroundColor(entry, isSelected);
          const rowStyle = getRowInlineStyles(entry, isSelected);

          return (
            <tr
              key={entry.id}
              className={`group ${rowClass}`}
              style={rowStyle}
              onClick={() => onRowClick?.(entry)}
              onContextMenu={(e) => onContextMenu(e, entry.id)}
            >
              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onSelectRow(entry.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  disabled={isResizing}
                />
              </td>

              {visibleColumns.map((col) => (
                <td
                  key={`${entry.id}:${col.key}`}
                  className="px-3 py-3 align-top border-l border-gray-50"
                  style={{ width: getColumnWidth(col.key) }}
                >
                  <CellContent
                    entry={entry}
                    columnKey={col.key}
                    mode={mode}
                    editing={editing}
                    onEditClick={onEditClick}
                    onAIClick={onAIClick}
                    onStartEdit={onStartEdit}
                    onEditChange={onEditChange}
                    onSaveEdit={onSaveEdit}
                    onCancelEdit={onCancelEdit}
                  />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
