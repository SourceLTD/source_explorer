import { NextRequest, NextResponse } from 'next/server';
import { getEntryById } from '@/lib/db';
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
    
    return NextResponse.json({
      sourceRelations: entry.sourceRelations,
      targetRelations: entry.targetRelations
    });
  } catch (error) {
    const { id } = await params;
    const { message, status } = handleDatabaseError(error, `GET /api/adjectives/${id}/relations`);
    return NextResponse.json({ error: message }, { status });
  }
}


