/**
 * API Route: /api/issues/[id]
 *
 * GET - Get a single issue with linked changesets
 * PATCH - Update issue fields (status, priority, title, etc.)
 * DELETE - Delete an issue
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  isIssuePriority,
  isIssueStatus,
  isPrismaNotFound,
  nullableTrim,
  parseIdParam,
  sanitizeLabels,
} from '@/lib/issues/validation';
import { buildIssuePatchEvents, emitIssueEvents } from '@/lib/issues/events';
import { getCurrentUserName } from '@/utils/supabase/server';
import type {
  IssueFindingEntityContext,
  IssueFindingFrameRef,
} from '@/lib/issues/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Build a per-finding `entity_context` summary so the UI can show
 * "parent → child" for `frame_relation` findings and a frame label for
 * `frame` findings without N+1 round-trips. Findings whose entity has
 * been deleted (or whose entity_type we don't know how to summarise)
 * simply resolve to `null` and the UI falls back to the raw
 * `entity_type:entity_id` reference.
 *
 * Defined ABOVE the route handlers so Turbopack-compiled bundles
 * don't trip over the hoisted reference (we hit a runtime
 * `ReferenceError: loadFindingEntityContexts is not defined` when this
 * lived at the bottom of the file).
 */
async function loadFindingEntityContexts(
  findings: Array<{ findingId: bigint; entityType: string; entityId: bigint }>,
): Promise<Map<bigint, IssueFindingEntityContext>> {
  const out = new Map<bigint, IssueFindingEntityContext>();
  if (findings.length === 0) return out;

  const relationIds = new Set<bigint>();
  const frameIds = new Set<bigint>();
  for (const f of findings) {
    if (f.entityType === 'frame_relation') {
      relationIds.add(f.entityId);
    } else if (f.entityType === 'frame') {
      frameIds.add(f.entityId);
    }
  }

  const relationCtx = new Map<bigint, IssueFindingEntityContext>();
  if (relationIds.size > 0) {
    const relations = await prisma.frame_relations.findMany({
      where: { id: { in: Array.from(relationIds) } },
      select: {
        id: true,
        type: true,
        frames_frame_relations_source_idToframes: {
          select: { id: true, label: true, code: true },
        },
        frames_frame_relations_target_idToframes: {
          select: { id: true, label: true, code: true },
        },
      },
    });
    for (const r of relations) {
      const parent = toFrameRef(r.frames_frame_relations_source_idToframes);
      const child = toFrameRef(r.frames_frame_relations_target_idToframes);
      relationCtx.set(r.id, {
        kind: 'frame_relation',
        relation_type: r.type,
        parent,
        child,
      });
    }
  }

  const frameCtx = new Map<bigint, IssueFindingEntityContext>();
  if (frameIds.size > 0) {
    const frames = await prisma.frames.findMany({
      where: { id: { in: Array.from(frameIds) } },
      select: { id: true, label: true, code: true },
    });
    for (const f of frames) {
      frameCtx.set(f.id, { kind: 'frame', frame: toFrameRef(f) });
    }
  }

  for (const f of findings) {
    if (f.entityType === 'frame_relation') {
      const ctx = relationCtx.get(f.entityId);
      if (ctx) out.set(f.findingId, ctx);
    } else if (f.entityType === 'frame') {
      const ctx = frameCtx.get(f.entityId);
      if (ctx) out.set(f.findingId, ctx);
    }
  }
  return out;
}

function toFrameRef(frame: {
  id: bigint;
  label: string;
  code: string | null;
}): IssueFindingFrameRef {
  return {
    id: frame.id.toString(),
    label: frame.label,
    code: frame.code,
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const issueId = parseIdParam(id);
    if (issueId === null) {
      return NextResponse.json({ error: 'Invalid issue id' }, { status: 400 });
    }

    const issue = await prisma.issues.findUnique({
      where: { id: issueId },
      include: {
        changesets: {
          select: {
            id: true,
            entity_type: true,
            entity_id: true,
            operation: true,
            status: true,
            created_by: true,
            created_at: true,
            before_snapshot: true,
            after_snapshot: true,
            change_plan_id: true,
          },
          orderBy: { created_at: 'desc' },
        },
        // v2: any change_plans created for this issue. Surfaces N-step
        // remediation proposals (split, merge, move) so the issue page can
        // render them as a single PlanCard instead of N loose changesets.
        change_plans: {
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            plan_kind: true,
            summary: true,
            status: true,
            created_by: true,
            reviewed_by: true,
            reviewed_at: true,
            committed_at: true,
            conflict_report: true,
            metadata: true,
            created_at: true,
            updated_at: true,
            changesets: {
              select: { id: true, entity_type: true, entity_id: true, operation: true, status: true },
              orderBy: [{ entity_type: 'asc' }, { id: 'asc' }],
            },
          },
        },
        diagnosis_code: {
          select: {
            id: true,
            code: true,
            label: true,
            severity: true,
            category: true,
            check_definition_id: true,
          },
        },
        health_check_findings: {
          select: {
            id: true,
            status: true,
            severity: true,
            title: true,
            message: true,
            first_seen_at: true,
            last_seen_at: true,
            resolved_at: true,
            diagnosis_code: {
              select: {
                id: true,
                code: true,
                label: true,
                severity: true,
                category: true,
                check_definition_id: true,
              },
            },
            result: {
              select: {
                run_id: true,
                entity_type: true,
                entity_id: true,
                entity_key: true,
                status: true,
                checked_at: true,
              },
            },
          },
          orderBy: [{ status: 'asc' }, { last_seen_at: 'desc' }],
        },
      },
    });

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    const entityContextByFinding = await loadFindingEntityContexts(
      issue.health_check_findings.map((f) => ({
        findingId: f.id,
        entityType: f.result.entity_type,
        entityId: f.result.entity_id,
      })),
    );

    return NextResponse.json({
      id: issue.id.toString(),
      title: issue.title,
      description: issue.description,
      status: issue.status,
      priority: issue.priority,
      labels: issue.labels,
      created_by: issue.created_by,
      assignee: issue.assignee,
      created_at: issue.created_at.toISOString(),
      updated_at: issue.updated_at.toISOString(),
      closed_at: issue.closed_at ? issue.closed_at.toISOString() : null,
      diagnosis_code_id: issue.diagnosis_code_id ? issue.diagnosis_code_id.toString() : null,
      diagnosis_code: issue.diagnosis_code
        ? {
            id: issue.diagnosis_code.id.toString(),
            code: issue.diagnosis_code.code,
            label: issue.diagnosis_code.label,
            severity: issue.diagnosis_code.severity,
            category: issue.diagnosis_code.category,
            check_definition_id: issue.diagnosis_code.check_definition_id
              ? issue.diagnosis_code.check_definition_id.toString()
              : null,
          }
        : null,
      changesets: issue.changesets.map((cs) => ({
        id: cs.id.toString(),
        entity_type: cs.entity_type,
        entity_id: cs.entity_id?.toString() ?? null,
        operation: cs.operation,
        status: cs.status,
        created_by: cs.created_by,
        created_at: cs.created_at.toISOString(),
        before_snapshot: cs.before_snapshot,
        after_snapshot: cs.after_snapshot,
        change_plan_id: cs.change_plan_id?.toString() ?? null,
      })),
      change_plans: issue.change_plans.map((plan) => ({
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
      })),
      health_check_findings: issue.health_check_findings.map((finding) => ({
        id: finding.id.toString(),
        status: finding.status,
        severity: finding.severity,
        title: finding.title,
        message: finding.message,
        first_seen_at: finding.first_seen_at.toISOString(),
        last_seen_at: finding.last_seen_at.toISOString(),
        resolved_at: finding.resolved_at ? finding.resolved_at.toISOString() : null,
        diagnosis_code: {
          id: finding.diagnosis_code.id.toString(),
          code: finding.diagnosis_code.code,
          label: finding.diagnosis_code.label,
          severity: finding.diagnosis_code.severity,
          category: finding.diagnosis_code.category,
          check_definition_id: finding.diagnosis_code.check_definition_id
            ? finding.diagnosis_code.check_definition_id.toString()
            : null,
        },
        result: {
          run_id: finding.result.run_id.toString(),
          entity_type: finding.result.entity_type,
          entity_id: finding.result.entity_id.toString(),
          entity_key: finding.result.entity_key as Record<string, unknown> | null,
          status: finding.result.status,
          checked_at: finding.result.checked_at.toISOString(),
        },
        entity_context: entityContextByFinding.get(finding.id) ?? null,
      })),
    });
  } catch (error) {
    console.error('Error getting issue:', error);
    return NextResponse.json(
      { error: 'Failed to get issue' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const issueId = parseIdParam(id);
    if (issueId === null) {
      return NextResponse.json({ error: 'Invalid issue id' }, { status: 400 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if ('title' in body) {
      if (typeof body.title !== 'string') {
        return NextResponse.json(
          { error: 'title must be a string' },
          { status: 400 }
        );
      }
      const trimmed = body.title.trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: 'title cannot be empty' },
          { status: 400 }
        );
      }
      updates.title = trimmed;
    }

    if ('description' in body) {
      updates.description = nullableTrim(body.description);
    }
    if ('assignee' in body) {
      updates.assignee = nullableTrim(body.assignee);
    }

    if ('status' in body && body.status !== undefined) {
      if (!isIssueStatus(body.status)) {
        return NextResponse.json(
          { error: 'Invalid status value' },
          { status: 400 }
        );
      }
      updates.status = body.status;
      // When transitioning into a terminal state, record when it closed.
      // When leaving a terminal state, clear `closed_at`. Re-entering a
      // terminal state always stamps fresh — callers that need to preserve
      // the original close timestamp should pass `closed_at` explicitly
      // (not currently supported).
      if (body.status === 'closed' || body.status === 'resolved') {
        updates.closed_at = new Date();
      } else {
        updates.closed_at = null;
      }
    }

    if ('priority' in body && body.priority !== undefined) {
      if (!isIssuePriority(body.priority)) {
        return NextResponse.json(
          { error: 'Invalid priority value' },
          { status: 400 }
        );
      }
      updates.priority = body.priority;
    }

    if ('labels' in body) {
      updates.labels = sanitizeLabels(body.labels);
    }

    if ('diagnosis_code_id' in body) {
      if (body.diagnosis_code_id === null || body.diagnosis_code_id === '') {
        updates.diagnosis_code_id = null;
      } else {
        const diagnosisCodeId = parseIdParam(body.diagnosis_code_id);
        if (diagnosisCodeId === null) {
          return NextResponse.json(
            { error: 'diagnosis_code_id must be a positive integer or null' },
            { status: 400 },
          );
        }
        updates.diagnosis_code_id = diagnosisCodeId;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Snapshot the pre-update state so we can diff and emit events.
    const before = await prisma.issues.findUnique({
      where: { id: issueId },
      select: {
        title: true,
        description: true,
        status: true,
        priority: true,
        labels: true,
        assignee: true,
      },
    });
    if (!before) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    let issue;
    try {
      issue = await prisma.issues.update({
        where: { id: issueId },
        data: updates,
        include: {
          _count: {
            select: {
              changesets: true,
              // Match the list endpoint: count only currently-open findings
              // so the badge stays consistent across the UI.
              health_check_findings: { where: { status: 'open' } },
            },
          },
          diagnosis_code: {
            select: {
              id: true,
              code: true,
              label: true,
              severity: true,
              category: true,
              check_definition_id: true,
            },
          },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        return NextResponse.json(
          { error: 'Linked diagnosis code does not exist' },
          { status: 400 },
        );
      }
      throw err;
    }

    const actor = await getCurrentUserName();
    const events = buildIssuePatchEvents(
      issue.id,
      actor,
      before,
      {
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
        labels: issue.labels,
        assignee: issue.assignee,
      },
    );
    if (events.length > 0) {
      // Fire-and-forget; the emit helpers catch their own errors.
      void emitIssueEvents(events);
    }

    return NextResponse.json({
      id: issue.id.toString(),
      title: issue.title,
      description: issue.description,
      status: issue.status,
      priority: issue.priority,
      labels: issue.labels,
      created_by: issue.created_by,
      assignee: issue.assignee,
      created_at: issue.created_at.toISOString(),
      updated_at: issue.updated_at.toISOString(),
      closed_at: issue.closed_at ? issue.closed_at.toISOString() : null,
      diagnosis_code_id: issue.diagnosis_code_id ? issue.diagnosis_code_id.toString() : null,
      diagnosis_code: issue.diagnosis_code
        ? {
            id: issue.diagnosis_code.id.toString(),
            code: issue.diagnosis_code.code,
            label: issue.diagnosis_code.label,
            severity: issue.diagnosis_code.severity,
            category: issue.diagnosis_code.category,
            check_definition_id: issue.diagnosis_code.check_definition_id
              ? issue.diagnosis_code.check_definition_id.toString()
              : null,
          }
        : null,
      changesets_count: issue._count.changesets,
      open_findings_count: issue._count.health_check_findings,
    });
  } catch (error) {
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }
    console.error('Error updating issue:', error);
    return NextResponse.json(
      { error: 'Failed to update issue' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const issueId = parseIdParam(id);
    if (issueId === null) {
      return NextResponse.json({ error: 'Invalid issue id' }, { status: 400 });
    }

    await prisma.issues.delete({ where: { id: issueId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }
    console.error('Error deleting issue:', error);
    return NextResponse.json(
      { error: 'Failed to delete issue' },
      { status: 500 }
    );
  }
}
