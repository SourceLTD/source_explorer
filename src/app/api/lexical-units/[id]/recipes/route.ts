import { NextRequest, NextResponse } from 'next/server';
import { getRecipesForEntryInternal } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await getRecipesForEntryInternal(id);
    return NextResponse.json(result);
  } catch (error) {
    const { message, status } = handleDatabaseError(error, `GET /api/lexical-units/${id}/recipes`);
    return NextResponse.json({ error: message }, { status });
  }
}
