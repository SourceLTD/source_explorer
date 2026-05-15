'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  ChatBubbleLeftIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { RevisionChain, RevisionHistoryEntry } from '@/lib/version-control/types';

interface RevisionNavigatorProps {
  changesetId: string;
  revisionNumber?: number;
  onRequestRevision: () => void;
  /** If true, always show (even without known revisions) — renders as a "Revise" trigger. */
  alwaysShow?: boolean;
  /** Called when the user navigates to a different revision entry (or null when collapsed). */
  onActiveRevisionChange?: (entry: RevisionHistoryEntry | null) => void;
  /** When true, shows a spinning indicator that a revision is in progress. */
  revising?: boolean;
}

export function RevisionNavigator({
  changesetId,
  revisionNumber,
  onRequestRevision,
  alwaysShow = false,
  onActiveRevisionChange,
  revising = false,
}: RevisionNavigatorProps) {
  const [chain, setChain] = useState<RevisionChain | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const hasRevisions = (revisionNumber ?? 1) > 1 || (chain && chain.total_revisions > 1);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/changesets/${changesetId}/history`);
      if (!response.ok) return;
      const data: RevisionChain = await response.json();
      setChain(data);
      setActiveIndex(data.entries.length - 1);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [changesetId]);

  useEffect(() => {
    if (expanded && !chain && !loading) {
      fetchHistory();
    }
  }, [expanded, chain, loading, fetchHistory]);

  // Eagerly fetch history on mount to discover revisions
  useEffect(() => {
    if (!chain && !loading) {
      fetchHistory();
    }
  }, [chain, loading, fetchHistory]);

  // Re-fetch history when a background revision completes
  useEffect(() => {
    if (!revising && chain) {
      fetchHistory();
    }
  }, [revising]);// eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand when we know there are revisions (either from prop or fetched chain)
  useEffect(() => {
    if ((revisionNumber ?? 1) > 1 && !expanded) {
      setExpanded(true);
    }
  }, [revisionNumber]);// eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (chain && chain.total_revisions > 1 && !expanded) {
      setExpanded(true);
    }
  }, [chain]);// eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent when active revision changes
  useEffect(() => {
    if (!onActiveRevisionChange) return;
    if (!expanded || !chain || activeIndex === null) {
      onActiveRevisionChange(null);
      return;
    }
    onActiveRevisionChange(chain.entries[activeIndex] ?? null);
  }, [activeIndex, expanded, chain, onActiveRevisionChange]);

  if (!hasRevisions && !alwaysShow) {
    return null;
  }

  if (!hasRevisions && alwaysShow) {
    return (
      <button
        type="button"
        onClick={onRequestRevision}
        disabled={revising}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 rounded-lg bg-white hover:bg-indigo-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <ArrowPathIcon className={`w-3.5 h-3.5 ${revising ? 'animate-spin' : ''}`} />
        {revising ? 'Revising...' : 'Revise with AI'}
      </button>
    );
  }

  const current = chain && activeIndex !== null ? chain.entries[activeIndex] : null;
  const canGoBack = activeIndex !== null && activeIndex > 0;
  const canGoForward = activeIndex !== null && chain !== null && activeIndex < chain.entries.length - 1;
  const isViewingLatest = chain !== null && activeIndex === chain.entries.length - 1;

  return (
    <div className="border border-indigo-200 rounded-lg bg-indigo-50/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <ArrowPathIcon className={`w-3.5 h-3.5 text-indigo-500 shrink-0 ${revising ? 'animate-spin' : ''}`} />
        {revising ? (
          <span className="text-xs font-medium text-indigo-600">Revising...</span>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
          >
            Revision {current?.revision_number ?? revisionNumber ?? 1}
            {chain && <span className="text-indigo-400 ml-1">of {chain.total_revisions}</span>}
          </button>
        )}

        {expanded && chain && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => canGoBack && setActiveIndex((i) => (i ?? 1) - 1)}
              disabled={!canGoBack}
              className="p-0.5 rounded text-indigo-600 hover:bg-indigo-100 disabled:text-indigo-300 disabled:cursor-not-allowed"
              title="Previous revision"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono text-indigo-600 min-w-[3ch] text-center">
              {current?.revision_number ?? (activeIndex ?? 0) + 1}
            </span>
            <button
              type="button"
              onClick={() => canGoForward && setActiveIndex((i) => (i ?? 0) + 1)}
              disabled={!canGoForward}
              className="p-0.5 rounded text-indigo-600 hover:bg-indigo-100 disabled:text-indigo-300 disabled:cursor-not-allowed"
              title="Next revision"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {!expanded && (
          <button
            type="button"
            onClick={onRequestRevision}
            className="ml-auto text-[11px] font-medium text-indigo-600 hover:text-indigo-800 px-2 py-0.5 rounded hover:bg-indigo-100"
          >
            Revise again
          </button>
        )}
      </div>

      {expanded && loading && (
        <div className="px-3 pb-3 flex items-center justify-center">
          <LoadingSpinner size="sm" noPadding />
        </div>
      )}

      {expanded && current && (
        <div className="border-t border-indigo-200 px-3 py-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-wide ${
              current.status === 'pending' ? 'text-amber-700' :
              current.status === 'discarded' ? 'text-gray-400' :
              'text-green-700'
            }`}>
              Rev {current.revision_number} · {current.status}
            </span>
            {isViewingLatest && (
              <span className="text-[10px] font-medium text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">
                Current
              </span>
            )}
          </div>

          {current.revision_prompt && (
            <div className="flex items-start gap-1.5">
              <ChatBubbleLeftIcon className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
              <p className="text-xs text-gray-600 italic">
                &ldquo;{current.revision_prompt}&rdquo;
              </p>
            </div>
          )}

          {current.field_changes.length > 0 && (
            <ul className="divide-y divide-indigo-100 border border-indigo-100 rounded bg-white">
              {current.field_changes.map((fc, i) => (
                <li key={i} className="px-2.5 py-1.5 text-xs flex items-baseline gap-2">
                  <span className="font-mono text-blue-600 shrink-0">
                    {fc.field_name}
                  </span>
                  <span className="text-gray-400 line-through truncate">
                    {formatValue(fc.old_value)}
                  </span>
                  <span className="text-gray-300 shrink-0">→</span>
                  <span className="text-gray-900 font-medium truncate">
                    {formatValue(fc.new_value)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {current.field_changes.length === 0 && current.revision_number === 1 && (
            <p className="text-[11px] text-gray-400 italic">
              Original changeset (no field-level changes recorded)
            </p>
          )}

          <div className="text-[10px] text-gray-400">
            {current.created_by} · {new Date(current.created_at).toLocaleDateString(undefined, {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </div>

          {isViewingLatest && (
            <button
              type="button"
              onClick={onRequestRevision}
              className="w-full mt-1 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 rounded-md bg-white hover:bg-indigo-50 transition-colors"
            >
              Revise again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value.length > 60 ? value.slice(0, 60) + '...' : value;
  if (Array.isArray(value)) return value.length === 0 ? '[]' : `[${value.length} items]`;
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 60);
  return String(value);
}
