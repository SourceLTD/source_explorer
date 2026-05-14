/**
 * API Route: /api/changesets/pending/by-remediation
 *
 * GET - Fetch all pending changesets bucketed by the *type of action*
 * they represent, with each action bucket further subdivided into
 * health-check sub-groups keyed by diagnosis code.
 *
 * Action key derivation:
 *   - If the changeset belongs to a `change_plans` row  → use `plan_kind`
 *     (e.g. `move_frame_parent`, `merge_frame`).
 *   - Otherwise                                         → use
 *     `<operation>/<entity_type>` (e.g. `update/frame`, `create/frame_role`).
 *
 * Response shape:
 *   {
 *     buckets: ActionBucket[],
 *     total_pending_changesets: number,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  PENDING_CHANGESET_INCLUDE,
  buildFrameRefLookup,
  shapePendingChangeset,
  type ShapedChangeset,
} from '@/lib/changesets/pending-shape';
import type { IssueChangePlanSummary } from '@/lib/issues/types';

export interface HealthCheckSubGroup {
  diagnosis_code: string | null;
  diagnosis_label: string | null;
  severity: string | null;
  changesets: ShapedChangeset[];
  plans: IssueChangePlanSummary[];
  counts: {
    total: number;
    with_plan: number;
    loose: number;
  };
}

export interface ActionBucket {
  action_key: string;
  action_label: string;
  health_check_groups: HealthCheckSubGroup[];
  changesets: ShapedChangeset[];
  plans: IssueChangePlanSummary[];
  counts: {
    total: number;
    with_plan: number;
    loose: number;
  };
}

export interface PendingByRemediationResponse {
  buckets: ActionBucket[];
  total_pending_changesets: number;
}

// ---------------------------------------------------------------------------
// Action-key helpers
// ---------------------------------------------------------------------------

const PLAN_KIND_LABELS: Record<string, string> = {
  split_frame: 'Split frame',
  merge_frame: 'Merge frames',
  merge_sense: 'Merge frame senses',
  move_frame_sense: 'Move frame sense',
  move_frame_parent: 'Reparent frame',
  detach_parent_relation: 'Detach parent relation',
  upsert_role_mappings: 'Upsert role mappings',
};

const ENTITY_LABELS: Record<string, string> = {
  frame: 'frame',
  frame_relation: 'relation',
  frame_role: 'frame role',
  frame_role_mapping: 'role mapping',
  frame_sense: 'sense',
};

const OPERATION_VERB: Record<string, string> = {
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  move: 'Move',
  merge: 'Merge',
};

function deriveActionKey(cs: ShapedChangeset): string {
  if (cs.change_plan_kind) return cs.change_plan_kind;
  return `${cs.operation}/${cs.entity_type}`;
}

function deriveActionLabel(cs: ShapedChangeset): string {
  if (cs.change_plan_kind) {
    return PLAN_KIND_LABELS[cs.change_plan_kind] ?? cs.change_plan_kind.replace(/_/g, ' ');
  }
  const verb = OPERATION_VERB[cs.operation] ?? (cs.operation.charAt(0).toUpperCase() + cs.operation.slice(1));
  const noun = ENTITY_LABELS[cs.entity_type] ?? cs.entity_type.replace(/_/g, ' ');
  return `${verb} ${noun}`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest) {
  try {
    const changesets = await prisma.changesets.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'desc' },
      include: PENDING_CHANGESET_INCLUDE,
    });

    const lookup = await buildFrameRefLookup(changesets);

    // Fetch plans for plan-bound changesets.
    const allPlanIds = Array.from(
      new Set(
        changesets
          .map((cs) => cs.change_plan_id?.toString())
          .filter((id): id is string => id != null),
      ),
    );

    const planRows = allPlanIds.length
      ? await prisma.change_plans.findMany({
          where: { id: { in: allPlanIds.map((s) => BigInt(s)) }, status: 'pending' },
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

    const planById = new Map<string, IssueChangePlanSummary>();
    for (const plan of planRows) {
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
      planById.set(summary.id, summary);
    }

    // Bucket changesets by action key.
    const byAction = new Map<
      string,
      {
        label: string;
        byDiag: Map<
          string | null,
          {
            diagCode: string | null;
            diagLabel: string | null;
            severity: string | null;
            changesets: ShapedChangeset[];
            planIds: Set<string>;
          }
        >;
        allChangesets: ShapedChangeset[];
      }
    >();

    for (const row of changesets) {
      const cs = shapePendingChangeset(row, lookup);
      const actionKey = deriveActionKey(cs);
      const actionLabel = deriveActionLabel(cs);

      let actionBucket = byAction.get(actionKey);
      if (!actionBucket) {
        actionBucket = { label: actionLabel, byDiag: new Map(), allChangesets: [] };
        byAction.set(actionKey, actionBucket);
      }
      actionBucket.allChangesets.push(cs);

      // Use a null diagnosis code group for all changesets (since issues are removed).
      const diagCode: string | null = null;

      let diagGroup = actionBucket.byDiag.get(diagCode);
      if (!diagGroup) {
        diagGroup = {
          diagCode,
          diagLabel: null,
          severity: null,
          changesets: [],
          planIds: new Set(),
        };
        actionBucket.byDiag.set(diagCode, diagGroup);
      }
      diagGroup.changesets.push(cs);

      if (cs.change_plan_id) {
        diagGroup.planIds.add(cs.change_plan_id);
      }
    }

    const buckets: ActionBucket[] = [];

    for (const [actionKey, actionBucket] of byAction) {
      const healthCheckGroups: HealthCheckSubGroup[] = [];

      for (const dg of actionBucket.byDiag.values()) {
        const subGroupPlans = Array.from(dg.planIds)
          .map((id) => planById.get(id))
          .filter((p): p is IssueChangePlanSummary => p != null);

        const withPlan = dg.changesets.filter((c) => c.change_plan_id).length;

        healthCheckGroups.push({
          diagnosis_code: dg.diagCode,
          diagnosis_label: dg.diagLabel,
          severity: dg.severity,
          changesets: dg.changesets,
          plans: subGroupPlans,
          counts: {
            total: dg.changesets.length,
            with_plan: withPlan,
            loose: dg.changesets.length - withPlan,
          },
        });
      }

      const allPlanIdsForBucket = new Set(
        actionBucket.allChangesets.map((c) => c.change_plan_id).filter((id): id is string => id != null),
      );
      const allPlans = Array.from(allPlanIdsForBucket)
        .map((id) => planById.get(id))
        .filter((p): p is IssueChangePlanSummary => p != null);

      const withPlanTotal = actionBucket.allChangesets.filter((c) => c.change_plan_id).length;

      buckets.push({
        action_key: actionKey,
        action_label: actionBucket.label,
        health_check_groups: healthCheckGroups,
        changesets: actionBucket.allChangesets,
        plans: allPlans,
        counts: {
          total: actionBucket.allChangesets.length,
          with_plan: withPlanTotal,
          loose: actionBucket.allChangesets.length - withPlanTotal,
        },
      });
    }

    buckets.sort((a, b) => {
      const aIsPlan = !a.action_key.includes('/');
      const bIsPlan = !b.action_key.includes('/');
      if (aIsPlan !== bIsPlan) return aIsPlan ? -1 : 1;
      if (b.counts.total !== a.counts.total) return b.counts.total - a.counts.total;
      return a.action_label.localeCompare(b.action_label);
    });

    const response: PendingByRemediationResponse = {
      buckets,
      total_pending_changesets: changesets.length,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching pending changesets by remediation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending changesets by remediation' },
      { status: 500 },
    );
  }
}
