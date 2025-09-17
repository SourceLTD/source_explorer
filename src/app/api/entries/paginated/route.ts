import { NextRequest, NextResponse } from 'next/server';
import { getPaginatedEntries } from '@/lib/db';
import { PaginationParams } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const params: PaginationParams = {
    page: searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1,
    limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 20,
    sortBy: searchParams.get('sortBy') || 'id',
    sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc',
    search: searchParams.get('search') || undefined,
    pos: searchParams.get('pos') || undefined,
    lexfile: searchParams.get('lexfile') || undefined,
  };

  // Validate pagination params
  if (params.page! < 1) {
    return NextResponse.json({ error: 'Page must be >= 1' }, { status: 400 });
  }

  if (params.limit! < 1 || params.limit! > 100) {
    return NextResponse.json({ error: 'Limit must be between 1 and 100' }, { status: 400 });
  }

  // Validate sort fields
  const validSortFields = ['id', 'gloss', 'pos', 'lexfile', 'lemmas', 'parentsCount', 'childrenCount', 'createdAt', 'updatedAt'];
  if (!validSortFields.includes(params.sortBy!)) {
    return NextResponse.json({ error: 'Invalid sortBy field' }, { status: 400 });
  }

  try {
    const result = await getPaginatedEntries(params);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching paginated entries:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}