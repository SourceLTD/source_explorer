import { NextRequest, NextResponse } from 'next/server';
import { 
  getEntryById, 
  updateEntry, 
  deleteEntry, 
  searchEntries,
  updateModerationStatus,
  getGraphNode,
  getPaginatedEntries,
  getPaginatedNouns,
  getPaginatedAdjectives,
  getPaginatedAdverbs
} from './db';
import { handleDatabaseError } from './db-utils';
import type { LexicalType, PaginationParams } from './types';

/**
 * Helper to get entity name from lexical type
 */
function getEntityName(lexicalType: LexicalType): string {
  const names: Record<LexicalType, string> = {
    verbs: 'Verb',
    nouns: 'Noun',
    adjectives: 'Adjective',
    adverbs: 'Adverb'
  };
  return names[lexicalType];
}

/**
 * Helper to get the appropriate paginated function based on lexical type
 */
function getPaginatedFunction(lexicalType: LexicalType) {
  const functions = {
    verbs: getPaginatedEntries,
    nouns: getPaginatedNouns,
    adjectives: getPaginatedAdjectives,
    adverbs: getPaginatedAdverbs
  };
  return functions[lexicalType];
}

/**
 * Helper to get search table name from lexical type
 */
function getSearchTable(lexicalType: LexicalType): 'verbs' | 'nouns' | 'adjectives' | 'adverbs' {
  return lexicalType;
}

/**
 * Handles paginated requests for any lexical type
 */
export async function handlePaginatedRequest(
  request: NextRequest,
  lexicalType: LexicalType
): Promise<NextResponse> {
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
      flaggedReason: searchParams.get('flaggedReason') || undefined,
      forbiddenReason: searchParams.get('forbiddenReason') || undefined,
      isMwe: searchParams.get('isMwe') === 'true' ? true : searchParams.get('isMwe') === 'false' ? false : undefined,
      flagged: searchParams.get('flagged') === 'true' ? true : searchParams.get('flagged') === 'false' ? false : undefined,
      forbidden: searchParams.get('forbidden') === 'true' ? true : searchParams.get('forbidden') === 'false' ? false : undefined,
      parentsCountMin: searchParams.get('parentsCountMin') ? parseInt(searchParams.get('parentsCountMin')!) : undefined,
      parentsCountMax: searchParams.get('parentsCountMax') ? parseInt(searchParams.get('parentsCountMax')!) : undefined,
      childrenCountMin: searchParams.get('childrenCountMin') ? parseInt(searchParams.get('childrenCountMin')!) : undefined,
      childrenCountMax: searchParams.get('childrenCountMax') ? parseInt(searchParams.get('childrenCountMax')!) : undefined,
      createdAfter: searchParams.get('createdAfter') || undefined,
      createdBefore: searchParams.get('createdBefore') || undefined,
      updatedAfter: searchParams.get('updatedAfter') || undefined,
      updatedBefore: searchParams.get('updatedBefore') || undefined,
    };

    const paginatedFunction = getPaginatedFunction(lexicalType);
    const result = await paginatedFunction(params);
    return NextResponse.json(result);
  } catch (error) {
    const { message, status } = handleDatabaseError(error, `GET /api/${lexicalType}/paginated`);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Handles GET by ID requests for any lexical type
 */
export async function handleGetById(
  id: string,
  lexicalType: LexicalType,
  routePath: string
): Promise<NextResponse> {
  try {
    const entry = await getEntryById(id);
    
    if (!entry) {
      return NextResponse.json(
        { error: `${getEntityName(lexicalType)} not found` },
        { status: 404 }
      );
    }
    
    return NextResponse.json(entry);
  } catch (error) {
    const { message, status } = handleDatabaseError(error, routePath);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Handles PATCH (update) requests for any lexical type
 */
export async function handleUpdateById(
  id: string,
  body: unknown,
  lexicalType: LexicalType,
  routePath: string
): Promise<NextResponse> {
  try {
    const updatedEntry = await updateEntry(id, body as any);
    
    if (!updatedEntry) {
      return NextResponse.json(
        { error: `${getEntityName(lexicalType)} not found` },
        { status: 404 }
      );
    }
    
    return NextResponse.json(updatedEntry);
  } catch (error) {
    const { message, status } = handleDatabaseError(error, routePath);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Handles DELETE requests for any lexical type
 */
export async function handleDeleteById(
  id: string,
  lexicalType: LexicalType,
  routePath: string
): Promise<NextResponse> {
  try {
    const deletedEntry = await deleteEntry(id);
    
    if (!deletedEntry) {
      return NextResponse.json(
        { error: `${getEntityName(lexicalType)} not found` },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `${getEntityName(lexicalType)} ${id} deleted successfully`,
      deletedEntry 
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    const { message, status } = handleDatabaseError(error, routePath);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Handles search requests for any lexical type
 */
export async function handleSearchRequest(
  request: NextRequest,
  lexicalType: LexicalType
): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 20;

  if (!query) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
  }

  try {
    const results = await searchEntries(query, limit, getSearchTable(lexicalType));
    return NextResponse.json(results);
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, `GET /api/${lexicalType}/search`);
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

/**
 * Handles GET relations requests for any lexical type
 */
export async function handleGetRelations(
  id: string,
  lexicalType: LexicalType,
  routePath: string
): Promise<NextResponse> {
  try {
    const entry = await getEntryById(id);
    
    if (!entry) {
      return NextResponse.json(
        { error: `${getEntityName(lexicalType)} not found` },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      sourceRelations: entry.sourceRelations,
      targetRelations: entry.targetRelations
    });
  } catch (error) {
    const { message, status } = handleDatabaseError(error, routePath);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Handles GET graph requests for any lexical type
 */
export async function handleGetGraph(
  id: string,
  lexicalType: LexicalType,
  routePath: string
): Promise<NextResponse> {
  try {
    const node = await getGraphNode(id);
    
    if (!node) {
      return NextResponse.json(
        { error: `${getEntityName(lexicalType)} not found` },
        { status: 404 }
      );
    }
    
    return NextResponse.json(node);
  } catch (error) {
    const { message, status } = handleDatabaseError(error, routePath);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * Handles PATCH moderation requests for any lexical type
 */
export async function handleModerationRequest(
  request: NextRequest,
  lexicalType: LexicalType
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { ids, updates } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'ids array is required' },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { error: 'updates object is required' },
        { status: 400 }
      );
    }

    const count = await updateModerationStatus(ids, updates, lexicalType);
    
    return NextResponse.json({ 
      success: true,
      count,
      message: `Updated ${count} ${lexicalType}` 
    });
  } catch (error) {
    const { message, status } = handleDatabaseError(error, `PATCH /api/${lexicalType}/moderation`);
    return NextResponse.json({ error: message }, { status });
  }
}

