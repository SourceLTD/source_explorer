'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import ReallocationBridge from './ReallocationBridge';
import NodeCard from './NodeCard';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

type JsonRecord = Record<string, unknown>;

interface LexicalUnitSnapshot {
  id?: unknown;
  code?: unknown;
  pos?: unknown;
  lemmas?: unknown;
  gloss?: unknown;
  frame_id?: unknown;
}

interface LexicalUnitSnippetApi {
  id?: string;
  code: string;
  lemmas: string[];
  src_lemmas?: string[];
  pos: string;
  gloss: string;
}

interface FrameFromPaginated {
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
  data: FrameFromPaginated[];
}

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (typeof err === 'object' && 'name' in err && (err as any).name === 'AbortError') return true;
  return false;
}

function normalizeIntLike(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return /^-?\d+$/.test(trimmed) ? trimmed : null;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return null;
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  return null;
}

function truncateText(input: string, maxLen: number): string {
  const s = input.trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

function formatLemmas(value: unknown): string {
  if (!Array.isArray(value)) return '';
  const strs = value.filter(v => typeof v === 'string') as string[];
  if (strs.length === 0) return '';
  const shown = strs.slice(0, 6);
  const more = strs.length > shown.length ? `, …(+${strs.length - shown.length})` : '';
  return shown.join(', ') + more;
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text || url}`);
  }
  return res.json() as Promise<T>;
}

async function loadFrameViaPaginated(id: string, signal: AbortSignal): Promise<FrameFromPaginated | null> {
  const url = `/api/frames/paginated?search=${encodeURIComponent(id)}&page=1&limit=1&sortBy=label&sortOrder=asc`;
  const res = await fetchJson<FramesPaginatedResponse>(url, signal);
  const frame = Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
  return frame;
}

function frameFromSnapshot(virtualId: string, snapshot: unknown): FrameFromPaginated {
  const rec = (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) ? (snapshot as JsonRecord) : {};
  const label = typeof rec.label === 'string' ? rec.label : '';
  const code = typeof rec.code === 'string' ? rec.code : null;
  return {
    id: virtualId,
    label: label || (code ?? 'Unknown'),
    code,
    definition: typeof rec.definition === 'string' ? rec.definition : null,
    short_definition: typeof rec.short_definition === 'string' ? rec.short_definition : null,
    lexical_entries: undefined,
  };
}

async function loadLexicalUnitSiblings(
  frameId: string,
  page: number,
  signal: AbortSignal
): Promise<{ data: LexicalUnitSnippetApi[]; total: number }> {
  // Using the paginated lexical units API with frame_id filter
  const url = `/api/lexical-units/paginated?frame_id=${encodeURIComponent(frameId)}&page=${page}&limit=10&sortBy=code&sortOrder=asc`;
  const res = await fetchJson<any>(url, signal);
  return { 
    data: res.data ?? [], 
    total: typeof res.total === 'number' ? res.total : (res.data?.length ?? 0) 
  };
}

export interface LexicalUnitReallocationContextProps {
  lexicalUnitId: string;
  oldFrameRef: string | null;
  newFrameRef: string | null;
  snapshot: JsonRecord | null;
}

export default function LexicalUnitReallocationContext(props: LexicalUnitReallocationContextProps) {
  const oldRef = useMemo(() => normalizeIntLike(props.oldFrameRef), [props.oldFrameRef]);
  const newRef = useMemo(() => normalizeIntLike(props.newFrameRef), [props.newFrameRef]);

  const [oldFrame, setOldFrame] = useState<FrameFromPaginated | null>(null);
  const [newFrame, setNewFrame] = useState<FrameFromPaginated | null>(null);
  const [oldSiblings, setOldSiblings] = useState<{ data: LexicalUnitSnippetApi[]; total: number } | null>(null);
  const [newSiblings, setNewSiblings] = useState<{ data: LexicalUnitSnippetApi[]; total: number } | null>(null);

  const [oldPage, setOldPage] = useState(1);
  const [newPage, setNewPage] = useState(1);

  const [loadingOld, setLoadingOld] = useState(false);
  const [loadingNew, setLoadingNew] = useState(false);
  const [loadingOldSiblings, setLoadingOldSiblings] = useState(false);
  const [loadingNewSiblings, setLoadingNewSiblings] = useState(false);

  const [errorOld, setErrorOld] = useState<string | null>(null);
  const [errorNew, setErrorNew] = useState<string | null>(null);
  const [errorOldSiblings, setErrorOldSiblings] = useState<string | null>(null);
  const [errorNewSiblings, setErrorNewSiblings] = useState<string | null>(null);

  const frameCacheRef = useRef(new Map<string, FrameFromPaginated | null>());

  const lu = props.snapshot as LexicalUnitSnapshot | null;
  const luCode = pickString(lu?.code);
  const luPos = pickString(lu?.pos);
  const luGloss = pickString(lu?.gloss);
  const luLemmas = formatLemmas(lu?.lemmas);

  useEffect(() => {
    const ac = new AbortController();

    const loadParent = async (ref: string | null, setParent: (f: FrameFromPaginated | null) => void, setLoading: (l: boolean) => void, setError: (e: string | null) => void) => {
      if (!ref) {
        setParent(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        if (frameCacheRef.current.has(ref)) {
          setParent(frameCacheRef.current.get(ref) ?? null);
        } else {
          const frame = await loadFrameRef(ref, ac.signal);
          frameCacheRef.current.set(ref, frame);
          setParent(frame);
        }
      } catch (e) {
        if (isAbortError(e) || ac.signal.aborted) return;
        setParent(null);
        setError(e instanceof Error ? e.message : 'Failed to load frame');
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };

    void Promise.all([
      loadParent(oldRef, setOldFrame, setLoadingOld, setErrorOld),
      loadParent(newRef, setNewFrame, setLoadingNew, setErrorNew),
    ]);

    return () => ac.abort();
  }, [oldRef, newRef]);

  // Siblings loading effects
  useEffect(() => {
    if (!oldRef || !/^\d+$/.test(oldRef)) {
      setOldSiblings(null);
      return;
    }
    const ac = new AbortController();
    const load = async () => {
      setLoadingOldSiblings(true);
      setErrorOldSiblings(null);
      try {
        const res = await loadLexicalUnitSiblings(oldRef, oldPage, ac.signal);
        setOldSiblings(res);
      } catch (e) {
        if (isAbortError(e) || ac.signal.aborted) return;
        setOldSiblings(null);
        setErrorOldSiblings(e instanceof Error ? e.message : 'Failed to load siblings');
      } finally {
        if (!ac.signal.aborted) setLoadingOldSiblings(false);
      }
    };
    void load();
    return () => ac.abort();
  }, [oldRef, oldPage]);

  useEffect(() => {
    if (!newRef || !/^\d+$/.test(newRef)) {
      setNewSiblings(null);
      return;
    }
    const ac = new AbortController();
    const load = async () => {
      setLoadingNewSiblings(true);
      setErrorNewSiblings(null);
      try {
        const res = await loadLexicalUnitSiblings(newRef, newPage, ac.signal);
        setNewSiblings(res);
      } catch (e) {
        if (isAbortError(e) || ac.signal.aborted) return;
        setNewSiblings(null);
        setErrorNewSiblings(e instanceof Error ? e.message : 'Failed to load siblings');
      } finally {
        if (!ac.signal.aborted) setLoadingNewSiblings(false);
      }
    };
    void load();
    return () => ac.abort();
  }, [newRef, newPage]);

  const isNoOp = (oldRef ?? null) === (newRef ?? null);
  if (isNoOp) return null;

  const renderSiblingList = (
    siblings: { data: LexicalUnitSnippetApi[]; total: number } | null,
    loading: boolean,
    error: string | null,
    parentId: string | null,
    page: number,
    setPage: (p: number) => void
  ) => {
    if (!parentId) return null;
    if (!/^\d+$/.test(parentId)) {
      return <div className="text-[11px] text-gray-400 italic mt-4">N/A for pending frames.</div>;
    }

    const totalPages = siblings ? Math.ceil(siblings.total / 10) : 0;

    return (
      <div className="mt-4 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Siblings ({siblings?.total ?? 0})</div>
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
          ) : siblings?.data.map((sibling, idx) => (
            <NodeCard
              key={`${sibling.code}-${idx}`}
              title={sibling.code}
              className="!p-2"
              noDivider
            >
              <div className="text-[10px] text-gray-500 line-clamp-1">{sibling.gloss}</div>
            </NodeCard>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-gray-50/50 rounded-2xl border border-gray-200 shadow-inner">
      <ReallocationBridge
        origin={
          <>
            <NodeCard
              type="origin"
              title={oldFrame ? oldFrame.label : 'No frame'}
              subtitle="Old Frame"
              loading={Boolean(oldRef) && loadingOld}
              error={errorOld}
            >
              {oldFrame && (
                <div className="text-[11px] text-gray-600 line-clamp-2">
                  {oldFrame.short_definition || oldFrame.definition}
                </div>
              )}
            </NodeCard>
            {renderSiblingList(oldSiblings, loadingOldSiblings, errorOldSiblings, oldRef, oldPage, setOldPage)}
          </>
        }
        focus={
          <NodeCard
            type="focus"
            title={luCode || 'Lexical Unit'}
            subtitle="Lexical Unit being moved"
            className="shadow-md scale-105 z-30"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-mono text-[9px] uppercase">{luPos}</span>
                <span className="text-[10px] text-gray-500 font-mono truncate">{luLemmas}</span>
              </div>
              <div className="text-[11px] text-gray-700 font-medium leading-tight line-clamp-3">{luGloss}</div>
            </div>
          </NodeCard>
        }
        destination={
          <>
            <NodeCard
              type="destination"
              title={newFrame ? newFrame.label : 'No frame'}
              subtitle="New Frame"
              loading={Boolean(newRef) && loadingNew}
              error={errorNew}
            >
              {newFrame && (
                <div className="text-[11px] text-gray-600 line-clamp-2">
                  {newFrame.short_definition || newFrame.definition}
                </div>
              )}
            </NodeCard>
            {renderSiblingList(newSiblings, loadingNewSiblings, errorNewSiblings, newRef, newPage, setNewPage)}
          </>
        }
      />
    </div>
  );
}

