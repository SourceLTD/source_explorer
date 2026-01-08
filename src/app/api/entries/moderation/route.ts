import { NextRequest, NextResponse } from 'next/server';
import { stageModerationUpdates } from '@/lib/version-control';
import { updateModerationStatus } from '@/lib/db';
import { getCurrentUserName } from '@/utils/supabase/server';

// Force dynamic rendering - no static optimization
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, updates } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Entry IDs are required' }, { status: 400 });
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Updates object is required' }, { status: 400 });
    }

    // Validate that at least one moderation field is being updated
    const VALID_MODERATION_FIELDS = ['flagged', 'flaggedReason', 'forbidden', 'forbiddenReason'];
    const hasValidUpdate = Object.keys(updates).some(key => VALID_MODERATION_FIELDS.includes(key));
    
    if (!hasValidUpdate) {
      return NextResponse.json({ 
        error: 'At least one moderation field must be updated' 
      }, { status: 400 });
    }

    const userId = await getCurrentUserName();

    // Split updates into direct (flagged) and staged (others)
    const directUpdates: Record<string, any> = {};
    const stagedUpdates: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'flagged' || key === 'flaggedReason') {
        directUpdates[key] = value;
      } else if (VALID_MODERATION_FIELDS.includes(key)) {
        stagedUpdates[key] = value;
      }
    }

    let stagedCount = 0;
    let directCount = 0;
    let changesetIds: string[] = [];
    let message = '';

    // Apply direct updates (flagged status) immediately
    if (Object.keys(directUpdates).length > 0) {
      // Default to 'verbs' for entries
      directCount = await updateModerationStatus(ids, directUpdates, 'verbs');
      message = `Updated flagging status for ${directCount} entries. `;
    }

    // Stage other moderation updates (e.g., forbidden)
    if (Object.keys(stagedUpdates).length > 0) {
      const result = await stageModerationUpdates('verb', ids, stagedUpdates, userId);
      stagedCount = result.staged_count;
      changesetIds = result.changeset_ids;
      message += `Staged other moderation changes for ${result.staged_count} entries.`;
    }

    return NextResponse.json({ 
      staged: Object.keys(stagedUpdates).length > 0, 
      staged_count: stagedCount,
      updated_count: directCount,
      count: directCount,
      changeset_ids: changesetIds,
      message: message.trim() || 'No changes applied'
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error updating moderation status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
