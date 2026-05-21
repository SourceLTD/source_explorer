import { NextRequest, NextResponse } from 'next/server';
import { stageFlagUpdates } from '@/lib/version-control';
import { prisma } from '@/lib/prisma';
import { getCurrentUserName } from '@/utils/supabase/server';

// Fields that should be staged (go through version control)
const STAGED_FLAG_FIELDS = ['verifiable', 'unverifiableReason'];
// Fields that should be updated directly (no version control needed)
const DIRECT_FLAG_FIELDS = ['flagged', 'flaggedReason'];

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, updates } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'ids must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { error: 'updates must be an object' },
        { status: 400 }
      );
    }

    const userId = await getCurrentUserName();

    // Separate direct updates (flagging) from staged updates (verifiable)
    const directUpdates: Record<string, unknown> = {};
    const stagedUpdates: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (DIRECT_FLAG_FIELDS.includes(key)) {
        directUpdates[key] = value;
      } else if (STAGED_FLAG_FIELDS.includes(key)) {
        stagedUpdates[key] = value;
      }
    }

    let directCount = 0;
    let stagedCount = 0;
    const changesetIds: string[] = [];
    let message = '';

    // Handle direct updates (flagging) - update database directly
    if (Object.keys(directUpdates).length > 0) {
      const dbUpdates: Record<string, unknown> = { updated_at: new Date() };
      if (directUpdates.flagged !== undefined) dbUpdates.flagged = directUpdates.flagged;
      if (directUpdates.flaggedReason !== undefined) dbUpdates.flagged_reason = directUpdates.flaggedReason;

      const numericIds = ids.filter(id => /^\d+$/.test(id)).map(id => BigInt(id));
      const labels = ids.filter(id => !/^\d+$/.test(id));

      const result = await prisma.frames.updateMany({
        where: {
          OR: [
            { id: { in: numericIds } },
            { label: { in: labels } },
          ],
        },
        data: dbUpdates,
      });
      directCount = result.count;
      message = `Updated flagging status for ${directCount} frames. `;
    }

    // Handle staged updates (verifiable) - go through version control
    if (Object.keys(stagedUpdates).length > 0) {
      const result = await stageFlagUpdates('frame', ids, stagedUpdates, userId);
      stagedCount = result.staged_count;
      changesetIds.push(...result.changeset_ids);
      message += `Staged other flag changes for ${stagedCount} frames.`;
    }

    return NextResponse.json({
      staged: Object.keys(stagedUpdates).length > 0,
      staged_count: stagedCount,
      updated_count: directCount,
      updatedCount: directCount,
      count: directCount + stagedCount,
      changeset_ids: changesetIds,
      message: message.trim() || 'No changes applied',
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API] Error updating frame flags:', error);
    return NextResponse.json(
      { error: 'Failed to update frame flags' },
      { status: 500 }
    );
  }
}

