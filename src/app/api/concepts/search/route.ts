import { NextRequest, NextResponse } from 'next/server';
import { searchConceptsLegacy } from '@/lib/search/concepts';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    if (!query || query.trim().length < 2) {
      return NextResponse.json([]);
    }

    const results = await searchConceptsLegacy(query, limit);
    return NextResponse.json(results);
  } catch (error) {
    console.error('[API] Error searching concepts:', error);
    return NextResponse.json(
      { error: 'Failed to search concepts' },
      { status: 500 }
    );
  }
}
