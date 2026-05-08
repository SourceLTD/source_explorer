'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ArrowRightCircleIcon,
  LinkIcon,
  XMarkIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import type {
  IssueChangePlanSummary,
  IssueChangePlanChangesetSummary,
} from '@/lib/issues/types';
import LoadingSpinner from '../LoadingSpinner';
import DAGMoveVisualization from '@/components/pending/context/DAGMoveVisualization';
import FrameRefPopover from '@/components/pending/context/FrameRefPopover';
import FrameInfoCard, {
  type ExtraSense,
} from '@/components/pending/context/FrameInfoCard';
import PlanContextPanel from '@/components/pending/context/PlanContextPanel';
import {
  fetchFrameSummary,
  getCachedFrameSummary,
  type FrameSenseSummary,
} from '@/components/pending/context/frameSummaryCache';

/**
 * v2: PlanCard renders a single `change_plans` row on the issue page.
 *
 * Plan kinds (split, merge, move, attach, detach) each ship with a
 * tiny `PlanRenderer` that knows how to draw the most important
 * visual diff for that kind ("Source.A → Target.B" for a move,
 * "Frame X = Y + Z" for a split, etc.). Unknown / composite kinds
 * fall back to a neutral N-changeset summary.
 *
 * The card itself owns the commit / discard CTA and the conflict
 * panel — those live here (not in the per-kind renderer) so retry
 * UX is consistent regardless of plan kind.
 */
export interface PlanCardProps {
  plan: IssueChangePlanSummary;
  /** Called after a successful commit so the parent can refetch. */
  onCommitted?: () => void;
  /** Called after a successful discard so the parent can refetch. */
  onDiscarded?: () => void;
}

const PLAN_KIND_LABELS: Record<string, string> = {
  split_frame: 'Split frame',
  merge_frame: 'Merge frames',
  move_frame_sense: 'Move frame sense',
  move_frame_parent: 'Reparent frame',
  attach_relation: 'Attach relation',
  detach_relation: 'Detach relation',
  composite: 'Composite plan',
};

const PLAN_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  committed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  discarded: 'bg-gray-100 text-gray-700 border-gray-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

function planKindLabel(kind: string): string {
  return PLAN_KIND_LABELS[kind] ?? kind.replace(/_/g, ' ');
}

function planKindIcon(kind: string): React.ReactNode {
  switch (kind) {
    case 'split_frame':
      return <ArrowsPointingOutIcon className="w-4 h-4" />;
    case 'merge_frame':
      return <ArrowsPointingInIcon className="w-4 h-4" />;
    case 'move_frame_sense':
    case 'move_frame_parent':
      return <ArrowRightCircleIcon className="w-4 h-4" />;
    case 'attach_relation':
      return <LinkIcon className="w-4 h-4" />;
    case 'detach_relation':
      return <XMarkIcon className="w-4 h-4" />;
    default:
      return <Squares2X2Icon className="w-4 h-4" />;
  }
}

/** Reads a string field off a snapshot, with a sensible fallback. */
function snapStr(
  snap: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!snap) return null;
  const v = (snap as Record<string, unknown>)[key];
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  return null;
}

/**
 * A pill that names a frame and reveals a short identity card on
 * hover/focus when an id is available. When the id is missing
 * (e.g. a not-yet-created split result) the pill renders plain.
 *
 * Uses the FrameRefPopover wrapper rather than rolling its own
 * popover so chips and DAG nodes share the same caching, delay,
 * and dismissal behaviour.
 */
function FrameChip({
  frameId,
  label,
  className,
}: {
  frameId: string | null;
  label: string;
  className: string;
}) {
  return (
    <FrameRefPopover frameId={frameId} fallbackLabel={label}>
      <span className={className}>{label}</span>
    </FrameRefPopover>
  );
}

function entityRef(cs: IssueChangePlanChangesetSummary): string {
  if (cs.entity_id) return `${cs.entity_type} #${cs.entity_id}`;
  return `${cs.entity_type} (new)`;
}

function operationBadge(op: string): string {
  switch (op) {
    case 'create':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'update':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'delete':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'move':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

/**
 * Right-hand side of the `move_frame_sense` panel.
 *
 * Renders the standard before/after FrameInfoCards but enriches the
 * "new parent" card with an `extraSenses` entry so the moving sense
 * shows up there in green ("Moving in") with the same emphasis the
 * field-diff panel uses for "Proposed" content. The sense's full
 * pos/definition/lemmas are pulled out of the FROM parent's frame
 * summary (where the sense currently lives) so we don't need a
 * dedicated sense-fetch endpoint.
 */
function MoveFrameSensePanel({
  senseId,
  senseLabel,
  fromId,
  fromLabel,
  toId,
  toLabel,
}: {
  senseId: string | null;
  senseLabel: string;
  fromId: string | null;
  fromLabel: string;
  toId: string | null;
  toLabel: string;
}) {
  const movingSense = useMovingSense(fromId, senseId);
  const extraSenses: ExtraSense[] = useMemo(() => {
    if (!senseId) return [];
    const sense: ExtraSense['sense'] = movingSense
      ? movingSense
      : { id: senseId };
    return [
      {
        sense,
        variant: 'added',
        fallbackLabel: senseLabel,
      },
    ];
  }, [movingSense, senseId, senseLabel]);
  const excludeFromOld = useMemo(
    () => (senseId ? [senseId] : []),
    [senseId],
  );

  return (
    <PlanContextPanel
      beforeLabel="Current frame"
      afterLabel="New frame"
      beforeContent={
        <FrameInfoCard
          frameId={fromId}
          fallbackLabel={fromLabel}
          emphasis="origin"
          excludeSenseIds={excludeFromOld}
          withPopover={false}
        />
      }
      afterContent={
        <FrameInfoCard
          frameId={toId}
          fallbackLabel={toLabel}
          emphasis="destination"
          extraSenses={extraSenses}
          withPopover={false}
        />
      }
    />
  );
}

/**
 * Looks up a frame_sense's pos / definition / lemmas by digging through
 * the parent frame's cached summary. The summary endpoint already
 * returns up to 6 senses with full metadata, so for the common case
 * (FROM parent has ≤6 senses) this is a free read off the existing
 * fetch. For larger parents the moving sense may not be in the
 * window, in which case we return null and the consumer falls back
 * to the bare `fallbackLabel`.
 */
function useMovingSense(
  parentFrameId: string | null,
  senseId: string | null,
): FrameSenseSummary | null {
  const [sense, setSense] = useState<FrameSenseSummary | null>(() => {
    if (!parentFrameId || !senseId) return null;
    const cached = getCachedFrameSummary(parentFrameId);
    return findSense(cached?.senses, senseId);
  });

  useEffect(() => {
    if (!parentFrameId || !senseId) {
      setSense(null);
      return;
    }
    const cached = getCachedFrameSummary(parentFrameId);
    const cachedSense = findSense(cached?.senses, senseId);
    if (cachedSense) {
      setSense(cachedSense);
      return;
    }
    const ac = new AbortController();
    void fetchFrameSummary(parentFrameId, ac.signal).then((summary) => {
      if (ac.signal.aborted) return;
      setSense(findSense(summary?.senses, senseId));
    });
    return () => ac.abort();
  }, [parentFrameId, senseId]);

  return sense;
}

function findSense(
  senses: FrameSenseSummary[] | undefined,
  senseId: string,
): FrameSenseSummary | null {
  if (!senses) return null;
  const match = senses.find((s) => String(s.id) === String(senseId));
  return match ?? null;
}

/**
 * Per-plan-kind renderer. We keep these tiny and rendering-only —
 * they read from the plan's `metadata` (filled in by the runner) and
 * fall back to a generic per-changeset list when the runner didn't
 * populate the structured metadata yet.
 */
function PlanKindRenderer({ plan }: { plan: IssueChangePlanSummary }) {
  const md = plan.metadata ?? {};

  switch (plan.plan_kind) {
    case 'split_frame': {
      // metadata (from `normaliseSplitFrame` in the runner):
      //   source_frame: { id, label }
      //   results: [{ label, code, definition, role_labels }, ...]
      // Result frames have NO `id` yet (they're created on commit) and the
      // planner doesn't reattach senses to them — sense moves land later
      // as a separate `move_frame_sense` plan, so the result-frame cards
      // intentionally show only label + planner-proposed definition.
      const source = md.source_frame as Record<string, unknown> | undefined;
      const results = Array.isArray(md.results)
        ? (md.results as Array<Record<string, unknown>>)
        : null;
      const sourceId = snapStr(source, 'id');
      const sourceLabel = snapStr(source, 'label') ?? 'Source frame';
      const resultCount = results?.length ?? plan.changesets.length;
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <FrameChip
              frameId={sourceId}
              label={sourceLabel}
              className="font-mono px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800"
            />
            <span className="text-gray-400">splits into</span>
            {results && results.length > 0 ? (
              results.map((r, i) => (
                <FrameChip
                  key={i}
                  frameId={snapStr(r, 'id')}
                  label={snapStr(r, 'label') ?? `result ${i + 1}`}
                  className="font-mono px-2 py-0.5 rounded bg-green-50 border border-green-200 text-green-800"
                />
              ))
            ) : (
              <span className="text-gray-500 italic">
                {plan.changesets.length} new frames
              </span>
            )}
          </div>
          <PlanContextPanel
            beforeLabel="Source frame"
            afterLabel={`Result frames (${resultCount})`}
            beforeContent={
              <FrameInfoCard
                frameId={sourceId}
                fallbackLabel={sourceLabel}
                emphasis="origin"
                withPopover={false}
              />
            }
            afterContent={
              results && results.length > 0 ? (
                results.map((r, i) => {
                  const roleLabels = Array.isArray(r.role_labels)
                    ? (r.role_labels as unknown[]).filter(
                        (v): v is string => typeof v === 'string' && v.trim().length > 0,
                      )
                    : [];
                  return (
                    <FrameInfoCard
                      key={i}
                      frameId={snapStr(r, 'id')}
                      fallbackLabel={snapStr(r, 'label') ?? `Result ${i + 1}`}
                      fallbackDefinition={
                        snapStr(r, 'definition') ?? snapStr(r, 'short_definition')
                      }
                      emphasis="destination"
                      withPopover={false}
                      badge={
                        roleLabels.length > 0 ? (
                          <div className="space-y-1">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                              Roles ({roleLabels.length})
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {roleLabels.map((rl) => (
                                <span
                                  key={rl}
                                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-700"
                                >
                                  {rl}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null
                      }
                    />
                  );
                })
              ) : (
                <div className="text-xs text-gray-500 italic">
                  {plan.changesets.length} new frames will be created.
                </div>
              )
            }
          />
        </div>
      );
    }
    case 'merge_frame': {
      // metadata: { sources: [{ id, label }, ...], target: { id?, label } }
      const sources = Array.isArray(md.sources)
        ? (md.sources as Array<Record<string, unknown>>)
        : null;
      const target = md.target as Record<string, unknown> | undefined;
      const targetId = snapStr(target, 'id');
      const targetLabel = snapStr(target, 'label') ?? 'target';
      const sourceCount = sources?.length ?? Math.max(plan.changesets.length - 1, 0);
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            {sources && sources.length > 0 ? (
              sources.map((s, i) => (
                <FrameChip
                  key={i}
                  frameId={snapStr(s, 'id')}
                  label={snapStr(s, 'label') ?? `source ${i + 1}`}
                  className="font-mono px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800"
                />
              ))
            ) : (
              <span className="text-gray-500 italic">
                {sourceCount} sources
              </span>
            )}
            <span className="text-gray-400">merge into</span>
            <FrameChip
              frameId={targetId}
              label={targetLabel}
              className="font-mono px-2 py-0.5 rounded bg-green-50 border border-green-200 text-green-800"
            />
          </div>
          <PlanContextPanel
            beforeLabel={`Source frames (${sourceCount})`}
            afterLabel="Target frame"
            beforeContent={
              sources && sources.length > 0 ? (
                sources.map((s, i) => (
                  <FrameInfoCard
                    key={i}
                    frameId={snapStr(s, 'id')}
                    fallbackLabel={snapStr(s, 'label') ?? `Source ${i + 1}`}
                    emphasis="origin"
                    withPopover={false}
                  />
                ))
              ) : (
                <div className="text-xs text-gray-500 italic">
                  {sourceCount} source frame{sourceCount === 1 ? '' : 's'} will be merged.
                </div>
              )
            }
            afterContent={
              <FrameInfoCard
                frameId={targetId}
                fallbackLabel={targetLabel}
                emphasis="destination"
                withPopover={false}
              />
            }
          />
        </div>
      );
    }
    case 'move_frame_sense': {
      // metadata: { sense: { id, label }, from: { id, label }, to: { id, label } }
      // `sense` is a frame_sense (not a frame), so it stays a plain
      // chip — only the `from` / `to` frames get the popover.
      const sense = md.sense as Record<string, unknown> | undefined;
      const from = md.from as Record<string, unknown> | undefined;
      const to = md.to as Record<string, unknown> | undefined;
      const senseLabel = snapStr(sense, 'label') ?? 'sense';
      const senseId = snapStr(sense, 'id');
      const fromId = snapStr(from, 'id');
      const fromLabel = snapStr(from, 'label') ?? 'from';
      const toId = snapStr(to, 'id');
      const toLabel = snapStr(to, 'label') ?? 'to';
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <span className="font-mono px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800">
              {senseLabel}
            </span>
            <span className="text-gray-400">moves</span>
            <FrameChip
              frameId={fromId}
              label={fromLabel}
              className="font-mono px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800"
            />
            <span className="text-gray-400">→</span>
            <FrameChip
              frameId={toId}
              label={toLabel}
              className="font-mono px-2 py-0.5 rounded bg-green-50 border border-green-200 text-green-800"
            />
          </div>
          <MoveFrameSensePanel
            senseId={senseId}
            senseLabel={senseLabel}
            fromId={fromId}
            fromLabel={fromLabel}
            toId={toId}
            toLabel={toLabel}
          />
        </div>
      );
    }
    case 'move_frame_parent': {
      // metadata: {
      //   child:       { id, label },
      //   old_parent:  { id, label, relation_id } | null,
      //   new_parent:  { id, label },
      // }
      // Backs the v2 `reparent_frame` strategy. Reuses the same
      // <DAGMoveVisualization> component the manual reparent UX uses
      // in source-explorer's pending-changes page so reviewers see
      // the same before/after DAG view either way.
      const child = md.child as Record<string, unknown> | undefined;
      const oldParent = md.old_parent as Record<string, unknown> | null | undefined;
      const newParent = md.new_parent as Record<string, unknown> | undefined;
      const childId = snapStr(child, 'id');
      const newParentId = snapStr(newParent, 'id');
      const childLabel = snapStr(child, 'label') ?? undefined;
      const oldParentId = oldParent ? snapStr(oldParent, 'id') : null;
      const oldParentLabel = oldParent ? snapStr(oldParent, 'label') : null;
      const newParentLabel = snapStr(newParent, 'label') ?? undefined;
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <FrameChip
              frameId={childId}
              label={childLabel ?? `frame ${childId ?? '?'}`}
              className="font-mono px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800"
            />
            <span className="text-gray-400">moves under</span>
            {oldParent ? (
              <>
                <FrameChip
                  frameId={oldParentId}
                  label={oldParentLabel ?? `parent ${oldParentId ?? '?'}`}
                  className="font-mono px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 line-through"
                />
                <span className="text-gray-400">→</span>
              </>
            ) : (
              <span className="text-gray-400 italic">(no current parent)</span>
            )}
            <FrameChip
              frameId={newParentId}
              label={newParentLabel ?? `parent ${newParentId ?? '?'}`}
              className="font-mono px-2 py-0.5 rounded bg-green-50 border border-green-200 text-green-800"
            />
          </div>
          {childId && newParentId && (
            <DAGMoveVisualization
              frameId={childId}
              frameLabel={childLabel}
              oldParentId={oldParentId}
              oldParentLabel={oldParentLabel}
              newParentId={newParentId}
              newParentLabel={newParentLabel}
            />
          )}
        </div>
      );
    }
    case 'attach_relation':
    case 'detach_relation': {
      // metadata: { edges: [{ source, target, type, source_id?, target_id?, source_label?, target_label? }, ...] }
      const edges = Array.isArray(md.edges)
        ? (md.edges as Array<Record<string, unknown>>)
        : null;
      const isAttach = plan.plan_kind === 'attach_relation';
      const verb = isAttach ? 'Attach' : 'Detach';
      const verbLower = isAttach ? 'attach' : 'detach';
      const accent = isAttach
        ? {
            border: 'border-emerald-200',
            bg: 'bg-emerald-50/30',
            label: 'text-emerald-600',
            arrow: 'text-emerald-500',
            arrowGlyph: '→',
          }
        : {
            border: 'border-red-200',
            bg: 'bg-red-50/30',
            label: 'text-red-600',
            arrow: 'text-red-500',
            arrowGlyph: '↛',
          };
      const edgeCount = edges?.length ?? plan.changesets.length;
      const visible = edges?.slice(0, 5) ?? [];
      const hidden = edges ? Math.max(edges.length - visible.length, 0) : 0;
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
              {verb}
            </span>
            <span className="text-gray-500">
              {edgeCount} edge{edgeCount === 1 ? '' : 's'}
            </span>
          </div>

          {edges && edges.length > 0 ? (
            <div className={`p-3 rounded-xl border ${accent.border} ${accent.bg} space-y-3`}>
              <header className={`text-xs font-bold uppercase tracking-wider ${accent.label}`}>
                {verb} relations
              </header>
              <ul className="space-y-3">
                {visible.map((e, i) => {
                  const sourceId =
                    snapStr(e, 'source_id') ??
                    (typeof snapStr(e, 'source') === 'string' &&
                    /^\d+$/.test(snapStr(e, 'source') ?? '')
                      ? snapStr(e, 'source')
                      : null);
                  const targetId =
                    snapStr(e, 'target_id') ??
                    (typeof snapStr(e, 'target') === 'string' &&
                    /^\d+$/.test(snapStr(e, 'target') ?? '')
                      ? snapStr(e, 'target')
                      : null);
                  const sourceLabel =
                    snapStr(e, 'source_label') ??
                    snapStr(e, 'source') ??
                    'Source';
                  const targetLabel =
                    snapStr(e, 'target_label') ??
                    snapStr(e, 'target') ??
                    'Target';
                  const relType = snapStr(e, 'type');
                  return (
                    <li
                      key={i}
                      className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3"
                    >
                      <FrameInfoCard
                        frameId={sourceId}
                        fallbackLabel={sourceLabel}
                        emphasis="sibling"
                        hideSenses
                        className="bg-white"
                      />
                      <div className="flex flex-col items-center justify-center gap-1 px-2">
                        {relType && (
                          <span className="text-[10px] font-mono text-gray-500 px-1.5 py-0.5 rounded bg-white border border-gray-200">
                            {relType}
                          </span>
                        )}
                        <span className={`text-2xl leading-none ${accent.arrow}`}>
                          {accent.arrowGlyph}
                        </span>
                      </div>
                      <FrameInfoCard
                        frameId={targetId}
                        fallbackLabel={targetLabel}
                        emphasis="sibling"
                        hideSenses
                        className="bg-white"
                      />
                    </li>
                  );
                })}
              </ul>
              {hidden > 0 && (
                <div className="text-[11px] text-gray-500 text-center">
                  +{hidden} more edge{hidden === 1 ? '' : 's'}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic">
              {edgeCount} edge{edgeCount === 1 ? '' : 's'} to {verbLower}.
            </div>
          )}
        </div>
      );
    }
    case 'composite':
    default: {
      // No structured metadata — fall back to a tidy per-changeset list.
      return null;
    }
  }
}

/**
 * Conflict report shape mirrors `PlanConflictReport` from
 * `src/lib/version-control/commit-plan.ts` but stays narrow here so
 * the UI doesn't reach into server-only modules.
 */
interface RenderedConflictReport {
  status: 'partial' | 'failed';
  attempted: number;
  committed: number;
  failed_at_changeset: string | null;
  errors: Array<{
    changeset_id: string;
    entity_type: string;
    entity_id: string | null;
    error: string;
  }>;
}

function readConflictReport(
  raw: Record<string, unknown> | null,
): RenderedConflictReport | null {
  if (!raw) return null;
  const status = raw.status;
  if (status !== 'partial' && status !== 'failed') return null;
  const attempted = typeof raw.attempted === 'number' ? raw.attempted : 0;
  const committed = typeof raw.committed === 'number' ? raw.committed : 0;
  const failed_at_changeset =
    typeof raw.failed_at_changeset === 'string' ? raw.failed_at_changeset : null;
  const errors = Array.isArray(raw.errors)
    ? (raw.errors as Array<Record<string, unknown>>).map((e) => ({
        changeset_id: String(e.changeset_id ?? ''),
        entity_type: String(e.entity_type ?? ''),
        entity_id: e.entity_id ? String(e.entity_id) : null,
        error: String(e.error ?? 'Unknown error'),
      }))
    : [];
  return { status, attempted, committed, failed_at_changeset, errors };
}

export default function PlanCard({ plan, onCommitted, onDiscarded }: PlanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<'commit' | 'discard' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const conflict = useMemo(() => readConflictReport(plan.conflict_report), [plan.conflict_report]);
  const isPending = plan.status === 'pending';
  const statusClass = PLAN_STATUS_BADGE[plan.status] ?? PLAN_STATUS_BADGE.pending;

  const handleCommit = async () => {
    if (!isPending) return;
    setBusy('commit');
    setError(null);
    try {
      const res = await fetch(`/api/change-plans/${plan.id}/commit`, { method: 'POST' });
      if (res.status === 409) {
        // Conflict report is now persisted on the plan; refetching shows it.
        onCommitted?.();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed to commit plan (${res.status})`);
      }
      onCommitted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to commit plan');
    } finally {
      setBusy(null);
    }
  };

  const handleDiscard = async () => {
    if (!isPending) return;
    if (!confirm(`Discard plan #${plan.id}? All ${plan.changesets.length} linked changesets will be discarded.`)) {
      return;
    }
    setBusy('discard');
    setError(null);
    try {
      const res = await fetch(`/api/change-plans/${plan.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed to discard plan (${res.status})`);
      }
      onDiscarded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to discard plan');
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <header className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-600">{planKindIcon(plan.plan_kind)}</span>
            <h3 className="text-sm font-semibold text-gray-900">
              {planKindLabel(plan.plan_kind)}
            </h3>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${statusClass}`}
            >
              {plan.status}
            </span>
            <span className="text-xs text-gray-500 font-mono">#{plan.id}</span>
            <span className="text-xs text-gray-500">
              {plan.changesets.length} change
              {plan.changesets.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        {isPending && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDiscard}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 border border-red-200 rounded-md bg-white hover:bg-red-50 disabled:opacity-50"
            >
              {busy === 'discard' ? <LoadingSpinner size="sm" noPadding /> : <XCircleIcon className="w-4 h-4" />}
              Discard
            </button>
            <button
              onClick={handleCommit}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === 'commit' ? <LoadingSpinner size="sm" noPadding /> : <CheckCircleIcon className="w-4 h-4" />}
              Commit plan
            </button>
          </div>
        )}
      </header>

      <div className="p-4 space-y-3">
        {/* Per-kind structured renderer (split/merge/move/attach/detach). */}
        <PlanKindRenderer plan={plan} />

        {/* Inline error from the last commit/discard attempt. */}
        {error && (
          <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Conflict report from a prior failed commit. Stays even after the
            inline `error` clears so reviewers can see what went wrong. */}
        {conflict && (
          <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-sm">
            <div className="flex items-center gap-2 font-semibold text-red-800">
              <ExclamationTriangleIcon className="w-4 h-4" />
              Last commit attempt {conflict.status === 'partial' ? 'partially failed' : 'failed'}
            </div>
            <div className="mt-1 text-xs text-red-700">
              Committed {conflict.committed} of {conflict.attempted} changesets
              {conflict.failed_at_changeset && (
                <> · failed at changeset #{conflict.failed_at_changeset}</>
              )}
            </div>
            {conflict.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-red-700 font-mono">
                {conflict.errors.slice(0, 3).map((e, i) => (
                  <li key={i} className="truncate">
                    #{e.changeset_id} {e.entity_type}
                    {e.entity_id ? `#${e.entity_id}` : ''}: {e.error}
                  </li>
                ))}
                {conflict.errors.length > 3 && (
                  <li className="italic text-red-600">+{conflict.errors.length - 3} more</li>
                )}
              </ul>
            )}
          </div>
        )}

        {/* Always-available expansion: the raw per-changeset list, so a
            reviewer can drill into any single child without leaving the
            issue page. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          {expanded ? (
            <ChevronDownIcon className="w-3.5 h-3.5" />
          ) : (
            <ChevronRightIcon className="w-3.5 h-3.5" />
          )}
          {expanded ? 'Hide' : 'Show'} {plan.changesets.length} changeset
          {plan.changesets.length === 1 ? '' : 's'}
        </button>

        {expanded && (
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md bg-white">
            {plan.changesets.map((cs) => (
              <li key={cs.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                <span className="font-mono text-gray-400">#{cs.id}</span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium uppercase ${operationBadge(cs.operation)}`}
                >
                  {cs.operation}
                </span>
                <span className="text-gray-700 truncate flex-1">{entityRef(cs)}</span>
                <span className="text-gray-400 capitalize">{cs.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
