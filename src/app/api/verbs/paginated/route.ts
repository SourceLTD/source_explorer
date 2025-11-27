import { NextRequest, NextResponse } from 'next/server';
import { getPaginatedEntries } from '@/lib/db';
import { PaginationParams } from '@/lib/types';
import { handleDatabaseError } from '@/lib/db-utils';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Debug logging to catch src_id usage
  const sortByParam = searchParams.get('sortBy');
  if (sortByParam === 'src_id') {
    console.warn('⚠️  WARNING: Request received with sortBy=src_id, converting to legacy_id');
    console.warn('Request URL:', request.url);
    console.warn('All params:', Object.fromEntries(searchParams.entries()));
  }
  
  // Convert old field names to new ones for backward compatibility
  let sortBy = searchParams.get('sortBy') || 'id';
  if (sortBy === 'src_id') {
    sortBy = 'legacy_id';
  }
  if (sortBy === 'frame') {
    sortBy = 'frame_id';
  }
  
  const pageParam = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;
  const limitParam = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 10;
  
  const params: PaginationParams = {
    page: (!isNaN(pageParam) && pageParam >= 1) ? pageParam : 1,
    limit: (!isNaN(limitParam) && limitParam >= 1 && limitParam <= 2000) ? limitParam : 10,
    sortBy: sortBy,
    sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc',
    search: searchParams.get('search') || undefined,
    
    // Basic filters (legacy)
    pos: searchParams.get('pos') || undefined,
    lexfile: searchParams.get('lexfile') || undefined,
    frame_id: searchParams.get('frame_id') || undefined,
    
    // Advanced filters
    gloss: searchParams.get('gloss') || undefined,
    lemmas: searchParams.get('lemmas') || undefined,
    examples: searchParams.get('examples') || undefined,
    particles: searchParams.get('particles') || undefined,
    flaggedReason: searchParams.get('flaggedReason') || undefined,
    forbiddenReason: searchParams.get('forbiddenReason') || undefined,
    // AI jobs filters
    flaggedByJobId: searchParams.get('flaggedByJobId') || undefined,
    
    // Boolean filters
    isMwe: searchParams.get('isMwe') ? searchParams.get('isMwe') === 'true' : undefined,
    transitive: searchParams.get('transitive') ? searchParams.get('transitive') === 'true' : undefined,
    flagged: searchParams.get('flagged') ? searchParams.get('flagged') === 'true' : undefined,
    forbidden: searchParams.get('forbidden') ? searchParams.get('forbidden') === 'true' : undefined,
    
    // Numeric filters
    parentsCountMin: searchParams.get('parentsCountMin') ? parseInt(searchParams.get('parentsCountMin')!, 10) : undefined,
    parentsCountMax: searchParams.get('parentsCountMax') ? parseInt(searchParams.get('parentsCountMax')!, 10) : undefined,
    childrenCountMin: searchParams.get('childrenCountMin') ? parseInt(searchParams.get('childrenCountMin')!, 10) : undefined,
    childrenCountMax: searchParams.get('childrenCountMax') ? parseInt(searchParams.get('childrenCountMax')!, 10) : undefined,
    
    // Date filters
    createdAfter: searchParams.get('createdAfter') || undefined,
    createdBefore: searchParams.get('createdBefore') || undefined,
    updatedAfter: searchParams.get('updatedAfter') || undefined,
    updatedBefore: searchParams.get('updatedBefore') || undefined,
  };

  // Validate pagination params
  if (isNaN(params.page!) || params.page! < 1) {
    return NextResponse.json({ error: 'Page must be a valid number >= 1' }, { status: 400 });
  }

  // Validate limit range
  if (isNaN(params.limit!) || params.limit! < 1 || params.limit! > 2000) {
    return NextResponse.json({ error: 'Limit must be a valid number between 1 and 2000' }, { status: 400 });
  }

  // Validate sort fields
  const validSortFields = ['id', 'legacy_id', 'gloss', 'pos', 'lexfile', 'lemmas', 'src_lemmas', 'frame_id', 'vendler_class', 'parentsCount', 'childrenCount', 'createdAt', 'updatedAt'];
  if (!validSortFields.includes(params.sortBy!)) {
    return NextResponse.json({ error: 'Invalid sortBy field' }, { status: 400 });
  }

  try {
    const result = await getPaginatedEntries(params);
    return NextResponse.json(result);
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, 'GET /api/verbs/paginated');
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

