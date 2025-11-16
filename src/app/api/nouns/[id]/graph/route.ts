import { NextRequest } from 'next/server';
import { handleGetGraph } from '@/lib/route-handlers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleGetGraph(id, 'nouns', `GET /api/nouns/${id}/graph`);
}


