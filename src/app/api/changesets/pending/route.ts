/**
 * API Route: /api/changesets/pending
 * 
 * GET - Get all pending changesets grouped by:
 *   - LLM job (if llm_job_id is set)
 *   - User (if llm_job_id is null - manual changes)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const FRAME_REF_FIELDS = new Set(['frame_id', 'super_frame_id']);

interface FieldChange {
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

interface Changeset {
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
  field_changes: FieldChange[];
}

interface ChangesetsByType {
  entity_type: string;
  changesets: Changeset[];
}

interface LlmJobGroup {
  type: 'llm_job';
  llm_job_id: string;
  llm_job: {
    id: string;
    label: string | null;
    status: string;
    submitted_by: string | null;
  } | null;
  changesets_by_type: ChangesetsByType[];
  total_changesets: number;
}

interface ManualGroup {
  type: 'manual';
  created_by: string;
  changesets_by_type: ChangesetsByType[];
  total_changesets: number;
}

type ChangeGroup = LlmJobGroup | ManualGroup;

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

export async function GET(request: NextRequest) {
  try {
    // Get all pending changesets with their field changes and llm_job info
    const changesets = await prisma.changesets.findMany({
      where: {
        status: 'pending',
      },
      orderBy: { created_at: 'desc' },
      include: {
        field_changes: true,
        llm_jobs: {
          select: {
            id: true,
            label: true,
            status: true,
            submitted_by: true,
          },
        },
      },
    });

    // Build display lookups for frame_id/super_frame_id so the UI can show codes instead of raw ints.
    const positiveFrameIds = new Set<string>();
    const virtualCreateChangesetIds = new Set<string>(); // positive changeset id (virtual id = -changeset_id)

    for (const cs of changesets) {
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

    const frameIdToName = new Map<string, string>(); // id -> code/label
    if (positiveFrameIds.size > 0) {
      const ids = Array.from(positiveFrameIds, s => BigInt(s));
      const frames = await prisma.frames.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true, label: true },
      });
      for (const f of frames) {
        frameIdToName.set(f.id.toString(), pickFrameName(f));
      }
    }

    const createChangesetIdToName = new Map<string, string>(); // create-changeset-id -> code/label
    if (virtualCreateChangesetIds.size > 0) {
      const ids = Array.from(virtualCreateChangesetIds, s => BigInt(s));
      const createChangesets = await prisma.changesets.findMany({
        where: { id: { in: ids } },
        select: { id: true, entity_type: true, operation: true, after_snapshot: true },
      });
      for (const cs of createChangesets) {
        // Only frames are expected here, but we can safely fall back for any snapshot with code/label.
        const name = pickSnapshotName(cs.after_snapshot);
        if (name) createChangesetIdToName.set(cs.id.toString(), name);
      }
    }

    const displayForFrameRef = (raw: string | null): string | null => {
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
    };

    // Group by llm_job_id (for LLM changes) or created_by (for manual changes)
    const llmJobGroups = new Map<string, {
      llm_job: typeof changesets[0]['llm_jobs'];
      changesets: typeof changesets;
    }>();
    const manualGroups = new Map<string, typeof changesets>();

    for (const cs of changesets) {
      if (cs.llm_job_id) {
        const jobIdStr = cs.llm_job_id.toString();
        if (!llmJobGroups.has(jobIdStr)) {
          llmJobGroups.set(jobIdStr, { llm_job: cs.llm_jobs, changesets: [] });
        }
        llmJobGroups.get(jobIdStr)!.changesets.push(cs);
      } else {
        if (!manualGroups.has(cs.created_by)) {
          manualGroups.set(cs.created_by, []);
        }
        manualGroups.get(cs.created_by)!.push(cs);
      }
    }

    // Helper to group changesets by entity type
    const groupByEntityType = (cs: typeof changesets): ChangesetsByType[] => {
      const byType = new Map<string, Changeset[]>();
      
      for (const c of cs) {
        if (!byType.has(c.entity_type)) {
          byType.set(c.entity_type, []);
        }
        byType.get(c.entity_type)!.push({
          id: c.id.toString(),
          entity_type: c.entity_type,
          entity_id: c.entity_id?.toString() ?? null,
          operation: c.operation,
          entity_version: c.entity_version,
          before_snapshot: c.before_snapshot as Record<string, unknown> | null,
          after_snapshot: c.after_snapshot as Record<string, unknown> | null,
          status: c.status,
          created_by: c.created_by,
          created_at: c.created_at.toISOString(),
          reviewed_by: c.reviewed_by,
          reviewed_at: c.reviewed_at?.toISOString() ?? null,
          committed_at: c.committed_at?.toISOString() ?? null,
          llm_job_id: c.llm_job_id?.toString() ?? null,
          field_changes: c.field_changes.map(fc => {
            const shouldDecorate = FRAME_REF_FIELDS.has(fc.field_name);
            const oldRaw = shouldDecorate ? normalizeIntLike(fc.old_value) : null;
            const newRaw = shouldDecorate ? normalizeIntLike(fc.new_value) : null;
            const oldDisplay = shouldDecorate ? displayForFrameRef(oldRaw) : null;
            const newDisplay = shouldDecorate ? displayForFrameRef(newRaw) : null;

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
        });
      }

      return Array.from(byType.entries()).map(([entity_type, changesets]) => ({
        entity_type,
        changesets,
      }));
    };

    // Build response groups
    const groups: ChangeGroup[] = [];

    // Add LLM job groups
    for (const [jobId, { llm_job, changesets: cs }] of llmJobGroups) {
      groups.push({
        type: 'llm_job',
        llm_job_id: jobId,
        llm_job: llm_job ? {
          id: llm_job.id.toString(),
          label: llm_job.label,
          status: llm_job.status,
          submitted_by: llm_job.submitted_by,
        } : null,
        changesets_by_type: groupByEntityType(cs),
        total_changesets: cs.length,
      });
    }

    // Add manual groups
    for (const [createdBy, cs] of manualGroups) {
      groups.push({
        type: 'manual',
        created_by: createdBy,
        changesets_by_type: groupByEntityType(cs),
        total_changesets: cs.length,
      });
    }

    // Sort groups: LLM jobs first, then manual groups
    groups.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'llm_job' ? -1 : 1;
      }
      return 0;
    });

    return NextResponse.json({
      groups,
      total_pending_changesets: changesets.length,
    });
  } catch (error) {
    console.error('Error fetching pending changesets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pending changesets' },
      { status: 500 }
    );
  }
}

