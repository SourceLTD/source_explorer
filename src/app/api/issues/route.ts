/**
 * API Route: /api/issues
 *
 * GET - List all issues with optional filtering
 * POST - Create a new issue
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserName } from '@/utils/supabase/server';
import type { issue_status, issue_priority } from '@prisma/client';
import {
  isIssuePriority,
  isIssueStatus,
  nullableTrim,
  sanitizeLabels,
} from '@/lib/issues/validation';

type IssueRow = {
  id: bigint;
  title: string;
  description: string | null;
  status: issue_status;
  priority: issue_priority;
  labels: string[];
  created_by: string;
  assignee: string | null;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
  _count?: { changesets: number };
};

function serializeIssue(issue: IssueRow) {
  return {
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
    changesets_count: issue._count?.changesets ?? 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const priorityParam = searchParams.get('priority');
    const assignee = searchParams.get('assignee');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (statusParam) {
      if (!isIssueStatus(statusParam)) {
        return NextResponse.json(
          { error: 'Invalid status filter' },
          { status: 400 }
        );
      }
      where.status = statusParam;
    }
    if (priorityParam) {
      if (!isIssuePriority(priorityParam)) {
        return NextResponse.json(
          { error: 'Invalid priority filter' },
          { status: 400 }
        );
      }
      where.priority = priorityParam;
    }
    if (assignee) where.assignee = assignee;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const issues = await prisma.issues.findMany({
      where,
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
      include: {
        _count: { select: { changesets: true } },
      },
    });

    return NextResponse.json({
      issues: issues.map(serializeIssue),
      total: issues.length,
    });
  } catch (error) {
    console.error('Error listing issues:', error);
    return NextResponse.json(
      { error: 'Failed to list issues' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, status, priority, labels, assignee } = body;

    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    if (!trimmedTitle) {
      return NextResponse.json(
        { error: 'title is required' },
        { status: 400 }
      );
    }

    let resolvedStatus: issue_status = 'open';
    if (status !== undefined && status !== null) {
      if (!isIssueStatus(status)) {
        return NextResponse.json(
          { error: 'Invalid status value' },
          { status: 400 }
        );
      }
      resolvedStatus = status;
    }

    let resolvedPriority: issue_priority = 'medium';
    if (priority !== undefined && priority !== null) {
      if (!isIssuePriority(priority)) {
        return NextResponse.json(
          { error: 'Invalid priority value' },
          { status: 400 }
        );
      }
      resolvedPriority = priority;
    }

    const userId = await getCurrentUserName();

    const issue = await prisma.issues.create({
      data: {
        title: trimmedTitle,
        description: nullableTrim(description),
        status: resolvedStatus,
        priority: resolvedPriority,
        labels: sanitizeLabels(labels),
        assignee: nullableTrim(assignee),
        created_by: userId,
        // Set closed_at if the issue is created in a terminal state.
        closed_at:
          resolvedStatus === 'closed' || resolvedStatus === 'resolved'
            ? new Date()
            : null,
      },
      include: { _count: { select: { changesets: true } } },
    });

    return NextResponse.json(serializeIssue(issue), { status: 201 });
  } catch (error) {
    console.error('Error creating issue:', error);
    return NextResponse.json(
      { error: 'Failed to create issue' },
      { status: 500 }
    );
  }
}
