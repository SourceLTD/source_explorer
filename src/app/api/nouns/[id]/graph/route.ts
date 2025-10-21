import { NextRequest, NextResponse } from 'next/server';
import { getNounGraphNode } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const node = await getNounGraphNode(params.id);
    
    if (!node) {
      return NextResponse.json(
        { error: 'Noun not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(node);
  } catch (error) {
    const { message, status } = handleDatabaseError(error, `GET /api/nouns/${params.id}/graph`);
    return NextResponse.json({ error: message }, { status });
  }
}


