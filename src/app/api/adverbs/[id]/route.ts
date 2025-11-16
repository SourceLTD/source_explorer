import { NextRequest } from 'next/server';
import { handleGetById, handleUpdateById, handleDeleteById } from '@/lib/route-handlers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleGetById(id, 'adverbs', `GET /api/adverbs/${id}`);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  return handleUpdateById(id, body, 'adverbs', `PATCH /api/adverbs/${id}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleDeleteById(id, 'adverbs', `DELETE /api/adverbs/${id}`);
}
