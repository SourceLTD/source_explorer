import { NextRequest, NextResponse } from 'next/server';
import { searchAdjectives } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 20;

  if (!query) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
  }

  try {
    const results = await searchAdjectives(query, limit);
    return NextResponse.json(results);
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, 'GET /api/adjectives/search');
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

