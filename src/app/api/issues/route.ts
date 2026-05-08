/**
 * API Route: /api/issues
 *
 * GET - List all issues with optional filtering
 * POST - Create a new issue
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUserName } from '@/utils/supabase/server';
import type { issue_status, issue_priority } from '@prisma/client';
import {
  isIssuePriority,
  isIssueStatus,
  nullableTrim,
  parseIdParam,
  sanitizeLabels,
} from '@/lib/issues/validation';
import { emitIssueEvent } from '@/lib/issues/events';

type IssueDiagnosisSummary = {
  id: bigint;
  code: string;
  label: string;
  severity: issue_priority;
  category: string | null;
  check_definition_id: bigint | null;
};

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
  diagnosis_code_id: bigint | null;
  diagnosis_code?: IssueDiagnosisSummary | null;
  _count?: { changesets: number; health_check_findings: number };
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
    changesets_count: issue._count?.changesets ?? 0,
    open_findings_count: issue._count?.health_check_findings ?? 0,
  };
}

const DIAGNOSIS_CODE_SELECT = {
  id: true,
  code: true,
  label: true,
  severity: true,
  category: true,
  check_definition_id: true,
} as const;

// `_count` shape we attach to every issue read so the UI gets a live
// count of currently-affected rows (open findings) without having to
// load full finding objects. Filtered relation counts are GA in
// Prisma 5+, so no preview feature is required here.
const ISSUE_COUNT_SELECT = {
  changesets: true,
  health_check_findings: { where: { status: 'open' as const } },
} as const;

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

    const diagnosisCodeParam = searchParams.get('diagnosis_code_id');
    if (diagnosisCodeParam !== null) {
      if (diagnosisCodeParam === '' || diagnosisCodeParam === 'null') {
        where.diagnosis_code_id = null;
      } else {
        const diagnosisCodeId = parseIdParam(diagnosisCodeParam);
        if (diagnosisCodeId === null) {
          return NextResponse.json(
            { error: 'Invalid diagnosis_code_id filter' },
            { status: 400 },
          );
        }
        where.diagnosis_code_id = diagnosisCodeId;
      }
    }

    const issues = await prisma.issues.findMany({
      where,
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
      include: {
        _count: { select: ISSUE_COUNT_SELECT },
        diagnosis_code: { select: DIAGNOSIS_CODE_SELECT },
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

    let diagnosisCodeId: bigint | null = null;
    if ('diagnosis_code_id' in body && body.diagnosis_code_id !== null && body.diagnosis_code_id !== undefined) {
      diagnosisCodeId = parseIdParam(body.diagnosis_code_id);
      if (diagnosisCodeId === null) {
        return NextResponse.json(
          { error: 'diagnosis_code_id must be a positive integer or null' },
          { status: 400 },
        );
      }
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

    let issue;
    try {
      issue = await prisma.issues.create({
        data: {
          title: trimmedTitle,
          description: nullableTrim(description),
          status: resolvedStatus,
          priority: resolvedPriority,
          labels: sanitizeLabels(labels),
          assignee: nullableTrim(assignee),
          created_by: userId,
          diagnosis_code_id: diagnosisCodeId ?? undefined,
          closed_at:
            resolvedStatus === 'closed' || resolvedStatus === 'resolved'
              ? new Date()
              : null,
        },
        include: {
          _count: { select: ISSUE_COUNT_SELECT },
          diagnosis_code: { select: DIAGNOSIS_CODE_SELECT },
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

    // Record "opened" in the timeline. Best-effort: emit helper already swallows errors.
    void emitIssueEvent({
      issueId: issue.id,
      actor: userId,
      eventType: 'opened',
      metadata: { initial_status: resolvedStatus, initial_priority: resolvedPriority },
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
