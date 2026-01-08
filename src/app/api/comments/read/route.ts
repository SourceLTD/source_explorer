/**
 * API Route: /api/comments/read
 * 
 * POST - Mark a changeset's comments as read for the current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { markAsRead } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

// POST /api/comments/read - Mark as read
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { changeset_id } = body;
    
    if (!changeset_id) {
      return NextResponse.json(
        { error: 'changeset_id is required' },
        { status: 400 }
      );
    }
    
    const userId = await getCurrentUserName();
    
    await markAsRead(userId, BigInt(changeset_id));
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking comments as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark comments as read' },
      { status: 500 }
    );
  }
}

