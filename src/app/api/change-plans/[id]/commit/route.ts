/**
 * API Route: POST /api/change-plans/[id]/commit
 *
 * Commits every linked changeset in `change_plans.id = :id` in
 * deterministic dependency order. Returns:
 *
 *   - 200 with `{ success: true, committed: N }` on full success.
 *   - 409 with `{ success: false, conflict_report: ..., errors: ... }`
 *     when any linked changeset failed to commit. The `conflict_report`
 *     field is also persisted on `change_plans.conflict_report` so the
 *     UI can re-render without an extra round trip.
 *   - 404 when the plan id does not exist.
 *   - 422 when the plan is not in `pending` status.
 *
 * Like the per-changeset commit endpoint, this should be restricted to
 * admin users; the explicit check is wired in the parent middleware.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  commitPlan,
  PlanNotFoundError,
  PlanNotPendingError,
} from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';
import { emitChangesetStatusEvents } from '@/lib/issues/events';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const planId = BigInt(id);
    const userId = await getCurrentUserName();

    let result;
    try {
      result = await commitPlan(planId, userId);
    } catch (err) {
      if (err instanceof PlanNotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      if (err instanceof PlanNotPendingError) {
        return NextResponse.json(
          { error: err.message, status: err.status },
          { status: 422 },
        );
      }
      throw err;
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          plan_id: planId.toString(),
          attempted: result.attempted,
          committed: result.committed,
          conflict_report: result.conflictReport,
          errors: result.errors.map((e) => ({
            ...e,
            changeset_id: e.changeset_id.toString(),
            entity_id: e.entity_id?.toString() ?? null,
          })),
        },
        { status: 409 },
      );
    }

    // Walk the linked changeset ids in the success path so issue events
    // render correctly. We re-fetch lazily because commitPlan already
    // serialised them and we don't want to plumb that through its return.
    const { prisma } = await import('@/lib/prisma');
    const linked = await prisma.changesets.findMany({
      where: { change_plan_id: planId },
      select: { id: true },
    });
    void emitChangesetStatusEvents({
      actor: userId,
      changesetIds: linked.map((c) => c.id),
      eventType: 'changeset_committed',
    });

    return NextResponse.json({
      success: true,
      plan_id: planId.toString(),
      committed: result.committed,
    });
  } catch (error) {
    console.error('Error committing change plan:', error);
    return NextResponse.json(
      { error: 'Failed to commit change plan' },
      { status: 500 },
    );
  }
}
