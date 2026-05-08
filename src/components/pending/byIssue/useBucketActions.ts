'use client';

import { useState, useCallback } from 'react';
import type { ConflictError } from '@/components/ui';
import { refreshPendingChangesCount } from '@/hooks/usePendingChangesCount';
import type { ByIssueBucket, ByIssueChangeset } from './types';
import { getEntityDisplayName } from './changesetDisplay';

export interface ConflictDialogState {
  isOpen: boolean;
  errors: ConflictError[];
  changesetId: string | null;
  entityDisplay: string | null;
}

export interface ConfirmDialogState {
  isOpen: boolean;
  bucketKey: string | null;
  count: number;
}

export interface BucketBusyState {
  /** Bucket key currently running a per-bucket commit/reject. */
  bucketKey: string | null;
  action: 'commit' | 'reject' | null;
}

interface UseBucketActionsResult {
  /** Bulk-approve every loose changeset in `bucket`. */
  commitBucket: (bucket: ByIssueBucket, bucketKey: string) => Promise<void>;
  /** Show the confirm dialog before rejecting an entire bucket. */
  requestRejectBucket: (bucket: ByIssueBucket, bucketKey: string) => void;
  /** Single-row commit. Catches 409s into the conflict dialog. */
  commitRow: (cs: ByIssueChangeset) => Promise<void>;
  /** Single-row reject. */
  rejectRow: (cs: ByIssueChangeset) => Promise<void>;

  /** Conflict dialog state and handlers. */
  conflictDialog: ConflictDialogState;
  closeConflictDialog: () => void;
  discardConflictedChangeset: () => Promise<void>;
  isDiscardingConflicted: boolean;

  /** Confirm dialog state for "reject all in bucket". */
  confirmReject: ConfirmDialogState;
  cancelConfirmReject: () => void;
  acceptConfirmReject: () => Promise<void>;

  busy: BucketBusyState;
}

/**
 * Encapsulates every per-bucket and per-row action used by the by-issue
 * Cards / Inbox views. Owns the conflict + confirm dialog state so
 * either view can render the dialogs from the wrapper.
 *
 * The hook calls `refetch()` itself after every successful action, and
 * also pings the global `refreshPendingChangesCount()` so the modal
 * tab badge stays in sync.
 */
export function useBucketActions({
  refetch,
}: {
  refetch: () => Promise<void>;
}): UseBucketActionsResult {
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState>({
    isOpen: false,
    errors: [],
    changesetId: null,
    entityDisplay: null,
  });
  const [isDiscardingConflicted, setIsDiscardingConflicted] = useState(false);
  const [confirmReject, setConfirmReject] = useState<ConfirmDialogState>({
    isOpen: false,
    bucketKey: null,
    count: 0,
  });
  const [busy, setBusy] = useState<BucketBusyState>({
    bucketKey: null,
    action: null,
  });
  // Pending bucket payload captured when the user opens the confirm
  // dialog — re-read on accept so we always reject the same set the
  // user saw.
  const [pendingRejectBucket, setPendingRejectBucket] = useState<{
    bucket: ByIssueBucket;
    bucketKey: string;
  } | null>(null);

  const looseIds = (bucket: ByIssueBucket): string[] =>
    bucket.changesets.filter((c) => !c.change_plan_id).map((c) => c.id);

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

  const commitBucket = useCallback<UseBucketActionsResult['commitBucket']>(
    async (bucket, bucketKey) => {
      const ids = looseIds(bucket);
      if (ids.length === 0) return;
      setBusy({ bucketKey, action: 'commit' });
      try {
        await runBulk(ids, 'approve_and_commit', (csId, errors) => {
          const conflicted = bucket.changesets.find((c) => c.id === csId);
          setConflictDialog({
            isOpen: true,
            errors,
            changesetId: csId,
            entityDisplay: conflicted ? getEntityDisplayName(conflicted) : null,
          });
        });
      } finally {
        setBusy({ bucketKey: null, action: null });
        await refetch();
        refreshPendingChangesCount();
      }
    },
    [refetch, runBulk],
  );

  const requestRejectBucket = useCallback<
    UseBucketActionsResult['requestRejectBucket']
  >((bucket, bucketKey) => {
    const ids = looseIds(bucket);
    if (ids.length === 0) return;
    setPendingRejectBucket({ bucket, bucketKey });
    setConfirmReject({
      isOpen: true,
      bucketKey,
      count: ids.length,
    });
  }, []);

  const cancelConfirmReject = useCallback(() => {
    setConfirmReject({ isOpen: false, bucketKey: null, count: 0 });
    setPendingRejectBucket(null);
  }, []);

  const acceptConfirmReject = useCallback(async () => {
    if (!pendingRejectBucket) {
      cancelConfirmReject();
      return;
    }
    const { bucket, bucketKey } = pendingRejectBucket;
    const ids = looseIds(bucket);
    setConfirmReject({ isOpen: false, bucketKey: null, count: 0 });
    setPendingRejectBucket(null);
    if (ids.length === 0) return;
    setBusy({ bucketKey, action: 'reject' });
    try {
      await runBulk(ids, 'reject');
    } finally {
      setBusy({ bucketKey: null, action: null });
      await refetch();
      refreshPendingChangesCount();
    }
  }, [pendingRejectBucket, refetch, runBulk, cancelConfirmReject]);

  const commitRow = useCallback<UseBucketActionsResult['commitRow']>(
    async (cs) => {
      try {
        await runBulk([cs.id], 'approve_and_commit', (csId, errors) => {
          setConflictDialog({
            isOpen: true,
            errors,
            changesetId: csId,
            entityDisplay: getEntityDisplayName(cs),
          });
        });
      } finally {
        await refetch();
        refreshPendingChangesCount();
      }
    },
    [refetch, runBulk],
  );

  const rejectRow = useCallback<UseBucketActionsResult['rejectRow']>(
    async (cs) => {
      try {
        await runBulk([cs.id], 'reject');
      } finally {
        await refetch();
        refreshPendingChangesCount();
      }
    },
    [refetch, runBulk],
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
    commitBucket,
    requestRejectBucket,
    commitRow,
    rejectRow,
    conflictDialog,
    closeConflictDialog,
    discardConflictedChangeset,
    isDiscardingConflicted,
    confirmReject,
    cancelConfirmReject,
    acceptConfirmReject,
    busy,
  };
}
