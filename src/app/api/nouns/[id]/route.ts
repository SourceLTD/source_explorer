import { NextRequest, NextResponse } from 'next/server';
import { getNounById, updateNoun } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const entry = await getNounById(params.id);
    
    if (!entry) {
      return NextResponse.json(
        { error: 'Noun not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(entry);
  } catch (error) {
    const { message, status } = handleDatabaseError(error, `GET /api/nouns/${params.id}`);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const updatedEntry = await updateNoun(params.id, body);
    
    if (!updatedEntry) {
      return NextResponse.json(
        { error: 'Noun not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(updatedEntry);
  } catch (error) {
    const { message, status } = handleDatabaseError(error, `PATCH /api/nouns/${params.id}`);
    return NextResponse.json({ error: message }, { status });
  }
}

