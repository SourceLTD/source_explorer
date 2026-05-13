'use client';

import React, { useEffect, useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import NodeCard from './NodeCard';
import FrameRefPopover from './FrameRefPopover';
import { posShortLabel } from '@/lib/types';
import {
  fetchFrameSummary,
  getCachedFrameSummary,
  isRealFrameId,
  type FrameSenseSummary,
  type FrameSummary,
} from './frameSummaryCache';

/**
 * Sense entry overlaid on top of the frame's normal senses list. Used
 * by `move_frame_sense` to surface the incoming sense in the new
 * parent's card with the same green emphasis the diff panel uses for
 * "Proposed" content.
 */
export interface ExtraSense {
  /**
   * Match the shape returned by `/api/frames/[id]/summary` but
   * allow `id` to come in as a string (planner metadata) or a
   * number (cached API row). All other sense fields are optional;
   * the card falls back to `fallbackLabel` when they're missing.
   */
  sense: Omit<Partial<FrameSenseSummary>, 'id'> & {
    id: number | string;
    pos?: string;
  };
  /** Visual variant. Today only `added` is used. */
  variant: 'added';
  /** Optional override for the lemma text shown on the card. */
  fallbackLabel?: string;
}

const FRAME_TYPE_BADGE: Record<string, string> = {
  event: 'bg-blue-50 text-blue-700 border-blue-200',
  state: 'bg-amber-50 text-amber-700 border-amber-200',
  entity: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  property: 'bg-purple-50 text-purple-700 border-purple-200',
  relation: 'bg-pink-50 text-pink-700 border-pink-200',
};

function frameTypeBadgeClass(t: string | null): string {
  if (!t) return 'bg-gray-100 text-gray-700 border-gray-200';
  return FRAME_TYPE_BADGE[t] ?? 'bg-gray-100 text-gray-700 border-gray-200';
}

export interface FrameInfoCardProps {
  /**
   * Real frame id, or `null` for virtual / not-yet-created frames
   * (e.g. the result frames of an unrun split). The card falls back
   * to the supplied `fallbackLabel` and `fallbackDefinition` in that
   * case so reviewers still see the planner's intent.
   */
  frameId: string | null;
  /** Used while the summary loads, and as the title for virtual ids. */
  fallbackLabel?: string;
  /** Definition shown when no real id (and so no summary fetch). */
  fallbackDefinition?: string | null;
  /**
   * Visual emphasis. Mirrors `NodeCard`'s `type` prop so this card
   * sits naturally next to the existing cards used in the DAG move
   * visualization (`origin` for "before", `destination` for "after",
   * `focus` for the central subject of the change, `sibling` for
   * supporting context).
   */
  emphasis?: 'origin' | 'destination' | 'focus' | 'sibling';
  /**
   * Optional extra slot rendered inside the card body, below the
   * definition. Used by per-plan renderers to surface plan-specific
   * highlights (e.g. "Departing this frame", "New parent").
   */
  badge?: React.ReactNode;
  className?: string;
  /**
   * Hide the inline senses list (kept on by default because it's
   * usually the most useful piece of context, but the relation/edge
   * panels prefer a tighter card without it).
   */
  hideSenses?: boolean;
  /**
   * Wrap the card in a hover popover (using FrameRefPopover) so the
   * reviewer can pull up the full FrameSummary tooltip without
   * leaving the panel. On by default — virtual ids skip it.
   */
  withPopover?: boolean;
  /**
   * Additional sense entries to render alongside (or in place of) the
   * frame's own senses. Used by the `move_frame_sense` panel to show
   * the incoming sense in the new parent's card with green emphasis.
   * `added` entries are shown above the existing senses.
   */
  extraSenses?: ExtraSense[];
  /**
   * Sense ids to drop from the rendered list. Used by the
   * `move_frame_sense` panel to remove the moving sense from the
   * old parent's senses (since it's leaving). Comparison is by
   * stringified id so callers can pass either string or number ids.
   */
  excludeSenseIds?: Array<string | number>;
}

/**
 * Always-visible rich identity card for a frame.
 *
 * Built on `NodeCard` so it shares look & padding with the cards used
 * in `DAGMoveVisualization`. Fetches `/api/frames/[id]/summary` (via
 * the shared cache in `frameSummaryCache.ts`) so all hovering popovers
 * and inline cards across the pending-changes UI collapse onto one
 * request per frame.
 *
 * For virtual frame ids (e.g. the result frames of a not-yet-committed
 * split), no fetch happens and the card reads `fallbackLabel` /
 * `fallbackDefinition` from the planner's `metadata`.
 */
export default function FrameInfoCard({
  frameId,
  fallbackLabel,
  fallbackDefinition,
  emphasis = 'sibling',
  badge,
  className,
  hideSenses = false,
  withPopover = true,
  extraSenses,
  excludeSenseIds,
}: FrameInfoCardProps) {
  const [summary, setSummary] = useState<FrameSummary | null>(() =>
    getCachedFrameSummary(frameId),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!frameId || !isRealFrameId(frameId)) {
      setSummary(null);
      return;
    }
    const cached = getCachedFrameSummary(frameId);
    if (cached) {
      setSummary(cached);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    void fetchFrameSummary(frameId, ac.signal).then((data) => {
      if (ac.signal.aborted) return;
      if (data) setSummary(data);
      setLoading(false);
    });
    return () => ac.abort();
  }, [frameId]);

  const title = summary?.label ?? fallbackLabel ?? `Frame #${frameId ?? '?'}`;
  const subtitle = frameId ? `#${frameId}` : 'pending';
  const def = summary?.short_definition ?? summary?.definition_excerpt ?? fallbackDefinition ?? null;

  const card = (
    <NodeCard
      title={title}
      subtitle={subtitle}
      type={emphasis}
      className={className}
      wrap
    >
      <div className="space-y-1.5">
        {summary?.frame_type && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium uppercase tracking-wide ${frameTypeBadgeClass(summary.frame_type)}`}
              title={
                summary.subtype
                  ? `${summary.frame_type} · ${summary.subtype}`
                  : summary.frame_type
              }
            >
              {summary.frame_type}
              {summary.subtype && (
                <span className="ml-1 opacity-70 normal-case">/ {summary.subtype}</span>
              )}
            </span>
            {summary.code && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                {summary.code}
              </span>
            )}
          </div>
        )}

        {loading && !summary && !def ? (
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <LoadingSpinner size="sm" noPadding />
            Loading…
          </div>
        ) : def ? (
          <p className="text-[11px] text-gray-700 leading-snug line-clamp-3">{def}</p>
        ) : null}

        {!hideSenses ? (
          <SensesList
            summary={summary}
            extraSenses={extraSenses ?? []}
            excludeSenseIds={excludeSenseIds ?? []}
          />
        ) : null}

        {badge}
      </div>
    </NodeCard>
  );

  if (!withPopover) return card;

  return (
    <FrameRefPopover as="div" frameId={frameId} fallbackLabel={fallbackLabel}>
      {card}
    </FrameRefPopover>
  );
}

function SensesList({
  summary,
  extraSenses,
  excludeSenseIds,
}: {
  summary: FrameSummary | null;
  extraSenses: ExtraSense[];
  excludeSenseIds: Array<string | number>;
}) {
  const excludedSet = new Set(excludeSenseIds.map(String));
  const senses = (summary?.senses ?? []).filter(
    (s) => !excludedSet.has(String(s.id)),
  );
  const totalRaw = summary?.senses_total ?? 0;
  // The exclusion only affects the visible window we got back from the
  // API, so subtract whatever we filtered out of that window from the
  // displayed total — if a frame had 4 senses and we hide 1, it should
  // read "Senses (3)", not "Senses (4)".
  const hiddenByExclusion = (summary?.senses ?? []).length - senses.length;
  const total = Math.max(totalRaw - hiddenByExclusion, 0);
  const hidden = Math.max(total - senses.length, 0);
  const headingTotal = total + extraSenses.length;

  if (senses.length === 0 && extraSenses.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
        Senses ({headingTotal})
      </div>
      <ul className="space-y-1.5">
        {extraSenses.map((entry) => (
          <li
            key={`extra-${entry.sense.id}`}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 ring-1 ring-emerald-200"
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              {entry.sense.pos && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-emerald-200 text-emerald-700 uppercase">
                  {posShortLabel(entry.sense.pos)}
                </span>
              )}
              {(entry.sense.lemmas?.length ?? 0) > 0 ? (
                <span className="text-[11px] text-emerald-900 font-medium">
                  {entry.sense.lemmas!.join(', ')}
                  {entry.sense.lemmas_truncated && (
                    <span className="text-emerald-500"> …</span>
                  )}
                </span>
              ) : entry.fallbackLabel ? (
                <span className="text-[11px] text-emerald-900 font-medium">
                  {entry.fallbackLabel}
                </span>
              ) : null}
              <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                Moving in
              </span>
            </div>
            {entry.sense.definition && (
              <p className="mt-1 text-[11px] text-emerald-900 leading-snug line-clamp-2">
                {entry.sense.definition}
              </p>
            )}
          </li>
        ))}
        {senses.map((s) => (
          <li
            key={s.id}
            className="rounded-md border border-gray-200 bg-gray-50/50 px-2 py-1.5"
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600 uppercase">
                {s.pos}
              </span>
              {s.lemmas.length > 0 && (
                <span className="text-[11px] text-gray-700">
                  {s.lemmas.join(', ')}
                  {s.lemmas_truncated && (
                    <span className="text-gray-400"> …</span>
                  )}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-gray-600 leading-snug line-clamp-2">
              {s.definition}
            </p>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <div className="text-[10px] text-gray-400">
          +{hidden} more sense{hidden === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}
