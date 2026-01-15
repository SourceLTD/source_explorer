'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import ReallocationBridge from './ReallocationBridge';
import NodeCard from './NodeCard';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

type JsonRecord = Record<string, unknown>;

interface FrameRoleApi {
  description?: string | null;
  notes?: string | null;
  main?: boolean | null;
  examples?: string[];
  label?: string | null;
  role_type?: {
    id: string;
    code?: string;
    label: string;
    generic_description: string;
    explanation?: string | null;
  };
}

interface LexicalUnitApi {
  id: string;
  code: string;
  gloss: string;
  lemmas: string[];
  pos: string;
}

interface FrameApi {
  id: string;
  label: string;
  code?: string | null;
  definition?: string | null;
  short_definition?: string | null;
  super_frame_id?: string | null;
  frame_roles?: FrameRoleApi[];
  lexical_units?: LexicalUnitApi[];
}

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

function isIntLikeString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^-?\d+$/.test(value.trim());
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

function truncateText(input: string, maxLen: number): string {
  const s = input.trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (typeof err === 'object' && 'name' in err && (err as any).name === 'AbortError') return true;
  return false;
}

function pickFrameTitle(frame: FrameApi | null): string {
  if (!frame) return 'None';
  const code = typeof frame.code === 'string' ? frame.code.trim() : '';
  const label = typeof frame.label === 'string' ? frame.label.trim() : '';
  const base = code || label || 'Unknown';
  return `${base} (#${frame.id})`;
}

function pickFrameDefinition(frame: FrameApi | null): string | null {
  if (!frame) return null;
  const shortDef = typeof frame.short_definition === 'string' ? frame.short_definition.trim() : '';
  if (shortDef) return shortDef;
  const def = typeof frame.definition === 'string' ? frame.definition.trim() : '';
  return def || null;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text || url}`);
  }
  return res.json() as Promise<T>;
}

function frameFromSnapshot(virtualId: string, snapshot: unknown): FrameApi {
  const rec = (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) ? (snapshot as JsonRecord) : {};
  const labelRaw = rec.label;
  const codeRaw = rec.code;
  const label = typeof labelRaw === 'string' && labelRaw.trim() !== '' ? labelRaw.trim() : '';
  const code = typeof codeRaw === 'string' && codeRaw.trim() !== '' ? codeRaw.trim() : null;

  const definition = typeof rec.definition === 'string' ? rec.definition : null;
  const short_definition = typeof rec.short_definition === 'string' ? rec.short_definition : null;

  return {
    id: virtualId,
    label: label || (code ?? 'Unknown'),
    code,
    definition,
    short_definition,
    frame_roles: Array.isArray(rec.frame_roles) ? (rec.frame_roles as any) : undefined,
  };
}

async function loadFrameRef(
  ref: string,
  signal: AbortSignal
): Promise<FrameApi> {
  // Virtual pending-create frame reference: -<changesetId>
  if (ref.startsWith('-')) {
    const changesetId = ref.slice(1);
    const changeset = await fetchJson<any>(`/api/changesets/${changesetId}`, signal);
    const snapshot = changeset?.after_snapshot ?? changeset?.before_snapshot ?? null;
    return frameFromSnapshot(ref, snapshot);
  }

  return fetchJson<FrameApi>(`/api/frames/${ref}`, signal);
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
  /** The frame being reallocated (A) */
  frameId: string;
  oldSuperFrameRef: string | null;
  newSuperFrameRef: string | null;
}

export default function FrameReallocationContext(props: FrameReallocationContextProps) {
  const oldRef = useMemo(() => normalizeFrameRef(props.oldSuperFrameRef), [props.oldSuperFrameRef]);
  const newRef = useMemo(() => normalizeFrameRef(props.newSuperFrameRef), [props.newSuperFrameRef]);

  const frameCacheRef = useRef(new Map<string, FrameApi>());
  const childCacheRef = useRef(new Map<string, { data: FrameChildApi[]; total: number }>());

  const [frameA, setFrameA] = useState<FrameApi | null>(null);
  const [oldSuper, setOldSuper] = useState<FrameApi | null>(null);
  const [newSuper, setNewSuper] = useState<FrameApi | null>(null);

  const [oldChildren, setOldChildren] = useState<{ data: FrameChildApi[]; total: number } | null>(null);
  const [newChildren, setNewChildren] = useState<{ data: FrameChildApi[]; total: number } | null>(null);

  const [oldPage, setOldPage] = useState(1);
  const [newPage, setNewPage] = useState(1);

  const [loadingA, setLoadingA] = useState(false);
  const [loadingOld, setLoadingOld] = useState(false);
  const [loadingNew, setLoadingNew] = useState(false);
  const [loadingOldChildren, setLoadingOldChildren] = useState(false);
  const [loadingNewChildren, setLoadingNewChildren] = useState(false);

  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorOld, setErrorOld] = useState<string | null>(null);
  const [errorNew, setErrorNew] = useState<string | null>(null);
  const [errorOldChildren, setErrorOldChildren] = useState<string | null>(null);
  const [errorNewChildren, setErrorNewChildren] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();

    const loadA = async () => {
      setLoadingA(true);
      setErrorA(null);
      try {
        if (!isIntLikeString(props.frameId) || props.frameId.startsWith('-')) {
          throw new Error('Invalid frame id');
        }
        const cached = frameCacheRef.current.get(props.frameId);
        if (cached) {
          setFrameA(cached);
        } else {
          const f = await loadFrameRef(props.frameId, ac.signal);
          frameCacheRef.current.set(props.frameId, f);
          setFrameA(f);
        }
      } catch (e) {
        if (isAbortError(e) || ac.signal.aborted) return;
        setFrameA(null);
        setErrorA(e instanceof Error ? e.message : 'Failed to load frame');
      } finally {
        if (!ac.signal.aborted) setLoadingA(false);
      }
    };

    const loadParent = async (ref: string | null, setParent: (f: FrameApi | null) => void, setLoading: (l: boolean) => void, setError: (e: string | null) => void) => {
      if (!ref) {
        setParent(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const cached = frameCacheRef.current.get(ref);
        if (cached) {
          setParent(cached);
        } else {
          const f = await loadFrameRef(ref, ac.signal);
          frameCacheRef.current.set(ref, f);
          setParent(f);
        }
      } catch (e) {
        if (isAbortError(e) || ac.signal.aborted) return;
        setParent(null);
        setError(e instanceof Error ? e.message : 'Failed to load super frame');
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };

    void Promise.all([
      loadA(),
      loadParent(oldRef, setOldSuper, setLoadingOld, setErrorOld),
      loadParent(newRef, setNewSuper, setLoadingNew, setErrorNew),
    ]);

    return () => ac.abort();
  }, [props.frameId, oldRef, newRef]);

  // Children loading effects (separated from main data to allow pagination)
  useEffect(() => {
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
  }, [oldRef, oldPage]);

  useEffect(() => {
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
  }, [newRef, newPage]);

  const isNoOp = (oldRef ?? null) === (newRef ?? null);
  if (isNoOp) return null;

  const renderLexicalUnitSnippets = (lus: LexicalUnitApi[] | undefined) => {
    const items = Array.isArray(lus) ? lus : [];
    if (items.length === 0) return <div className="text-[11px] text-gray-500 italic">No lexical units.</div>;

    return (
      <div className="mt-2 space-y-2">
        {items.slice(0, 10).map(lu => (
          <div key={lu.id} className="flex flex-col gap-0.5 border-l-2 border-blue-100 pl-2">
            <a
              key={lu.id}
              href={`/table?search=${encodeURIComponent(lu.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-mono text-blue-700 hover:text-blue-800 cursor-pointer font-bold"
            >
              {lu.code}
            </a>
            <div className="text-[10px] text-gray-600 leading-tight line-clamp-2" title={lu.gloss}>
              {lu.gloss}
            </div>
          </div>
        ))}
        {items.length > 10 && <span className="text-[10px] text-gray-400 italic">…(+{items.length - 10} more)</span>}
      </div>
    );
  };

  const renderRolesSnippet = (roles: FrameRoleApi[] | undefined) => {
    const items = Array.isArray(roles) ? roles : [];
    if (items.length === 0) return null;

    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {items.slice(0, 8).map((r, idx) => (
          <span 
            key={idx} 
            className="px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 font-mono text-[10px] border border-gray-100"
            title={r.description || undefined}
          >
            {r.role_type?.label || 'Role'}
          </span>
        ))}
        {items.length > 8 && <span className="text-[10px] text-gray-400 self-center">…</span>}
      </div>
    );
  };

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
      return <div className="text-[11px] text-gray-400 italic mt-4">N/A for pending parents.</div>;
    }

    const totalPages = children ? Math.ceil(children.total / 10) : 0;

    return (
      <div className="mt-4 flex-1 flex flex-col min-h-0">
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
    <div className="p-6 bg-gray-50/50 rounded-2xl border border-gray-200 shadow-inner">
      <ReallocationBridge
        origin={
          <>
            <NodeCard
              type="origin"
              title={oldSuper ? pickFrameTitle(oldSuper) : 'No parent'}
              subtitle="Old Super Frame"
              loading={Boolean(oldRef) && loadingOld}
              error={errorOld}
            >
              {oldSuper && (
                <>
                  {pickFrameDefinition(oldSuper) && (
                    <div className="text-[11px] text-gray-600 line-clamp-2 mb-2">{pickFrameDefinition(oldSuper)}</div>
                  )}
                  {renderRolesSnippet(oldSuper.frame_roles)}
                </>
              )}
            </NodeCard>
            {renderSiblingList(oldChildren, loadingOldChildren, errorOldChildren, oldRef, oldPage, setOldPage)}
          </>
        }
        focus={
          <NodeCard
            type="focus"
            title={frameA ? pickFrameTitle(frameA) : 'Frame'}
            subtitle="Entity being moved"
            loading={loadingA}
            error={errorA}
            className="shadow-md scale-105 z-30"
          >
            {frameA && (
              <>
                {pickFrameDefinition(frameA) && (
                  <div className="text-[11px] text-gray-700 font-medium mb-2">{pickFrameDefinition(frameA)}</div>
                )}
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Lexical entries</div>
                {renderLexicalUnitSnippets(frameA.lexical_units)}
              </>
            )}
          </NodeCard>
        }
        destination={
          <>
            <NodeCard
              type="destination"
              title={newSuper ? pickFrameTitle(newSuper) : 'No parent'}
              subtitle="New Super Frame"
              loading={Boolean(newRef) && loadingNew}
              error={errorNew}
            >
              {newSuper && (
                <>
                  {pickFrameDefinition(newSuper) && (
                    <div className="text-[11px] text-gray-600 line-clamp-2 mb-2">{pickFrameDefinition(newSuper)}</div>
                  )}
                  {renderRolesSnippet(newSuper.frame_roles)}
                </>
              )}
            </NodeCard>
            {renderSiblingList(newChildren, loadingNewChildren, errorNewChildren, newRef, newPage, setNewPage)}
          </>
        }
      />
    </div>
  );
}

