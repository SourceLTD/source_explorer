/**
 * API Route: /api/change-plans/[id]/select
 *
 * POST — Mark this plan as the selected alternative within its group. The
 * selected plan is the one applied when committed; sibling plans (and their
 * changesets) are discarded at commit time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  selectPlanAlternative,
  getGroupIdForPlan,
} from '@/lib/version-control/alternatives';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const planId = BigInt(id);

    const plan = await prisma.change_plans.findUnique({
      where: { id: planId },
      select: { id: true },
    });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const groupId = await getGroupIdForPlan(prisma, planId);
    if (groupId == null) {
      return NextResponse.json(
        { error: 'This plan is not part of an alternative group' },
        { status: 400 },
      );
    }

    await selectPlanAlternative(prisma, groupId, planId);

    return NextResponse.json(
      {
        group_id: groupId.toString(),
        selected_plan_id: planId.toString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[API] Error selecting plan alternative:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to select plan alternative' },
      { status: 500 },
    );
  }
}
