/**
 * API Route: /api/comments/unread
 * 
 * GET - Get unread comments for the current user
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUnreadComments, getUnreadStatusForChangesets } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

// GET /api/comments/unread - Get unread comments
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const changeset_ids = searchParams.get('changeset_ids'); // comma-separated for checking specific changesets
    
    const userId = await getCurrentUserName();
    
    // If specific changeset IDs provided, just return which ones have unread
    if (changeset_ids) {
      const ids = changeset_ids.split(',').map(id => BigInt(id.trim()));
      const unreadSet = await getUnreadStatusForChangesets(userId, ids);
      
      return NextResponse.json({
        unread_changeset_ids: Array.from(unreadSet),
      });
    }
    
    // Otherwise return full unread info
    const unreadChangesets = await getUnreadComments(userId);
    
    return NextResponse.json({
      unread: unreadChangesets,
      count: unreadChangesets.length,
    });
  } catch (error) {
    console.error('Error fetching unread comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unread comments' },
      { status: 500 }
    );
  }
}

