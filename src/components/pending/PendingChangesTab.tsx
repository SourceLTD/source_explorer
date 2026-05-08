'use client';

import { useMemo } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import { ConfirmDialog, ConflictDialog } from '@/components/ui';
import { usePendingByIssue } from './byIssue/usePendingByIssue';
import { useBucketActions } from './byIssue/useBucketActions';
import PendingByIssueInbox from './byIssue/PendingByIssueInbox';

interface PendingChangesTabProps {
  /**
   * Called when the user clicks "Open issue" on a bucket. Lets the
   * parent modal switch to the Issues tab and preselect the row.
   * Optional — when omitted the affordance is hidden.
   */
  onOpenIssue?: (issueId: string) => void;
}

/**
 * Wrapper around the by-issue Inbox view for the Pending Changes tab.
 *
 * Owns the data fetch, the per-bucket / per-row action handlers, and
 * the conflict + confirm dialogs so the underlying view component
 * stays focused on layout. Today there's only one view (Inbox); a
 * future view could drop in alongside without touching the modal.
 */
export default function PendingChangesTab({ onOpenIssue }: PendingChangesTabProps) {
  const { data, isLoading, error, refetch } = usePendingByIssue();
  const buckets = useMemo(() => data?.buckets ?? [], [data]);
  const actions = useBucketActions({ refetch });

  const issueBucketCount = useMemo(
    () => buckets.filter((b) => b.issue !== null).length,
    [buckets],
  );

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-3 shrink-0">
        {data && (
          <span className="text-xs text-gray-500 tabular-nums">
            {data.total_pending_changesets} pending · {issueBucketCount} issue
            {issueBucketCount === 1 ? '' : 's'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
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

      <div className="flex-1 min-h-0 overflow-hidden">
        <PendingByIssueInbox
          buckets={buckets}
          isLoading={isLoading}
          error={error}
          busy={actions.busy}
          onCommitBucket={actions.commitBucket}
          onRejectBucket={actions.requestRejectBucket}
          onCommitRow={actions.commitRow}
          onRejectRow={actions.rejectRow}
          onPlanChanged={() => void refetch()}
          onOpenIssue={onOpenIssue}
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
        isOpen={actions.confirmReject.isOpen}
        onCancel={actions.cancelConfirmReject}
        onConfirm={actions.acceptConfirmReject}
        title="Reject loose changes?"
        message={`Reject ${actions.confirmReject.count} loose change${actions.confirmReject.count === 1 ? '' : 's'} in this bucket? Plan-bound changesets are unaffected.`}
        confirmLabel="Reject"
        variant="danger"
      />
    </div>
  );
}
