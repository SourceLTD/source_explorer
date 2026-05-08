/**
 * Shared types for the by-issue pending-changes views (Cards + Inbox).
 *
 * The wire shape mirrors the response of `/api/changesets/pending/by-issue`.
 * Keep these in lockstep with that route's types.
 */
import type { ShapedChangeset } from '@/lib/changesets/pending-shape';
import type {
  IssueChangePlanSummary,
  IssuePriority,
  IssueStatus,
} from '@/lib/issues/types';

export type ByIssueChangeset = ShapedChangeset;

export interface ByIssueBucketIssue {
  id: string;
  title: string;
  description: string | null;
  status: IssueStatus | string;
  priority: IssuePriority | string;
  labels: string[];
  assignee: string | null;
  created_at: string;
  updated_at: string;
}

export interface ByIssueBucket {
  /** `null` marks the synthetic "Unlinked" bucket. */
  issue: ByIssueBucketIssue | null;
  changesets: ByIssueChangeset[];
  plans: IssueChangePlanSummary[];
  counts: {
    total: number;
    with_plan: number;
    loose: number;
  };
}

export interface PendingByIssueResponse {
  buckets: ByIssueBucket[];
  total_pending_changesets: number;
}

/**
 * Stable id for a bucket — used as React keys and as the selection
 * key in the inbox view. Real issues use their numeric id, the
 * synthetic Unlinked bucket uses a sentinel.
 */
export const UNLINKED_BUCKET_KEY = '__unlinked__';

export function bucketKey(bucket: ByIssueBucket): string {
  return bucket.issue ? bucket.issue.id : UNLINKED_BUCKET_KEY;
}
