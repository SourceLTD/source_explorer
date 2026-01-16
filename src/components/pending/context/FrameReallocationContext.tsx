'use client';

import React, { useEffect, useMemo, useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import NodeCard from './NodeCard';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { VirtualIndex } from '../virtualIndex';

interface LexicalUnitSnippetApi {
  code: string;
  lemmas: string[];
  src_lemmas?: string[];
  pos: string;
  gloss: string;
}

interface FrameChildApi {
  id: string;
  label: string;
  code?: string | null;
  definition?: string | null;
  short_definition?: string | null;
  lexical_entries?: {
    entries: LexicalUnitSnippetApi[];
    totalCount: number;
    hasMore: boolean;
  };
}

interface FramesPaginatedResponse {
  data: FrameChildApi[];
  total: number;
}

function normalizeFrameRef(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isInteger(value)) return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return /^-?\d+$/.test(trimmed) ? trimmed : null;
  }
  if (typeof value === 'bigint') return value.toString();
  return null;
}

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (typeof err === 'object' && 'name' in err && (err as any).name === 'AbortError') return true;
  return false;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text || url}`);
  }
  return res.json() as Promise<T>;
}

async function loadChildFrames(
  superFrameId: string,
  page: number,
  signal: AbortSignal
): Promise<{ data: FrameChildApi[]; total: number }> {
  const url = `/api/frames/paginated?super_frame_id=${encodeURIComponent(superFrameId)}&page=${page}&limit=10&sortBy=label&sortOrder=asc`;
  const res = await fetchJson<FramesPaginatedResponse>(url, signal);
  return { data: res.data ?? [], total: typeof res.total === 'number' ? res.total : (res.data?.length ?? 0) };
}

export interface FrameReallocationContextProps {
  oldSuperFrameRef: string | null;
  newSuperFrameRef: string | null;
  virtualIndex?: VirtualIndex;
}

export default function FrameReallocationContext(props: FrameReallocationContextProps) {
  const oldRef = useMemo(() => normalizeFrameRef(props.oldSuperFrameRef), [props.oldSuperFrameRef]);
  const newRef = useMemo(() => normalizeFrameRef(props.newSuperFrameRef), [props.newSuperFrameRef]);

  const [isExpanded, setIsExpanded] = useState(false);

  const [oldChildren, setOldChildren] = useState<{ data: FrameChildApi[]; total: number } | null>(null);
  const [newChildren, setNewChildren] = useState<{ data: FrameChildApi[]; total: number } | null>(null);

  const [oldPage, setOldPage] = useState(1);
  const [newPage, setNewPage] = useState(1);

  const [loadingOldChildren, setLoadingOldChildren] = useState(false);
  const [loadingNewChildren, setLoadingNewChildren] = useState(false);

  const [errorOldChildren, setErrorOldChildren] = useState<string | null>(null);
  const [errorNewChildren, setErrorNewChildren] = useState<string | null>(null);

  // Children loading effects (separated from main data to allow pagination)
  useEffect(() => {
    if (!isExpanded) return;
    if (!oldRef || !/^\d+$/.test(oldRef)) {
      setOldChildren(null);
      return;
    }
    const ac = new AbortController();
    const load = async () => {
      setLoadingOldChildren(true);
      setErrorOldChildren(null);
      try {
        const cacheKey = `${oldRef}-${oldPage}`;
        const res = await loadChildFrames(oldRef, oldPage, ac.signal);
        setOldChildren(res);
      } catch (e) {
        if (isAbortError(e) || ac.signal.aborted) return;
        setOldChildren(null);
        setErrorOldChildren(e instanceof Error ? e.message : 'Failed to load child frames');
      } finally {
        if (!ac.signal.aborted) setLoadingOldChildren(false);
      }
    };
    void load();
    return () => ac.abort();
  }, [isExpanded, oldRef, oldPage]);

  useEffect(() => {
    if (!isExpanded) return;
    if (!newRef || !/^\d+$/.test(newRef)) {
      setNewChildren(null);
      return;
    }
    const ac = new AbortController();
    const load = async () => {
      setLoadingNewChildren(true);
      setErrorNewChildren(null);
      try {
        const res = await loadChildFrames(newRef, newPage, ac.signal);
        setNewChildren(res);
      } catch (e) {
        if (isAbortError(e) || ac.signal.aborted) return;
        setNewChildren(null);
        setErrorNewChildren(e instanceof Error ? e.message : 'Failed to load child frames');
      } finally {
        if (!ac.signal.aborted) setLoadingNewChildren(false);
      }
    };
    void load();
    return () => ac.abort();
  }, [isExpanded, newRef, newPage]);

  useEffect(() => {
    // Collapse details when the refs change (new row / new change)
    setIsExpanded(false);
  }, [oldRef, newRef]);

  const isNoOp = (oldRef ?? null) === (newRef ?? null);
  if (isNoOp) return null;

  const renderSiblingList = (
    children: { data: FrameChildApi[]; total: number } | null,
    loading: boolean,
    error: string | null,
    parentId: string | null,
    page: number,
    setPage: (p: number) => void
  ) => {
    if (!parentId) return null;
    if (!/^\d+$/.test(parentId)) {
      const virtualParent = props.virtualIndex?.virtualFramesByRef.get(parentId) ?? null;
      const virtualChildren = props.virtualIndex?.framesBySuperRef.get(parentId) ?? [];
      const totalPages = Math.ceil(virtualChildren.length / 10);
      const pageStart = (page - 1) * 10;
      const pageItems = virtualChildren.slice(pageStart, pageStart + 10);

      return (
        <div className="mt-2 flex-1 flex flex-col min-h-0">
          <div className="mb-2 space-y-1">
            <div className="text-[9px] font-bold uppercase tracking-wider text-amber-600">Pending</div>
            {virtualParent ? (
              <NodeCard title={virtualParent.label} className="!p-2" noDivider subtle>
                {(virtualParent.short_definition || virtualParent.definition) && (
                  <div className="text-[10px] text-gray-500 line-clamp-2 italic">
                    {virtualParent.short_definition || virtualParent.definition}
                  </div>
                )}
              </NodeCard>
            ) : (
              <div className="text-[11px] text-gray-400 italic">Pending destination details unavailable.</div>
            )}
          </div>

          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Siblings ({virtualChildren.length})
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeftIcon className="w-3 h-3" />
                </button>
                <span className="text-[10px] font-medium text-gray-500">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronRightIcon className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar">
            {pageItems.length === 0 ? (
              <div className="text-[11px] text-gray-400 italic">No pending frames found inside.</div>
            ) : (
              pageItems.map(child => {
                const pendingLexicalUnits = props.virtualIndex?.lexicalUnitsByFrameRef.get(child.id) ?? [];
                return (
                  <NodeCard
                    key={child.id}
                    title={child.label}
                    className="!p-2"
                    noDivider
                    subtle
                  >
                    {(child.short_definition || child.definition) && (
                      <div className="text-[10px] text-gray-500 line-clamp-1">{child.short_definition || child.definition}</div>
                    )}
                    {pendingLexicalUnits.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {pendingLexicalUnits.slice(0, 3).map((lu, idx) => (
                          <div key={`${lu.id}-${idx}`} className="text-[9px] leading-tight">
                            <span className="font-mono text-blue-600/70 font-bold">{lu.code}</span>
                            <span className="text-gray-400 mx-1">•</span>
                            <span className="text-gray-500 line-clamp-1 italic inline">{lu.gloss}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </NodeCard>
                );
              })
            )}
          </div>
        </div>
      );
    }

    const totalPages = children ? Math.ceil(children.total / 10) : 0;

    return (
      <div className="mt-2 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Siblings ({children?.total ?? 0})</div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1 || loading}
                className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                <ChevronLeftIcon className="w-3 h-3" />
              </button>
              <span className="text-[10px] font-medium text-gray-500">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages || loading}
                className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
              >
                <ChevronRightIcon className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar">
          {loading ? (
            <div className="py-8 flex justify-center"><LoadingSpinner size="sm" noPadding /></div>
          ) : error ? (
            <div className="text-[11px] text-red-500">{error}</div>
          ) : children?.data.map(child => (
            <NodeCard
              key={child.id}
              title={child.label}
              className="!p-2"
              noDivider
              subtle
            >
              <div className="flex flex-col gap-1">
                {child.short_definition && (
                  <div className="text-[10px] text-gray-500 line-clamp-1">{child.short_definition}</div>
                )}
                {child.lexical_entries && child.lexical_entries.entries.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {child.lexical_entries.entries.slice(0, 3).map((e, idx) => (
                      <div key={idx} className="text-[9px] leading-tight">
                        <a
                          href={`/table?search=${encodeURIComponent(e.code)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-blue-600/70 hover:text-blue-700 font-bold"
                        >
                          {e.code}
                        </a>
                        <span className="text-gray-400 mx-1">•</span>
                        <span className="text-gray-500 line-clamp-1 italic inline">{e.gloss}</span>
                      </div>
                    ))}
                    {child.lexical_entries.totalCount > 3 && <div className="text-[8px] text-gray-400 italic">+{child.lexical_entries.totalCount - 3} more entries</div>}
                  </div>
                )}
              </div>
            </NodeCard>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setIsExpanded(v => !v)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer"
        aria-expanded={isExpanded}
      >
        {isExpanded ? 'Show less' : 'Show more'}
        <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <div className="mt-2 flex items-start gap-3">
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {renderSiblingList(oldChildren, loadingOldChildren, errorOldChildren, oldRef, oldPage, setOldPage)}
          </div>

          {/* Spacer aligns with the arrow column in the Current → New row above (w-20 + px-2 = ~w-24). */}
          <div className="flex-shrink-0 w-24" aria-hidden="true" />

          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {renderSiblingList(newChildren, loadingNewChildren, errorNewChildren, newRef, newPage, setNewPage)}
          </div>
        </div>
      )}
    </div>
  );
}

