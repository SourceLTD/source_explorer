'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  FrameSenseFrameRef,
  FrameSenseWarning,
  PendingChangeInfo,
} from '@/lib/types';
import { getPendingRowClasses } from '@/components/PendingChangeIndicator';
import LoadingSpinner from '@/components/LoadingSpinner';
import Pagination from '@/components/Pagination';

interface LexicalUnitSnippet {
  id: string;
  code: string;
  lemmas: string[];
  src_lemmas: string[];
  pos: string;
  gloss: string;
}

export interface FrameSenseRow {
  id: string;
  pos: string;
  definition: string;
  frame_type: string;
  confidence: string | null;
  lemmas: string[];
  causative: boolean | null;
  inchoative: boolean | null;
  perspectival: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  frame: FrameSenseFrameRef | null;
  frames: FrameSenseFrameRef[];
  frameWarning: FrameSenseWarning;
  lexical_units: {
    entries: LexicalUnitSnippet[];
    totalCount: number;
    hasMore: boolean;
  };
  lexical_units_count: number;
  pending: PendingChangeInfo | null;
}

interface PaginatedFrameSenses {
  data: FrameSenseRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface FrameSensesTableProps {
  searchQuery: string;
  refreshTrigger?: number;
}

type SortField = 'id' | 'pos' | 'definition' | 'frame_type' | 'createdAt' | 'updatedAt';

interface SortState {
  field: SortField;
  order: 'asc' | 'desc';
}

const DEFAULT_PAGE_SIZE = 50;

const COLUMNS: Array<{
  key: string;
  label: string;
  sortable: boolean;
  sortField?: SortField;
  widthClass: string;
}> = [
  { key: 'id', label: 'ID', sortable: true, sortField: 'id', widthClass: 'w-24' },
  { key: 'pos', label: 'POS', sortable: true, sortField: 'pos', widthClass: 'w-20' },
  { key: 'lemmas', label: 'Lemmas', sortable: false, widthClass: 'w-48' },
  { key: 'definition', label: 'Definition', sortable: true, sortField: 'definition', widthClass: '' },
  { key: 'frame_type', label: 'Frame Type', sortable: true, sortField: 'frame_type', widthClass: 'w-32' },
  { key: 'frame', label: 'Frame', sortable: false, widthClass: 'w-48' },
  { key: 'lexical_units', label: 'Lexical Units', sortable: false, widthClass: 'w-80' },
  { key: 'warning', label: 'Warning', sortable: false, widthClass: 'w-28' },
  { key: 'createdAt', label: 'Created', sortable: true, sortField: 'createdAt', widthClass: 'w-28' },
  { key: 'updatedAt', label: 'Updated', sortable: true, sortField: 'updatedAt', widthClass: 'w-28' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function WarningBadge({ warning }: { warning: FrameSenseWarning }) {
  if (warning === null) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const label = warning === 'none' ? 'No frame' : 'Multiple frames';
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      {label}
    </span>
  );
}

function SortIcon({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  if (!active) {
    return (
      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
        />
      </svg>
    );
  }
  return order === 'asc' ? (
    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default function FrameSensesTable({ searchQuery, refreshTrigger }: FrameSensesTableProps) {
  const router = useRouter();

  const [data, setData] = useState<PaginatedFrameSenses | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortState, setSortState] = useState<SortState>({ field: 'id', order: 'asc' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('limit', String(pageSize));
      params.set('sortBy', sortState.field);
      params.set('sortOrder', sortState.order);
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const response = await fetch(`/api/frame-senses/paginated?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Failed to load senses (${response.status})`);
      }
      const result: PaginatedFrameSenses = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load senses');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, sortState, searchQuery]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, refreshTrigger]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleSort = useCallback((field: SortField) => {
    setSortState(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc',
    }));
    setCurrentPage(1);
  }, []);

  const rows = useMemo(() => data?.data ?? [], [data]);

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 table-fixed">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide ${col.widthClass}`}
                >
                  {col.sortable && col.sortField ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col.sortField!)}
                      className="inline-flex items-center gap-1 hover:text-gray-900 cursor-pointer"
                    >
                      {col.label}
                      <SortIcon
                        active={sortState.field === col.sortField}
                        order={sortState.order}
                      />
                    </button>
                  ) : (
                    <span>{col.label}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-12">
                  <LoadingSpinner size="lg" label="Loading senses..." />
                </td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-12 text-center">
                  <div className="text-red-600 text-sm font-medium">{error}</div>
                </td>
              </tr>
            )}

            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-sm text-gray-500">
                  {searchQuery.trim()
                    ? `No senses found for "${searchQuery.trim()}"`
                    : 'No senses available'}
                </td>
              </tr>
            )}

            {rows.map(row => {
              const pending = row.pending;
              const rowClass = pending ? getPendingRowClasses(pending.operation) : 'hover:bg-gray-50';
              return (
                <tr key={row.id} className={rowClass}>
                  <td className="px-4 py-3 align-top text-xs font-mono text-gray-700 break-all">
                    {row.id}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 uppercase">
                      {row.pos}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {row.lemmas.length === 0 ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.lemmas.slice(0, 6).map((lemma, idx) => (
                          <span
                            key={`${row.id}-lemma-${idx}`}
                            className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                          >
                            {lemma}
                          </span>
                        ))}
                        {row.lemmas.length > 6 && (
                          <span className="text-xs text-gray-500 self-center">
                            +{row.lemmas.length - 6}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-sm text-gray-900">
                    {row.definition || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="text-xs font-medium text-gray-700">
                      {row.frame_type || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {row.frames.length === 0 ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.frames.map(f => {
                          const label = f.code ?? f.label ?? f.id;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() =>
                                router.push(`/graph/frames?entry=${encodeURIComponent(f.id)}`)
                              }
                              className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-100 cursor-pointer transition-colors"
                              title={f.label}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {row.lexical_units.entries.length === 0 ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <div className="space-y-1">
                        {row.lexical_units.entries.map(lu => {
                          const allLemmas = [...(lu.src_lemmas || []), ...(lu.lemmas || [])];
                          const firstLemma = allLemmas[0] || lu.code || '—';
                          const extraCount = Math.max(0, allLemmas.length - 1);
                          return (
                            <div
                              key={lu.id}
                              className="flex items-start gap-2 text-xs"
                              title={lu.gloss}
                            >
                              <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-800 whitespace-nowrap">
                                {firstLemma}
                                {extraCount > 0 && (
                                  <span className="ml-1 text-gray-500">+{extraCount}</span>
                                )}
                              </span>
                              <span className="truncate text-gray-600">{lu.gloss}</span>
                            </div>
                          );
                        })}
                        {row.lexical_units.hasMore && (
                          <div className="text-xs text-gray-400 italic">
                            +{row.lexical_units.totalCount - row.lexical_units.entries.length} more
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <WarningBadge warning={row.frameWarning} />
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-gray-600">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 align-top text-xs text-gray-600">
                    {formatDate(row.updatedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data && (
        <Pagination
          currentPage={data.page}
          totalPages={data.totalPages}
          totalItems={data.total}
          pageSize={data.limit}
          onPageChange={setCurrentPage}
          loading={loading}
          itemLabel="senses"
        />
      )}
    </div>
  );
}
