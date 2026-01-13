import { NextRequest } from 'next/server';
import { handleGetById, handleUpdateById, handleDeleteById } from '@/lib/route-handlers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleGetById(id, 'lexical_units' as any, `GET /api/lexical-units/${id}`);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  return handleUpdateById(id, body, 'lexical_units' as any, `PATCH /api/lexical-units/${id}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleDeleteById(id, 'lexical_units' as any, `DELETE /api/lexical-units/${id}`);
}
