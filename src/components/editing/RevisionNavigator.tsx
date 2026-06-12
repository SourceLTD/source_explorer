'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowPathIcon,
  ChatBubbleLeftIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { AlternativeGroup, AlternativeEntry } from '@/lib/version-control/types';

interface RevisionNavigatorProps {
  changesetId: string;
  /** Hint of how many alternatives exist (drives initial render). */
  revisionNumber?: number;
  onRequestRevision: () => void;
  /** If true, always show (even without known alternatives) — renders an "Add alternative" trigger. */
  alwaysShow?: boolean;
  /** Called when the user focuses a different alternative (or null when none). */
  onActiveRevisionChange?: (entry: AlternativeEntry | null) => void;
  /** When true, shows a spinning indicator that an alternative is being added. */
  revising?: boolean;
  /** Called after the selected alternative changes (so parents can refetch). */
  onSelectionChanged?: (selectedChangesetId: string) => void;
  /**
   * `panel` (default) renders a self-contained box with the active
   * alternative's detail — used where the card has no other preview surface
   * (e.g. loose changesets). `bar` renders just the stepper + actions as a
   * full-width toolbar, for when the surrounding container IS the preview
   * (e.g. PlanCard, whose body re-renders for the focused alternative).
   */
  variant?: 'panel' | 'bar';
}

const ORIGIN_LABELS: Record<string, string> = {
  remediation: 'Remediation',
  revision: 'AI revision',
  manual: 'Manual',
};

export function RevisionNavigator({
  changesetId,
  revisionNumber,
  onRequestRevision,
  alwaysShow = false,
  onActiveRevisionChange,
  revising = false,
  onSelectionChanged,
  variant = 'panel',
}: RevisionNavigatorProps) {
  const [group, setGroup] = useState<AlternativeGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);

  const pendingAlternatives = (group?.alternatives ?? []).filter(
    (a) => a.status !== 'discarded',
  );
  const hasAlternatives =
    (revisionNumber ?? 1) > 1 || pendingAlternatives.length > 1;

  const fetchGroup = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/changesets/${changesetId}/history`);
      if (!response.ok) return;
      const data: AlternativeGroup = await response.json();
      setGroup(data);
      // Focus the selected alternative if known, else the last one.
      const visible = data.alternatives.filter((a) => a.status !== 'discarded');
      const selectedIdx = visible.findIndex(
        (a) => a.id === data.selected_changeset_id,
      );
      setActiveIndex(selectedIdx >= 0 ? selectedIdx : Math.max(0, visible.length - 1));
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [changesetId]);

  useEffect(() => {
    if (!group && !loading) {
      fetchGroup();
    }
  }, [group, loading, fetchGroup]);

  // Re-fetch when a background revision (add alternative) completes.
  useEffect(() => {
    if (!revising && group) {
      fetchGroup();
    }
  }, [revising]);// eslint-disable-line react-hooks/exhaustive-deps

  // Notify parent of the focused alternative.
  useEffect(() => {
    if (!onActiveRevisionChange) return;
    if (!group || activeIndex === null) {
      onActiveRevisionChange(null);
      return;
    }
    onActiveRevisionChange(pendingAlternatives[activeIndex] ?? null);
  }, [activeIndex, group, onActiveRevisionChange]);// eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = useCallback(
    async (altId: string) => {
      if (selecting) return;
      setSelecting(true);
      try {
        const response = await fetch(`/api/changesets/${altId}/select`, {
          method: 'POST',
        });
        if (response.ok) {
          await fetchGroup();
          onSelectionChanged?.(altId);
        }
      } finally {
        setSelecting(false);
      }
    },
    [selecting, fetchGroup, onSelectionChanged],
  );

  if (!hasAlternatives && !alwaysShow) {
    return null;
  }

  if (!hasAlternatives && alwaysShow) {
    return (
      <button
        type="button"
        onClick={onRequestRevision}
        disabled={revising}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 rounded-lg bg-white hover:bg-indigo-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <ArrowPathIcon className={`w-3.5 h-3.5 ${revising ? 'animate-spin' : ''}`} />
        {revising ? 'Adding alternative...' : 'Add alternative with AI'}
      </button>
    );
  }

  const count = pendingAlternatives.length;
  const idx = Math.min(Math.max(activeIndex ?? 0, 0), Math.max(0, count - 1));
  const active = pendingAlternatives[idx];
  const activeSelected = !!active && active.id === group?.selected_changeset_id;

  // Full-width toolbar: the surrounding container is the preview, so we only
  // render navigation + the "use this" action, no per-alternative detail.
  if (variant === 'bar') {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50/40 border-b border-indigo-200">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
          {revising ? 'Adding…' : 'Alternatives'}
          {group && !revising && count > 0 && (
            <span className="ml-1 text-indigo-400">({count})</span>
          )}
        </span>

        {loading && !group ? (
          <div className="flex-1 flex justify-center">
            <LoadingSpinner size="sm" noPadding />
          </div>
        ) : active ? (
          <div className="flex-1 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setActiveIndex(idx - 1)}
              disabled={idx === 0}
              className="inline-flex items-center gap-0.5 px-2 py-1 text-xs font-medium text-indigo-700 rounded-md hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Previous alternative"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              Prev
            </button>

            <span className="text-xs font-semibold text-indigo-900 tabular-nums whitespace-nowrap">
              Option {idx + 1} of {count}
            </span>

            {count > 1 && (
              <div className="flex items-center gap-1.5">
                {pendingAlternatives.map((alt, i) => (
                  <button
                    key={alt.id}
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    aria-label={`Go to alternative ${i + 1}`}
                    aria-current={i === idx}
                    className={`h-2 w-2 rounded-full transition-colors ${
                      i === idx ? 'bg-indigo-600' : 'bg-indigo-200 hover:bg-indigo-300'
                    }`}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setActiveIndex(idx + 1)}
              disabled={idx === count - 1}
              className="inline-flex items-center gap-0.5 px-2 py-1 text-xs font-medium text-indigo-700 rounded-md hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Next alternative"
            >
              Next
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border border-indigo-200 rounded-lg bg-indigo-50/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <ArrowPathIcon className={`w-3.5 h-3.5 text-indigo-500 shrink-0 ${revising ? 'animate-spin' : ''}`} />
        <span className="text-xs font-medium text-indigo-700">
          {revising ? 'Adding alternative...' : `Alternatives`}
          {group && !revising && (
            <span className="text-indigo-400 ml-1">({count})</span>
          )}
        </span>
      </div>

      {loading && (
        <div className="px-3 pb-3 flex items-center justify-center">
          <LoadingSpinner size="sm" noPadding />
        </div>
      )}

      {!loading && group && count > 0 && active && (
        <div className="border-t border-indigo-200">
          {/* Stepper: page through one alternative at a time. */}
          <div className="flex items-center justify-center gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => setActiveIndex(idx - 1)}
              disabled={idx === 0}
              className="inline-flex items-center gap-0.5 px-2 py-1 text-xs font-medium text-indigo-700 rounded-md hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Previous alternative"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              Prev
            </button>

            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900 tabular-nums">
              <span>Option {idx + 1} of {count}</span>
              {activeSelected && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700">
                  <CheckCircleSolid className="w-3.5 h-3.5" />
                  current
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveIndex(idx + 1)}
              disabled={idx === count - 1}
              className="inline-flex items-center gap-0.5 px-2 py-1 text-xs font-medium text-indigo-700 rounded-md hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Next alternative"
            >
              Next
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Position dots — click to jump straight to an alternative. */}
          {count > 1 && (
            <div className="flex justify-center gap-1.5 pb-2">
              {pendingAlternatives.map((alt, i) => (
                <button
                  key={alt.id}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  aria-label={`Go to alternative ${i + 1}`}
                  aria-current={i === idx}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i === idx
                      ? 'bg-indigo-600'
                      : alt.id === group.selected_changeset_id
                        ? 'bg-emerald-400 hover:bg-emerald-500'
                        : 'bg-indigo-200 hover:bg-indigo-300'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Active alternative detail. */}
          <div className="border-t border-indigo-100 bg-white px-3 py-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-indigo-800">
                Alternative {idx + 1}
                <span className="ml-1.5 text-[10px] font-medium text-indigo-400">
                  {ORIGIN_LABELS[active.origin] ?? active.origin}
                </span>
              </span>
              <button
                type="button"
                onClick={() => { if (!activeSelected) handleSelect(active.id); }}
                disabled={selecting || activeSelected}
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md ${
                  activeSelected
                    ? 'text-green-700 bg-green-100 cursor-default'
                    : 'text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50'
                }`}
                title={activeSelected ? 'This alternative is selected' : 'Use this alternative'}
              >
                {selecting && !activeSelected ? (
                  <LoadingSpinner size="sm" noPadding />
                ) : activeSelected ? (
                  <>
                    <CheckCircleSolid className="w-3.5 h-3.5" />
                    Selected
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    Use this option
                  </>
                )}
              </button>
            </div>

            {active.label && (
              <div className="flex items-start gap-1.5">
                <ChatBubbleLeftIcon className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                <p className="text-xs text-gray-600 italic">&ldquo;{active.label}&rdquo;</p>
              </div>
            )}

            {active.field_changes.length > 0 && (
              <ul className="divide-y divide-indigo-100 border border-indigo-100 rounded bg-white">
                {active.field_changes.map((fc, i) => (
                  <li key={i} className="px-2.5 py-1.5 text-xs flex items-baseline gap-2">
                    <span className="font-mono text-blue-600 shrink-0">{fc.field_name}</span>
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

            <div className="text-[10px] text-gray-400">
              {active.created_by} ·{' '}
              {new Date(active.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
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
