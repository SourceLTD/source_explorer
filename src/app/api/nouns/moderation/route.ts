import { NextRequest, NextResponse } from 'next/server';
import { updateNounModerationStatus } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, updates } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'ids array is required' },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { error: 'updates object is required' },
        { status: 400 }
      );
    }

    const count = await updateNounModerationStatus(ids, updates);
    
    return NextResponse.json({ 
      success: true,
      count,
      message: `Updated ${count} noun(s)` 
    });
  } catch (error) {
    const { message, status } = handleDatabaseError(error, 'PATCH /api/nouns/moderation');
    return NextResponse.json({ error: message }, { status });
  }
}

