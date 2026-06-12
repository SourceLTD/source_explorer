/**
 * Version Control - Alternatives
 *
 * A logical "change" owns N coexisting candidate changesets ("alternatives").
 * Both UI revision (this app) and automated remediation (the health-check
 * runner) append alternatives to the same `change_alternatives` group. A
 * reviewer selects one alternative as the winner and commits it; the
 * non-selected siblings are discarded at commit time.
 *
 * This module owns the read/write helpers for the grouping table. The Prisma
 * transaction client (`Prisma.TransactionClient`) is accepted everywhere so
 * callers can compose these helpers inside their own transactions.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type {
  AlternativeGroup,
  AlternativeEntry,
  AlternativeOrigin,
  ChangesetStatus,
  FieldChangeStatus,
} from './types';

type Tx = Prisma.TransactionClient | typeof prisma;

/**
 * Resolve (or lazily create) the alternative group for an entity. If the
 * entity already has a pending group, return it; otherwise create one.
 *
 * Plan-scoped groups (alternatives are whole plans) use `changePlanId`
 * instead of an entity; pass exactly one of (entityType+entityId) or
 * changePlanId.
 */
export async function getOrCreateAlternativeGroup(
  tx: Tx,
  args: {
    entityType?: string | null;
    entityId?: bigint | null;
    changePlanId?: bigint | null;
    findingId?: bigint | null;
    createdBy: string;
  },
): Promise<bigint> {
  const client = tx as Prisma.TransactionClient;

  // Plan-scoped group.
  if (args.changePlanId != null) {
    const existing = await (client.change_alternatives as any).findFirst({
      where: { change_plan_id: args.changePlanId, status: 'pending' },
      select: { id: true },
    });
    if (existing) return existing.id as bigint;
    const created = await (client.change_alternatives as any).create({
      data: {
        change_plan_id: args.changePlanId,
        finding_id: args.findingId ?? null,
        status: 'pending',
        created_by: args.createdBy,
      },
      select: { id: true },
    });
    return created.id as bigint;
  }

  // Entity-scoped group.
  if (args.entityType == null || args.entityId == null) {
    throw new Error(
      'getOrCreateAlternativeGroup requires either changePlanId or (entityType + entityId)',
    );
  }

  const existing = await (client.change_alternatives as any).findFirst({
    where: {
      entity_type: args.entityType as any,
      entity_id: args.entityId,
      status: 'pending',
    },
    select: { id: true },
  });
  if (existing) return existing.id as bigint;

  const created = await (client.change_alternatives as any).create({
    data: {
      entity_type: args.entityType as any,
      entity_id: args.entityId,
      finding_id: args.findingId ?? null,
      status: 'pending',
      created_by: args.createdBy,
    },
    select: { id: true },
  });
  return created.id as bigint;
}

/**
 * Attach an existing changeset to an alternative group, tagging its origin.
 * If the group has no selected alternative yet, the newly-added changeset
 * becomes the default selection (so a single-alternative group is always
 * committable without an explicit select step).
 */
export async function attachChangesetToGroup(
  tx: Tx,
  args: {
    groupId: bigint;
    changesetId: bigint;
    origin: AlternativeOrigin;
    /** When true, select this changeset even if a selection already exists. */
    select?: boolean;
  },
): Promise<void> {
  const client = tx as Prisma.TransactionClient;

  await (client.changesets as any).update({
    where: { id: args.changesetId },
    data: {
      alternative_group_id: args.groupId,
      origin: args.origin,
    },
  });

  const group = await (client.change_alternatives as any).findUnique({
    where: { id: args.groupId },
    select: { selected_changeset_id: true },
  });

  if (args.select || group?.selected_changeset_id == null) {
    await (client.change_alternatives as any).update({
      where: { id: args.groupId },
      data: { selected_changeset_id: args.changesetId },
    });
  }
}

/**
 * Set the selected alternative for a group. Validates that the changeset
 * actually belongs to the group and is not discarded.
 */
export async function selectAlternative(
  tx: Tx,
  groupId: bigint,
  changesetId: bigint,
): Promise<void> {
  const client = tx as Prisma.TransactionClient;

  const cs = await (client.changesets as any).findUnique({
    where: { id: changesetId },
    select: { alternative_group_id: true, status: true },
  });
  if (!cs) throw new Error(`changeset ${changesetId} not found`);
  if (cs.alternative_group_id !== groupId) {
    throw new Error(
      `changeset ${changesetId} does not belong to alternative group ${groupId}`,
    );
  }
  if (cs.status === 'discarded') {
    throw new Error(`cannot select a discarded alternative (${changesetId})`);
  }

  await (client.change_alternatives as any).update({
    where: { id: groupId },
    data: { selected_changeset_id: changesetId },
  });
}

/**
 * Resolve the alternative group for an arbitrary changeset id. Returns the
 * full group shaped for the UI, or null if the changeset has no group (a
 * legacy ungrouped changeset).
 */
export async function getAlternativeGroupForChangeset(
  changesetId: bigint,
): Promise<AlternativeGroup | null> {
  const cs = await (prisma.changesets as any).findUnique({
    where: { id: changesetId },
    select: { alternative_group_id: true },
  });
  if (!cs) return null;

  const groupId = cs.alternative_group_id as bigint | null;
  if (groupId == null) {
    // Legacy / ungrouped: represent as a singleton group with no group id.
    const single = await (prisma.changesets as any).findUnique({
      where: { id: changesetId },
      include: { field_changes: true },
    });
    if (!single) return null;
    return {
      group_id: null,
      current_id: changesetId.toString(),
      selected_changeset_id: changesetId.toString(),
      total_alternatives: 1,
      alternatives: [shapeAlternative(single, 1)],
    };
  }

  const group = await (prisma.change_alternatives as any).findUnique({
    where: { id: groupId },
    include: {
      alternatives: {
        include: { field_changes: true },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!group) return null;

  const alternatives: AlternativeEntry[] = group.alternatives.map(
    (cs: any, idx: number) => shapeAlternative(cs, idx + 1),
  );

  return {
    group_id: groupId.toString(),
    current_id: changesetId.toString(),
    selected_changeset_id: group.selected_changeset_id?.toString() ?? null,
    total_alternatives: alternatives.length,
    alternatives,
  };
}

function shapeAlternative(cs: any, ordinal: number): AlternativeEntry {
  return {
    id: cs.id.toString(),
    label: cs.revision_prompt ?? null,
    origin: (cs.origin ?? 'manual') as AlternativeOrigin,
    created_by: cs.created_by,
    created_at: cs.created_at.toISOString(),
    status: cs.status as ChangesetStatus,
    revision_number: cs.revision_number ?? ordinal,
    field_changes: (cs.field_changes ?? []).map((fc: any) => ({
      field_name: fc.field_name,
      old_value: fc.old_value,
      new_value: fc.new_value,
      status: fc.status as FieldChangeStatus,
    })),
  };
}

/**
 * Discard all non-selected alternatives in a group (called at commit time).
 * Returns the ids of the changesets that were discarded.
 */
export async function discardSiblingAlternatives(
  tx: Tx,
  groupId: bigint,
  keepChangesetId: bigint,
): Promise<bigint[]> {
  const client = tx as Prisma.TransactionClient;

  const siblings = await (client.changesets as any).findMany({
    where: {
      alternative_group_id: groupId,
      id: { not: keepChangesetId },
      status: 'pending',
    },
    select: { id: true },
  });

  const ids: bigint[] = siblings.map((s: any) => s.id as bigint);
  if (ids.length > 0) {
    await (client.changesets as any).updateMany({
      where: { id: { in: ids } },
      data: { status: 'discarded' },
    });
  }
  return ids;
}

/**
 * Count pending alternatives in a group (used for max-alternatives guard).
 */
export async function countPendingAlternatives(
  tx: Tx,
  groupId: bigint,
): Promise<number> {
  const client = tx as Prisma.TransactionClient;
  return (client.changesets as any).count({
    where: { alternative_group_id: groupId, status: 'pending' },
  });
}

// ---------------------------------------------------------------------------
// Plan-level alternatives
//
// A group can also own N whole plans as alternatives (e.g. two competing
// reparent strategies for the same concept). The winning plan is recorded on
// `change_alternatives.selected_plan_id`. Committing a plan discards the
// group's sibling plans and their changesets.
// ---------------------------------------------------------------------------

/**
 * Set the selected plan alternative for a group. Validates that the plan
 * actually belongs to the group and is still pending.
 */
export async function selectPlanAlternative(
  tx: Tx,
  groupId: bigint,
  planId: bigint,
): Promise<void> {
  const client = tx as Prisma.TransactionClient;

  const plan = await (client.change_plans as any).findUnique({
    where: { id: planId },
    select: { alternative_group_id: true, status: true },
  });
  if (!plan) throw new Error(`change plan ${planId} not found`);
  if (plan.alternative_group_id !== groupId) {
    throw new Error(
      `change plan ${planId} does not belong to alternative group ${groupId}`,
    );
  }
  if (plan.status === 'discarded') {
    throw new Error(`cannot select a discarded plan alternative (${planId})`);
  }

  await (client.change_alternatives as any).update({
    where: { id: groupId },
    data: { selected_plan_id: planId },
  });
}

/**
 * Resolve the alternative group id a plan belongs to (via the plan FK, falling
 * back to the legacy `change_plan_id` column for groups created before the
 * plan-alternatives migration). Returns null for ungrouped plans.
 */
export async function getGroupIdForPlan(
  tx: Tx,
  planId: bigint,
): Promise<bigint | null> {
  const client = tx as Prisma.TransactionClient;
  const plan = await (client.change_plans as any).findUnique({
    where: { id: planId },
    select: { alternative_group_id: true },
  });
  if (plan?.alternative_group_id != null) {
    return plan.alternative_group_id as bigint;
  }
  // Legacy fallback: a group that still references this plan via change_plan_id.
  const legacy = await (client.change_alternatives as any).findFirst({
    where: { change_plan_id: planId, status: 'pending' },
    select: { id: true },
  });
  return (legacy?.id as bigint | undefined) ?? null;
}

/**
 * Finalize a plan-scoped alternative group when one of its plans commits:
 *   1. mark the winning plan selected + the group committed,
 *   2. discard every sibling plan in the group (status='discarded'),
 *   3. discard every changeset belonging to a sibling plan in the group.
 *
 * No-op for ungrouped plans. Safe to call inside the plan-commit transaction.
 */
export async function finalizePlanAlternativeGroupInTx(
  tx: Tx,
  planId: bigint,
): Promise<void> {
  const client = tx as Prisma.TransactionClient;

  const groupId = await getGroupIdForPlan(client, planId);
  if (groupId == null) return;

  // Discard the changesets of every sibling plan in this group. Sibling plan
  // members share the group's alternative_group_id but have a different
  // change_plan_id.
  const siblingChangesets = await (client.changesets as any).findMany({
    where: {
      alternative_group_id: groupId,
      change_plan_id: { not: planId },
      status: 'pending',
    },
    select: { id: true },
  });
  const siblingChangesetIds = siblingChangesets.map((c: { id: bigint }) => c.id);

  if (siblingChangesetIds.length > 0) {
    await (client.changesets as any).updateMany({
      where: { id: { in: siblingChangesetIds } },
      data: { status: 'discarded' },
    });
    // Reject their pending field_changes so the pending list reflects removal.
    await (client.field_changes as any).updateMany({
      where: { changeset_id: { in: siblingChangesetIds }, status: 'pending' },
      data: { status: 'rejected' },
    });
  }

  // Discard the sibling plans themselves.
  await (client.change_plans as any).updateMany({
    where: {
      alternative_group_id: groupId,
      id: { not: planId },
      status: 'pending',
    },
    data: { status: 'discarded' },
  });

  // Mark the group committed with this plan as the winner.
  await (client.change_alternatives as any).update({
    where: { id: groupId },
    data: { status: 'committed', selected_plan_id: planId },
  });
}
