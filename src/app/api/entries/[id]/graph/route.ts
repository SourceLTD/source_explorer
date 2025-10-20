import { NextRequest, NextResponse } from 'next/server';
import { getGraphNode, getGraphNodeUncached, revalidateGraphNodeCache } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    // Check for cache invalidation parameter
    const { searchParams } = new URL(request.url);
    const invalidateCache = searchParams.get('invalidate') === 'true';
    
    let graphNode;
    let cacheHeaders;
    
    if (invalidateCache) {
      // Invalidate the cache tag
      revalidateGraphNodeCache();
      // Bypass cache entirely and fetch fresh data
      graphNode = await getGraphNodeUncached(id);
      // Set no-cache headers to prevent browser caching
      cacheHeaders = {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      };
    } else {
      // Use cached version
      graphNode = await getGraphNode(id);
      // Add cache headers for browser and CDN caching
      cacheHeaders = {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      };
    }
    
    if (!graphNode) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json(graphNode, {
      headers: cacheHeaders,
    });
  } catch (error) {
    console.error('Error fetching graph node:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
