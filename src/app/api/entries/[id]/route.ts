import { NextRequest, NextResponse } from 'next/server';
import { getEntryById, updateEntry } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const entry = await getEntryById(id);
    
    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json(entry);
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, 'GET /api/entries/[id]');
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
    const allowedFields = ['gloss', 'lemmas', 'examples', 'roles'];
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
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json(updatedEntry);
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, 'PATCH /api/entries/[id]');
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