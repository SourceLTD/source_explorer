import { NextRequest, NextResponse } from 'next/server';
import { getAdjectiveById, updateAdjective } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const entry = await getAdjectiveById(params.id);
    
    if (!entry) {
      return NextResponse.json(
        { error: 'Adjective not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(entry);
  } catch (error) {
    const { message, status } = handleDatabaseError(error, `GET /api/adjectives/${params.id}`);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const updatedEntry = await updateAdjective(params.id, body);
    
    if (!updatedEntry) {
      return NextResponse.json(
        { error: 'Adjective not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(updatedEntry);
  } catch (error) {
    const { message, status } = handleDatabaseError(error, `PATCH /api/adjectives/${params.id}`);
    return NextResponse.json({ error: message }, { status });
  }
}

