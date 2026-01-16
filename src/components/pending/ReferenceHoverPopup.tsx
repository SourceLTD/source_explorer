'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import NodeCard from './context/NodeCard';
import type { VirtualIndex, VirtualFrameSummary, VirtualLexicalUnitSummary } from './virtualIndex';

interface LexicalUnitSnippet {
  code: string;
  gloss: string;
}

interface FrameChild {
  id: string;
  label: string;
  short_definition?: string | null;
  lexical_entries?: {
    entries: LexicalUnitSnippet[];
    totalCount: number;
  };
}

interface LexicalEntryRow {
  id?: string;
  code: string;
  gloss: string;
  pos?: string;
}

type ReferenceHoverMode = 'super_frame_children' | 'frame_lexical_entries';

type HoverData =
  | { kind: 'frames'; data: FrameChild[]; total: number }
  | { kind: 'lexical_entries'; data: LexicalEntryRow[]; total: number }
  | null;

interface ReferenceHoverPopupProps {
  mode: ReferenceHoverMode;
  entityId: string | null;
  virtualIndex?: VirtualIndex;
  children: React.ReactNode;
}

export default function ReferenceHoverPopup({
  mode,
  entityId,
  virtualIndex,
  children,
}: ReferenceHoverPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HoverData>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [containerLabel, setContainerLabel] = useState<string | null>(null);
  
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const acRef = useRef<AbortController | null>(null);
  const labelAcRef = useRef<AbortController | null>(null);
  const labelCacheRef = useRef(new Map<string, string>());

  const pageSize = useMemo(() => {
    // Keep consistent with the modal pagination UX (10 items per page).
    return 10;
  }, []);

  const isVirtualRef = Boolean(entityId && entityId.startsWith('-'));

  const loadContainerLabel = async () => {
    if (!entityId || isVirtualRef || !/^\d+$/.test(entityId)) return;

    const cacheKey = entityId;
    const cached = labelCacheRef.current.get(cacheKey);
    if (cached) {
      setContainerLabel(cached);
      return;
    }

    if (labelAcRef.current) labelAcRef.current.abort();
    labelAcRef.current = new AbortController();

    try {
      const res = await fetch(`/api/frames/${encodeURIComponent(entityId)}`, { signal: labelAcRef.current.signal });
      if (!res.ok) return;
      const json = await res.json();
      const code = typeof json?.code === 'string' ? json.code.trim() : '';
      const label = typeof json?.label === 'string' ? json.label.trim() : '';
      const name = code || label;
      if (!name) return;
      labelCacheRef.current.set(cacheKey, name);
      setContainerLabel(name);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      // Silent fail: header will fall back to #id
    }
  };

  const loadData = async (p: number) => {
    if (!entityId || isVirtualRef || !/^\d+$/.test(entityId)) return;
    
    // Cancel in-flight request
    if (acRef.current) acRef.current.abort();
    acRef.current = new AbortController();
    
    setLoading(true);
    setError(null);
    try {
      const url =
        mode === 'super_frame_children'
          ? `/api/frames/paginated?super_frame_id=${encodeURIComponent(entityId)}&page=${p}&limit=${pageSize}&sortBy=label&sortOrder=asc`
          : `/api/lexical-units/paginated?frame_id=${encodeURIComponent(entityId)}&page=${p}&limit=${pageSize}&sortBy=code&sortOrder=asc`;

      const res = await fetch(url, { signal: acRef.current.signal });
      if (!res.ok) throw new Error('Failed to load reference details');
      const json = await res.json();

      if (mode === 'super_frame_children') {
        setData({
          kind: 'frames',
          data: json.data || [],
          total: json.total || 0,
        });
      } else {
        setData({
          kind: 'lexical_entries',
          data: json.data || [],
          total: json.total || 0,
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isVisible) {
      loadContainerLabel();
      loadData(page);
    }
  }, [isVisible, page, entityId, mode, pageSize, isVirtualRef]);

  useEffect(() => {
    // Reset paging/data when hovering a different reference
    setPage(1);
    setData(null);
    setError(null);
    setContainerLabel(null);
  }, [entityId, mode]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: rect.left,
      });
    }
    
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 150);
  };

  const virtualFrames = useMemo(() => {
    if (!isVirtualRef || !entityId || mode !== 'super_frame_children') return [] as VirtualFrameSummary[];
    return virtualIndex?.framesBySuperRef.get(entityId) ?? [];
  }, [entityId, isVirtualRef, mode, virtualIndex]);

  const virtualLexicalUnits = useMemo(() => {
    if (!isVirtualRef || !entityId || mode !== 'frame_lexical_entries') return [] as VirtualLexicalUnitSummary[];
    return virtualIndex?.lexicalUnitsByFrameRef.get(entityId) ?? [];
  }, [entityId, isVirtualRef, mode, virtualIndex]);

  const virtualParent = useMemo(() => {
    if (!isVirtualRef || !entityId) return null;
    return virtualIndex?.virtualFramesByRef.get(entityId) ?? null;
  }, [entityId, isVirtualRef, virtualIndex]);

  const totalCount = isVirtualRef
    ? (mode === 'super_frame_children' ? virtualFrames.length : virtualLexicalUnits.length)
    : (data?.total ?? 0);
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;

  const pageStart = (page - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const pagedVirtualFrames = isVirtualRef ? virtualFrames.slice(pageStart, pageEnd) : [];
  const pagedVirtualLexicalUnits = isVirtualRef ? virtualLexicalUnits.slice(pageStart, pageEnd) : [];
  const collectionLabel = mode === 'super_frame_children' ? 'Frames' : 'Lexical Units';
  const containerName = isVirtualRef
    ? (virtualParent?.label || (entityId ? `#${entityId}` : ''))
    : (containerLabel ? containerLabel : (entityId ? `#${entityId}` : ''));
  const headerTitle = containerName ? `${collectionLabel} inside ${containerName}` : `${collectionLabel} inside`;

  return (
    <div 
      ref={triggerRef}
      className="inline-block relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      
      {isVisible && (
        <div 
          style={{ 
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            zIndex: 9999,
          }}
          className="w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 pointer-events-auto overflow-hidden"
          onMouseEnter={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
          }}
          onMouseLeave={handleMouseLeave}
        >
          <div className="flex items-center justify-between mb-3">
            <div
              className="flex-1 min-w-0 text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate"
              title={`${headerTitle} (${totalCount})`}
            >
              {headerTitle} ({totalCount})
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPage(p => Math.max(1, p - 1));
                  }}
                  disabled={page === 1 || loading}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronLeftIcon className="w-3 h-3" />
                </button>
                <span className="text-[10px] font-medium text-gray-500">{page} / {totalPages}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPage(p => Math.min(totalPages, p + 1));
                  }}
                  disabled={page === totalPages || loading}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronRightIcon className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
            {isVirtualRef && (
              <div className="space-y-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-amber-600">Pending</div>
                {virtualParent ? (
                  <NodeCard
                    title={virtualParent.label}
                    className="!p-2 shadow-sm"
                    noDivider
                    subtle
                  >
                    {(virtualParent.short_definition || virtualParent.definition) && (
                      <div className="text-[10px] text-gray-500 line-clamp-2 italic">
                        {virtualParent.short_definition || virtualParent.definition}
                      </div>
                    )}
                  </NodeCard>
                ) : (
                  <div className="text-[11px] text-gray-400 italic">
                    Pending destination details unavailable.
                  </div>
                )}
              </div>
            )}
            {isVirtualRef ? (
              mode === 'super_frame_children' ? (
                pagedVirtualFrames.length === 0 ? (
                  <div className="text-[11px] text-gray-400 italic">No pending frames found inside.</div>
                ) : (
                  pagedVirtualFrames.map(frame => {
                    const pendingLexicalUnits = virtualIndex?.lexicalUnitsByFrameRef.get(frame.id) ?? [];
                    return (
                      <NodeCard
                        key={frame.id}
                        title={frame.label}
                        className="!p-2 shadow-sm"
                        noDivider
                        subtle
                      >
                        {(frame.short_definition || frame.definition) && (
                          <div className="text-[10px] text-gray-500 line-clamp-2 mb-1 italic">
                            {frame.short_definition || frame.definition}
                          </div>
                        )}
                        {pendingLexicalUnits.length > 0 && (
                          <div className="space-y-1 mt-1">
                            {pendingLexicalUnits.slice(0, 3).map((lu, idx) => (
                              <div key={`${lu.id}-${idx}`} className="text-[9px] leading-tight flex items-start gap-1">
                                <span className="font-mono text-blue-600 font-bold flex-shrink-0">{lu.code}</span>
                                <span className="text-gray-400">•</span>
                                <span className="text-gray-500 line-clamp-1 italic">{lu.gloss}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </NodeCard>
                    );
                  })
                )
              ) : pagedVirtualLexicalUnits.length === 0 ? (
                <div className="text-[11px] text-gray-400 italic">No pending lexical entries found inside.</div>
              ) : (
                pagedVirtualLexicalUnits.map((lu, idx) => (
                  <NodeCard
                    key={`${lu.id}-${idx}`}
                    title={lu.code}
                    className="!p-2 shadow-sm"
                    noDivider
                    subtle
                  >
                    <div className="text-[10px] text-gray-500 line-clamp-2 italic">{lu.gloss}</div>
                  </NodeCard>
                ))
              )
            ) : loading ? (
              <div className="py-8 flex justify-center"><LoadingSpinner size="sm" noPadding /></div>
            ) : error ? (
              <div className="text-[11px] text-red-500">{error}</div>
            ) : mode === 'super_frame_children' && data?.kind === 'frames' && data.data.length === 0 ? (
              <div className="text-[11px] text-gray-400 italic">No frames found inside.</div>
            ) : mode === 'frame_lexical_entries' && data?.kind === 'lexical_entries' && data.data.length === 0 ? (
              <div className="text-[11px] text-gray-400 italic">No lexical entries found inside.</div>
            ) : (
              <>
                {mode === 'super_frame_children' && data?.kind === 'frames' && (
                  <>
                    {data.data.map(frame => (
                      <NodeCard
                        key={frame.id}
                        title={frame.label}
                        className="!p-2 shadow-sm"
                        noDivider
                        subtle
                      >
                        {frame.short_definition && (
                          <div className="text-[10px] text-gray-500 line-clamp-2 mb-1 italic">
                            {frame.short_definition}
                          </div>
                        )}
                        {frame.lexical_entries && frame.lexical_entries.entries.length > 0 && (
                          <div className="space-y-1 mt-1">
                            {frame.lexical_entries.entries.slice(0, 3).map((lu, idx) => (
                              <div key={idx} className="text-[9px] leading-tight flex items-start gap-1">
                                <span className="font-mono text-blue-600 font-bold flex-shrink-0">{lu.code}</span>
                                <span className="text-gray-400">•</span>
                                <span className="text-gray-500 line-clamp-1 italic">{lu.gloss}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </NodeCard>
                    ))}
                  </>
                )}

                {mode === 'frame_lexical_entries' && data?.kind === 'lexical_entries' && (
                  <>
                    {data.data.map((lu, idx) => (
                      <NodeCard
                        key={`${lu.code}-${idx}`}
                        title={lu.code}
                        className="!p-2 shadow-sm"
                        noDivider
                        subtle
                      >
                        <div className="text-[10px] text-gray-500 line-clamp-2 italic">{lu.gloss}</div>
                      </NodeCard>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
