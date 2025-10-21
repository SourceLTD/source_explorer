import { NextRequest, NextResponse } from 'next/server';
import { getGraphNode } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const node = await getGraphNode(id);
    
    if (!node) {
      return NextResponse.json(
        { error: 'Noun not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(node);
  } catch (error) {
    const { id } = await params;
    const { message, status } = handleDatabaseError(error, `GET /api/nouns/${id}/graph`);
    return NextResponse.json({ error: message }, { status });
  }
}


