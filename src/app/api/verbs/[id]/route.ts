import { NextRequest, NextResponse } from 'next/server';
import { getEntryById, updateEntry } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';
import { handleDeleteById } from '@/lib/route-handlers';

// Force dynamic rendering - no static optimization
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const entry = await getEntryById(id);
    
    if (!entry) {
      return NextResponse.json({ error: 'Verb not found' }, { status: 404 });
    }

    return NextResponse.json(entry);
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, 'GET /api/verbs/[id]');
    return NextResponse.json(
      { 
        error: message,
        retryable: shouldRetry,
        timestamp: new Date().toISOString()
      },
      { 
        status,
        headers: shouldRetry ? { 'Retry-After': '5' } : {}
      }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const updates = await request.json();
    
    // Validate that only allowed fields are being updated
    const allowedFields = ['id', 'gloss', 'lemmas', 'src_lemmas', 'examples', 'roles', 'role_groups', 'vendler_class', 'lexfile', 'frame_id'];
    const updateData: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updatedEntry = await updateEntry(id, updateData);
    
    if (!updatedEntry) {
      return NextResponse.json({ error: 'Verb not found' }, { status: 404 });
    }

    // Return with no-cache headers to ensure fresh data
    return NextResponse.json(updatedEntry, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, 'PATCH /api/verbs/[id]');
    return NextResponse.json(
      { 
        error: message,
        retryable: shouldRetry,
        timestamp: new Date().toISOString()
      },
      { 
        status,
        headers: shouldRetry ? { 'Retry-After': '5' } : {}
      }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  return handleDeleteById(id, 'verbs', `DELETE /api/verbs/${id}`);
}

