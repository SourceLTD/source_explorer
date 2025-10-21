import { NextRequest, NextResponse } from 'next/server';
import { getPaginatedEntries } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';
import type { PaginationParams } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const params: PaginationParams = {
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined,
      search: searchParams.get('search') || undefined,
      pos: searchParams.get('pos') || undefined,
      lexfile: searchParams.get('lexfile') || undefined,
      gloss: searchParams.get('gloss') || undefined,
      lemmas: searchParams.get('lemmas') || undefined,
      examples: searchParams.get('examples') || undefined,
      isMwe: searchParams.get('isMwe') === 'true' ? true : searchParams.get('isMwe') === 'false' ? false : undefined,
      flagged: searchParams.get('flagged') === 'true' ? true : searchParams.get('flagged') === 'false' ? false : undefined,
      forbidden: searchParams.get('forbidden') === 'true' ? true : searchParams.get('forbidden') === 'false' ? false : undefined,
      createdAfter: searchParams.get('createdAfter') || undefined,
      createdBefore: searchParams.get('createdBefore') || undefined,
      updatedAfter: searchParams.get('updatedAfter') || undefined,
      updatedBefore: searchParams.get('updatedBefore') || undefined,
    };

    const result = await getPaginatedEntries(params);
    return NextResponse.json(result);
  } catch (error) {
    const { message, status } = handleDatabaseError(error, 'GET /api/adjectives/paginated');
    return NextResponse.json({ error: message }, { status });
  }
}


