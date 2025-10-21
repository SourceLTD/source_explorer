import { NextRequest, NextResponse } from 'next/server';
import { getAdjectiveById } from '@/lib/db';
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
    
    return NextResponse.json({
      sourceRelations: entry.sourceRelations,
      targetRelations: entry.targetRelations
    });
  } catch (error) {
    const { message, status } = handleDatabaseError(error, `GET /api/adjectives/${params.id}/relations`);
    return NextResponse.json({ error: message }, { status });
  }
}


