/**
 * Helpers for emitting and reading issue timeline events.
 *
 * The timeline is a chronological merge of:
 *   - `issue_comments`  (user comments)
 *   - `issue_events`    (activity: status changes, linked changesets, commits, ...)
 *
 * We keep emission best-effort: if an event fails to insert, we log and carry
 * on rather than failing the originating mutation. Events are ancillary UX
 * context — it's better to lose a log line than to abort a user's save.
 */

import { prisma } from '@/lib/prisma';
import type { issue_event_type, Prisma } from '@prisma/client';

export type IssueEventType = issue_event_type;

export interface EmitEventInput {
  issueId: bigint;
  actor: string;
  eventType: IssueEventType;
  metadata?: Record<string, unknown>;
}

export async function emitIssueEvent(input: EmitEventInput): Promise<void> {
  try {
    await prisma.issue_events.create({
      data: {
        issue_id: input.issueId,
        actor: input.actor,
        event_type: input.eventType,
        metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Best-effort: log but don't throw. The caller's mutation must still succeed.
    console.error('[issues] Failed to emit event', input.eventType, err);
  }
}

/**
 * Emit multiple events sequentially. Used when a single PATCH changes several
 * fields and we want one event per field.
 */
export async function emitIssueEvents(events: EmitEventInput[]): Promise<void> {
  for (const ev of events) {
    // Small sequential loop — ordering matters for the timeline and the
    // volume per request is tiny (usually 1–3 events).
    // eslint-disable-next-line no-await-in-loop
    await emitIssueEvent(ev);
  }
}

/**
 * Compute diff events from an issue PATCH. `before` is the row as it existed
 * prior to update; `after` is the just-updated row. Only changed fields emit
 * events, and {open|in_progress} ↔ {closed|resolved} transitions also emit
 * the higher-level `opened`/`closed`/`reopened` event.
 */
export function buildIssuePatchEvents(
  issueId: bigint,
  actor: string,
  before: {
    title: string;
    description: string | null;
    status: string;
    priority: string;
    labels: string[];
    assignee: string | null;
  },
  after: {
    title: string;
    description: string | null;
    status: string;
    priority: string;
    labels: string[];
    assignee: string | null;
  },
): EmitEventInput[] {
  const events: EmitEventInput[] = [];

  if (before.status !== after.status) {
    events.push({
      issueId,
      actor,
      eventType: 'status_changed',
      metadata: { from: before.status, to: after.status },
    });

    const wasTerminal = before.status === 'closed' || before.status === 'resolved';
    const isTerminal = after.status === 'closed' || after.status === 'resolved';
    if (!wasTerminal && isTerminal) {
      events.push({
        issueId,
        actor,
        eventType: 'closed',
        metadata: { to: after.status },
      });
    } else if (wasTerminal && !isTerminal) {
      events.push({
        issueId,
        actor,
        eventType: 'reopened',
        metadata: { to: after.status },
      });
    }
  }

  if (before.priority !== after.priority) {
    events.push({
      issueId,
      actor,
      eventType: 'priority_changed',
      metadata: { from: before.priority, to: after.priority },
    });
  }

  if (before.title !== after.title) {
    events.push({
      issueId,
      actor,
      eventType: 'title_changed',
      metadata: { from: before.title, to: after.title },
    });
  }

  if ((before.description ?? '') !== (after.description ?? '')) {
    events.push({
      issueId,
      actor,
      eventType: 'description_changed',
      // Don't store old/new description contents: they can be large and the
      // actual content is already the current issue state. A bare event is
      // enough to surface "X updated the description".
    });
  }

  if (before.assignee !== after.assignee) {
    events.push({
      issueId,
      actor,
      eventType: 'assignee_changed',
      metadata: { from: before.assignee, to: after.assignee },
    });
  }

  const beforeLabels = new Set(before.labels);
  const afterLabels = new Set(after.labels);
  const added = [...afterLabels].filter((l) => !beforeLabels.has(l));
  const removed = [...beforeLabels].filter((l) => !afterLabels.has(l));
  if (added.length > 0 || removed.length > 0) {
    events.push({
      issueId,
      actor,
      eventType: 'labels_changed',
      metadata: { added, removed },
    });
  }

  return events;
}

/**
 * Emit `changeset_unlinked` / `changeset_linked` events when a changeset's
 * `issue_id` changes. Fires an event on *both* the old and new issue so the
 * timelines stay coherent.
 */
export async function emitChangesetLinkChangeEvents(args: {
  actor: string;
  changesetId: bigint;
  previousIssueId: bigint | null;
  newIssueId: bigint | null;
  changesetSummary?: {
    entity_type: string;
    entity_id: string | null;
    operation: string;
  };
}): Promise<void> {
  const { actor, changesetId, previousIssueId, newIssueId, changesetSummary } = args;

  if (previousIssueId === newIssueId) return;

  const metadata = {
    changeset_id: changesetId.toString(),
    ...(changesetSummary ?? {}),
  };

  const events: EmitEventInput[] = [];
  if (previousIssueId !== null) {
    events.push({
      issueId: previousIssueId,
      actor,
      eventType: 'changeset_unlinked',
      metadata,
    });
  }
  if (newIssueId !== null) {
    events.push({
      issueId: newIssueId,
      actor,
      eventType: 'changeset_linked',
      metadata,
    });
  }

  await emitIssueEvents(events);
}

/**
 * Emit a `changeset_committed` or `changeset_discarded` event for each of the
 * given changeset ids that is linked to an issue. Lookup is done in one query
 * to keep this cheap for bulk operations.
 */
export async function emitChangesetStatusEvents(args: {
  actor: string;
  changesetIds: Array<bigint | string | number>;
  eventType: Extract<IssueEventType, 'changeset_committed' | 'changeset_discarded'>;
}): Promise<void> {
  const { actor, changesetIds, eventType } = args;
  if (changesetIds.length === 0) return;

  const normalizedIds: bigint[] = [];
  for (const id of changesetIds) {
    try {
      normalizedIds.push(typeof id === 'bigint' ? id : BigInt(id as string | number));
    } catch {
      // skip malformed ids
    }
  }
  if (normalizedIds.length === 0) return;

  let rows: Array<{
    id: bigint;
    issue_id: bigint | null;
    entity_type: string;
    entity_id: bigint | null;
    operation: string;
  }>;
  try {
    rows = await prisma.changesets.findMany({
      where: {
        id: { in: normalizedIds },
        issue_id: { not: null },
      },
      select: {
        id: true,
        issue_id: true,
        entity_type: true,
        entity_id: true,
        operation: true,
      },
    });
  } catch (err) {
    console.error('[issues] Failed to fetch changesets for event emission', err);
    return;
  }

  const events: EmitEventInput[] = rows
    .filter((r) => r.issue_id !== null)
    .map((r) => ({
      issueId: r.issue_id as bigint,
      actor,
      eventType,
      metadata: {
        changeset_id: r.id.toString(),
        entity_type: r.entity_type,
        entity_id: r.entity_id?.toString() ?? null,
        operation: r.operation,
      },
    }));

  await emitIssueEvents(events);
}
