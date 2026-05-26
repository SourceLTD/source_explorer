/**
 * API Route: POST /api/change-plans/bulk-commit
 *
 * Commits many pending change plans in one database transaction.
 * Duplicate parent_of proposals are discarded automatically.
 *
 * Body:
 *   { plan_ids?: string[], plan_kind?: string }
 *
 * When plan_ids is omitted, all pending plans are committed (optionally
 * filtered by plan_kind).
 */

import { NextRequest, NextResponse } from 'next/server';

import { bulkCommitPlans } from '@/lib/version-control/bulk-commit-plans';
import { getCurrentUserName } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const planIdsRaw = body.plan_ids as string[] | undefined;
    const planKind = typeof body.plan_kind === 'string' ? body.plan_kind : undefined;

    const planIds =
      Array.isArray(planIdsRaw) && planIdsRaw.length > 0
        ? planIdsRaw.map((id: string) => BigInt(id))
        : undefined;

    const userId = await getCurrentUserName();
    const result = await bulkCommitPlans({
      planIds,
      planKind,
      committedBy: userId,
    });

    if (result.error) {
      return NextResponse.json(
        {
          success: false,
          ...result,
          failed_plan_id: result.failedPlanId ?? null,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error bulk-committing change plans:', error);
    return NextResponse.json(
      { error: 'Failed to bulk-commit change plans' },
      { status: 500 },
    );
  }
}
