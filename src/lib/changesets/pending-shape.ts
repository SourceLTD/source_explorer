/**
 * Shared row-shaping helpers for pending-changeset API endpoints.
 *
 * Both `/api/changesets/pending` (flat-table view) and
 * `/api/changesets/pending/by-issue` (grouped-by-issue view) need to
 * return the *same* changeset shape so the UI can reuse rendering and
 * action helpers. This module owns:
 *
 *   1. The Prisma include shape (`PENDING_CHANGESET_INCLUDE`).
 *   2. The frame_id display-decoration lookup (`buildFrameRefLookup`).
 *   3. Per-row conversion to the wire format (`shapePendingChangeset`).
 *
 * Keep these in lockstep with `Changeset` in
 * `src/components/PendingChangesList.tsx` and the new by-issue view —
 * any field added here should land in both clients.
 */
import { prisma } from '@/lib/prisma';

const FRAME_REF_FIELDS = new Set(['frame_id']);

export interface ShapedFieldChange {
  id: string;
  changeset_id: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  old_display?: string;
  new_display?: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
}

export interface ShapedChangesetIssue {
  id: string;
  title: string;
  status: string;
  priority: string;
}

export interface ShapedChangeset {
  id: string;
  entity_type: string;
  entity_id: string | null;
  operation: string;
  entity_version: number | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  status: string;
  created_by: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  committed_at: string | null;
  llm_job_id: string | null;
  issue_id: string | null;
  /**
   * v2: when set, this changeset belongs to an N-step `change_plans` row
   * and the UI should render it inside the parent plan card. v1 single-
   * entity remediation strategies leave this null.
   */
  change_plan_id: string | null;
  /** Plan kind hint duplicated here so the list view can colour-code rows. */
  change_plan_kind: string | null;
  issue: ShapedChangesetIssue | null;
  field_changes: ShapedFieldChange[];
}

/**
 * Prisma include shape consumed by every pending-changeset endpoint.
 * Co-located with the row-shaper so the include and the consumer can
 * never drift.
 */
export const PENDING_CHANGESET_INCLUDE = {
  field_changes: true,
  llm_jobs: {
    select: {
      id: true,
      label: true,
      status: true,
      submitted_by: true,
    },
  },
  issues: {
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
    },
  },
  change_plan: {
    select: {
      id: true,
      plan_kind: true,
      status: true,
    },
  },
} as const;

export interface FrameRefLookup {
  /** Decorate a raw frame-ref value (positive id or `-changeset_id` virtual id). */
  displayForFrameRef(raw: string | null): string | null;
}

function normalizeIntLike(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return /^-?\d+$/.test(trimmed) ? trimmed : null;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return null;
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  return null;
}

function pickSnapshotName(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  if (Array.isArray(snapshot)) return null;
  const rec = snapshot as Record<string, unknown>;
  const code = rec.code;
  if (typeof code === 'string' && code.trim() !== '') return code.trim();
  const label = rec.label;
  if (typeof label === 'string' && label.trim() !== '') return label.trim();
  return null;
}

function pickFrameName(frame: { code: string | null; label: string }): string {
  const code = typeof frame.code === 'string' ? frame.code.trim() : '';
  if (code) return code;
  const label = frame.label.trim();
  if (label) return label;
  return 'Unknown';
}

/**
 * Walk every field-change in `rows`, collect the frame ids referenced
 * by `frame_id` fields, and resolve them to display names. Virtual
 * negative ids point at create-changesets whose `after_snapshot.code`
 * (or `.label`) we surface as a "(pending)" hint.
 */
export async function buildFrameRefLookup(
  rows: Array<{ field_changes: Array<{ field_name: string; old_value: unknown; new_value: unknown }> }>,
): Promise<FrameRefLookup> {
  const positiveFrameIds = new Set<string>();
  const virtualCreateChangesetIds = new Set<string>();

  for (const cs of rows) {
    for (const fc of cs.field_changes) {
      if (!FRAME_REF_FIELDS.has(fc.field_name)) continue;
      for (const v of [fc.old_value, fc.new_value]) {
        const raw = normalizeIntLike(v);
        if (!raw) continue;
        if (/^\d+$/.test(raw)) positiveFrameIds.add(raw);
        else if (/^-\d+$/.test(raw)) virtualCreateChangesetIds.add(raw.slice(1));
      }
    }
  }

  const frameIdToName = new Map<string, string>();
  if (positiveFrameIds.size > 0) {
    const ids = Array.from(positiveFrameIds, (s) => BigInt(s));
    const frames = await prisma.frames.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, label: true },
    });
    for (const f of frames) {
      frameIdToName.set(f.id.toString(), pickFrameName(f));
    }
  }

  const createChangesetIdToName = new Map<string, string>();
  if (virtualCreateChangesetIds.size > 0) {
    const ids = Array.from(virtualCreateChangesetIds, (s) => BigInt(s));
    const createChangesets = await prisma.changesets.findMany({
      where: { id: { in: ids } },
      select: { id: true, entity_type: true, operation: true, after_snapshot: true },
    });
    for (const cs of createChangesets) {
      const name = pickSnapshotName(cs.after_snapshot);
      if (name) createChangesetIdToName.set(cs.id.toString(), name);
    }
  }

  return {
    displayForFrameRef(raw: string | null): string | null {
      if (!raw) return null;
      if (/^\d+$/.test(raw)) {
        const name = frameIdToName.get(raw) ?? 'Unknown';
        return `${name} (#${raw})`;
      }
      if (/^-\d+$/.test(raw)) {
        const createId = raw.slice(1);
        const name = createChangesetIdToName.get(createId) ?? 'Unknown';
        return `${name} (${raw}) (pending)`;
      }
      return null;
    },
  };
}

/**
 * Loose typing of the Prisma row we accept. Using a structural type
 * avoids leaking Prisma's generated types across the lib boundary
 * while still letting both endpoints reuse this helper.
 */
interface PendingChangesetRow {
  id: bigint;
  entity_type: string;
  entity_id: bigint | null;
  operation: string;
  entity_version: number | null;
  before_snapshot: unknown;
  after_snapshot: unknown;
  status: string;
  created_by: string;
  created_at: Date;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  committed_at: Date | null;
  llm_job_id: bigint | null;
  issue_id: bigint | null;
  change_plan_id: bigint | null;
  change_plan: { id: bigint; plan_kind: string; status: string } | null;
  issues: { id: bigint; title: string; status: string; priority: string } | null;
  field_changes: Array<{
    id: bigint;
    changeset_id: bigint;
    field_name: string;
    old_value: unknown;
    new_value: unknown;
    status: string;
    approved_by: string | null;
    approved_at: Date | null;
    rejected_by: string | null;
    rejected_at: Date | null;
  }>;
}

/**
 * Convert a Prisma row + the precomputed frame-ref lookup into the
 * wire shape consumed by every pending-changeset client.
 */
export function shapePendingChangeset(
  row: PendingChangesetRow,
  lookup: FrameRefLookup,
): ShapedChangeset {
  return {
    id: row.id.toString(),
    entity_type: row.entity_type,
    entity_id: row.entity_id?.toString() ?? null,
    operation: row.operation,
    entity_version: row.entity_version,
    before_snapshot: row.before_snapshot as Record<string, unknown> | null,
    after_snapshot: row.after_snapshot as Record<string, unknown> | null,
    status: row.status,
    created_by: row.created_by,
    created_at: row.created_at.toISOString(),
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at?.toISOString() ?? null,
    committed_at: row.committed_at?.toISOString() ?? null,
    llm_job_id: row.llm_job_id?.toString() ?? null,
    issue_id: row.issue_id?.toString() ?? null,
    change_plan_id: row.change_plan_id?.toString() ?? null,
    change_plan_kind: row.change_plan?.plan_kind ?? null,
    issue: row.issues
      ? {
          id: row.issues.id.toString(),
          title: row.issues.title,
          status: row.issues.status,
          priority: row.issues.priority,
        }
      : null,
    field_changes: row.field_changes.map((fc) => {
      const shouldDecorate = FRAME_REF_FIELDS.has(fc.field_name);
      const oldRaw = shouldDecorate ? normalizeIntLike(fc.old_value) : null;
      const newRaw = shouldDecorate ? normalizeIntLike(fc.new_value) : null;
      const oldDisplay = shouldDecorate ? lookup.displayForFrameRef(oldRaw) : null;
      const newDisplay = shouldDecorate ? lookup.displayForFrameRef(newRaw) : null;

      return {
        id: fc.id.toString(),
        changeset_id: fc.changeset_id.toString(),
        field_name: fc.field_name,
        old_value: fc.old_value,
        new_value: fc.new_value,
        old_display: oldDisplay ?? undefined,
        new_display: newDisplay ?? undefined,
        status: fc.status,
        approved_by: fc.approved_by,
        approved_at: fc.approved_at?.toISOString() ?? null,
        rejected_by: fc.rejected_by,
        rejected_at: fc.rejected_at?.toISOString() ?? null,
      };
    }),
  };
}
