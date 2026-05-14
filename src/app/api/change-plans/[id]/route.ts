/**
 * API Route: /api/change-plans/[id]
 *
 *   - GET    -> { plan, changesets } including conflict_report.
 *   - DELETE -> Discard the plan AND every linked pending changeset.
 *
 * Both endpoints require the caller to already be authenticated; the
 * admin-only check belongs in middleware.
 */

import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import {
  discardPlan,
  PlanNotFoundError,
} from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const planId = BigInt(id);

    const plan = await prisma.change_plans.findUnique({
      where: { id: planId },
      include: {
        changesets: {
          orderBy: [{ entity_type: 'asc' }, { id: 'asc' }],
          include: {
            field_changes: { orderBy: { id: 'asc' } },
          },
        },
      },
    });
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    return NextResponse.json({
      plan: {
        id: plan.id.toString(),
        plan_kind: plan.plan_kind,
        summary: plan.summary,
        created_by: plan.created_by,
        status: plan.status,
        reviewed_by: plan.reviewed_by,
        reviewed_at: plan.reviewed_at,
        committed_at: plan.committed_at,
        conflict_report: plan.conflict_report,
        metadata: plan.metadata,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
      },
      changesets: plan.changesets.map((cs) => ({
        id: cs.id.toString(),
        entity_type: cs.entity_type,
        entity_id: cs.entity_id?.toString() ?? null,
        operation: cs.operation,
        status: cs.status,
        before_snapshot: cs.before_snapshot,
        after_snapshot: cs.after_snapshot,
        field_changes: cs.field_changes.map((fc) => ({
          id: fc.id.toString(),
          field_name: fc.field_name,
          old_value: fc.old_value,
          new_value: fc.new_value,
          status: fc.status,
        })),
      })),
    });
  } catch (error) {
    console.error('Error fetching change plan:', error);
    return NextResponse.json({ error: 'Failed to fetch change plan' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const planId = BigInt(id);
    const userId = await getCurrentUserName();

    let result;
    try {
      result = await discardPlan(planId, userId);
    } catch (err) {
      if (err instanceof PlanNotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      throw err;
    }

    return NextResponse.json({
      success: true,
      plan_id: result.planId.toString(),
      discarded_changesets: result.discardedChangesets,
    });
  } catch (error) {
    console.error('Error discarding change plan:', error);
    return NextResponse.json({ error: 'Failed to discard change plan' }, { status: 500 });
  }
}
