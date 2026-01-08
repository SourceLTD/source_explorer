import { NextRequest, NextResponse } from 'next/server';
import { stageModerationUpdates } from '@/lib/version-control';

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
    const validFields = ['flagged', 'flaggedReason', 'forbidden', 'forbiddenReason'];
    const hasValidUpdate = Object.keys(updates).some(key => validFields.includes(key));
    
    if (!hasValidUpdate) {
      return NextResponse.json({ 
        error: 'At least one moderation field must be updated' 
      }, { status: 400 });
    }

    // TODO: Get actual user ID from auth context
    const userId = 'current-user';

    // Default to 'verb' for entries (verbs are the main "entries" in this system)
    const result = await stageModerationUpdates('verb', ids, updates, userId);

    return NextResponse.json({ 
      staged: true, 
      staged_count: result.staged_count,
      changeset_ids: result.changeset_ids,
      message: `Staged moderation changes for ${result.staged_count} entries` 
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error staging moderation status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
