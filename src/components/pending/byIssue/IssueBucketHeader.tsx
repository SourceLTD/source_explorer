'use client';

import {
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  XMarkIcon,
  InboxIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_PRIORITY_STYLES,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUS_STYLES,
  type IssuePriority,
  type IssueStatus,
} from '@/lib/issues/types';
import type { ByIssueBucket } from './types';

interface IssueBucketHeaderProps {
  bucket: ByIssueBucket;
  /** Disables all buttons while a per-bucket action is in flight. */
  busyAction: 'commit' | 'reject' | null;
  /** Approve+commit every loose pending changeset in this bucket. */
  onCommitAll: () => void;
  /** Discard every loose pending changeset in this bucket. */
  onRejectAll: () => void;
  /** When set, "Open issue" surfaces; called with the real issue id. */
  onOpenIssue?: (issueId: string) => void;
  /**
   * Density variant. `card` is for the stacked-card layout;
   * `compact` strips outer padding so the inbox can render the same
   * header inside its right-hand pane.
   */
  variant?: 'card' | 'compact';
}

/**
 * Single source of truth for how an issue bucket announces itself —
 * status pill, priority pill, title, count badges, and the per-bucket
 * commit/reject CTAs.
 *
 * Both views (Cards + Inbox) render this so a bucket reads identical
 * across surfaces. The synthetic Unlinked bucket gets a slightly
 * different look (no pills, neutral icon, and the CTAs apply only to
 * loose changesets).
 */
export default function IssueBucketHeader({
  bucket,
  busyAction,
  onCommitAll,
  onRejectAll,
  onOpenIssue,
  variant = 'card',
}: IssueBucketHeaderProps) {
  const isUnlinked = bucket.issue === null;
  const looseCount = bucket.counts.loose;
  const hasLoose = looseCount > 0;

  const wrapperClass =
    variant === 'card'
      ? 'px-4 py-3 border-b border-gray-200 bg-gray-50'
      : 'px-4 py-3 bg-white border-b border-gray-200';

  return (
    <header className={wrapperClass}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isUnlinked ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                  <InboxIcon className="w-4 h-4 text-gray-500" />
                  Unlinked changes
                </span>
              </>
            ) : (
              <>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium ${
                    ISSUE_STATUS_STYLES[bucket.issue!.status as IssueStatus] ??
                    'bg-gray-100 text-gray-700 border-gray-200'
                  }`}
                >
                  {ISSUE_STATUS_LABELS[bucket.issue!.status as IssueStatus] ??
                    bucket.issue!.status}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium ${
                    ISSUE_PRIORITY_STYLES[
                      bucket.issue!.priority as IssuePriority
                    ] ?? 'bg-gray-100 text-gray-700 border-gray-200'
                  }`}
                >
                  {ISSUE_PRIORITY_LABELS[
                    bucket.issue!.priority as IssuePriority
                  ] ?? bucket.issue!.priority}
                </span>
                <span className="text-xs text-gray-500 font-mono">
                  #{bucket.issue!.id}
                </span>
                <h3 className="text-sm font-semibold text-gray-900 truncate">
                  {bucket.issue!.title}
                </h3>
              </>
            )}
            <span className="ml-auto inline-flex items-center justify-center min-w-[1.5rem] h-5 px-2 rounded-full text-[11px] font-medium tabular-nums bg-gray-200 text-gray-700">
              {bucket.counts.total} pending
            </span>
          </div>
          {!isUnlinked && bucket.issue!.description && (
            <p className="mt-1 text-xs text-gray-500 line-clamp-2 break-words">
              {bucket.issue!.description}
            </p>
          )}
          <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-500">
            {bucket.counts.with_plan > 0 && (
              <span>
                {bucket.counts.with_plan} in plan
                {bucket.counts.with_plan === 1 ? '' : 's'}
              </span>
            )}
            {looseCount > 0 && (
              <span>
                {looseCount} loose change{looseCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isUnlinked && onOpenIssue && (
            <button
              type="button"
              onClick={() => onOpenIssue(bucket.issue!.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 border border-gray-300 rounded-md bg-white hover:bg-gray-50"
              title="Open issue"
            >
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
              Open issue
            </button>
          )}
          <button
            type="button"
            onClick={onRejectAll}
            disabled={!hasLoose || busyAction !== null}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 border border-red-200 rounded-md bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              hasLoose
                ? `Reject ${looseCount} loose change${looseCount === 1 ? '' : 's'}`
                : 'No loose changes to reject (plan-bound changesets are managed inside their plan)'
            }
          >
            {busyAction === 'reject' ? (
              <LoadingSpinner size="sm" noPadding />
            ) : (
              <XMarkIcon className="w-3.5 h-3.5" />
            )}
            Reject {hasLoose ? `(${looseCount})` : ''}
          </button>
          <button
            type="button"
            onClick={onCommitAll}
            disabled={!hasLoose || busyAction !== null}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            title={
              hasLoose
                ? `Commit ${looseCount} loose change${looseCount === 1 ? '' : 's'}`
                : 'No loose changes to commit (plan-bound changesets are committed inside their plan)'
            }
          >
            {busyAction === 'commit' ? (
              <LoadingSpinner size="sm" noPadding />
            ) : (
              <CheckIcon className="w-3.5 h-3.5" />
            )}
            Commit {hasLoose ? `(${looseCount})` : ''}
          </button>
        </div>
      </div>
    </header>
  );
}
