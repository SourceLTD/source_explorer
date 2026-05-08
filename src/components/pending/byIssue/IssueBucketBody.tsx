'use client';

import { useState } from 'react';
import PlanCard from '@/components/issues/PlanCard';
import LazyMount from '@/components/pending/LazyMount';
import LooseChangesetCard from './LooseChangesetCard';
import type { ByIssueBucket, ByIssueChangeset } from './types';

interface IssueBucketBodyProps {
  bucket: ByIssueBucket;
  /** Per-row commit handler. Returns true when commit succeeded. */
  onCommitRow: (cs: ByIssueChangeset) => Promise<void>;
  /** Per-row reject handler. */
  onRejectRow: (cs: ByIssueChangeset) => Promise<void>;
  /** Open the existing changeset detail modal for this row. */
  onOpenRow?: (cs: ByIssueChangeset) => void;
  /** Refetch trigger after a plan commit/discard succeeds. */
  onPlanChanged: () => void;
}

// Approximate rendered heights, used as placeholder min-heights so
// the scrollbar / scroll position behaves naturally before each card
// mounts. A small mismatch with the actual height is fine — it
// produces a tiny one-time scroll-jump on first reveal which the
// rootMargin in `LazyMount` already hides under most scroll speeds.
const PLAN_CARD_PLACEHOLDER_HEIGHT = 360;
const LOOSE_CARD_PLACEHOLDER_HEIGHT = 220;

/**
 * Renders the contents of one issue bucket: any pending change_plans
 * (rendered through the existing `PlanCard`) followed by the bucket's
 * loose changesets as a compact list.
 *
 * Plan-bound changesets are intentionally excluded from the loose
 * list because they're already represented inside their parent plan
 * card — committing a child outside the plan would strand the rest.
 *
 * Each card is wrapped in `LazyMount` so heavy children (frame
 * summary fetches, DAG-context fetches, etc.) only run for cards the
 * reviewer is about to see. Once mounted, cards stay mounted to
 * preserve their state and avoid refetches as the user scrolls back
 * and forth.
 */
export default function IssueBucketBody({
  bucket,
  onCommitRow,
  onRejectRow,
  onOpenRow,
  onPlanChanged,
}: IssueBucketBodyProps) {
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'commit' | 'reject' | null>(null);

  const looseChangesets = bucket.changesets.filter((c) => !c.change_plan_id);

  const handleCommit = async (cs: ByIssueChangeset) => {
    setBusyRowId(cs.id);
    setBusyAction('commit');
    try {
      await onCommitRow(cs);
    } finally {
      setBusyRowId(null);
      setBusyAction(null);
    }
  };

  const handleReject = async (cs: ByIssueChangeset) => {
    setBusyRowId(cs.id);
    setBusyAction('reject');
    try {
      await onRejectRow(cs);
    } finally {
      setBusyRowId(null);
      setBusyAction(null);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {bucket.plans.length > 0 && (
        <section className="space-y-3">
          {bucket.plans.map((plan) => (
            <LazyMount
              key={plan.id}
              placeholderHeight={PLAN_CARD_PLACEHOLDER_HEIGHT}
            >
              <PlanCard
                plan={plan}
                onCommitted={onPlanChanged}
                onDiscarded={onPlanChanged}
              />
            </LazyMount>
          ))}
        </section>
      )}

      {looseChangesets.length === 0 ? (
        bucket.plans.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-500 text-center">
            No pending changes for this issue.
          </div>
        ) : null
      ) : (
        <section className="space-y-3">
          {bucket.plans.length > 0 && (
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
                    disabled={busyRowId !== null && busyRowId !== cs.id}
                    onCommit={() => void handleCommit(cs)}
                    onReject={() => void handleReject(cs)}
                    onOpen={onOpenRow ? () => onOpenRow(cs) : undefined}
                  />
                </LazyMount>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
