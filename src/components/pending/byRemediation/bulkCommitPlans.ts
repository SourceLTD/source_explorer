'use client';

import type { ActionBucket } from './types';

export function collectPendingPlanIds(buckets: ActionBucket[]): string[] {
  const ids = new Set<string>();
  for (const bucket of buckets) {
    for (const plan of bucket.plans) {
      if (plan.status === 'pending') ids.add(plan.id);
    }
  }
  return [...ids];
}

export function collectBucketPendingPlanIds(bucket: ActionBucket): string[] {
  const ids = new Set<string>();
  for (const plan of bucket.plans) {
    if (plan.status === 'pending') ids.add(plan.id);
  }
  return [...ids];
}

export interface BulkCommitPlansResponse {
  success: boolean;
  total?: number;
  committed?: number;
  discarded?: number;
  changesetsCommitted?: number;
  error?: string;
  failed_plan_id?: string | null;
}

export async function bulkCommitPlansRequest(args: {
  planIds?: string[];
  planKind?: string;
}): Promise<BulkCommitPlansResponse> {
  const res = await fetch('/api/change-plans/bulk-commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(args.planIds ? { plan_ids: args.planIds } : {}),
      ...(args.planKind ? { plan_kind: args.planKind } : {}),
    }),
  });

  const body = (await res.json().catch(() => ({}))) as BulkCommitPlansResponse;
  if (!res.ok) {
    return {
      ...body,
      success: false,
      error: body.error ?? `Bulk commit failed (${res.status})`,
    };
  }
  return body;
}
