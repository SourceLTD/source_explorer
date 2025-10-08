import { NextRequest, NextResponse } from 'next/server';
import { getGraphNode } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Enable static route caching - data changes infrequently
export const dynamic = 'force-static';
export const revalidate = 3600; // Revalidate every hour

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const graphNode = await getGraphNode(id);
    
    if (!graphNode) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // Add cache headers for browser and CDN caching
    return NextResponse.json(graphNode, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('Error fetching graph node:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
