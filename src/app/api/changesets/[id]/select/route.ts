/**
 * API Route: /api/changesets/[id]/select
 *
 * POST — Mark this changeset as the selected alternative within its group.
 * The selected alternative is the one that will be applied when the change is
 * committed; non-selected siblings are discarded at commit time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { selectAlternative } from '@/lib/version-control/alternatives';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const changesetId = BigInt(id);

    const cs = await (prisma.changesets as any).findUnique({
      where: { id: changesetId },
      select: { alternative_group_id: true, status: true },
    });

    if (!cs) {
      return NextResponse.json({ error: 'Changeset not found' }, { status: 404 });
    }

    const groupId = cs.alternative_group_id as bigint | null;
    if (groupId == null) {
      return NextResponse.json(
        { error: 'This changeset is not part of an alternative group' },
        { status: 400 },
      );
    }

    await selectAlternative(prisma, groupId, changesetId);

    return NextResponse.json(
      {
        group_id: groupId.toString(),
        selected_changeset_id: changesetId.toString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[API] Error selecting alternative:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to select alternative' },
      { status: 500 },
    );
  }
}
