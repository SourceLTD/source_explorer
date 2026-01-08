import { NextRequest } from 'next/server';
import { handleGetById, handleUpdateById, handleDeleteById } from '@/lib/route-handlers';

// Force dynamic rendering - no static optimization
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleGetById(id, 'verbs', `GET /api/verbs/${id}`);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  return handleUpdateById(id, body, 'verbs', `PATCH /api/verbs/${id}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleDeleteById(id, 'verbs', `DELETE /api/verbs/${id}`);
}
