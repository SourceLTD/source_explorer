import { NextRequest, NextResponse } from 'next/server';
import { searchLexicalUnits } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';
import { PartOfSpeech } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 20;
  
  // Optional POS filter
  const pos = searchParams.get('pos') as PartOfSpeech | undefined;

  if (!query) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
  }

  try {
    // Search across all lexical units if pos is not specified
    const results = await searchLexicalUnits(query, limit, pos);
    return NextResponse.json(results);
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, 'GET /api/search');
    return NextResponse.json(
      { 
        error: message,
        retryable: shouldRetry,
        timestamp: new Date().toISOString()
      },
      { 
        status,
        headers: shouldRetry ? { 'Retry-After': '5' } : {}
      }
    );
  }
}
