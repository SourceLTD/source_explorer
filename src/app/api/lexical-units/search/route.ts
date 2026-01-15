import { NextRequest, NextResponse } from 'next/server';
import { searchLexicalUnits } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';
import type { PartOfSpeech } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Unified lexical-units search endpoint.
 * POST body: { query: string, limit?: number, pos?: PartOfSpeech | PartOfSpeech[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = typeof body?.query === 'string' ? body.query : '';
    const limit = typeof body?.limit === 'number' ? body.limit : 20;
    const pos = body?.pos as PartOfSpeech | PartOfSpeech[] | undefined;

    if (!query.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const results = await searchLexicalUnits(query, limit, pos);
    return NextResponse.json({ results });
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, 'POST /api/lexical-units/search');
    return NextResponse.json(
      { error: message, retryable: shouldRetry, timestamp: new Date().toISOString() },
      { status, headers: shouldRetry ? { 'Retry-After': '5' } : {} }
    );
  }
}
