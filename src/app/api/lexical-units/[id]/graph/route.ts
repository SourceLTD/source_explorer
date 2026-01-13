import { NextRequest } from 'next/server';
import { handleGetGraph } from '@/lib/route-handlers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  return handleGetGraph(id, 'lexical_units' as any, `GET /api/lexical-units/${id}/graph`, searchParams);
}
