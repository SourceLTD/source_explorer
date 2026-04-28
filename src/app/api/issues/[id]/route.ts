/**
 * API Route: /api/issues/[id]
 *
 * GET - Get a single issue with linked changesets
 * PATCH - Update issue fields (status, priority, title, etc.)
 * DELETE - Delete an issue
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  isIssuePriority,
  isIssueStatus,
  isPrismaNotFound,
  nullableTrim,
  parseIdParam,
  sanitizeLabels,
} from '@/lib/issues/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
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
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
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

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const issue = await prisma.issues.update({
      where: { id: issueId },
      data: updates,
      include: { _count: { select: { changesets: true } } },
    });

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
      changesets_count: issue._count.changesets,
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
