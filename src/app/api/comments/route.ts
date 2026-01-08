/**
 * API Route: /api/comments
 * 
 * GET - Fetch comments for a changeset or field change
 * POST - Add a new comment
 */

import { NextRequest, NextResponse } from 'next/server';
import { getComments, addComment, getCommentCounts } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

// GET /api/comments - Fetch comments
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const changeset_id = searchParams.get('changeset_id');
    const field_change_id = searchParams.get('field_change_id');
    const counts_only = searchParams.get('counts_only') === 'true';
    const changeset_ids = searchParams.get('changeset_ids'); // comma-separated for bulk count
    
    // Handle bulk count request
    if (counts_only && changeset_ids) {
      const ids = changeset_ids.split(',').map(id => BigInt(id.trim()));
      const counts = await getCommentCounts(ids);
      
      // Convert Map to object for JSON
      const countsObj: Record<string, number> = {};
      counts.forEach((count, id) => {
        countsObj[id] = count;
      });
      
      return NextResponse.json({ counts: countsObj });
    }
    
    // Fetch comments for a specific changeset or field change
    const filters: { changeset_id?: bigint; field_change_id?: bigint } = {};
    
    if (changeset_id) {
      filters.changeset_id = BigInt(changeset_id);
    }
    if (field_change_id) {
      filters.field_change_id = BigInt(field_change_id);
    }
    
    if (!changeset_id && !field_change_id) {
      return NextResponse.json(
        { error: 'changeset_id or field_change_id is required' },
        { status: 400 }
      );
    }
    
    const comments = await getComments(filters);
    
    return NextResponse.json({
      comments: comments.map(c => ({
        id: c.id.toString(),
        changeset_id: c.changeset_id?.toString() ?? null,
        field_change_id: c.field_change_id?.toString() ?? null,
        author: c.author,
        content: c.content,
        created_at: c.created_at.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

// POST /api/comments - Add a new comment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { changeset_id, field_change_id, content } = body;
    
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: 'content is required and must be non-empty' },
        { status: 400 }
      );
    }
    
    if (!changeset_id && !field_change_id) {
      return NextResponse.json(
        { error: 'changeset_id or field_change_id is required' },
        { status: 400 }
      );
    }
    
    const author = await getCurrentUserName();
    
    const comment = await addComment({
      changeset_id: changeset_id ? BigInt(changeset_id) : undefined,
      field_change_id: field_change_id ? BigInt(field_change_id) : undefined,
      author,
      content: content.trim(),
    });
    
    return NextResponse.json({
      id: comment.id.toString(),
      changeset_id: comment.changeset_id?.toString() ?? null,
      field_change_id: comment.field_change_id?.toString() ?? null,
      author: comment.author,
      content: comment.content,
      created_at: comment.created_at.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error('Error adding comment:', error);
    return NextResponse.json(
      { error: 'Failed to add comment' },
      { status: 500 }
    );
  }
}

