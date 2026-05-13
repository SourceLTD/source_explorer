'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ArrowLeftIcon,
  PencilSquareIcon,
  TrashIcon,
  LinkIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { IssueHealthCheckFindingSummary } from '@/lib/issues/types';
import { posShortLabel } from '@/lib/types';
import {
  Issue,
  IssueStatus,
  IssuePriority,
  IssueWithChangesets,
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_STATUS_LABELS,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_STYLES,
  ISSUE_PRIORITY_STYLES,
} from '@/lib/issues/types';
import {
  HEALTH_REMEDIATION_STRATEGIES,
  HEALTH_REMEDIATION_STRATEGY_LABELS,
  type HealthRemediationStrategy,
} from '@/lib/health-checks/types';
import LoadingSpinner from '../LoadingSpinner';
import IssueFormModal from './IssueFormModal';
import IssueTimeline from './IssueTimeline';
import PlanCard from './PlanCard';
import LazyMount from '@/components/pending/LazyMount';
import { ConfirmDialog } from '../ui';

// Approximate rendered height of a plan card; used as the
// `LazyMount` placeholder so the scroll position behaves naturally
// before each card mounts. A small mismatch is fine — it just
// produces a tiny one-time scroll-jump on first reveal.
const PLAN_CARD_PLACEHOLDER_HEIGHT = 360;
import {
  SYSTEM_USER_ID,
  SYSTEM_USER_DISPLAY_NAME,
} from '@/lib/users/displayName';

interface IssueDetailPanelProps {
  issueId: string;
  onBack: () => void;
  onUpdated?: (issue: Issue) => void;
  onDeleted?: (id: string) => void;
}

function Badge({
  className,
  children,
  title,
}: {
  className: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${className}`}
      title={title}
    >
      {children}
    </span>
  );
}

type FindingsFilter = 'open' | 'all' | 'resolved';

/** Cap on rows rendered before we surface a "show all" affordance. */
const FINDINGS_INITIAL_LIMIT = 50;

const FINDING_STATUS_BADGE_CLASS: Record<string, string> = {
  open: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  resolved: 'bg-gray-100 text-gray-700 border-gray-200',
  ignored: 'bg-slate-100 text-slate-700 border-slate-200',
  false_positive: 'bg-amber-100 text-amber-800 border-amber-200',
};

function findingStatusBadgeClass(status: string): string {
  return (
    FINDING_STATUS_BADGE_CLASS[status] ??
    'bg-gray-100 text-gray-700 border-gray-200'
  );
}

/**
 * Compact "3d ago" / "just now" string. Local copy of the same helper
 * used by `IssueTimeline`; the function is small and the duplication
 * keeps both modules independent.
 */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return secs <= 1 ? 'just now' : `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Compact frame chip — used inside `FindingCard` to surface a
 * parent/child or single-frame reference. Code (when present) is the
 * stable mnemonic identifier and renders in a monospace tail.
 */
function FrameChip({ frame }: { frame: { label: string; code: string | null } }) {
  return (
    <span
      className="inline-flex items-center gap-1 max-w-full"
      title={frame.code ? `${frame.label} · ${frame.code}` : frame.label}
    >
      <span className="font-medium text-gray-900 truncate">{frame.label}</span>
      {frame.code && (
        <span className="font-mono text-[11px] text-gray-500 shrink-0">
          {frame.code}
        </span>
      )}
    </span>
  );
}

/**
 * Per-card entity summary. For parent_of edges we show "parent → child";
 * for single-frame findings we show the frame label. When we couldn't
 * resolve the entity (e.g. it's been deleted), we fall back to the raw
 * `entity_type:entity_id` reference so the row is still actionable.
 */
function FindingEntitySummary({
  finding,
}: {
  finding: IssueHealthCheckFindingSummary;
}) {
  const ctx = finding.entity_context ?? null;

  if (ctx?.kind === 'frame_relation') {
    return (
      <div className="flex items-center gap-1.5 text-sm text-gray-700 min-w-0 flex-wrap">
        <FrameChip frame={ctx.parent} />
        <span aria-hidden className="text-gray-400 shrink-0">
          →
        </span>
        <FrameChip frame={ctx.child} />
      </div>
    );
  }

  if (ctx?.kind === 'frame') {
    return (
      <div className="flex items-center gap-1.5 text-sm text-gray-700 min-w-0">
        <FrameChip frame={ctx.frame} />
      </div>
    );
  }

  // Programmatic checks targeting frame_role rows surface as
  // "Frame_label · Role_Label" so the reviewer can see at a glance
  // which role on which frame the finding pertains to.
  if (ctx?.kind === 'frame_role') {
    return (
      <div className="flex items-center gap-1.5 text-sm text-gray-700 min-w-0 flex-wrap">
        <FrameChip frame={ctx.frame} />
        <span aria-hidden className="text-gray-400 shrink-0">
          ·
        </span>
        <span
          className="font-mono text-[12px] text-gray-800 truncate"
          title={ctx.role.label}
        >
          {ctx.role.label}
        </span>
      </div>
    );
  }

  // frame_sense findings surface as "Frame_label · pos: definition…".
  // The POS + short definition is usually enough to disambiguate among
  // a frame's senses without forcing the reviewer to click through.
  if (ctx?.kind === 'frame_sense') {
    const snippet = ctx.sense.definition_snippet;
    return (
      <div className="flex items-center gap-1.5 text-sm text-gray-700 min-w-0 flex-wrap">
        <FrameChip frame={ctx.frame} />
        <span aria-hidden className="text-gray-400 shrink-0">
          ·
        </span>
        {ctx.sense.pos && (
          <span className="font-mono text-[10px] uppercase text-gray-500 px-1 py-px rounded bg-gray-100 border border-gray-200 shrink-0">
            {posShortLabel(ctx.sense.pos)}
          </span>
        )}
        {snippet && (
          <span className="text-gray-700 truncate" title={snippet}>
            {snippet}
          </span>
        )}
      </div>
    );
  }

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-xs font-mono"
      title={`${finding.result.entity_type}:${finding.result.entity_id}`}
    >
      {finding.result.entity_type}:{finding.result.entity_id}
    </span>
  );
}

/**
 * One row in the "Failing rows" section. Renders a parent → child (or
 * single-frame) summary, the row's status / severity, and the LLM
 * rationale in full (no truncation), with a muted footer for
 * seen-at / run metadata.
 *
 * The diagnosis code/label is intentionally NOT repeated per card —
 * every finding under one issue shares the same diagnosis, which is
 * already visible in the issue title at the top of the panel.
 */
function FindingCard({ finding }: { finding: IssueHealthCheckFindingSummary }) {
  const isOpen = finding.status === 'open';
  // The runner sometimes uses the diagnosis label as the per-finding
  // title; if they match, suppress the duplicate so the card body
  // jumps straight to the reasoning.
  const showDistinctTitle =
    !!finding.title && finding.title !== finding.diagnosis_code.label;

  return (
    <article
      className={`rounded-md border p-3 ${
        isOpen
          ? 'bg-white border-gray-200'
          : 'bg-gray-50 border-gray-200 opacity-80'
      }`}
    >
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <FindingEntitySummary finding={finding} />
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <Badge className={findingStatusBadgeClass(finding.status)}>
              {finding.status.replace('_', ' ')}
            </Badge>
            <Badge className={ISSUE_PRIORITY_STYLES[finding.severity]}>
              {ISSUE_PRIORITY_LABELS[finding.severity]}
            </Badge>
            <span
              className="text-[11px] text-gray-400 font-mono"
              title={`${finding.result.entity_type}:${finding.result.entity_id}`}
            >
              {finding.result.entity_type}:{finding.result.entity_id}
            </span>
          </div>
        </div>
        <span
          className="text-[11px] text-gray-500 shrink-0"
          title={new Date(finding.last_seen_at).toLocaleString()}
        >
          Last seen {formatRelative(finding.last_seen_at)}
        </span>
      </header>

      {showDistinctTitle && (
        <h4 className="mt-2 text-sm font-medium text-gray-900 break-words">
          {finding.title}
        </h4>
      )}

      {finding.message ? (
        <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
          {finding.message}
        </p>
      ) : (
        <p className="mt-2 text-sm italic text-gray-400">
          No reasoning recorded for this row.
        </p>
      )}

      <footer className="mt-3 pt-2 border-t border-gray-100 text-[11px] text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span title={new Date(finding.first_seen_at).toLocaleString()}>
          First seen {formatRelative(finding.first_seen_at)}
        </span>
        <span>run #{finding.result.run_id}</span>
        {finding.resolved_at && (
          <span title={new Date(finding.resolved_at).toLocaleString()}>
            Resolved {formatRelative(finding.resolved_at)}
          </span>
        )}
      </footer>
    </article>
  );
}

export default function IssueDetailPanel({
  issueId,
  onBack,
  onUpdated,
  onDeleted,
}: IssueDetailPanelProps) {
  const [issue, setIssue] = useState<IssueWithChangesets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [timelineKey, setTimelineKey] = useState(0);
  const [findingsFilter, setFindingsFilter] = useState<FindingsFilter>('open');
  const [showAllFindings, setShowAllFindings] = useState(false);

  // Switching filters resets the list back to the first
  // FINDINGS_INITIAL_LIMIT items so the user lands at the top of the
  // freshly-filtered set.
  useEffect(() => {
    setShowAllFindings(false);
  }, [findingsFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/issues/${issueId}`);
      if (!res.ok) throw new Error('Failed to load issue');
      const data = (await res.json()) as IssueWithChangesets;
      setIssue(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load issue');
    } finally {
      setLoading(false);
    }
  }, [issueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pokeTimeline = useCallback(() => setTimelineKey((k) => k + 1), []);

  const updateField = async (
    updates: Partial<{
      status: IssueStatus;
      priority: IssuePriority;
      /**
       * Per-issue override of the planner's strategy choice. `null`
       * clears the override and reverts to the diagnosis-code default.
       * Accepted values are validated against `HEALTH_REMEDIATION_STRATEGIES`
       * by the PATCH endpoint, so the client-side string type here is
       * intentionally loose.
       */
      strategy_override: string | null;
    }>,
  ) => {
    try {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update');
      const updated = (await res.json()) as Issue;
      setIssue((prev) => (prev ? { ...prev, ...updated } : prev));
      onUpdated?.(updated);
      pokeTimeline();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/issues/${issueId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete issue');
      onDeleted?.(issueId);
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete issue');
    }
  };

  const handleUnlinkChangeset = async (changesetId: string) => {
    try {
      const res = await fetch(`/api/changesets/${changesetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_id: null }),
      });
      if (!res.ok) throw new Error('Failed to unlink');
      await load();
      pokeTimeline();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unlink');
    }
  };

  // Currently-linked pending changesets (committed/discarded ones live only in
  // the timeline — they're historical). Plan-bound changesets are
  // hidden here because they're rendered inside their parent
  // `PlanCard` below; surfacing them twice would let a reviewer
  // commit a child outside the plan and stranded the rest.
  const pendingLinkedChangesets = useMemo(
    () =>
      issue?.changesets.filter(
        (c) => c.status === 'pending' && !c.change_plan_id,
      ) ?? [],
    [issue],
  );
  const pendingPlans = useMemo(
    () =>
      (issue?.change_plans ?? []).filter(
        (p) => p.status === 'pending' || p.status === 'failed',
      ),
    [issue],
  );
  const historicalPlans = useMemo(
    () =>
      (issue?.change_plans ?? []).filter(
        (p) => p.status === 'committed' || p.status === 'discarded',
      ),
    [issue],
  );
  const linkedHealthFindings = useMemo(
    () => issue?.health_check_findings ?? [],
    [issue],
  );
  const openHealthFindings = useMemo(
    () => linkedHealthFindings.filter((f) => f.status === 'open'),
    [linkedHealthFindings],
  );
  const resolvedHealthFindings = useMemo(
    () => linkedHealthFindings.filter((f) => f.status === 'resolved'),
    [linkedHealthFindings],
  );
  const visibleHealthFindings = useMemo(() => {
    switch (findingsFilter) {
      case 'open':
        return openHealthFindings;
      case 'resolved':
        return resolvedHealthFindings;
      case 'all':
      default:
        return linkedHealthFindings;
    }
  }, [
    findingsFilter,
    linkedHealthFindings,
    openHealthFindings,
    resolvedHealthFindings,
  ]);
  const renderedHealthFindings = showAllFindings
    ? visibleHealthFindings
    : visibleHealthFindings.slice(0, FINDINGS_INITIAL_LIMIT);

  if (loading && !issue) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="p-6 text-center text-gray-600">
        {error ?? 'Issue not found'}
        <div className="mt-4">
          <button
            onClick={onBack}
            className="text-blue-600 hover:underline text-sm"
          >
            Back to issues
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-xs text-gray-500">#{issue.id}</span>
          <h2 className="text-lg font-semibold text-gray-900 truncate">
            {issue.title}
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-md bg-white hover:bg-gray-50"
          >
            <PencilSquareIcon className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-700 border border-red-200 rounded-md bg-white hover:bg-red-50"
          >
            <TrashIcon className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-6 space-y-6 max-w-4xl mx-auto">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-500">Status</label>
            <select
              value={issue.status}
              onChange={(e) => updateField({ status: e.target.value as IssueStatus })}
              className={`text-xs rounded-full border px-2 py-0.5 font-medium ${ISSUE_STATUS_STYLES[issue.status]}`}
            >
              {ISSUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ISSUE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            <label className="text-xs text-gray-500 ml-4">Priority</label>
            <select
              value={issue.priority}
              onChange={(e) => updateField({ priority: e.target.value as IssuePriority })}
              className={`text-xs rounded-full border px-2 py-0.5 font-medium ${ISSUE_PRIORITY_STYLES[issue.priority]}`}
            >
              {ISSUE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {ISSUE_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>

            {issue.assignee && (
              <span className="text-xs text-gray-500 ml-4">
                Assigned to <span className="font-medium text-gray-800">{issue.assignee}</span>
              </span>
            )}

            {issue.created_by === 'system' && (
              <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                Auto-created
              </Badge>
            )}

            {/*
              * Strategy-override editor. Always rendered when the
              * issue is anchored to a diagnosis code (i.e. it actually
              * goes through the remediation pipeline). The default
              * option clears the override and restores the
              * diagnosis-code default. When an override is set the
              * select keeps the amber chrome it used to have as a
              * read-only badge so the override is still spottable
              * at a glance.
              *
              * Auto-promotion (`create-issues-for-run.ts`) and manual
              * overrides hit the same `strategy_override` column, so
              * a reviewer can flip an auto-promoted issue back to the
              * default from here without having to PATCH the API
              * directly.
              */}
            {issue.diagnosis_code_id && (
              <label className="text-xs text-gray-500 ml-4 flex items-center gap-1.5">
                Strategy
                <select
                  value={issue.strategy_override ?? ''}
                  onChange={(e) =>
                    updateField({
                      strategy_override: e.target.value || null,
                    })
                  }
                  title={
                    issue.strategy_override
                      ? `Planner will route this issue through "${
                          HEALTH_REMEDIATION_STRATEGY_LABELS[
                            issue.strategy_override as HealthRemediationStrategy
                          ] ?? issue.strategy_override
                        }" instead of the diagnosis-code default. ` +
                        `Set by the auto-promotion rule in create-issues-for-run.ts ` +
                        `(see issue comments for the reasoning), or by a manual edit here.`
                      : 'Override which remediation strategy the planner uses for this issue. ' +
                        'Leave on "diagnosis-code default" to inherit the catalogue-routed strategy.'
                  }
                  className={`text-xs rounded-full border px-2 py-0.5 font-medium ${
                    issue.strategy_override
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  <option value="">— diagnosis-code default —</option>
                  {HEALTH_REMEDIATION_STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {HEALTH_REMEDIATION_STRATEGY_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {issue.labels.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                {issue.labels.map((label) => (
                  <Badge
                    key={label}
                    className="bg-gray-100 text-gray-700 border-gray-200"
                  >
                    {label}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Description card — always shown (even empty) so the issue body has a home */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-sm text-gray-700">
              <span className="font-medium text-gray-900">
                {issue.created_by === SYSTEM_USER_ID
                  ? SYSTEM_USER_DISPLAY_NAME
                  : issue.created_by}
              </span>
              {' '}opened this issue
              <span className="text-gray-500"> · {new Date(issue.created_at).toLocaleString()}</span>
            </div>
            <div className="p-4 text-sm text-gray-800 whitespace-pre-wrap break-words">
              {issue.description || (
                <span className="italic text-gray-400">No description provided.</span>
              )}
            </div>
          </div>

          {linkedHealthFindings.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <header className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 min-w-0">
                    <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 shrink-0" />
                    Failing rows
                    <span className="text-xs text-gray-500 font-normal tabular-nums">
                      {openHealthFindings.length} open of{' '}
                      {linkedHealthFindings.length} total
                    </span>
                  </h3>
                  <div
                    className="flex items-center gap-1 shrink-0"
                    role="tablist"
                    aria-label="Filter failing rows"
                  >
                    {(
                      [
                        { value: 'open' as const, count: openHealthFindings.length },
                        { value: 'all' as const, count: linkedHealthFindings.length },
                        { value: 'resolved' as const, count: resolvedHealthFindings.length },
                      ]
                    ).map(({ value, count }) => {
                      const active = findingsFilter === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setFindingsFilter(value)}
                          className={`px-2.5 py-1 rounded-full border text-xs font-medium capitalize transition-colors ${
                            active
                              ? 'bg-blue-100 text-blue-800 border-blue-300'
                              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {value}
                          <span
                            className={`ml-1 tabular-nums ${
                              active ? 'text-blue-700' : 'text-gray-500'
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </header>

              {visibleHealthFindings.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  {findingsFilter === 'open'
                    ? 'All flagged rows have been resolved on subsequent runs.'
                    : findingsFilter === 'resolved'
                      ? 'No rows have been resolved yet.'
                      : 'No rows linked to this issue.'}
                </div>
              ) : (
                <div className="p-3 space-y-2.5">
                  {renderedHealthFindings.map((finding) => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))}
                  {!showAllFindings &&
                    visibleHealthFindings.length > FINDINGS_INITIAL_LIMIT && (
                      <button
                        type="button"
                        onClick={() => setShowAllFindings(true)}
                        className="w-full px-3 py-2 rounded-md border border-dashed border-gray-300 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                      >
                        Show all {visibleHealthFindings.length} rows (
                        {visibleHealthFindings.length - FINDINGS_INITIAL_LIMIT}{' '}
                        more)
                      </button>
                    )}
                </div>
              )}
            </section>
          )}

          {/* v2: structural change plans (split, merge, move,
              attach/detach). Each renders as its own card with a
              commit/discard CTA so reviewers approve the whole N-step
              plan as a unit rather than approving children individually. */}
          {pendingPlans.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                Proposed change plans
                <span className="text-xs text-gray-500 font-normal">
                  ({pendingPlans.length})
                </span>
              </h3>
              {pendingPlans.map((plan) => (
                <LazyMount
                  key={plan.id}
                  placeholderHeight={PLAN_CARD_PLACEHOLDER_HEIGHT}
                >
                  <PlanCard
                    plan={plan}
                    onCommitted={() => {
                      void load();
                      pokeTimeline();
                    }}
                    onDiscarded={() => {
                      void load();
                      pokeTimeline();
                    }}
                  />
                </LazyMount>
              ))}
            </section>
          )}

          {historicalPlans.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-gray-500 flex items-center gap-2">
                Historical plans
                <span className="text-xs text-gray-400 font-normal">
                  ({historicalPlans.length})
                </span>
              </h3>
              {historicalPlans.map((plan) => (
                <LazyMount
                  key={plan.id}
                  placeholderHeight={PLAN_CARD_PLACEHOLDER_HEIGHT}
                >
                  <PlanCard plan={plan} />
                </LazyMount>
              ))}
            </section>
          )}

          {/* Currently linked pending changes: compact chips with unlink affordance. */}
          {pendingLinkedChangesets.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <LinkIcon className="w-4 h-4" />
                Pending changes linked to this issue
                <span className="text-xs text-gray-500 font-normal">
                  ({pendingLinkedChangesets.length})
                </span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {pendingLinkedChangesets.map((cs) => (
                  <div
                    key={cs.id}
                    className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full pl-2 pr-1 py-0.5 text-xs shadow-sm"
                  >
                    <span className="font-mono text-gray-500">#{cs.id}</span>
                    <span className="text-gray-700">
                      {cs.operation} {cs.entity_type}
                      {cs.entity_id ? ` ${cs.entity_id}` : ''}
                    </span>
                    <button
                      onClick={() => handleUnlinkChangeset(cs.id)}
                      className="p-0.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50"
                      title="Unlink"
                    >
                      <XMarkIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* The unified GitHub-style timeline: comments + events interleaved. */}
          <IssueTimeline
            issueId={issueId}
            issueTitle={issue.title}
            refreshKey={timelineKey}
          />
        </div>
      </div>

      <IssueFormModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => {
          setIssue((prev) => (prev ? { ...prev, ...updated } : prev));
          onUpdated?.(updated);
          pokeTimeline();
        }}
        issue={issue}
      />

      <ConfirmDialog
        isOpen={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete Issue"
        message="Are you sure you want to delete this issue? Linked changesets will be unlinked (not deleted)."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
