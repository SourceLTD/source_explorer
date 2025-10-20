import { NextRequest, NextResponse } from 'next/server';
import { getRecipesForEntry } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';

// Import internal version for cache bypass
import { getRecipesForEntryInternal } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    // Check for cache invalidation
    const { searchParams } = new URL(request.url);
    const skipCache = searchParams.get('nocache') === 'true';
    
    const data = skipCache 
      ? await getRecipesForEntryInternal(id)
      : await getRecipesForEntry(id);
      
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': skipCache ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, 'GET /api/entries/[id]/recipes');
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


