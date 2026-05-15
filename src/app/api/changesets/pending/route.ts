/**
 * API Route: /api/changesets/pending
 *
 * GET - Get all pending changesets grouped by:
 *   - LLM job (if llm_job_id is set)
 *   - User (if llm_job_id is null - manual changes)
 *
 * The wire shape per changeset is owned by `src/lib/changesets/pending-shape.ts`
 * so this endpoint and the by-issue endpoint stay byte-identical.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  PENDING_CHANGESET_INCLUDE,
  buildFrameRefLookup,
  shapePendingChangeset,
  type ShapedChangeset,
} from '@/lib/changesets/pending-shape';

interface ChangesetsByType {
  entity_type: string;
  changesets: ShapedChangeset[];
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

interface RemediationGroup {
  type: 'remediation';
  changesets_by_type: ChangesetsByType[];
  total_changesets: number;
}

type ChangeGroup = LlmJobGroup | ManualGroup | RemediationGroup;

export async function GET(_request: NextRequest) {
  try {
    const changesets = await prisma.changesets.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'desc' },
      include: PENDING_CHANGESET_INCLUDE,
    });

    const lookup = await buildFrameRefLookup(changesets);

    const llmJobGroups = new Map<
      string,
      {
        llm_job: typeof changesets[0]['llm_jobs'];
        changesets: typeof changesets;
      }
    >();
    const manualGroups = new Map<string, typeof changesets>();
    const remediationChangesets: typeof changesets = [];

    for (const cs of changesets) {
      if (cs.llm_job_id) {
        const jobIdStr = cs.llm_job_id.toString();
        if (!llmJobGroups.has(jobIdStr)) {
          llmJobGroups.set(jobIdStr, { llm_job: cs.llm_jobs, changesets: [] });
        }
        llmJobGroups.get(jobIdStr)!.changesets.push(cs);
      } else if (cs.change_plan_id) {
        remediationChangesets.push(cs);
      } else {
        if (!manualGroups.has(cs.created_by)) {
          manualGroups.set(cs.created_by, []);
        }
        manualGroups.get(cs.created_by)!.push(cs);
      }
    }

    const groupByEntityType = (cs: typeof changesets): ChangesetsByType[] => {
      const byType = new Map<string, ShapedChangeset[]>();
      for (const c of cs) {
        if (!byType.has(c.entity_type)) {
          byType.set(c.entity_type, []);
        }
        byType.get(c.entity_type)!.push(shapePendingChangeset(c, lookup));
      }
      return Array.from(byType.entries()).map(([entity_type, changesets]) => ({
        entity_type,
        changesets,
      }));
    };

    const groups: ChangeGroup[] = [];

    for (const [jobId, { llm_job, changesets: cs }] of llmJobGroups) {
      groups.push({
        type: 'llm_job',
        llm_job_id: jobId,
        llm_job: llm_job
          ? {
              id: llm_job.id.toString(),
              label: llm_job.label,
              status: llm_job.status,
              submitted_by: llm_job.submitted_by,
            }
          : null,
        changesets_by_type: groupByEntityType(cs),
        total_changesets: cs.length,
      });
    }

    for (const [createdBy, cs] of manualGroups) {
      groups.push({
        type: 'manual',
        created_by: createdBy,
        changesets_by_type: groupByEntityType(cs),
        total_changesets: cs.length,
      });
    }

    if (remediationChangesets.length > 0) {
      groups.push({
        type: 'remediation',
        changesets_by_type: groupByEntityType(remediationChangesets),
        total_changesets: remediationChangesets.length,
      });
    }

    // Sort groups: LLM jobs first, then remediation, then manual
    const sortOrder = { llm_job: 0, remediation: 1, manual: 2 };
    groups.sort((a, b) => (sortOrder[a.type] ?? 2) - (sortOrder[b.type] ?? 2));

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
