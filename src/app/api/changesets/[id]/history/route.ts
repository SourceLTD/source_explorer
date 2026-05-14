/**
 * API Route: /api/changesets/[id]/history
 *
 * GET — Retrieve the full revision chain for a changeset, walking both
 * backwards (via revision_parent_id) and forwards (via superseded_by_id).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { RevisionChain, RevisionHistoryEntry } from '@/lib/version-control/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const changesetId = BigInt(id);

    const changeset = await prisma.changesets.findUnique({
      where: { id: changesetId },
    }) as any;

    if (!changeset) {
      return NextResponse.json(
        { error: 'Changeset not found' },
        { status: 404 },
      );
    }

    let rootId = changeset.id;
    let currentParentId = changeset.revision_parent_id as bigint | null;
    while (currentParentId) {
      const parent = await prisma.changesets.findUnique({
        where: { id: currentParentId },
      }) as any;
      if (!parent) break;
      rootId = parent.id;
      currentParentId = parent.revision_parent_id as bigint | null;
    }

    const entries: RevisionHistoryEntry[] = [];
    let currentId: bigint | null = rootId;

    while (currentId) {
      const cs = await prisma.changesets.findUnique({
        where: { id: currentId },
        include: { field_changes: true },
      }) as any;
      if (!cs) break;

      entries.push({
        id: cs.id.toString(),
        revision_number: cs.revision_number ?? 1,
        revision_prompt: cs.revision_prompt ?? null,
        created_by: cs.created_by,
        created_at: cs.created_at.toISOString(),
        status: cs.status as RevisionHistoryEntry['status'],
        field_changes: cs.field_changes.map((fc: any) => ({
          field_name: fc.field_name,
          old_value: fc.old_value,
          new_value: fc.new_value,
          status: fc.status as 'pending' | 'approved' | 'rejected',
        })),
      });

      currentId = cs.superseded_by_id as bigint | null;
    }

    const response: RevisionChain = {
      current_id: changesetId.toString(),
      total_revisions: entries.length,
      entries,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[API] Error fetching revision history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch revision history' },
      { status: 500 },
    );
  }
}
