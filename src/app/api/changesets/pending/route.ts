/**
 * API Route: /api/changesets/pending
 * 
 * GET - Get all pending changesets grouped by:
 *   - LLM job (if llm_job_id is set)
 *   - User (if llm_job_id is null - manual changes)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface FieldChange {
  id: string;
  changeset_id: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
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
          field_changes: c.field_changes.map(fc => ({
            id: fc.id.toString(),
            changeset_id: fc.changeset_id.toString(),
            field_name: fc.field_name,
            old_value: fc.old_value,
            new_value: fc.new_value,
            status: fc.status,
            approved_by: fc.approved_by,
            approved_at: fc.approved_at?.toISOString() ?? null,
            rejected_by: fc.rejected_by,
            rejected_at: fc.rejected_at?.toISOString() ?? null,
          })),
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

