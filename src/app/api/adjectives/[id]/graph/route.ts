import { NextRequest, NextResponse } from 'next/server';
import { getAdjectiveGraphNode } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const node = await getAdjectiveGraphNode(params.id);
    
    if (!node) {
      return NextResponse.json(
        { error: 'Adjective not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(node);
  } catch (error) {
    const { message, status } = handleDatabaseError(error, `GET /api/adjectives/${params.id}/graph`);
    return NextResponse.json({ error: message }, { status });
  }
}

