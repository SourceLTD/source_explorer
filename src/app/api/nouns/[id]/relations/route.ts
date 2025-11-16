import { NextRequest } from 'next/server';
import { handleGetRelations } from '@/lib/route-handlers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleGetRelations(id, 'nouns', `GET /api/nouns/${id}/relations`);
}


