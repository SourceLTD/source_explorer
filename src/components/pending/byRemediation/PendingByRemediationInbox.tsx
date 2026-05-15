'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircleIcon,
  InboxIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import { EmptyState } from '@/components/ui';
import LazyMount from '@/components/pending/LazyMount';
import PlanCard from '@/components/pending/PlanCard';
import LooseChangesetCard from './LooseChangesetCard';
import type { BucketBusyState } from './useBucketActions';
import {
  actionBucketKey,
  healthCheckGroupKey,
  type ActionBucket,
  type HealthCheckSubGroup,
  type ByRemediationChangeset,
} from './types';

// ---------------------------------------------------------------------------
// Update field splitting — purely UI-side label enrichment
// ---------------------------------------------------------------------------

/**
 * Well-known field → human fragment mappings.
 * Keys for `frame` entity type.
 */
const FRAME_FIELD_FRAGMENTS: Record<string, string> = {
  definition: 'definition',
  short_definition: 'short definition',
  label: 'label',
  code: 'code',
  recipe: 'recipe',
  recipe_graph: 'recipe',
  vendler: 'Vendler class',
  frame_type: 'type',
  subtype: 'subtype',
  flagged: 'flag',
  verifiable: 'verifiability',
  wikidata_id: 'Wikidata link',
  multi_perspective: 'multi-perspective',
};

/** Well-known field → fragment for `frame_role` entity type. */
const FRAME_ROLE_FIELD_FRAGMENTS: Record<string, string> = {
  description: 'description',
  label: 'label',
  examples: 'examples',
  main: 'main flag',
  fillers: 'fillers',
};

/**
 * Pick the most meaningful "primary field" key from a changeset's field
 * changes for use as a grouping sub-key. Returns null for entity types
 * where field-level splitting isn't useful.
 */
function primaryUpdateFieldKey(cs: ByRemediationChangeset): string | null {
  const entityType = cs.entity_type;
  if (entityType !== 'frame' && entityType !== 'frame_role') return null;

  const fieldNames = cs.field_changes.map((fc) => fc.field_name);
  if (fieldNames.length === 0) return null;

  if (entityType === 'frame') {
    // frame_roles.* sub-fields → group together as "roles"
    if (fieldNames.some((f) => f.startsWith('frame_roles.'))) return 'roles';
    // Priority order: pick the first known field
    for (const f of fieldNames) {
      if (FRAME_FIELD_FRAGMENTS[f]) return f;
    }
    return fieldNames[0];
  }

  if (entityType === 'frame_role') {
    for (const f of fieldNames) {
      if (FRAME_ROLE_FIELD_FRAGMENTS[f]) return f;
    }
    return fieldNames[0];
  }

  return null;
}

function primaryUpdateFieldLabel(cs: ByRemediationChangeset, fieldKey: string): string {
  const base = cs.entity_type === 'frame_role' ? 'Update role' : 'Update frame';
  if (cs.entity_type === 'frame') {
    if (fieldKey === 'roles') return 'Update frame roles';
    const frag = FRAME_FIELD_FRAGMENTS[fieldKey];
    return frag ? `${base} ${frag}` : `${base} (${fieldKey})`;
  }
  if (cs.entity_type === 'frame_role') {
    const frag = FRAME_ROLE_FIELD_FRAGMENTS[fieldKey];
    return frag ? `${base} ${frag}` : `${base} (${fieldKey})`;
  }
  return base;
}

/**
 * For `update/*` buckets with more than one distinct primary field,
 * split into one sub-bucket per field. All other buckets pass through
 * unchanged.
 *
 * Health-check groups and plans are re-filtered to only include the
 * changesets that belong to each sub-bucket.
 */
function splitUpdateBuckets(buckets: ActionBucket[]): ActionBucket[] {
  const result: ActionBucket[] = [];

  for (const bucket of buckets) {
    if (!bucket.action_key.startsWith('update/')) {
      result.push(bucket);
      continue;
    }

    // Group changesets by primary field key.
    const subMap = new Map<string, { label: string; changesets: ByRemediationChangeset[] }>();
    for (const cs of bucket.changesets) {
      const fieldKey = primaryUpdateFieldKey(cs);
      // If we can't determine a field key, keep this changeset in the parent bucket.
      const subKey = fieldKey ? `${bucket.action_key}/${fieldKey}` : bucket.action_key;
      const subLabel = fieldKey ? primaryUpdateFieldLabel(cs, fieldKey) : bucket.action_label;

      let sub = subMap.get(subKey);
      if (!sub) {
        sub = { label: subLabel, changesets: [] };
        subMap.set(subKey, sub);
      }
      sub.changesets.push(cs);
    }

    // Only bother splitting when there's more than one distinct sub-key.
    // Even when all changesets share one field key, still rename the label
    // to the specific version (e.g. "Update frame definition" not "Update frame").
    if (subMap.size <= 1) {
      const [[, { label }]] = subMap;
      result.push(label !== bucket.action_label ? { ...bucket, action_label: label } : bucket);
      continue;
    }

    for (const [subKey, { label, changesets }] of subMap) {
      const csIds = new Set(changesets.map((c) => c.id));

      const subHealthCheckGroups: HealthCheckSubGroup[] = bucket.health_check_groups
        .map((g) => {
          const subChangesets = g.changesets.filter((c) => csIds.has(c.id));
          if (subChangesets.length === 0) return null;
          const subPlans = g.plans.filter((p) =>
            subChangesets.some((c) => c.change_plan_id === p.id),
          );
          const withPlan = subChangesets.filter((c) => c.change_plan_id).length;
          return {
            ...g,
            changesets: subChangesets,
            plans: subPlans,
            counts: {
              total: subChangesets.length,
              with_plan: withPlan,
              loose: subChangesets.length - withPlan,
            },
          };
        })
        .filter((g): g is HealthCheckSubGroup => g !== null);

      const withPlanTotal = changesets.filter((c) => c.change_plan_id).length;
      const allPlans = subHealthCheckGroups.flatMap((g) => g.plans);
      const uniquePlans = Array.from(new Map(allPlans.map((p) => [p.id, p])).values());

      result.push({
        action_key: subKey,
        action_label: label,
        health_check_groups: subHealthCheckGroups,
        changesets,
        plans: uniquePlans,
        counts: {
          total: changesets.length,
          with_plan: withPlanTotal,
          loose: changesets.length - withPlanTotal,
        },
      });
    }
  }

  return result;
}

const PLAN_CARD_PLACEHOLDER_HEIGHT = 360;
const LOOSE_CARD_PLACEHOLDER_HEIGHT = 220;

interface PendingByRemediationInboxProps {
  buckets: ActionBucket[];
  isLoading: boolean;
  error: string | null;
  busy: BucketBusyState;
  onCommitBucket: (bucket: ActionBucket, key: string) => Promise<void>;
  onRejectBucket: (bucket: ActionBucket, key: string) => void;
  onCommitRow: (cs: ByRemediationChangeset) => Promise<void>;
  onRejectRow: (cs: ByRemediationChangeset) => Promise<void>;
  onPlanChanged: () => void;
  onOpenChangeset?: (cs: ByRemediationChangeset) => void;
}

/**
 * Master/detail inbox organised by action type (e.g. "Reparent frame",
 * "Update frame"). Each row in the left rail represents one action bucket
 * and expands to reveal health-check sub-rows (diagnosis codes) nested
 * below it. Selecting a row shows the full changeset list in the right pane.
 */
export default function PendingByRemediationInbox({
  buckets,
  isLoading,
  error,
  busy,
  onCommitBucket,
  onRejectBucket,
  onCommitRow,
  onRejectRow,
  onPlanChanged,
  onOpenChangeset,
}: PendingByRemediationInboxProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Split update/* buckets by primary changed field — purely UI-side.
  const expandedBuckets = useMemo(() => splitUpdateBuckets(buckets), [buckets]);

  const keyedBuckets = useMemo(
    () => expandedBuckets.map((b) => ({ key: actionBucketKey(b), bucket: b })),
    [expandedBuckets],
  );

  useEffect(() => {
    if (keyedBuckets.length === 0) { setSelectedKey(null); return; }
    if (selectedKey && keyedBuckets.some((b) => b.key === selectedKey)) return;
    setSelectedKey(keyedBuckets[0].key);
  }, [keyedBuckets, selectedKey]);

  useEffect(() => {
    const node = railRef.current;
    if (!node) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'j' && e.key !== 'k') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (keyedBuckets.length === 0) return;
      e.preventDefault();
      const idx = keyedBuckets.findIndex((b) => b.key === selectedKey);
      const delta = e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1;
      const next = Math.max(0, Math.min(keyedBuckets.length - 1, idx + delta));
      setSelectedKey(keyedBuckets[next].key);
    };
    node.addEventListener('keydown', handler);
    return () => node.removeEventListener('keydown', handler);
  }, [keyedBuckets, selectedKey]);

  const selected = keyedBuckets.find((b) => b.key === selectedKey)?.bucket ?? null;
  const selectedBucketBusy =
    selected && busy.bucketKey === actionBucketKey(selected) ? busy.action : null;

  if (isLoading && buckets.length === 0) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  }
  if (error) {
    return <div className="p-6 text-center text-red-600 text-sm">{error}</div>;
  }
  if (buckets.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircleIcon className="h-24 w-24 mx-auto mb-4" />}
        title="All Clear!"
        description="No pending changes to review."
      />
    );
  }

  return (
    <div className="h-full flex bg-gray-50">
      {/* Left rail */}
      <aside
        ref={railRef}
        tabIndex={0}
        className="w-[320px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto focus:outline-none"
        aria-label="Actions with pending changes"
      >
        <div className="px-3 py-2 border-b border-gray-100 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {expandedBuckets.length} action type{expandedBuckets.length === 1 ? '' : 's'}
        </div>
        <ul role="listbox">
          {keyedBuckets.map(({ key, bucket }) => (
            <li key={key}>
              <ActionRailItem
                bucket={bucket}
                isSelected={selectedKey === key}
                onSelect={() => setSelectedKey(key)}
              />
            </li>
          ))}
        </ul>
      </aside>

      {/* Right pane */}
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {selected ? (
          <>
            <ActionBucketHeader
              bucket={selected}
              busyAction={selectedBucketBusy}
              onCommitAll={() => void onCommitBucket(selected, actionBucketKey(selected))}
              onRejectAll={() => onRejectBucket(selected, actionBucketKey(selected))}
            />
            <div className="flex-1 overflow-y-auto">
              <ActionBucketBody
                bucket={selected}
                onCommitRow={onCommitRow}
                onRejectRow={onRejectRow}
                onOpenRow={onOpenChangeset}
                onPlanChanged={onPlanChanged}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
            Select an action to review.
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left rail: action row + collapsible health-check sub-rows
// ---------------------------------------------------------------------------

function ActionRailItem({
  bucket,
  isSelected,
  onSelect,
}: {
  bucket: ActionBucket;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasMultipleGroups = bucket.health_check_groups.length > 1;

  return (
    <div
      className={`border-b border-gray-100 transition-colors ${
        isSelected
          ? 'bg-blue-50 border-l-2 border-l-blue-500'
          : 'border-l-2 border-l-transparent'
      }`}
    >
      {/* Action row */}
      <button
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={onSelect}
        className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-1.5 min-w-0"
      >
        {/* Chevron toggle (only when there are multiple health-check groups) */}
        <span
          role={hasMultipleGroups ? 'button' : undefined}
          aria-label={hasMultipleGroups ? (expanded ? 'Collapse' : 'Expand') : undefined}
          onClick={
            hasMultipleGroups
              ? (e) => { e.stopPropagation(); setExpanded((v) => !v); }
              : undefined
          }
          className={`mt-0.5 shrink-0 text-gray-400 ${hasMultipleGroups ? 'cursor-pointer hover:text-gray-700' : 'cursor-default'}`}
        >
          {hasMultipleGroups ? (
            expanded
              ? <ChevronDownIcon className="w-3.5 h-3.5" />
              : <ChevronRightIcon className="w-3.5 h-3.5" />
          ) : (
            /* Indent spacer when no chevron */
            <span className="w-3.5 h-3.5 inline-block" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-900 leading-snug">
            {bucket.action_label}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
            <span className="tabular-nums">{bucket.counts.total} pending</span>
            {bucket.counts.with_plan > 0 && (
              <span className="text-gray-400">· {bucket.counts.with_plan} in plans</span>
            )}
          </div>
        </div>
      </button>

      {/* Health-check sub-rows (only when expanded and there are multiple groups) */}
      {expanded && hasMultipleGroups && (
        <ul className="pl-7 pb-1 space-y-px">
          {bucket.health_check_groups.map((group) => (
            <li key={healthCheckGroupKey(group)}>
              <button
                type="button"
                onClick={onSelect}
                className="w-full text-left px-2 py-1 flex items-start gap-1.5 min-w-0 hover:bg-gray-50 rounded"
              >
                <span
                  className={`mt-1 shrink-0 w-1.5 h-1.5 rounded-full ${severityDotClass(group.severity)}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-gray-700 leading-snug break-words">
                    {group.diagnosis_code === null
                      ? 'Manual / Unlinked'
                      : (group.diagnosis_label ?? group.diagnosis_code)}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                    {group.counts.total} change{group.counts.total === 1 ? '' : 's'}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Single-group: inline health-check tag below the action label */}
      {!hasMultipleGroups && bucket.health_check_groups.length === 1 && (
        <div className="pl-8 pb-1.5 flex items-center gap-1.5 text-[11px] text-gray-400">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${severityDotClass(bucket.health_check_groups[0].severity)}`}
          />
          <span className="truncate">
            {bucket.health_check_groups[0].diagnosis_code === null
              ? 'Manual / Unlinked'
              : (bucket.health_check_groups[0].diagnosis_label ?? bucket.health_check_groups[0].diagnosis_code)}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right pane: header
// ---------------------------------------------------------------------------

function ActionBucketHeader({
  bucket,
  busyAction,
  onCommitAll,
  onRejectAll,
}: {
  bucket: ActionBucket;
  busyAction: 'commit' | 'reject' | null;
  onCommitAll: () => void;
  onRejectAll: () => void;
}) {
  const looseCount = bucket.counts.loose;
  const hasLoose = looseCount > 0;

  return (
    <header className="px-4 py-3 bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900">
              {bucket.action_label}
            </h3>
            <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-2 rounded-full text-[11px] font-medium tabular-nums bg-gray-200 text-gray-700">
              {bucket.counts.total} pending
            </span>
          </div>

          {/* Health-check group summary pills */}
          {bucket.health_check_groups.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
              {bucket.health_check_groups.map((g) => (
                <span
                  key={healthCheckGroupKey(g)}
                  className="inline-flex items-center gap-1"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${severityDotClass(g.severity)}`} />
                  {g.diagnosis_code === null
                    ? <span className="text-gray-400">Manual / Unlinked</span>
                    : <span>{g.diagnosis_label ?? g.diagnosis_code}</span>
                  }
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRejectAll}
            disabled={!hasLoose || busyAction !== null}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 border border-red-200 rounded-md bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busyAction === 'reject'
              ? <LoadingSpinner size="sm" noPadding />
              : <XMarkIcon className="w-3.5 h-3.5" />
            }
            Reject {hasLoose ? `(${looseCount})` : ''}
          </button>
          <button
            type="button"
            onClick={onCommitAll}
            disabled={!hasLoose || busyAction !== null}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busyAction === 'commit'
              ? <LoadingSpinner size="sm" noPadding />
              : <CheckIcon className="w-3.5 h-3.5" />
            }
            Commit {hasLoose ? `(${looseCount})` : ''}
          </button>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Right pane: body — sectioned by health-check group
// ---------------------------------------------------------------------------

function ActionBucketBody({
  bucket,
  onCommitRow,
  onRejectRow,
  onOpenRow,
  onPlanChanged,
}: {
  bucket: ActionBucket;
  onCommitRow: (cs: ByRemediationChangeset) => Promise<void>;
  onRejectRow: (cs: ByRemediationChangeset) => Promise<void>;
  onOpenRow?: (cs: ByRemediationChangeset) => void;
  onPlanChanged: () => void;
}) {
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'commit' | 'reject' | null>(null);

  const handleCommit = async (cs: ByRemediationChangeset) => {
    setBusyRowId(cs.id); setBusyAction('commit');
    try { await onCommitRow(cs); } finally { setBusyRowId(null); setBusyAction(null); }
  };
  const handleReject = async (cs: ByRemediationChangeset) => {
    setBusyRowId(cs.id); setBusyAction('reject');
    try { await onRejectRow(cs); } finally { setBusyRowId(null); setBusyAction(null); }
  };

  const multipleGroups = bucket.health_check_groups.length > 1;

  return (
    <div className="p-4 space-y-6">
      {bucket.health_check_groups.map((group) => (
        <HealthCheckGroupSection
          key={healthCheckGroupKey(group)}
          group={group}
          showHeader={multipleGroups}
          busyRowId={busyRowId}
          busyAction={busyAction}
          disabled={busyRowId !== null}
          onCommit={handleCommit}
          onReject={handleReject}
          onOpen={onOpenRow}
          onPlanChanged={onPlanChanged}
        />
      ))}
      {bucket.health_check_groups.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-500 text-center">
          No pending changes in this action type.
        </div>
      )}
    </div>
  );
}

function HealthCheckGroupSection({
  group,
  showHeader,
  busyRowId,
  busyAction,
  disabled,
  onCommit,
  onReject,
  onOpen,
  onPlanChanged,
}: {
  group: HealthCheckSubGroup;
  showHeader: boolean;
  busyRowId: string | null;
  busyAction: 'commit' | 'reject' | null;
  disabled: boolean;
  onCommit: (cs: ByRemediationChangeset) => Promise<void>;
  onReject: (cs: ByRemediationChangeset) => Promise<void>;
  onOpen?: (cs: ByRemediationChangeset) => void;
  onPlanChanged: () => void;
}) {
  const looseChangesets = group.changesets.filter((c) => !c.change_plan_id);
  const uniquePlans = Array.from(new Map(group.plans.map((p) => [p.id, p])).values());

  return (
    <section className="space-y-3">
      {showHeader && (
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${severityDotClass(group.severity)}`} />
          <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
            {group.diagnosis_code === null
              ? 'Manual / Unlinked'
              : (group.diagnosis_label ?? group.diagnosis_code)}
          </h4>
          <span className="text-[11px] text-gray-400">
            ({group.counts.total} change{group.counts.total === 1 ? '' : 's'})
          </span>
        </div>
      )}

      {uniquePlans.length > 0 && (
        <div className="space-y-3">
          {uniquePlans.map((plan) => (
            <LazyMount key={plan.id} placeholderHeight={PLAN_CARD_PLACEHOLDER_HEIGHT}>
              <PlanCard plan={plan} onCommitted={onPlanChanged} onDiscarded={onPlanChanged} onRevised={onPlanChanged} />
            </LazyMount>
          ))}
        </div>
      )}

      {looseChangesets.length > 0 && (
        <>
          {uniquePlans.length > 0 && (
            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              Loose changes ({looseChangesets.length})
            </div>
          )}
          <ul className="space-y-3">
            {looseChangesets.map((cs) => (
              <li key={cs.id}>
                <LazyMount placeholderHeight={LOOSE_CARD_PLACEHOLDER_HEIGHT}>
                  <LooseChangesetCard
                    cs={cs}
                    isBusy={busyRowId === cs.id}
                    busyAction={busyRowId === cs.id ? busyAction : null}
                    disabled={disabled && busyRowId !== cs.id}
                    onCommit={() => void onCommit(cs)}
                    onReject={() => void onReject(cs)}
                    onOpen={onOpen ? () => onOpen(cs) : undefined}
                    onRevisionComplete={() => onPlanChanged()}
                  />
                </LazyMount>
              </li>
            ))}
          </ul>
        </>
      )}

      {uniquePlans.length === 0 && looseChangesets.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-4 text-sm text-gray-500 text-center">
          No pending changes for this health check.
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function severityDotClass(severity: string | null | undefined): string {
  switch (severity) {
    case 'critical': return 'bg-red-500';
    case 'high':     return 'bg-orange-500';
    case 'medium':   return 'bg-yellow-500';
    case 'low':      return 'bg-gray-400';
    default:         return 'bg-gray-300';
  }
}
