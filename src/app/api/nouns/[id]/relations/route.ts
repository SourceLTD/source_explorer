import { NextRequest, NextResponse } from 'next/server';
import { getNounById } from '@/lib/db';
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
    
    return NextResponse.json({
      sourceRelations: entry.sourceRelations,
      targetRelations: entry.targetRelations
    });
  } catch (error) {
    const { message, status } = handleDatabaseError(error, `GET /api/nouns/${params.id}/relations`);
    return NextResponse.json({ error: message }, { status });
  }
}

