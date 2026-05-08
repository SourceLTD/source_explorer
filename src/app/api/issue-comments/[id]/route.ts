/**
 * API Route: /api/issue-comments/[id]
 *
 * PATCH  - Edit a comment's content (only the author may edit)
 * DELETE - Soft-delete a comment (only the author may delete)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserName } from '@/utils/supabase/server';
import { isPrismaNotFound, parseIdParam } from '@/lib/issues/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function serialize(c: {
  id: bigint;
  issue_id: bigint;
  author: string;
  content: string;
  created_at: Date;
  updated_at: Date;
  edited: boolean;
  deleted: boolean;
}) {
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const commentId = parseIdParam(id);
    if (commentId === null) {
      return NextResponse.json(
        { error: 'Invalid comment id' },
        { status: 400 }
      );
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

    const existing = await prisma.issue_comments.findUnique({
      where: { id: commentId },
      select: { id: true, author: true, deleted: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }
    if (existing.deleted) {
      return NextResponse.json(
        { error: 'Cannot edit a deleted comment' },
        { status: 409 }
      );
    }

    const userId = await getCurrentUserName();
    if (existing.author !== userId) {
      return NextResponse.json(
        { error: 'Only the author can edit this comment' },
        { status: 403 }
      );
    }

    const updated = await prisma.issue_comments.update({
      where: { id: commentId },
      data: { content, edited: true },
    });

    return NextResponse.json(serialize(updated));
  } catch (error) {
    if (isPrismaNotFound(error)) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }
    console.error('Error updating comment:', error);
    return NextResponse.json(
      { error: 'Failed to update comment' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const commentId = parseIdParam(id);
    if (commentId === null) {
      return NextResponse.json(
        { error: 'Invalid comment id' },
        { status: 400 }
      );
    }

    const existing = await prisma.issue_comments.findUnique({
      where: { id: commentId },
      select: { id: true, author: true, deleted: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    const userId = await getCurrentUserName();
    if (existing.author !== userId) {
      return NextResponse.json(
        { error: 'Only the author can delete this comment' },
        { status: 403 }
      );
    }

    if (existing.deleted) {
      return NextResponse.json({ success: true });
    }

    // Soft-delete so the timeline keeps ordering and anchor points for replies.
    await prisma.issue_comments.update({
      where: { id: commentId },
      data: {
        deleted: true,
        deleted_at: new Date(),
        content: '',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isPrismaNotFound(error)) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }
    console.error('Error deleting comment:', error);
    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}
