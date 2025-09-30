/**
 * Example configuration for using DataTable with adverbs data
 * 
 * This file demonstrates how to create a custom configuration
 * for the DataTable component for a different data type (adverbs).
 * 
 * Usage:
 *   import { ADVERBS_COLUMNS, ADVERBS_COLUMN_WIDTHS, renderAdverbsCell } from './DataTable.adverbs.config';
 *   
 *   <DataTable
 *     columns={ADVERBS_COLUMNS}
 *     defaultColumnWidths={ADVERBS_COLUMN_WIDTHS}
 *     apiEndpoint="/api/adverbs/paginated"
 *     storageKeyPrefix="adverbs-table"
 *     renderCell={renderAdverbsCell}
 *     fetchRelations={fetchAdverbRelations}
 *     moderationEndpoint="/api/adverbs/moderation"
 *   />
 */

import React from 'react';
import { TableEntry, POS_LABELS } from '@/lib/types';
import { ColumnConfig } from './ColumnVisibilityPanel';
import { ColumnWidthState } from './DataTable.config';

// Example columns for adverbs - customize based on your actual adverbs schema
export const ADVERBS_COLUMNS: ColumnConfig[] = [
  { key: 'id', label: 'ID', visible: true, sortable: true },
  { key: 'legacy_id', label: 'Legacy ID', visible: false, sortable: true },
  { key: 'lemmas', label: 'Lemmas', visible: true, sortable: true },
  { key: 'gloss', label: 'Definition', visible: true, sortable: true },
  { key: 'pos', label: 'Part of Speech', visible: true, sortable: true },
  { key: 'lexfile', label: 'Lexfile', visible: true, sortable: true },
  { key: 'examples', label: 'Examples', visible: true, sortable: false },
  // Add adverb-specific columns here
  // { key: 'manner', label: 'Manner', visible: true, sortable: true },
  // { key: 'degree', label: 'Degree', visible: false, sortable: true },
  { key: 'parentsCount', label: 'Parents', visible: true, sortable: true },
  { key: 'childrenCount', label: 'Children', visible: true, sortable: true },
  { key: 'createdAt', label: 'Created', visible: false, sortable: true },
  { key: 'updatedAt', label: 'Updated', visible: false, sortable: true },
];

// Column widths for adverbs table
export const ADVERBS_COLUMN_WIDTHS: ColumnWidthState = {
  id: 120,
  legacy_id: 150,
  lemmas: 150,
  gloss: 350,
  pos: 120,
  lexfile: 120,
  examples: 300,
  // manner: 120,
  // degree: 120,
  parentsCount: 150,
  childrenCount: 150,
  createdAt: 100,
  updatedAt: 100,
};

// Helper functions
const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

const formatDate = (date: Date) => {
  return new Date(date).toLocaleDateString();
};

// Custom cell renderer for adverbs
export const renderAdverbsCell = (
  entry: TableEntry,
  columnKey: string,
  relationsData?: { parents: string[]; children: string[] }
): React.ReactNode => {
  switch (columnKey) {
    case 'lemmas':
      const allLemmas = [...(entry.src_lemmas || []), ...(entry.lemmas || [])];
      return (
        <div className="flex flex-wrap gap-1">
          {allLemmas.slice(0, 3).map((lemma, idx) => (
            <span 
              key={idx}
              className="inline-block px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded"
            >
              {lemma}
            </span>
          ))}
          {allLemmas.length > 3 && (
            <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
              +{allLemmas.length - 3}
            </span>
          )}
        </div>
      );
    case 'gloss':
      return (
        <div className="text-sm text-gray-900" title={entry.gloss}>
          {truncateText(entry.gloss, 150)}
        </div>
      );
    case 'pos':
      return (
        <span className="inline-block px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded font-medium">
          {POS_LABELS[entry.pos as keyof typeof POS_LABELS] || entry.pos}
        </span>
      );
    case 'lexfile':
      return <span className="text-xs text-gray-500">{entry.lexfile.replace(/^adv\./, '')}</span>;
    case 'examples':
      if (!entry.examples || entry.examples.length === 0) {
        return <span className="text-gray-400 text-sm">None</span>;
      }
      return (
        <div className="space-y-1 text-xs text-gray-700 max-w-md">
          {entry.examples.map((example, idx) => (
            <div key={idx} className="leading-relaxed">
              <span className="text-gray-400 mr-1">{idx + 1}.</span>
              {example}
            </div>
          ))}
        </div>
      );
    case 'parentsCount':
      if (!relationsData?.parents || relationsData.parents.length === 0) {
        return <span className="text-gray-400 text-sm">None</span>;
      }
      return (
        <div className="space-y-1 text-xs text-gray-700 max-w-sm">
          {relationsData.parents.map((parentId, idx) => (
            <div key={idx} className="font-mono text-blue-600">
              {parentId}
            </div>
          ))}
        </div>
      );
    case 'childrenCount':
      if (!relationsData?.children || relationsData.children.length === 0) {
        return <span className="text-gray-400 text-sm">None</span>;
      }
      return (
        <div className="space-y-1 text-xs text-gray-700 max-w-sm">
          {relationsData.children.map((childId, idx) => (
            <div key={idx} className="font-mono text-green-600">
              {childId}
            </div>
          ))}
        </div>
      );
    case 'id':
      return <span className="text-sm font-mono text-blue-600">{entry.id}</span>;
    case 'legacy_id':
      return <span className="text-sm font-mono text-gray-600">{entry.legacy_id}</span>;
    case 'createdAt':
      return <span className="text-xs text-gray-500">{formatDate(entry.createdAt)}</span>;
    case 'updatedAt':
      return <span className="text-xs text-gray-500">{formatDate(entry.updatedAt)}</span>;
    // Add custom adverb-specific rendering here
    // case 'manner':
    //   return <span className="text-sm">{(entry as any).manner}</span>;
    default:
      return <span className="text-sm text-gray-900">{String((entry as unknown as Record<string, unknown>)[columnKey] || '')}</span>;
  }
};

// Custom relations fetcher for adverbs (if different from verbs)
export const fetchAdverbRelations = async (entryId: string): Promise<{ parents: string[]; children: string[] }> => {
  try {
    const response = await fetch(`/api/adverbs/${entryId}/relations`);
    if (!response.ok) {
      throw new Error('Failed to fetch relations');
    }
    const data = await response.json();
    
    // Extract parent and children IDs
    const parents = data.sourceRelations
      .filter((rel: { type: string }) => rel.type === 'hypernym')
      .map((rel: { target?: { id: string } }) => rel.target?.id)
      .filter(Boolean);
    
    const children = data.targetRelations
      .filter((rel: { type: string }) => rel.type === 'hypernym')
      .map((rel: { source?: { id: string } }) => rel.source?.id)
      .filter(Boolean);
    
    return { parents, children };
  } catch (error) {
    console.error('Error fetching adverb relations:', error);
    return { parents: [], children: [] };
  }
};