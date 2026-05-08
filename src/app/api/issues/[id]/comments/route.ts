/**
 * API Route: /api/issues/[id]/comments
 *
 * POST   - Add a comment to an issue
 * GET    - List comments for an issue (non-deleted, chronological ascending)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserName } from '@/utils/supabase/server';
import { parseIdParam } from '@/lib/issues/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type CommentRow = {
  id: bigint;
  issue_id: bigint;
  author: string;
  content: string;
  created_at: Date;
  updated_at: Date;
  edited: boolean;
  deleted: boolean;
};

function serializeComment(c: CommentRow) {
  return {
    id: c.id.toString(),
    issue_id: c.issue_id.toString(),
    author: c.author,
    content: c.deleted ? '' : c.content,
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString(),
    edited: c.edited,
    deleted: c.deleted,
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const issueId = parseIdParam(id);
    if (issueId === null) {
      return NextResponse.json({ error: 'Invalid issue id' }, { status: 400 });
    }

    const comments = await prisma.issue_comments.findMany({
      where: { issue_id: issueId },
      orderBy: { created_at: 'asc' },
    });

    return NextResponse.json({
      comments: comments.map(serializeComment),
    });
  } catch (error) {
    console.error('Error listing comments:', error);
    return NextResponse.json(
      { error: 'Failed to list comments' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const issueId = parseIdParam(id);
    if (issueId === null) {
      return NextResponse.json({ error: 'Invalid issue id' }, { status: 400 });
    }

    const body = await request.json();
    const rawContent = typeof body.content === 'string' ? body.content : '';
    const content = rawContent.trim();
    if (!content) {
      return NextResponse.json(
        { error: 'content is required' },
        { status: 400 }
      );
    }

    // Verify the issue exists so we give a clean 404 instead of a FK error.
    const issue = await prisma.issues.findUnique({
      where: { id: issueId },
      select: { id: true },
    });
    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    const userId = await getCurrentUserName();

    const comment = await prisma.issue_comments.create({
      data: {
        issue_id: issueId,
        author: userId,
        content,
      },
    });

    return NextResponse.json(serializeComment(comment), { status: 201 });
  } catch (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}
