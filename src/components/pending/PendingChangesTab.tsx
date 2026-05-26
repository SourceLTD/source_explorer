'use client';

import { useMemo, useState, useCallback } from 'react';
import { ArrowPathIcon, CheckIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import { ConfirmDialog, ConflictDialog } from '@/components/ui';
import { usePendingByRemediation } from './byRemediation/usePendingByRemediation';
import { useBucketActions } from './byRemediation/useBucketActions';
import PendingByRemediationInbox from './byRemediation/PendingByRemediationInbox';
import { collectPendingPlanIds } from './byRemediation/bulkCommitPlans';

/**
 * Wrapper around the by-remediation Inbox view for the Pending Changes tab.
 *
 * Organises pending changesets first by the LLM remediation job that
 * produced them, with health-check diagnosis codes as collapsible sub-
 * rows inside each remediation bucket.
 */
export default function PendingChangesTab() {
  const { data, isLoading, error, refetch } = usePendingByRemediation();
  const buckets = useMemo(() => data?.buckets ?? [], [data]);
  const [confirmCommitAllPlans, setConfirmCommitAllPlans] = useState(false);

  const actions = useBucketActions({ refetch });

  const remediationCount = useMemo(
    () => buckets.filter((b) => !b.action_key.includes('/')).length,
    [buckets],
  );

  const pendingPlanIds = useMemo(() => collectPendingPlanIds(buckets), [buckets]);
  const allPlansBusy = actions.plansBulkBusy.scope === 'all';

  const handleCommitAllPlans = useCallback(async () => {
    setConfirmCommitAllPlans(false);
    await actions.commitAllPlans(buckets);
  }, [actions, buckets]);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-3 shrink-0">
        {data && (
          <span className="text-xs text-gray-500 tabular-nums">
            {data.total_pending_changesets} pending · {remediationCount} action type
            {remediationCount === 1 ? '' : 's'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {pendingPlanIds.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmCommitAllPlans(true)}
              disabled={isLoading || allPlansBusy || actions.plansBulkBusy.scope === 'bucket'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-600 disabled:opacity-50"
              title="Commit all pending change plans in one transaction"
            >
              {allPlansBusy ? (
                <LoadingSpinner size="sm" noPadding />
              ) : (
                <CheckIcon className="w-3.5 h-3.5" />
              )}
              Commit all plans ({pendingPlanIds.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            title="Refresh"
          >
            {isLoading ? (
              <LoadingSpinner size="sm" noPadding />
            ) : (
              <ArrowPathIcon className="w-3.5 h-3.5" />
            )}
            Refresh
          </button>
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
          buckets={buckets}
          isLoading={isLoading}
          error={error}
          busy={actions.busy}
          plansBulkBusy={actions.plansBulkBusy}
          onCommitBucket={(bucket, key) =>
            actions.commitBucket(bucket, key)
          }
          onCommitBucketPlans={(bucket, key) =>
            actions.commitBucketPlans(bucket, key)
          }
          onRejectBucket={(bucket, key) =>
            actions.requestRejectBucket(bucket, key)
          }
          onCommitRow={actions.commitRow}
          onRejectRow={actions.rejectRow}
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

      <ConfirmDialog
        isOpen={confirmCommitAllPlans}
        onCancel={() => setConfirmCommitAllPlans(false)}
        onConfirm={() => void handleCommitAllPlans()}
        title="Commit all pending plans?"
        message={`Commit ${pendingPlanIds.length} change plan${pendingPlanIds.length === 1 ? '' : 's'} in a single transaction? Duplicate parent proposals will be discarded automatically.`}
        confirmLabel="Commit all"
        variant="success"
      />

      <ConfirmDialog
        isOpen={actions.confirmReject.isOpen}
        onCancel={actions.cancelConfirmReject}
        onConfirm={actions.acceptConfirmReject}
        title="Reject loose changes?"
        message={`Reject ${actions.confirmReject.count} loose change${actions.confirmReject.count === 1 ? '' : 's'} in this remediation? Plan-bound changesets are unaffected.`}
        confirmLabel="Reject"
        variant="danger"
      />
    </div>
  );
}

