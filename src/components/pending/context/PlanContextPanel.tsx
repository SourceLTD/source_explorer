'use client';

import React from 'react';

export interface PlanContextPanelProps {
  /**
   * Content for the "before" column. Pass a single block or a list
   * of `FrameInfoCard`s. Wrap multiple items in your own
   * flex/grid — the panel only adds outer chrome.
   */
  beforeContent: React.ReactNode;
  /** Content for the "after" column. Same conventions as `beforeContent`. */
  afterContent: React.ReactNode;
  /** Override the heading on the "before" column. */
  beforeLabel?: string;
  /** Override the heading on the "after" column. */
  afterLabel?: string;
}

/**
 * Two-column "Before / After" container for plan-kind context panels.
 *
 * Mirrors the visual language of the reparent panel's
 * `DAGMoveVisualization` (gray for "before", emerald for "after",
 * same outer card chrome) so split / merge / move-sense / attach /
 * detach reviews feel like the same surface — minus the tree
 * diagram, which only makes sense for hierarchy moves.
 *
 * Each column accepts arbitrary children so callers can stack
 * `FrameInfoCard`s, lists of edges, or a single hero card. The
 * panel deliberately has no warning/footnote slot; cascading-effect
 * copy (the old "Heads up" notes) was removed because reviewers
 * found it noisy and the Before/After diff already communicates the
 * intent.
 */
export default function PlanContextPanel({
  beforeContent,
  afterContent,
  beforeLabel = 'Before',
  afterLabel = 'After',
}: PlanContextPanelProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <section className="p-3 rounded-xl border border-gray-200 bg-gray-50/50 flex flex-col gap-3">
        <header className="text-xs font-bold uppercase tracking-wider text-gray-400">
          {beforeLabel}
        </header>
        <div className="flex flex-col gap-2 min-w-0">{beforeContent}</div>
      </section>
      <section className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/30 flex flex-col gap-3">
        <header className="text-xs font-bold uppercase tracking-wider text-emerald-600">
          {afterLabel}
        </header>
        <div className="flex flex-col gap-2 min-w-0">{afterContent}</div>
      </section>
    </div>
  );
}
