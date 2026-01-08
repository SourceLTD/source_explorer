import { NextRequest, NextResponse } from 'next/server';
import { stageModerationUpdates } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

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

    const result = await stageModerationUpdates('frame', ids, updates, userId);

    return NextResponse.json({
      staged: true,
      staged_count: result.staged_count,
      changeset_ids: result.changeset_ids,
      message: `Staged moderation changes for ${result.staged_count} frames`,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API] Error staging frame moderation:', error);
    return NextResponse.json(
      { error: 'Failed to stage frame moderation' },
      { status: 500 }
    );
  }
}
