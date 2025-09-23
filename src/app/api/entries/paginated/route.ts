import { NextRequest, NextResponse } from 'next/server';
import { getPaginatedEntries } from '@/lib/db';
import { PaginationParams } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const params: PaginationParams = {
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20,
      sortBy: searchParams.get('sortBy') || 'id',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc',
      search: searchParams.get('search') || undefined,
      pos: searchParams.get('pos') || undefined,
      lexfile: searchParams.get('lexfile') || undefined,
      isMwe: searchParams.get('isMwe') ? searchParams.get('isMwe') === 'true' : undefined,
      transitive: searchParams.get('transitive') ? searchParams.get('transitive') === 'true' : undefined,
      hasParticles: searchParams.get('hasParticles') ? searchParams.get('hasParticles') === 'true' : undefined,
      hasFrames: searchParams.get('hasFrames') ? searchParams.get('hasFrames') === 'true' : undefined,
      hasExamples: searchParams.get('hasExamples') ? searchParams.get('hasExamples') === 'true' : undefined,
      lemmaContains: searchParams.get('lemmaContains') || undefined,
      glossContains: searchParams.get('glossContains') || undefined,
      minParents: searchParams.get('minParents') ? parseInt(searchParams.get('minParents')!) : undefined,
      maxParents: searchParams.get('maxParents') ? parseInt(searchParams.get('maxParents')!) : undefined,
      minChildren: searchParams.get('minChildren') ? parseInt(searchParams.get('minChildren')!) : undefined,
      maxChildren: searchParams.get('maxChildren') ? parseInt(searchParams.get('maxChildren')!) : undefined,
      createdAfter: searchParams.get('createdAfter') || undefined,
      createdBefore: searchParams.get('createdBefore') || undefined,
    };

    const result = await getPaginatedEntries(params);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching paginated entries:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}