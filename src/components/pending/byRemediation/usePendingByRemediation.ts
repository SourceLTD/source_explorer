'use client';

import { useCallback, useEffect, useState } from 'react';
import type { IssueChangePlanSummary } from '@/lib/issues/types';
import type { ByRemediationChangeset, PendingByRemediationResponse } from './types';

interface UsePendingByRemediationResult {
  data: PendingByRemediationResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /**
   * Optimistically drop one or more change plans (and their changesets) from
   * the cached payload without a network round-trip. Used so committing a plan
   * removes just that card, leaving sibling cards and any in-flight actions
   * untouched.
   */
  removePlans: (planIds: string[]) => void;
  /** Optimistically drop one or more loose changesets from the cached payload. */
  removeChangesets: (changesetIds: string[]) => void;
}

function countOf(changesets: ByRemediationChangeset[]) {
  const withPlan = changesets.filter((c) => c.change_plan_id).length;
  return {
    total: changesets.length,
    with_plan: withPlan,
    loose: changesets.length - withPlan,
  };
}

/**
 * Pure helper: return a new payload with the given plans / changesets removed,
 * recomputing all counts and dropping any now-empty health-check groups and
 * buckets. Changesets belonging to a removed plan (matched on
 * `change_plan_id`) are dropped alongside the plan itself.
 */
function pruneResponse(
  data: PendingByRemediationResponse,
  dropPlanIds: Set<string>,
  dropChangesetIds: Set<string>,
): PendingByRemediationResponse {
  const keepCs = (c: ByRemediationChangeset) =>
    !dropChangesetIds.has(c.id) &&
    !(c.change_plan_id != null && dropPlanIds.has(c.change_plan_id));
  const keepPlan = (p: IssueChangePlanSummary) => !dropPlanIds.has(p.id);

  const buckets = data.buckets
    .map((bucket) => {
      const changesets = bucket.changesets.filter(keepCs);
      const plans = bucket.plans.filter(keepPlan);
      const health_check_groups = bucket.health_check_groups
        .map((g) => {
          const gcs = g.changesets.filter(keepCs);
          return {
            ...g,
            changesets: gcs,
            plans: g.plans.filter(keepPlan),
            counts: countOf(gcs),
          };
        })
        .filter((g) => g.changesets.length > 0 || g.plans.length > 0);
      return { ...bucket, changesets, plans, health_check_groups, counts: countOf(changesets) };
    })
    .filter((b) => b.changesets.length > 0 || b.plans.length > 0);

  return {
    buckets,
    total_pending_changesets: buckets.reduce((n, b) => n + b.changesets.length, 0),
    // Subject maps are keyed by id; stale entries for now-removed changes are
    // simply never looked up, so we carry them through verbatim.
    subjects_by_changeset: data.subjects_by_changeset,
    subjects_by_plan: data.subjects_by_plan,
  };
}

export function usePendingByRemediation(): UsePendingByRemediationResult {
  const [data, setData] = useState<PendingByRemediationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/changesets/pending/by-remediation');
      if (!res.ok) throw new Error('Failed to load pending changes by remediation');
      const json = (await res.json()) as PendingByRemediationResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removePlans = useCallback((planIds: string[]) => {
    if (planIds.length === 0) return;
    const drop = new Set(planIds);
    setData((prev) => (prev ? pruneResponse(prev, drop, new Set()) : prev));
  }, []);

  const removeChangesets = useCallback((changesetIds: string[]) => {
    if (changesetIds.length === 0) return;
    const drop = new Set(changesetIds);
    setData((prev) => (prev ? pruneResponse(prev, new Set(), drop) : prev));
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch, removePlans, removeChangesets };
}
