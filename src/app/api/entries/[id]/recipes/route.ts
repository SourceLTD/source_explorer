import { NextRequest, NextResponse } from 'next/server';
import { getRecipesForEntry } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';

// Import internal version for cache bypass
import { getRecipesForEntryInternal } from '@/lib/db';

// Force dynamic rendering - no static optimization
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    // Check for cache invalidation
    const { searchParams } = new URL(request.url);
    const skipCache = searchParams.has('t'); // If timestamp param exists, bypass cache
    
    const data = skipCache 
      ? await getRecipesForEntryInternal(id)
      : await getRecipesForEntry(id);
      
    if (skipCache) {
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
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


