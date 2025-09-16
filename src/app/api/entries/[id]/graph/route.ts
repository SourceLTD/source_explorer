import { NextRequest, NextResponse } from 'next/server';
import { getGraphNode } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const graphNode = await getGraphNode(id);
    
    if (!graphNode) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json(graphNode);
  } catch (error) {
    console.error('Error fetching graph node:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
