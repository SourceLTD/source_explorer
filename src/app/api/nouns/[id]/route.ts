import { NextRequest, NextResponse } from 'next/server';
import { getEntryById, updateEntry, deleteEntry } from '@/lib/db';
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
        { error: 'Noun not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(entry);
  } catch (error) {
    const { id } = await params;
    const { message, status } = handleDatabaseError(error, `GET /api/nouns/${id}`);
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
        { error: 'Noun not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(updatedEntry);
  } catch (error) {
    const { id } = await params;
    const { message, status } = handleDatabaseError(error, `PATCH /api/nouns/${id}`);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deletedEntry = await deleteEntry(id);
    
    if (!deletedEntry) {
      return NextResponse.json(
        { error: 'Noun not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Noun ${id} deleted successfully`,
      deletedEntry 
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    const { id } = await params;
    const { message, status } = handleDatabaseError(error, `DELETE /api/nouns/${id}`);
    return NextResponse.json({ error: message }, { status });
  }
}


