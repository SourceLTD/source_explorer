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
  // Check for pending changes
  const pending = (entry as TableEntry & { pending?: PendingChangeInfo | null }).pending;
  const isFlagged = 'flagged' in entry && entry.flagged;
  
  if (isSelected) {
    // Pending + flagged uses inline styles
    if (pending && isFlagged) {
      return '';
    }
    // Selected rows get a more intense version of their base color
    if (pending) {
      // More intense pending colors when selected
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
      // Flagged rows use inline styles for selected state
      return '';
    }
    // Default selected color
    return 'bg-blue-100 hover:bg-blue-200';
  }
  
  // Non-selected states
  if (pending) {
    return getPendingRowClasses(pending.operation);
  }
  
  // Flagged rows get blue background (handled via inline styles, but add hover here)
  if (isFlagged) {
    return 'bg-white hover:bg-blue-200';
  }
  
  return 'bg-white hover:bg-gray-50';
}

export function getRowInlineStyles(entry: TableEntry | Frame, isSelected: boolean): React.CSSProperties {
  // Check for pending changes
  const pending = (entry as TableEntry & { pending?: PendingChangeInfo | null }).pending;
  const isFlagged = 'flagged' in entry && entry.flagged;
  
  if (isSelected) {
    // Selected rows that are both pending AND flagged: more intense pending color + blue border
    if (pending && isFlagged) {
      const pendingSelectedBackgroundColors: Record<string, string> = {
        create: '#bbf7d0',  // green-200
        update: '#fed7aa',  // orange-200
        delete: '#fecaca',  // red-200
      };
      return { 
        backgroundColor: pendingSelectedBackgroundColors[pending.operation] || '#fed7aa',
        borderLeft: '4px solid #3b82f6'  // blue-500
      };
    }
    // Selected flagged rows (without pending) get a more intense blue
    if (isFlagged) {
      return { backgroundColor: '#7cb8e8' };  // More intense blue than #add8ff
    }
    // Selected pending rows use Tailwind classes, no inline styles needed
    return {};
  }
  
  // Non-selected states
  
  // If both pending AND flagged, show pending background with blue left border
  if (pending && isFlagged) {
    const pendingBackgroundColors: Record<string, string> = {
      create: '#dcfce7',  // green-100
      update: '#ffedd5',  // orange-100
      delete: '#fee2e2',  // red-100
    };
    return { 
      backgroundColor: pendingBackgroundColors[pending.operation] || '#ffedd5',
      borderLeft: '4px solid #3b82f6'  // blue-500
    };
  }
  
  // If only flagged (no pending), show blue background
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

  // Type guard to check if entry is a Frame
  const isFrame = (e: TableEntry | Frame): e is Frame => {
    return mode === 'frames' && 'label' in e;
  };

  // Handle frame-specific columns
  if (isFrame(entry)) {
    switch (columnKey) {
      case 'id':
        return <span className="text-xs font-mono text-blue-600 break-words">{entry.id}</span>;
      case 'label':
        return <span className="inline-block max-w-full text-sm font-semibold text-gray-900 break-words">{entry.label}</span>;
      case 'definition':
        return (
          <div className="text-sm text-gray-900 break-words max-w-full">
            {entry.definition || '—'}
          </div>
        );
      case 'short_definition':
        return (
          <div className="text-sm text-gray-700 break-words max-w-full">
            {entry.short_definition || '—'}
          </div>
        );
      case 'prototypical_synset':
        return (
          <span className="inline-block max-w-full text-sm font-mono text-blue-600 hover:text-blue-800 cursor-pointer break-words"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`${graphBasePath}?entry=${entry.prototypical_synset}`);
            }}
            title={`Click to view ${entry.prototypical_synset} in graph mode`}
          >
            {entry.prototypical_synset}
          </span>
        );
      case 'frame_roles':
        if (!entry.frame_roles || entry.frame_roles.length === 0) {
          return <EmptyCell />;
        }
        return (
          <div className="space-y-1 text-xs">
            {entry.frame_roles.map((role, idx) => (
              <div key={`role-${idx}`} className="flex items-start gap-1">
                <span className={`inline-block px-2 py-1 rounded font-medium ${
                  role.main 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {role.role_type.label}
                </span>
                {role.description && (
                  <span className="text-gray-600 text-xs">
                    {role.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        );
      case 'roles_count':
        return (
          <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded font-medium">
            {entry.roles_count ?? 0}
          </span>
        );
      case 'verbs_count':
        return (
          <span className="inline-block px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded font-medium">
            {entry.verbs_count ?? 0}
          </span>
        );
      case 'words_sample':
        if (!entry.words_sample) {
          return <EmptyCell />;
        }
        const { nouns, verbs, adjectives, adverbs } = entry.words_sample;
        const hasNoWords = nouns.length === 0 && verbs.length === 0 && adjectives.length === 0 && adverbs.length === 0;
        if (hasNoWords) {
          return <EmptyCell />;
        }
        return (
          <div className="space-y-1.5 text-xs">
            {verbs.length > 0 && (
              <div className="flex items-start gap-1">
                <span className="inline-block px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium shrink-0">V</span>
                <span className="text-gray-700 break-words">
                  {verbs.slice(0, 3).map(w => w.lemmas[0] || w.code).join(', ')}
                </span>
              </div>
            )}
            {nouns.length > 0 && (
              <div className="flex items-start gap-1">
                <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium shrink-0">N</span>
                <span className="text-gray-700 break-words">
                  {nouns.slice(0, 3).map(w => w.lemmas[0] || w.code).join(', ')}
                </span>
              </div>
            )}
            {adjectives.length > 0 && (
              <div className="flex items-start gap-1">
                <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">A</span>
                <span className="text-gray-700 break-words">
                  {adjectives.slice(0, 3).map(w => w.lemmas[0] || w.code).join(', ')}
                </span>
              </div>
            )}
            {adverbs.length > 0 && (
              <div className="flex items-start gap-1">
                <span className="inline-block px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium shrink-0">R</span>
                <span className="text-gray-700 break-words">
                  {adverbs.slice(0, 3).map(w => w.lemmas[0] || w.code).join(', ')}
                </span>
              </div>
            )}
          </div>
        );
      case 'flagged':
        if (entry.flagged === null || entry.flagged === undefined) {
          return <NACell />;
        }
        return (
          <div className="flex items-center gap-1">
            <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${
              entry.flagged 
                ? 'bg-orange-100 text-orange-800' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {entry.flagged ? 'Yes' : 'No'}
            </span>
            {entry.flagged && entry.flaggedReason && (
              <div className="group relative">
                <svg className="w-4 h-4 text-orange-600 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="absolute left-0 top-6 hidden group-hover:block z-50 w-64 p-2 bg-gray-900 text-white text-xs rounded">
                  {entry.flaggedReason}
                </div>
              </div>
            )}
          </div>
        );
      case 'flaggedReason':
        if (!entry.flaggedReason) {
          return <span className="text-gray-400 text-xs">None</span>;
        }
        return (
          <div className="text-xs text-gray-700 break-words">
            {entry.flaggedReason}
          </div>
        );
      case 'verifiable':
        if (entry.verifiable === null || entry.verifiable === undefined) {
          return <NACell />;
        }
        return entry.verifiable ? (
          <CheckCircleIcon className="w-5 h-5 text-green-600" title="Verifiable" />
        ) : (
          <XCircleIcon className="w-5 h-5 text-red-500" title="Unverifiable" />
        );
      case 'unverifiableReason':
        if (!entry.unverifiableReason) {
          return <span className="text-gray-400 text-xs">None</span>;
        }
        return (
          <div className="text-xs text-gray-700 break-words">
            {entry.unverifiableReason}
          </div>
        );
      case 'createdAt':
        return <span className="text-xs text-gray-500 break-words">{formatDate(entry.createdAt)}</span>;
      case 'updatedAt':
        return <span className="text-xs text-gray-500 break-words">{formatDate(entry.updatedAt)}</span>;
      case 'actions':
        return (
          <div className="flex flex-col items-center justify-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                console.log('Edit button clicked for frame:', entry.id);
                if (onEditClick) {
                  onEditClick(entry);
                } else {
                  console.warn('onEditClick is not defined');
                }
              }}
              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors cursor-pointer"
              title="Edit frame"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                console.log('AI Quick Edit button clicked for frame:', entry.id);
                if (onAIClick) {
                  onAIClick(entry);
                } else {
                  console.warn('onAIClick is not defined');
                }
              }}
              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors cursor-pointer"
              title="AI Agent Quick Edit"
            >
              <SparklesIcon className="w-4 h-4" />
            </button>
          </div>
        );
      default:
        return <span className="text-sm text-gray-900 break-words">{String((entry as unknown as Record<string, unknown>)[columnKey] || '')}</span>;
    }
  }

  // Handle TableEntry columns
  const tableEntry = entry as TableEntry;
  switch (columnKey) {
    case 'lemmas':
      // Display regular lemmas first, then src_lemmas in bold at the end
      const allLemmas = entry.lemmas || [];
      const srcLemmas = entry.src_lemmas || [];
      const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
      const displayLemmas = [...regularLemmas, ...srcLemmas];
      
      return (
        <div className="flex flex-wrap gap-1">
          {displayLemmas.map((lemma, idx) => {
            const isSrcLemma = srcLemmas.includes(lemma);
            return (
              <span 
                key={idx}
                className={`inline-block px-2 py-1 text-xs rounded ${
                  isSrcLemma 
                    ? 'bg-blue-100 text-blue-800 font-bold' 
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {lemma}
              </span>
            );
          })}
        </div>
      );
    case 'gloss':
      const isEditingThisGloss = editing.entryId === entry.id && editing.field === 'gloss';
      
      if (isEditingThisGloss) {
        return (
          <div className="relative">
            <textarea
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
              className="w-full px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
            />
            <div className="text-xs text-gray-500 mt-1">
              Press Enter to save, Esc to cancel
            </div>
          </div>
        );
      }
      
      return (
        <div 
          className="text-sm text-gray-900 cursor-text hover:bg-blue-50 px-2 py-1 rounded transition-colors" 
          title={`Double-click to edit\n\n${entry.gloss}`}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartEdit(entry.id, 'gloss', entry.gloss);
          }}
        >
          {truncateText(entry.gloss, 150)}
        </div>
      );
    case 'pos':
      if (isFrame(entry)) return <EmptyCell />;
      return (
        <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded font-medium">
          {POS_LABELS[tableEntry.pos as keyof typeof POS_LABELS] || tableEntry.pos}
        </span>
      );
    case 'lexfile':
      if (isFrame(entry)) return <EmptyCell />;
      return <span className="text-xs text-gray-500 break-words">{tableEntry.lexfile?.replace(/^verb\./, '') || '—'}</span>;
    case 'frame':
      if (!tableEntry.frame) {
        return <EmptyCell />;
      }
      return (
        <span className="inline-block max-w-full px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded font-medium uppercase break-words whitespace-normal">
          {tableEntry.frame}
        </span>
      );
    case 'isMwe':
      return (
        <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${
          tableEntry.isMwe 
            ? 'bg-purple-100 text-purple-800' 
            : 'bg-gray-100 text-gray-600'
        }`}>
          {tableEntry.isMwe ? 'Yes' : 'No'}
        </span>
      );
    case 'flagged':
      if (isFrame(entry)) return <NACell />;
      if (tableEntry.flagged === null || tableEntry.flagged === undefined) {
        return <NACell />;
      }
      return (
        <div className="flex items-center gap-1">
          <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${
            tableEntry.flagged 
              ? 'bg-orange-100 text-orange-800' 
              : 'bg-gray-100 text-gray-600'
          }`}>
            {tableEntry.flagged ? 'Yes' : 'No'}
          </span>
          {tableEntry.flagged && tableEntry.flaggedReason && (
            <div className="group relative">
              <svg className="w-4 h-4 text-orange-600 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="absolute left-0 top-6 hidden group-hover:block z-50 w-64 p-2 bg-gray-900 text-white text-xs rounded">
                {tableEntry.flaggedReason}
              </div>
            </div>
          )}
        </div>
      );
    case 'verifiable':
      if (isFrame(entry)) return <NACell />;
      if (tableEntry.verifiable === null || tableEntry.verifiable === undefined) {
        return <NACell />;
      }
      return tableEntry.verifiable ? (
        <CheckCircleIcon className="w-5 h-5 text-green-600" title="Verifiable" />
      ) : (
        <XCircleIcon className="w-5 h-5 text-red-500" title="Unverifiable" />
      );
    case 'flaggedReason':
      if (isFrame(entry)) return <NACell />;
      if (!tableEntry.flaggedReason) {
        return <span className="text-gray-400 text-xs">None</span>;
      }
      return (
        <div className="text-xs text-gray-700 break-words">
          {tableEntry.flaggedReason}
        </div>
      );
    case 'unverifiableReason':
      if (isFrame(entry)) return <NACell />;
      if (!tableEntry.unverifiableReason) {
        return <span className="text-gray-400 text-xs">None</span>;
      }
      return (
        <div className="text-xs text-gray-700 break-words">
          {tableEntry.unverifiableReason}
        </div>
      );
    case 'examples':
      if (!tableEntry.examples || tableEntry.examples.length === 0) {
        return <NoneCell />;
      }
      return (
        <div className="space-y-1 text-xs text-gray-700 max-w-md">
          {tableEntry.examples.map((example, idx) => (
            <div key={idx} className="leading-relaxed">
              <span className="text-gray-400 mr-1">{idx + 1}.</span>
              {example}
            </div>
          ))}
        </div>
      );
    case 'frame_id':
      if (!tableEntry.frame_id) {
        return <span className="text-gray-400 text-sm">None</span>;
      }
      return <span className="text-sm font-mono text-purple-600">{tableEntry.frame_id}</span>;
    case 'vendler_class':
      if (!tableEntry.vendler_class) {
        return <span className="text-gray-400 text-sm">None</span>;
      }
      const vendlerColors: Record<string, string> = {
        state: 'bg-blue-100 text-blue-800',
        activity: 'bg-green-100 text-green-800',
        accomplishment: 'bg-orange-100 text-orange-800',
        achievement: 'bg-red-100 text-red-800',
      };
      const colorClass = vendlerColors[tableEntry.vendler_class] || 'bg-gray-100 text-gray-800';
      return (
        <span className={`inline-block px-2 py-1 text-xs rounded font-medium ${colorClass}`}>
          {tableEntry.vendler_class}
        </span>
      );
    case 'roles':
      if (!tableEntry.roles || tableEntry.roles.length === 0) {
        return <NoneCell />;
      }
      
      // Create a map of role IDs to check which roles are in groups
      const rolesInGroups = new Set<string>();
      const roleGroups = tableEntry.role_groups || [];
      roleGroups.forEach(group => {
        group.role_ids.forEach(roleId => rolesInGroups.add(roleId));
      });
      
      // Separate roles that are not in groups
      const ungroupedRoles = tableEntry.roles.filter(role => !rolesInGroups.has(role.id));
      
      return (
        <div className="space-y-1 text-xs">
          {/* Render ungrouped roles */}
          {ungroupedRoles.map((role, idx) => (
            <div key={`role-${idx}`} className="flex items-start gap-1">
              <span className={`inline-block px-2 py-1 rounded font-medium ${
                role.main 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {role.role_type.label}
              </span>
              {role.description && (
                <span className="text-gray-600 text-xs">
                  {role.description}
                </span>
              )}
            </div>
          ))}
          
          {/* Render role groups with OR indicators */}
          {roleGroups.map((group, groupIdx) => {
            const groupRoles = tableEntry.roles!.filter(role => group.role_ids.includes(role.id));
            if (groupRoles.length === 0) return null;
            
            return (
              <div 
                key={`group-${groupIdx}`} 
                className="border border-black rounded px-2 py-1 bg-gray-50"
                title={group.description || 'OR group: one of these roles is required'}
              >
                {groupRoles.map((role, roleIdx) => (
                  <React.Fragment key={`group-${groupIdx}-role-${roleIdx}`}>
                    {roleIdx > 0 && (
                      <span className="mx-1 text-xs font-bold text-gray-700">OR</span>
                    )}
                    <span className={`inline-block px-2 py-1 rounded font-medium ${
                      role.main 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {role.role_type.label}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            );
          })}
        </div>
      );
    case 'id':
      return <span className="text-xs font-mono text-blue-600 break-words">{entry.id}</span>;
    case 'legacy_id':
      return <span className="text-sm font-mono text-gray-600 break-words">{tableEntry.legacy_id}</span>;
    case 'createdAt':
      return <span className="text-xs text-gray-500 break-words">{formatDate(entry.createdAt)}</span>;
    case 'updatedAt':
      return <span className="text-xs text-gray-500 break-words">{formatDate(entry.updatedAt)}</span>;
    case 'actions':
      return (
        <div className="flex flex-col items-center justify-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              console.log('Edit button clicked for entry:', entry.id);
              if (onEditClick) {
                onEditClick(entry);
              } else {
                console.warn('onEditClick is not defined');
              }
            }}
            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors cursor-pointer"
            title="Edit entry"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              console.log('AI Quick Edit button clicked for entry:', entry.id);
              if (onAIClick) {
                onAIClick(entry);
              } else {
                console.warn('onAIClick is not defined');
              }
            }}
            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors cursor-pointer"
            title="AI Agent Quick Edit"
          >
            <SparklesIcon className="w-4 h-4" />
          </button>
        </div>
      );
    default:
      return <span className="text-sm text-gray-900 break-words">{String((entry as unknown as Record<string, unknown>)[columnKey] || '')}</span>;
  }
}

interface DataTableBodyProps {
  data: (TableEntry | Frame)[] | null;
  visibleColumns: ColumnConfig[];
  mode: DataTableMode;
  sortState: SortState;
  selectedIds: Set<string>;
  editing: EditingState;
  filters: FilterState;
  searchQuery?: string;
  isResizing: boolean;
  onSort: (field: string) => void;
  onRowClick?: (entry: TableEntry | Frame) => void;
  onEditClick?: (entry: TableEntry | Frame) => void;
  onAIClick?: (entry: TableEntry | Frame) => void;
  onSelectAll: () => void;
  onSelectRow: (entryId: string) => void;
  onContextMenu: (e: React.MouseEvent, entryId: string) => void;
  onStartEdit: (entryId: string, field: string, currentValue: string) => void;
  onEditChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onMouseDown: (columnKey: string, e: React.MouseEvent) => void;
  getColumnWidth: (columnKey: string) => string;
  selectAll: boolean;
}

export function DataTableBody({
  data,
  visibleColumns,
  mode,
  sortState,
  selectedIds,
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
  selectAll,
}: DataTableBodyProps) {
  const hasData = data && data.length > 0;

  return (
    <table className="w-full" style={{ tableLayout: 'fixed' }}>
      <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-20">
        <tr>
          <th className="px-4 py-3 text-left w-12 bg-gray-50" style={{ width: '48px' }}>
            <input
              type="checkbox"
              checked={selectAll}
              onChange={onSelectAll}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </th>
          {visibleColumns.map((column) => (
            <th 
              key={column.key}
              className="relative px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 bg-gray-50"
              style={{ width: getColumnWidth(column.key), minWidth: '50px' }}
            >
              <div 
                className={`flex items-center gap-2 ${column.sortable ? 'cursor-pointer hover:bg-gray-100 rounded px-1 py-1' : ''}`}
                onClick={column.sortable ? () => onSort(column.key) : undefined}
              >
                {column.label}
                {column.sortable && <SortIcon field={column.key} sortState={sortState} />}
              </div>
              {/* Resize handle */}
              <div
                className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-blue-200 bg-transparent group"
                onMouseDown={(e) => onMouseDown(column.key, e)}
              >
                <div className="w-px h-full bg-gray-300 group-hover:bg-blue-400 ml-auto"></div>
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-gray-50 divide-y divide-gray-200">
        {hasData && data ? (
          data.map((entry) => {
            const isSelected = selectedIds.has(entry.id);
            return (
              <tr
                key={entry.id}
                className={getRowBackgroundColor(entry, isSelected)}
                style={getRowInlineStyles(entry, isSelected)}
                onContextMenu={(e) => onContextMenu(e, entry.id)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  onSelectRow(entry.id);
                }}
              >
                <td className="px-4 py-4 whitespace-nowrap w-12" style={{ width: '48px' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(entry.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      onSelectRow(entry.id);
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                {visibleColumns.map((column) => {
                  const isClickable = onRowClick && column.key !== 'isMwe' && column.key !== 'gloss' && column.key !== 'actions';
                  const cellClassName = `px-4 py-4 break-words ${isClickable ? 'cursor-pointer' : ''} align-top border-r border-gray-200`;
                  const pending = (entry as TableEntry & { pending?: PendingChangeInfo | null }).pending;
                  
                  const fieldName = FIELD_NAME_MAP[column.key] || column.key;
                  const hasPendingChange = pending?.pending_fields?.[fieldName];
                  
                  return (
                    <td 
                      key={column.key}
                      className={cellClassName}
                      style={{ width: getColumnWidth(column.key), minWidth: '50px' }}
                      onClick={isClickable ? () => onRowClick?.(entry) : undefined}
                    >
                      <div className="max-w-full">
                        {hasPendingChange ? (
                          <PendingFieldIndicator
                            fieldName={fieldName}
                            pending={pending}
                            isTableCell={true}
                          >
                            <CellContent
                              entry={entry}
                              columnKey={column.key}
                              mode={mode}
                              editing={editing}
                              onEditClick={onEditClick}
                              onAIClick={onAIClick}
                              onStartEdit={onStartEdit}
                              onEditChange={onEditChange}
                              onSaveEdit={onSaveEdit}
                              onCancelEdit={onCancelEdit}
                            />
                          </PendingFieldIndicator>
                        ) : (
                          <CellContent
                            entry={entry}
                            columnKey={column.key}
                            mode={mode}
                            editing={editing}
                            onEditClick={onEditClick}
                            onAIClick={onAIClick}
                            onStartEdit={onStartEdit}
                            onEditChange={onEditChange}
                            onSaveEdit={onSaveEdit}
                            onCancelEdit={onCancelEdit}
                          />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })
        ) : (
          <tr>
            <td colSpan={visibleColumns.length + 1}>
              <EmptyState
                title="No entries found"
                description={(searchQuery || Object.keys(filters).length > 0) ? "Try adjusting your search or filters" : undefined}
              />
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

