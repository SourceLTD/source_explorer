'use client';

import { useState, useCallback } from 'react';
import type { ConflictError } from '@/components/ui';
import { refreshPendingChangesCount } from '@/hooks/usePendingChangesCount';
import type { ActionBucket, ByRemediationChangeset } from './types';
import { getEntityDisplayName } from './changesetDisplay';
import {
  bulkCommitPlansRequest,
  collectBucketPendingPlanIds,
} from './bulkCommitPlans';

export interface ConflictDialogState {
  isOpen: boolean;
  errors: ConflictError[];
  changesetId: string | null;
  entityDisplay: string | null;
}

export interface PlansBulkBusyState {
  scope: 'all' | 'bucket' | null;
  bucketKey?: string | null;
}

interface UseBucketActionsResult {
  commitBucketPlans: (bucket: ActionBucket, bucketKey: string) => Promise<BulkCommitPlansOutcome>;
  commitRow: (cs: ByRemediationChangeset) => Promise<void>;
  rejectRow: (cs: ByRemediationChangeset) => Promise<void>;

  conflictDialog: ConflictDialogState;
  closeConflictDialog: () => void;
  discardConflictedChangeset: () => Promise<void>;
  isDiscardingConflicted: boolean;

  plansBulkBusy: PlansBulkBusyState;
  lastBulkError: string | null;
  clearBulkError: () => void;
}

export interface BulkCommitPlansOutcome {
  success: boolean;
  committed?: number;
  discarded?: number;
  error?: string;
}

export function useBucketActions({
  refetch,
  removeChangesets,
}: {
  refetch: () => Promise<void>;
  /** Optimistically drop committed/rejected loose changesets from the list. */
  removeChangesets: (changesetIds: string[]) => void;
}): UseBucketActionsResult {
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState>({
    isOpen: false,
    errors: [],
    changesetId: null,
    entityDisplay: null,
  });
  const [isDiscardingConflicted, setIsDiscardingConflicted] = useState(false);
  const [plansBulkBusy, setPlansBulkBusy] = useState<PlansBulkBusyState>({
    scope: null,
    bucketKey: null,
  });
  const [lastBulkError, setLastBulkError] = useState<string | null>(null);

  const runBulk = useCallback(
    async (
      ids: string[],
      action: 'approve_and_commit' | 'reject',
      onConflict?: (changesetId: string, errors: ConflictError[]) => void,
    ): Promise<boolean> => {
      if (ids.length === 0) return true;
      const res = await fetch('/api/changesets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        if (onConflict && body?.conflict?.changeset_id) {
          onConflict(body.conflict.changeset_id, body.conflict.errors ?? []);
        }
        return false;
      }
      if (!res.ok) {
        console.error('Bulk action failed:', action, await res.text().catch(() => ''));
        return false;
      }
      return true;
    },
    [],
  );

  const commitBucketPlans = useCallback<
    UseBucketActionsResult['commitBucketPlans']
  >(
    async (bucket, bucketKey) => {
      const planIds = collectBucketPendingPlanIds(bucket);
      if (planIds.length === 0) {
        return { success: true, committed: 0, discarded: 0 };
      }
      setLastBulkError(null);
      setPlansBulkBusy({ scope: 'bucket', bucketKey });
      try {
        // `planIds` already identifies the exact pending plans in this bucket,
        // and the endpoint ANDs plan_ids with plan_kind — so passing a
        // plan_kind here can only ever narrow (or, for non-action-type bucket
        // keys like `concept:123`, break) an already-correct selection.
        const result = await bulkCommitPlansRequest({ planIds });
        if (!result.success) {
          setLastBulkError(result.error ?? 'Bulk commit failed');
          return { success: false, error: result.error };
        }
        return {
          success: true,
          committed: result.committed,
          discarded: result.discarded,
        };
      } finally {
        setPlansBulkBusy({ scope: null, bucketKey: null });
        await refetch();
        refreshPendingChangesCount();
      }
    },
    [refetch],
  );

  const clearBulkError = useCallback(() => setLastBulkError(null), []);

  const commitRow = useCallback<UseBucketActionsResult['commitRow']>(
    async (cs) => {
      // Single-row actions remove just that changeset locally on success, so
      // concurrent commits/rejects on other rows are never interrupted by a
      // full-list refetch. On conflict the dialog opens and the row stays.
      const ok = await runBulk([cs.id], 'approve_and_commit', (csId, errors) => {
        setConflictDialog({
          isOpen: true,
          errors,
          changesetId: csId,
          entityDisplay: getEntityDisplayName(cs),
        });
      });
      if (ok) {
        removeChangesets([cs.id]);
        refreshPendingChangesCount();
      }
    },
    [runBulk, removeChangesets],
  );

  const rejectRow = useCallback<UseBucketActionsResult['rejectRow']>(
    async (cs) => {
      const ok = await runBulk([cs.id], 'reject');
      if (ok) {
        removeChangesets([cs.id]);
        refreshPendingChangesCount();
      }
    },
    [runBulk, removeChangesets],
  );

  const closeConflictDialog = useCallback(() => {
    setConflictDialog({
      isOpen: false,
      errors: [],
      changesetId: null,
      entityDisplay: null,
    });
    void refetch();
  }, [refetch]);

  const discardConflictedChangeset = useCallback(async () => {
    if (!conflictDialog.changesetId) return;
    setIsDiscardingConflicted(true);
    try {
      const res = await fetch(
        `/api/changesets/${conflictDialog.changesetId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Failed to discard changeset');
      setConflictDialog({
        isOpen: false,
        errors: [],
        changesetId: null,
        entityDisplay: null,
      });
      await refetch();
      refreshPendingChangesCount();
    } catch (err) {
      console.error('Failed to discard conflicted changeset:', err);
    } finally {
      setIsDiscardingConflicted(false);
    }
  }, [conflictDialog.changesetId, refetch]);

  return {
    commitBucketPlans,
    commitRow,
    rejectRow,
    conflictDialog,
    closeConflictDialog,
    discardConflictedChangeset,
    isDiscardingConflicted,
    plansBulkBusy,
    lastBulkError,
    clearBulkError,
  };
}
