/**
 * API Route: /api/changesets/pending/by-issue
 *
 * GET - Fetch all pending changesets bucketed by their parent issue.
 *
 * Each bucket carries:
 *   - the issue summary (or null for the synthetic "Unlinked" bucket),
 *   - every pending changeset linked to that issue (same wire shape as
 *     `/api/changesets/pending`),
 *   - any pending/failed `change_plans` rows attached to that issue,
 *     formatted exactly like `/api/issues/[id]` so the existing
 *     `<PlanCard>` component renders them unchanged.
 *
 * Buckets are ordered by issue priority (critical → low) then by most-
 * recently-updated; the synthetic Unlinked bucket is pinned last.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  PENDING_CHANGESET_INCLUDE,
  buildFrameRefLookup,
  shapePendingChangeset,
  type ShapedChangeset,
} from '@/lib/changesets/pending-shape';
import {
  ISSUE_PRIORITIES,
  type IssueChangePlanSummary,
  type IssuePriority,
  type IssueStatus,
} from '@/lib/issues/types';

interface BucketIssueSummary {
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

interface PendingByIssueBucket {
  /** `null` marks the synthetic "Unlinked" bucket. */
  issue: BucketIssueSummary | null;
  changesets: ShapedChangeset[];
  plans: IssueChangePlanSummary[];
  counts: {
    /** Total pending changesets in this bucket (loose + plan-bound). */
    total: number;
    /** Subset of `total` that belong to a `change_plans` row. */
    with_plan: number;
    /** Subset of `total` that are "loose" (no `change_plan_id`). */
    loose: number;
  };
}

interface PendingByIssueResponse {
  buckets: PendingByIssueBucket[];
  total_pending_changesets: number;
}

// `critical` = highest urgency. Pin issues with no priority to the
// bottom of the priority block.
const PRIORITY_RANK: Record<string, number> = ISSUE_PRIORITIES.reduce(
  (acc, p, idx) => {
    acc[p] = ISSUE_PRIORITIES.length - 1 - idx;
    return acc;
  },
  {} as Record<string, number>,
);

export async function GET(_request: NextRequest) {
  try {
    const changesets = await prisma.changesets.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'desc' },
      include: PENDING_CHANGESET_INCLUDE,
    });

    const lookup = await buildFrameRefLookup(changesets);

    // Bucket changesets by issue_id (or `null` for the synthetic
    // unlinked bucket). Insertion order doesn't matter — we sort
    // explicitly below.
    const byIssue = new Map<string | null, typeof changesets>();
    for (const cs of changesets) {
      const key = cs.issue_id ? cs.issue_id.toString() : null;
      const list = byIssue.get(key) ?? [];
      list.push(cs);
      byIssue.set(key, list);
    }

    // For every real issue id we touched, fetch the issue summary +
    // any pending/failed plans in one round-trip per group of fields.
    // We DON'T fetch all issues — only those that own at least one
    // pending changeset. Issues with zero pending changesets stay
    // invisible in this view (they belong on the Issues tab).
    const realIssueIdStrs = Array.from(byIssue.keys()).filter(
      (k): k is string => k !== null,
    );
    const realIssueIds = realIssueIdStrs.map((s) => BigInt(s));

    const issueRows = realIssueIds.length
      ? await prisma.issues.findMany({
          where: { id: { in: realIssueIds } },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            labels: true,
            assignee: true,
            created_at: true,
            updated_at: true,
          },
        })
      : [];

    const issueById = new Map<string, BucketIssueSummary>();
    for (const i of issueRows) {
      issueById.set(i.id.toString(), {
        id: i.id.toString(),
        title: i.title,
        description: i.description,
        status: i.status,
        priority: i.priority,
        labels: i.labels,
        assignee: i.assignee,
        created_at: i.created_at.toISOString(),
        updated_at: i.updated_at.toISOString(),
      });
    }

    // Pull change_plans for the same issue scope. We hide committed/
    // discarded plans here — historical plans live on the issue page.
    // The local `change_plan_status` enum doesn't include `failed`
    // (the runner's schema does), so filter to `pending` server-side
    // and let the client surface any `failed` rows that arrive in
    // the wire data.
    const planRows = realIssueIds.length
      ? await prisma.change_plans.findMany({
          where: {
            issue_id: { in: realIssueIds },
            status: 'pending',
          },
          orderBy: { created_at: 'desc' },
          include: {
            changesets: {
              select: {
                id: true,
                entity_type: true,
                entity_id: true,
                operation: true,
                status: true,
              },
              orderBy: [{ entity_type: 'asc' }, { id: 'asc' }],
            },
          },
        })
      : [];

    const plansByIssue = new Map<string, IssueChangePlanSummary[]>();
    for (const plan of planRows) {
      if (!plan.issue_id) continue;
      const key = plan.issue_id.toString();
      const summary: IssueChangePlanSummary = {
        id: plan.id.toString(),
        plan_kind: plan.plan_kind,
        summary: plan.summary,
        status: plan.status,
        created_by: plan.created_by,
        reviewed_by: plan.reviewed_by,
        reviewed_at: plan.reviewed_at ? plan.reviewed_at.toISOString() : null,
        committed_at: plan.committed_at ? plan.committed_at.toISOString() : null,
        conflict_report: plan.conflict_report as Record<string, unknown> | null,
        metadata: plan.metadata as Record<string, unknown>,
        created_at: plan.created_at.toISOString(),
        updated_at: plan.updated_at.toISOString(),
        changesets: plan.changesets.map((cs) => ({
          id: cs.id.toString(),
          entity_type: cs.entity_type,
          entity_id: cs.entity_id?.toString() ?? null,
          operation: cs.operation,
          status: cs.status,
        })),
      };
      const list = plansByIssue.get(key) ?? [];
      list.push(summary);
      plansByIssue.set(key, list);
    }

    const buckets: PendingByIssueBucket[] = [];

    for (const [issueIdKey, csList] of byIssue) {
      const issue = issueIdKey ? issueById.get(issueIdKey) ?? null : null;
      const shaped = csList.map((c) => shapePendingChangeset(c, lookup));
      const withPlan = shaped.filter((c) => c.change_plan_id).length;
      const plans = issueIdKey ? plansByIssue.get(issueIdKey) ?? [] : [];
      buckets.push({
        issue,
        changesets: shaped,
        plans,
        counts: {
          total: shaped.length,
          with_plan: withPlan,
          loose: shaped.length - withPlan,
        },
      });
    }

    // Sort: real issues first by priority desc, then most-recently
    // updated. Synthetic Unlinked bucket is pinned last.
    buckets.sort((a, b) => {
      if (a.issue === null && b.issue === null) return 0;
      if (a.issue === null) return 1;
      if (b.issue === null) return -1;
      const aRank = PRIORITY_RANK[a.issue.priority] ?? -1;
      const bRank = PRIORITY_RANK[b.issue.priority] ?? -1;
      if (aRank !== bRank) return bRank - aRank;
      return b.issue.updated_at.localeCompare(a.issue.updated_at);
    });

    const response: PendingByIssueResponse = {
      buckets,
      total_pending_changesets: changesets.length,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching pending changesets by issue:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending changesets by issue' },
      { status: 500 },
    );
  }
}
