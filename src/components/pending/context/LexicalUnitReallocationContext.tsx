'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import NodeCard from './NodeCard';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { VirtualIndex } from '../virtualIndex';

type JsonRecord = Record<string, unknown>;

interface LexicalUnitSnippetApi {
  id?: string;
  code: string;
  lemmas: string[];
  src_lemmas?: string[];
  pos: string;
  gloss: string;
}

interface ConceptFromPaginated {
  id: string;
  label: string;
  code?: string | null;
  definition?: string | null;
  short_definition?: string | null;
  lexical_units?: {
    entries: LexicalUnitSnippetApi[];
    totalCount: number;
    hasMore: boolean;
  };
}

interface ConceptsPaginatedResponse {
  data: ConceptFromPaginated[];
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

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text || url}`);
  }
  return res.json() as Promise<T>;
}

function conceptFromSnapshot(virtualId: string, snapshot: unknown): ConceptFromPaginated {
  const rec = (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) ? (snapshot as JsonRecord) : {};
  const label = typeof rec.label === 'string' ? rec.label : '';
  const code = typeof rec.code === 'string' ? rec.code : null;
  return {
    id: virtualId,
    label: label || (code ?? 'Unknown'),
    code,
    definition: typeof rec.definition === 'string' ? rec.definition : null,
    short_definition: typeof rec.short_definition === 'string' ? rec.short_definition : null,
    lexical_units: undefined,
  };
}

async function loadConceptRef(
  ref: string,
  signal: AbortSignal
): Promise<ConceptFromPaginated> {
  if (ref.startsWith('-')) {
    const changesetId = ref.slice(1);
    const changeset = await fetchJson<any>(`/api/changesets/${changesetId}`, signal);
    const snapshot = changeset?.after_snapshot ?? changeset?.before_snapshot ?? null;
    return conceptFromSnapshot(ref, snapshot);
  }

  const url = `/api/concepts/paginated?search=${encodeURIComponent(ref)}&page=1&limit=1&sortBy=label&sortOrder=asc`;
  const res = await fetchJson<ConceptsPaginatedResponse>(url, signal);
  const concept = Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : null;
  if (!concept) throw new Error(`Concept ${ref} not found`);
  return concept;
}

async function loadLexicalUnitSiblings(
  conceptId: string,
  page: number,
  signal: AbortSignal
): Promise<{ data: LexicalUnitSnippetApi[]; total: number }> {
  const url = `/api/lexical-units/paginated?concept_id=${encodeURIComponent(conceptId)}&page=${page}&limit=10&sortBy=code&sortOrder=asc`;
  const res = await fetchJson<any>(url, signal);
  return { 
    data: res.data ?? [], 
    total: typeof res.total === 'number' ? res.total : (res.data?.length ?? 0) 
  };
}

export interface LexicalUnitReallocationContextProps {
  oldConceptRef: string | null;
  newConceptRef: string | null;
  virtualIndex?: VirtualIndex;
}

export default function LexicalUnitReallocationContext(props: LexicalUnitReallocationContextProps) {
  const oldRef = useMemo(() => normalizeIntLike(props.oldConceptRef), [props.oldConceptRef]);
  const newRef = useMemo(() => normalizeIntLike(props.newConceptRef), [props.newConceptRef]);

  const [isExpanded, setIsExpanded] = useState(false);

  const [oldConcept, setOldConcept] = useState<ConceptFromPaginated | null>(null);
  const [newConcept, setNewConcept] = useState<ConceptFromPaginated | null>(null);
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

  const conceptCacheRef = useRef(new Map<string, ConceptFromPaginated | null>());

  useEffect(() => {
    if (!isExpanded) return;
    const ac = new AbortController();

    const loadParent = async (ref: string | null, setParent: (f: ConceptFromPaginated | null) => void, setLoading: (l: boolean) => void, setError: (e: string | null) => void) => {
      if (!ref) {
        setParent(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        if (conceptCacheRef.current.has(ref)) {
          setParent(conceptCacheRef.current.get(ref) ?? null);
        } else {
          const concept = await loadConceptRef(ref, ac.signal);
          conceptCacheRef.current.set(ref, concept);
          setParent(concept);
        }
      } catch (e) {
        if (isAbortError(e) || ac.signal.aborted) return;
        setParent(null);
        setError(e instanceof Error ? e.message : 'Failed to load concept');
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };

    void Promise.all([
      loadParent(oldRef, setOldConcept, setLoadingOld, setErrorOld),
      loadParent(newRef, setNewConcept, setLoadingNew, setErrorNew),
    ]);

    return () => ac.abort();
  }, [isExpanded, oldRef, newRef]);

  // Siblings loading effects
  useEffect(() => {
    if (!isExpanded) return;
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
  }, [isExpanded, oldRef, oldPage]);

  useEffect(() => {
    if (!isExpanded) return;
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
  }, [isExpanded, newRef, newPage]);

  useEffect(() => {
    // Collapse details when the refs change (new row / new change)
    setIsExpanded(false);
  }, [oldRef, newRef]);

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
      const virtualUnits = props.virtualIndex?.lexicalUnitsByConceptRef.get(parentId) ?? [];
      const totalPages = Math.ceil(virtualUnits.length / 10);
      const pageStart = (page - 1) * 10;
      const pageItems = virtualUnits.slice(pageStart, pageStart + 10);

      return (
        <div className="mt-2 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Siblings ({virtualUnits.length})
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
              <div className="text-[11px] text-gray-400 italic">Nothing inside yet.</div>
            ) : (
              pageItems.map((sibling, idx) => (
                <NodeCard
                  key={`${sibling.code}-${idx}`}
                  title={sibling.code}
                  className="!p-2"
                  noDivider
                  subtle
                >
                  <div className="text-[10px] text-gray-500 line-clamp-1">{sibling.gloss}</div>
                </NodeCard>
              ))
            )}
          </div>
        </div>
      );
    }

    const totalPages = siblings ? Math.ceil(siblings.total / 10) : 0;

    return (
      <div className="mt-2 flex-1 flex flex-col min-h-0">
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
              subtle
            >
              <div className="text-[10px] text-gray-500 line-clamp-1">{sibling.gloss}</div>
            </NodeCard>
          ))}
        </div>
      </div>
    );
  };

  const renderVirtualParentDetails = (parentId: string | null) => {
    if (!parentId || /^\d+$/.test(parentId)) return null;
    const virtualParent = props.virtualIndex?.virtualConceptsByRef.get(parentId);
    if (!virtualParent) {
      return <div className="text-[11px] text-gray-400 italic">Pending destination details unavailable.</div>;
    }
    return (
      <div className="space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-wider text-amber-600">Pending</div>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Parent Details</div>
        <div className="bg-gray-50/50 p-2 rounded-lg border border-gray-100 italic text-[11px] text-gray-600 line-clamp-3">
          {virtualParent.short_definition || virtualParent.definition}
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
            {oldConcept ? (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Parent Details</div>
                <div className="bg-gray-50/50 p-2 rounded-lg border border-gray-100 italic text-[11px] text-gray-600 line-clamp-3">
                  {oldConcept.short_definition || oldConcept.definition}
                </div>
              </div>
            ) : (
              renderVirtualParentDetails(oldRef)
            )}
            {renderSiblingList(oldSiblings, loadingOldSiblings, errorOldSiblings, oldRef, oldPage, setOldPage)}
          </div>

          {/* Spacer aligns with the arrow column in the Current → New row above (w-20 + px-2 = ~w-24). */}
          <div className="flex-shrink-0 w-24" aria-hidden="true" />

          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {newConcept ? (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Parent Details</div>
                <div className="bg-gray-50/50 p-2 rounded-lg border border-gray-100 italic text-[11px] text-gray-600 line-clamp-3">
                  {newConcept.short_definition || newConcept.definition}
                </div>
              </div>
            ) : (
              renderVirtualParentDetails(newRef)
            )}
            {renderSiblingList(newSiblings, loadingNewSiblings, errorNewSiblings, newRef, newPage, setNewPage)}
          </div>
        </div>
      )}
    </div>
  );
}

