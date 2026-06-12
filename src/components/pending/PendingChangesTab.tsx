'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { ConflictDialog } from '@/components/ui';
import { refreshPendingChangesCount } from '@/hooks/usePendingChangesCount';
import { SearchInput } from '@/components/filters';
import PendingFilterPanel from './filter/PendingFilterPanel';
import {
  type PendingFilter,
  type PendingFilterSections,
  defaultPendingFilter,
  hasActivePendingFilters,
  clearHiddenFacets,
} from './filter/pendingFilter';
import { usePendingByRemediation } from './byRemediation/usePendingByRemediation';
import { useBucketActions } from './byRemediation/useBucketActions';
import PendingByRemediationInbox from './byRemediation/PendingByRemediationInbox';
import { filterActionBuckets, buildInboxFilterOptions } from './byRemediation/inboxFilter';
import { regroupBySubject } from './byRemediation/regroupBySubject';
import type { ByRemediationChangeset } from './byRemediation/types';
import type { IssueChangePlanSummary } from '@/lib/issues/types';

/** Inbox grouping mode. `action_type` is the original (default) view. */
type GroupByMode = 'action_type' | 'concept' | 'concept_type';

const GROUP_BY_OPTIONS: { value: GroupByMode; label: string; noun: string }[] = [
  { value: 'action_type', label: 'Action type', noun: 'action type' },
  { value: 'concept', label: 'Concept', noun: 'concept' },
  { value: 'concept_type', label: 'Concept type', noun: 'concept type' },
];

/**
 * Which filter facets each grouping mode exposes. Action-type leans into how a
 * change arose (jobs, health checks); concept views swap those for subject
 * facets (archetype, new vs existing). `concept_type` already groups by
 * archetype, so it drops the redundant archetype facet.
 */
const FILTER_SECTIONS_BY_MODE: Record<GroupByMode, PendingFilterSections> = {
  action_type: { jobs: true, planState: true, severity: true, diagnosis: true, dates: true },
  concept: { archetype: true, subjectState: true, planState: true, jobs: true, dates: true },
  concept_type: { subjectState: true, planState: true, jobs: true, dates: true },
};

/**
 * Wrapper around the by-remediation Inbox view for the Pending Changes tab.
 *
 * Organises pending changesets first by the LLM remediation job that
 * produced them, with health-check diagnosis codes as collapsible sub-
 * rows inside each remediation bucket.
 */
export default function PendingChangesTab({
  onRegisterRefresh,
}: {
  /** Lets the modal header's Refresh button trigger this tab's refetch. */
  onRegisterRefresh?: (refresh: (() => void | Promise<void>) | null) => void;
} = {}) {
  const { data, isLoading, error, refetch, removePlans, removeChangesets } =
    usePendingByRemediation();
  const buckets = useMemo(() => data?.buckets ?? [], [data]);
  const [filter, setFilter] = useState<PendingFilter>(defaultPendingFilter);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupByMode>('action_type');

  const actions = useBucketActions({ refetch, removeChangesets });

  // Expose this tab's refetch to the modal header's Refresh button while
  // mounted; clear it on unmount (e.g. when switching to the Health tab).
  useEffect(() => {
    onRegisterRefresh?.(refetch);
    return () => onRegisterRefresh?.(null);
  }, [onRegisterRefresh, refetch]);

  const filterShow = FILTER_SECTIONS_BY_MODE[groupBy];

  // Switch the active facets to the new mode's set, dropping any that the new
  // mode hides so no invisible filter keeps narrowing the list.
  const changeGroupBy = useCallback((mode: GroupByMode) => {
    setGroupBy(mode);
    setFilter((f) => clearHiddenFacets(f, FILTER_SECTIONS_BY_MODE[mode]));
  }, []);

  const filterOptions = useMemo(
    () => buildInboxFilterOptions(buckets, data?.subjects_by_changeset, data?.subjects_by_plan),
    [buckets, data],
  );
  const filteredBuckets = useMemo(
    () => filterActionBuckets(buckets, filter, data?.subjects_by_changeset, data?.subjects_by_plan),
    [buckets, filter, data],
  );
  const filterActive = hasActivePendingFilters(filter);
  const filteredTotal = useMemo(
    () => filteredBuckets.reduce((n, b) => n + b.counts.total, 0),
    [filteredBuckets],
  );

  // The buckets actually rendered. For the concept / concept-type views we
  // re-bucket the (already-filtered) changes by their subject concept; the
  // action-type view passes the server buckets through untouched.
  const displayBuckets = useMemo(() => {
    if (groupBy === 'action_type' || !data) return filteredBuckets;
    const csById = new Map<string, ByRemediationChangeset>();
    const planById = new Map<string, IssueChangePlanSummary>();
    for (const b of filteredBuckets) {
      for (const c of b.changesets) csById.set(c.id, c);
      for (const p of b.plans) planById.set(p.id, p);
    }
    return regroupBySubject(
      Array.from(csById.values()),
      Array.from(planById.values()),
      data.subjects_by_changeset,
      data.subjects_by_plan,
      groupBy,
    );
  }, [groupBy, data, filteredBuckets]);

  const groupNoun =
    GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.noun ?? 'action type';

  // A plan committed: drop its (and any discarded siblings') cards locally and
  // keep the global pending badge in sync — no disruptive full-list refetch.
  const handlePlanCommitted = useCallback(
    (planIds: string[]) => {
      removePlans(planIds);
      refreshPendingChangesCount();
    },
    [removePlans],
  );

  // In action-type view, count only the plan (remediation) buckets — those
  // are the ones keyed without a `<op>/<entity>` slash. In subject views the
  // bucket count is just the number of subject groups.
  const bucketCount = useMemo(
    () =>
      groupBy === 'action_type'
        ? filteredBuckets.filter((b) => !b.action_key.includes('/')).length
        : displayBuckets.length,
    [groupBy, filteredBuckets, displayBuckets],
  );

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-3 shrink-0">
        {/* Grouping mode toggle */}
        <div
          className="inline-flex rounded-md border border-gray-200 bg-white p-0.5"
          role="group"
          aria-label="Group pending changes by"
        >
          {GROUP_BY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => changeGroupBy(opt.value)}
              aria-pressed={groupBy === opt.value}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                groupBy === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {data && (
          <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
            {filterActive
              ? `${filteredTotal} of ${data.total_pending_changesets}`
              : data.total_pending_changesets}{' '}
            pending · {bucketCount} {groupNoun}
            {bucketCount === 1 ? '' : 's'}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <PendingFilterPanel
              filter={filter}
              onFilterChange={setFilter}
              isOpen={isFilterOpen}
              onToggle={() => setIsFilterOpen((v) => !v)}
              options={filterOptions}
              show={filterShow}
            />
          </div>
          <SearchInput
            value={filter.search}
            onChange={(value) => setFilter((f) => ({ ...f, search: value }))}
            placeholder="Search changes..."
            className="w-56"
          />
        </div>
      </div>

      {actions.lastBulkError && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 flex items-center justify-between gap-3">
          <span>{actions.lastBulkError}</span>
          <button
            type="button"
            onClick={actions.clearBulkError}
            className="text-red-800 underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        <PendingByRemediationInbox
          buckets={displayBuckets}
          groupNoun={groupNoun}
          isLoading={isLoading}
          emptyHint={filterActive ? 'No changes match the current filters.' : undefined}
          error={error}
          plansBulkBusy={actions.plansBulkBusy}
          subjectsByPlan={groupBy === 'action_type' ? data?.subjects_by_plan : undefined}
          onCommitBucketPlans={(bucket, key) =>
            actions.commitBucketPlans(bucket, key)
          }
          onCommitRow={actions.commitRow}
          onRejectRow={actions.rejectRow}
          onPlanCommitted={handlePlanCommitted}
          onPlanChanged={() => void refetch()}
        />
      </div>

      <ConflictDialog
        isOpen={actions.conflictDialog.isOpen}
        onClose={actions.closeConflictDialog}
        onDiscard={actions.discardConflictedChangeset}
        errors={actions.conflictDialog.errors}
        entityDisplay={actions.conflictDialog.entityDisplay ?? undefined}
        loading={actions.isDiscardingConflicted}
      />

    </div>
  );
}

