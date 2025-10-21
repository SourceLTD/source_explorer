import { NextRequest, NextResponse } from 'next/server';
import { getEntryById, updateEntry } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const entry = await getEntryById(id);
    
    if (!entry) {
      return NextResponse.json(
        { error: 'Adjective not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(entry);
  } catch (error) {
    const { id } = await params;
    const { message, status } = handleDatabaseError(error, `GET /api/adjectives/${id}`);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updatedEntry = await updateEntry(id, body);
    
    if (!updatedEntry) {
      return NextResponse.json(
        { error: 'Adjective not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(updatedEntry);
  } catch (error) {
    const { id } = await params;
    const { message, status } = handleDatabaseError(error, `PATCH /api/adjectives/${id}`);
    return NextResponse.json({ error: message }, { status });
  }
}


