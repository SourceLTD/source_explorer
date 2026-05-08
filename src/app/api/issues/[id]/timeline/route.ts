/**
 * API Route: /api/issues/[id]/timeline
 *
 * GET - Return a GitHub-style merged timeline for an issue:
 *       comments + activity events, sorted chronologically (ascending).
 *
 *       Deleted comments are included as tombstones so the ordering is
 *       stable; the client can render them as "This comment was deleted".
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseIdParam } from '@/lib/issues/validation';
import { getCurrentUserName } from '@/utils/supabase/server';

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
      select: { id: true },
    });
    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 });
    }

    const [comments, events] = await Promise.all([
      prisma.issue_comments.findMany({
        where: { issue_id: issueId },
        orderBy: { created_at: 'asc' },
      }),
      prisma.issue_events.findMany({
        where: { issue_id: issueId },
        orderBy: { created_at: 'asc' },
      }),
    ]);

    type Entry =
      | {
          kind: 'comment';
          id: string;
          issue_id: string;
          author: string;
          content: string;
          created_at: string;
          updated_at: string;
          edited: boolean;
          deleted: boolean;
        }
      | {
          kind: 'event';
          id: string;
          issue_id: string;
          actor: string;
          event_type: string;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };

    const entries: Entry[] = [];

    for (const c of comments) {
      entries.push({
        kind: 'comment',
        id: c.id.toString(),
        issue_id: c.issue_id.toString(),
        author: c.author,
        content: c.deleted ? '' : c.content,
        created_at: c.created_at.toISOString(),
        updated_at: c.updated_at.toISOString(),
        edited: c.edited,
        deleted: c.deleted,
      });
    }

    for (const e of events) {
      entries.push({
        kind: 'event',
        id: e.id.toString(),
        issue_id: e.issue_id.toString(),
        actor: e.actor,
        event_type: e.event_type,
        metadata: (e.metadata as Record<string, unknown> | null) ?? null,
        created_at: e.created_at.toISOString(),
      });
    }

    entries.sort((a, b) => {
      const cmp = a.created_at.localeCompare(b.created_at);
      if (cmp !== 0) return cmp;
      // Stable fallback: events before comments at the same instant (rare).
      if (a.kind !== b.kind) return a.kind === 'event' ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    const currentUser = await getCurrentUserName();

    return NextResponse.json({ entries, current_user: currentUser });
  } catch (error) {
    console.error('Error fetching issue timeline:', error);
    return NextResponse.json(
      { error: 'Failed to fetch timeline' },
      { status: 500 }
    );
  }
}
