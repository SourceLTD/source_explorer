'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircleIcon, InboxIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import { EmptyState } from '@/components/ui';
import {
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  type IssuePriority,
  type IssueStatus,
} from '@/lib/issues/types';
import IssueBucketHeader from './IssueBucketHeader';
import IssueBucketBody from './IssueBucketBody';
import { bucketKey, type ByIssueBucket, type ByIssueChangeset } from './types';
import type { BucketBusyState } from './useBucketActions';

interface PendingByIssueInboxProps {
  buckets: ByIssueBucket[];
  isLoading: boolean;
  error: string | null;
  busy: BucketBusyState;
  onCommitBucket: (bucket: ByIssueBucket, key: string) => Promise<void>;
  onRejectBucket: (bucket: ByIssueBucket, key: string) => void;
  onCommitRow: (cs: ByIssueChangeset) => Promise<void>;
  onRejectRow: (cs: ByIssueChangeset) => Promise<void>;
  onPlanChanged: () => void;
  onOpenIssue?: (issueId: string) => void;
  onOpenChangeset?: (cs: ByIssueChangeset) => void;
}

/**
 * Master/detail layout: left rail lists buckets, right pane renders
 * the selected bucket's header + body. Arrow keys move selection.
 *
 * Selection persists across refetches by `bucketKey`. If the selected
 * bucket disappears (e.g. all of its changes were committed), we
 * fall back to the first remaining bucket.
 */
export default function PendingByIssueInbox({
  buckets,
  isLoading,
  error,
  busy,
  onCommitBucket,
  onRejectBucket,
  onCommitRow,
  onRejectRow,
  onPlanChanged,
  onOpenIssue,
  onOpenChangeset,
}: PendingByIssueInboxProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  const keyedBuckets = useMemo(
    () => buckets.map((b) => ({ key: bucketKey(b), bucket: b })),
    [buckets],
  );

  // Pick a default selection: first bucket on first load, or fall
  // back when the previously-selected bucket disappears after a
  // commit.
  useEffect(() => {
    if (keyedBuckets.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (selectedKey && keyedBuckets.some((b) => b.key === selectedKey)) return;
    setSelectedKey(keyedBuckets[0].key);
  }, [keyedBuckets, selectedKey]);

  // Arrow-key navigation while the rail (or any descendant) has focus.
  useEffect(() => {
    const node = railRef.current;
    if (!node) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'j' && e.key !== 'k')
        return;
      // Don't hijack typing inside form fields nested in the bucket body.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (keyedBuckets.length === 0) return;
      e.preventDefault();
      const idx = keyedBuckets.findIndex((b) => b.key === selectedKey);
      const delta = e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1;
      const nextIdx = Math.max(0, Math.min(keyedBuckets.length - 1, idx + delta));
      setSelectedKey(keyedBuckets[nextIdx].key);
    };
    node.addEventListener('keydown', handler);
    return () => node.removeEventListener('keydown', handler);
  }, [keyedBuckets, selectedKey]);

  const selected = keyedBuckets.find((b) => b.key === selectedKey)?.bucket ?? null;
  const selectedBucketBusy =
    selected && busy.bucketKey === bucketKey(selected) ? busy.action : null;

  if (isLoading && buckets.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
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
      <aside
        ref={railRef}
        tabIndex={0}
        className="w-[320px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto focus:outline-none"
        aria-label="Issues with pending changes"
      >
        <div className="px-3 py-2 border-b border-gray-100 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {buckets.length} bucket{buckets.length === 1 ? '' : 's'}
        </div>
        <ul role="listbox" aria-label="Pending change buckets">
          {keyedBuckets.map(({ key, bucket }) => {
            const isSelected = selectedKey === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => setSelectedKey(key)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-100 transition-colors ${
                    isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                  }`}
                >
                  <BucketRailItem bucket={bucket} />
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {selected ? (
          <>
            <IssueBucketHeader
              bucket={selected}
              busyAction={selectedBucketBusy}
              onCommitAll={() => void onCommitBucket(selected, bucketKey(selected))}
              onRejectAll={() => onRejectBucket(selected, bucketKey(selected))}
              onOpenIssue={onOpenIssue}
              variant="compact"
            />
            <div className="flex-1 overflow-y-auto">
              <IssueBucketBody
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
            Select a bucket to review.
          </div>
        )}
      </main>
    </div>
  );
}

function BucketRailItem({ bucket }: { bucket: ByIssueBucket }) {
  const isUnlinked = bucket.issue === null;
  const status = bucket.issue?.status as IssueStatus | undefined;
  const priority = bucket.issue?.priority as IssuePriority | undefined;
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="mt-1 shrink-0">
        {isUnlinked ? (
          <InboxIcon className="w-4 h-4 text-gray-500" />
        ) : (
          <span
            className={`inline-block w-2 h-2 rounded-full ${statusDotClass(status)}`}
            title={status ? ISSUE_STATUS_LABELS[status] : undefined}
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 min-w-0">
          {!isUnlinked && (
            <span className="text-[10px] font-mono text-gray-400 shrink-0">
              #{bucket.issue!.id}
            </span>
          )}
          <span className="text-sm text-gray-900 break-words min-w-0 flex-1">
            {isUnlinked ? 'Unlinked changes' : bucket.issue!.title}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
          {!isUnlinked && priority && (
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${priorityDotClass(priority)}`}
              title={ISSUE_PRIORITY_LABELS[priority]}
            />
          )}
          <span>{bucket.counts.total} pending</span>
          {bucket.counts.with_plan > 0 && (
            <span className="text-gray-400">· {bucket.counts.with_plan} planned</span>
          )}
        </div>
      </div>
    </div>
  );
}

function statusDotClass(status: IssueStatus | undefined): string {
  switch (status) {
    case 'open':
      return 'bg-emerald-500';
    case 'in_progress':
      return 'bg-blue-500';
    case 'resolved':
      return 'bg-purple-500';
    case 'closed':
      return 'bg-gray-400';
    default:
      return 'bg-gray-400';
  }
}

function priorityDotClass(priority: IssuePriority): string {
  switch (priority) {
    case 'critical':
      return 'bg-red-500';
    case 'high':
      return 'bg-orange-500';
    case 'medium':
      return 'bg-yellow-500';
    case 'low':
      return 'bg-gray-400';
    default:
      return 'bg-gray-400';
  }
}
