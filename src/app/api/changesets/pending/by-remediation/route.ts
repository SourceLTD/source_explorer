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
  buildConceptRefLookup,
  shapePendingChangeset,
  type ShapedChangeset,
} from '@/lib/changesets/pending-shape';
import type { IssueChangePlanSummary } from '@/lib/issues/types';
import {
  subjectConceptForChangeset,
  subjectConceptForPlan,
  type SubjectConcept,
} from '@/components/pending/byRemediation/subjectConcept';

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

export interface EnrichedSubject {
  concept_id: string | null;
  key: string;
  label: string | null;
  archetype: string | null;
  is_new: boolean;
}

export interface PendingByRemediationResponse {
  buckets: ActionBucket[];
  total_pending_changesets: number;
  subjects_by_changeset: Record<string, EnrichedSubject>;
  subjects_by_plan: Record<string, EnrichedSubject>;
}

/**
 * Resolve the subject concept of every surfaced changeset and plan, and
 * batch-fetch each subject concept's label/archetype in one query. The
 * client uses these maps to regroup the inbox "by concept" or "by
 * concept type" without per-card fetches. Action-type grouping ignores
 * them entirely.
 */
async function buildSubjectMaps(
  shapedChangesets: ShapedChangeset[],
  plans: Iterable<IssueChangePlanSummary>,
): Promise<{
  subjects_by_changeset: Record<string, EnrichedSubject>;
  subjects_by_plan: Record<string, EnrichedSubject>;
}> {
  const raw: Array<{
    map: Record<string, EnrichedSubject>;
    id: string;
    subj: SubjectConcept;
  }> = [];

  const subjects_by_changeset: Record<string, EnrichedSubject> = {};
  const subjects_by_plan: Record<string, EnrichedSubject> = {};

  for (const cs of shapedChangesets) {
    raw.push({ map: subjects_by_changeset, id: cs.id, subj: subjectConceptForChangeset(cs) });
  }
  for (const plan of plans) {
    raw.push({ map: subjects_by_plan, id: plan.id, subj: subjectConceptForPlan(plan) });
  }

  // Batch-resolve label + archetype for the real subject concept ids that
  // the subject derivation couldn't fill in locally.
  const conceptIds = Array.from(
    new Set(
      raw
        .map((r) => r.subj.id)
        .filter((id): id is string => id != null && /^\d+$/.test(id)),
    ),
  );

  const meta = new Map<string, { label: string | null; archetype: string | null }>();
  if (conceptIds.length) {
    const rows = await prisma.concepts.findMany({
      where: { id: { in: conceptIds.map((s) => BigInt(s)) } },
      select: { id: true, label: true, code: true, archetype: true },
    });
    for (const r of rows) {
      meta.set(r.id.toString(), {
        label: r.label?.trim() || r.code?.trim() || null,
        archetype: r.archetype ?? null,
      });
    }
  }

  for (const { map, id, subj } of raw) {
    const resolved = subj.id ? meta.get(subj.id) : undefined;
    map[id] = {
      concept_id: subj.id,
      key: subj.key,
      label: subj.label ?? resolved?.label ?? null,
      archetype: subj.archetype ?? resolved?.archetype ?? null,
      is_new: subj.isNew,
    };
  }

  return { subjects_by_changeset, subjects_by_plan };
}

// ---------------------------------------------------------------------------
// Action-key helpers
// ---------------------------------------------------------------------------

const PLAN_KIND_LABELS: Record<string, string> = {
  split_frame: 'Split concept',
  merge_frame: 'Merge concepts',
  merge_sense: 'Merge senses',
  move_frame_sense: 'Move sense',
  move_frame_parent: 'Reparent concept',
  detach_parent_relation: 'Detach parent relation',
  upsert_role_mappings: 'Upsert property mappings',
  ingest_new_tbox_concept: 'Add new concept',
};

const ENTITY_LABELS: Record<string, string> = {
  frame: 'concept',
  frame_relation: 'relation',
  frame_role: 'property',
  frame_role_mapping: 'property mapping',
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
    const allPending = await prisma.changesets.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'desc' },
      include: PENDING_CHANGESET_INCLUDE,
    });

    // Collapse alternative siblings: a change with N pending alternatives
    // should appear as ONE card (the selected one, else the most recent),
    // with the in-card navigator surfacing the other alternatives. Plan
    // members are never collapsed here (a plan is one logical unit already).
    const seenGroups = new Set<string>();
    const changesets = allPending.filter((cs) => {
      // Plan members are one logical unit already; never collapse them as
      // alternatives of each other. (A plan-scoped group represents the
      // whole plan as a single alternative, not its individual changesets.)
      if (cs.change_plan_id != null) return true;
      const groupId = (cs as any).alternative_group_id as bigint | null | undefined;
      if (!groupId) return true;
      const key = groupId.toString();
      const selectedId = (cs as any).alternative_group?.selected_changeset_id as
        | bigint
        | null
        | undefined;
      // Prefer the selected alternative as the representative.
      if (selectedId != null) {
        return cs.id === selectedId;
      }
      // No selection yet: keep the first one we encounter (most recent, since
      // ordered by created_at desc).
      if (seenGroups.has(key)) return false;
      seenGroups.add(key);
      return true;
    });

    const lookup = await buildConceptRefLookup(changesets);

    // Fetch plans for plan-bound changesets.
    const allPlanIds = Array.from(
      new Set(
        changesets
          .map((cs) => cs.change_plan_id?.toString())
          .filter((id): id is string => id != null),
      ),
    );

    // Plan alternatives: a logical change may have several coexisting plans in
    // one `change_alternatives` group. We surface ONE representative plan card
    // per group (the selected plan, else the most recent) and expose the other
    // sibling plans as `alternatives` on it. Sibling plans (and their
    // changesets) are dropped from the bucket lists so the inbox shows the
    // logical change once.
    //
    // To do that we first need the group membership of every surfaced plan,
    // then we pull ALL pending plans in those groups (siblings may have no
    // surviving changeset of their own in `changesets`).
    const surfacedPlans = allPlanIds.length
      ? await prisma.change_plans.findMany({
          where: { id: { in: allPlanIds.map((s) => BigInt(s)) } },
          select: { id: true, alternative_group_id: true },
        })
      : [];

    const groupIds = Array.from(
      new Set(
        surfacedPlans
          .map((p) => (p as any).alternative_group_id as bigint | null)
          .filter((g): g is bigint => g != null)
          .map((g) => g.toString()),
      ),
    );

    // Map group -> selected_plan_id (the chosen winner, if any).
    const groupSelection = new Map<string, string | null>();
    if (groupIds.length) {
      const groups = await prisma.change_alternatives.findMany({
        where: { id: { in: groupIds.map((s) => BigInt(s)) } },
        select: { id: true, selected_plan_id: true },
      });
      for (const g of groups) {
        groupSelection.set(
          g.id.toString(),
          (g as any).selected_plan_id ? (g as any).selected_plan_id.toString() : null,
        );
      }
    }

    // Pull every pending plan in the surfaced groups (siblings included), plus
    // the originally-surfaced plans (which may be ungrouped). One findMany with
    // a union of ids.
    const planFetchIds = new Set<string>(allPlanIds);
    if (groupIds.length) {
      const siblings = await prisma.change_plans.findMany({
        where: {
          status: 'pending',
          alternative_group_id: { in: groupIds.map((s) => BigInt(s)) },
        },
        select: { id: true },
      });
      for (const s of siblings) planFetchIds.add(s.id.toString());
    }

    const planRows = planFetchIds.size
      ? await prisma.change_plans.findMany({
          where: { id: { in: Array.from(planFetchIds).map((s) => BigInt(s)) }, status: 'pending' },
          orderBy: { created_at: 'desc' },
          include: {
            changesets: {
              select: {
                id: true,
                entity_type: true,
                entity_id: true,
                operation: true,
                status: true,
                revision_number: true,
              },
              orderBy: [{ entity_type: 'asc' }, { id: 'asc' }],
            },
          },
        })
      : [];

    const planById = new Map<string, IssueChangePlanSummary>();
    // Group membership for every fetched plan, used to build representatives.
    const planGroupId = new Map<string, string | null>();
    for (const plan of planRows) {
      const groupId = (plan as any).alternative_group_id
        ? (plan as any).alternative_group_id.toString()
        : null;
      planGroupId.set(plan.id.toString(), groupId);
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
          revision_number: cs.revision_number ?? 1,
        })),
        alternative_group_id: groupId,
        selected_plan_id: groupId ? groupSelection.get(groupId) ?? null : null,
      };
      planById.set(summary.id, summary);
    }

    // Resolve the representative plan id for each group. planRows is ordered by
    // created_at desc, so the first pending plan we see in a group is the most
    // recent; the selected plan (if any) always wins.
    const groupRepresentative = new Map<string, string>();
    for (const plan of planRows) {
      const groupId = planGroupId.get(plan.id.toString());
      if (!groupId) continue;
      const selected = groupSelection.get(groupId) ?? null;
      const existing = groupRepresentative.get(groupId);
      if (selected != null) {
        groupRepresentative.set(groupId, selected);
      } else if (existing == null) {
        groupRepresentative.set(groupId, plan.id.toString());
      }
    }

    // Attach sibling alternatives to each representative summary.
    for (const [groupId, repId] of groupRepresentative) {
      const rep = planById.get(repId);
      if (!rep) continue;
      const siblings: IssueChangePlanSummary[] = [];
      for (const plan of planRows) {
        if (planGroupId.get(plan.id.toString()) !== groupId) continue;
        if (plan.id.toString() === repId) continue;
        const sib = planById.get(plan.id.toString());
        if (sib) siblings.push(sib);
      }
      rep.alternatives = siblings;
    }

    // Returns true if a plan id should be surfaced as its own card: it's
    // ungrouped, or it's the representative of its group. Sibling plans are
    // folded into the representative's `alternatives` and must not appear
    // standalone.
    const isSurfacedPlan = (planId: string | null | undefined): boolean => {
      if (planId == null) return false;
      const groupId = planGroupId.get(planId);
      if (!groupId) return true;
      return groupRepresentative.get(groupId) === planId;
    };

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

    // Flat list of every surfaced shaped changeset, reused for the
    // subject-concept enrichment after bucketing.
    const surfacedShaped: ShapedChangeset[] = [];

    for (const row of changesets) {
      const cs = shapePendingChangeset(row, lookup);

      // Plan alternatives: drop changesets that belong to a non-representative
      // sibling plan. The representative plan's card carries the siblings as
      // `alternatives`, so surfacing the sibling's changesets here would
      // duplicate the logical change.
      if (cs.change_plan_id && !isSurfacedPlan(cs.change_plan_id)) {
        continue;
      }

      surfacedShaped.push(cs);

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

    const surfacedPlanSummaries = Array.from(planById.values()).filter((p) =>
      isSurfacedPlan(p.id),
    );
    const { subjects_by_changeset, subjects_by_plan } = await buildSubjectMaps(
      surfacedShaped,
      surfacedPlanSummaries,
    );

    const response: PendingByRemediationResponse = {
      buckets,
      total_pending_changesets: buckets.reduce((sum, b) => sum + b.counts.total, 0),
      subjects_by_changeset,
      subjects_by_plan,
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
