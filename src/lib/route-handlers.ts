import { NextRequest, NextResponse } from 'next/server';
import { 
  getEntryById, 
  searchEntries,
  getGraphNode,
  getGraphNodeUncached,
  updateModerationStatus,
} from './db';
import { getPaginatedEntities } from './db/entities';
import { handleDatabaseError } from './db-utils';
import { stageUpdate, stageDelete, stageModerationUpdates, EntityType, attachPendingInfoToEntities, getPendingInfoForEntity, applyPendingToEntity } from './version-control';
import type { LexicalType, PaginationParams, TableEntry } from './types';
import { getCurrentUserName } from '@/utils/supabase/server';

/**
 * Helper to convert LexicalType to EntityType
 */
function lexicalTypeToEntityType(_lexicalType: LexicalType | 'lexical_units'): EntityType {
  return 'lexical_unit';
}

/**
 * Helper to get entity name from lexical type
 */
function getEntityName(_lexicalType: LexicalType | 'lexical_units'): string {
  return 'Lexical Unit';
}

/**
 * Valid sortBy fields for pagination
 */
const VALID_SORT_FIELDS = [
  'id', 'legacy_id', 'code', 'gloss', 'pos', 'lexfile', 'lemmas', 'src_lemmas', 
  'frame_id', 'vendler_class', 'parentsCount', 'childrenCount', 
  'createdAt', 'updatedAt', 'created_at', 'updated_at'
];

/**
 * Parse pagination parameters from URL search params
 */
function parsePaginationParams(searchParams: URLSearchParams): { 
  params: PaginationParams; 
  validationError: string | null;
} {
  let sortBy = searchParams.get('sortBy') || 'id';
  if (sortBy === 'src_id') {
    sortBy = 'legacy_id';
  }
  if (sortBy === 'frame') {
    sortBy = 'frame_id';
  }

  const pageParam = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;
  const limitParam = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 10;
  
  if (isNaN(pageParam) || pageParam < 1) {
    return { 
      params: {} as PaginationParams, 
      validationError: 'Page must be a valid number >= 1' 
    };
  }
  
  if (isNaN(limitParam) || limitParam < 1 || limitParam > 2000) {
    return { 
      params: {} as PaginationParams, 
      validationError: 'Limit must be a valid number between 1 and 2000' 
    };
  }

  if (!VALID_SORT_FIELDS.includes(sortBy)) {
    return { 
      params: {} as PaginationParams, 
      validationError: 'Invalid sortBy field' 
    };
  }

  return {
    validationError: null,
    params: {
      page: pageParam,
      limit: limitParam,
      sortBy,
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc',
      search: searchParams.get('search') || undefined,
      
      // Basic filters
      pos: searchParams.get('pos') || undefined,
      lexfile: searchParams.get('lexfile') || undefined,
      frame_id: searchParams.get('frame_id') || undefined,
      
      // Advanced filters
      gloss: searchParams.get('gloss') || undefined,
      lemmas: searchParams.get('lemmas') || undefined,
      examples: searchParams.get('examples') || undefined,
      flaggedReason: searchParams.get('flaggedReason') || undefined,
      unverifiableReason: searchParams.get('unverifiableReason') || undefined,
      
      // AI jobs filters
      flaggedByJobId: searchParams.get('flaggedByJobId') || undefined,
      
      // Boolean filters
      isMwe: searchParams.get('isMwe') === 'true' ? true : searchParams.get('isMwe') === 'false' ? false : undefined,
      flagged: searchParams.get('flagged') === 'true' ? true : searchParams.get('flagged') === 'false' ? false : undefined,
      verifiable: searchParams.get('verifiable') === 'true' ? true : searchParams.get('verifiable') === 'false' ? false : undefined,
      excludeNullFrame: searchParams.get('excludeNullFrame') === 'true',
      
      // Pending state filters
      pendingCreate: searchParams.get('pendingCreate') === 'true' ? true : undefined,
      pendingUpdate: searchParams.get('pendingUpdate') === 'true' ? true : undefined,
      pendingDelete: searchParams.get('pendingDelete') === 'true' ? true : undefined,
      
      // Numeric filters
      parentsCountMin: searchParams.get('parentsCountMin') ? parseInt(searchParams.get('parentsCountMin')!) : undefined,
      parentsCountMax: searchParams.get('parentsCountMax') ? parseInt(searchParams.get('parentsCountMax')!) : undefined,
      childrenCountMin: searchParams.get('childrenCountMin') ? parseInt(searchParams.get('childrenCountMin')!) : undefined,
      childrenCountMax: searchParams.get('childrenCountMax') ? parseInt(searchParams.get('childrenCountMax')!) : undefined,
      
      // Date filters
      createdAfter: searchParams.get('createdAfter') || undefined,
      createdBefore: searchParams.get('createdBefore') || undefined,
      updatedAfter: searchParams.get('updatedAfter') || undefined,
      updatedBefore: searchParams.get('updatedBefore') || undefined,
    }
  };
}

/**
 * Handles paginated requests for any lexical type
 */
export async function handlePaginatedRequest(
  request: NextRequest,
  lexicalType: LexicalType | 'lexical_units'
): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const { params, validationError } = parsePaginationParams(searchParams);
    
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const result = await getPaginatedEntities(params);
    
    const entityType = lexicalTypeToEntityType(lexicalType);
    const dataWithPending = await attachPendingInfoToEntities(
      result.data,
      entityType,
      (entry: TableEntry) => BigInt(entry.numericId)
    );
    
    return NextResponse.json({
      ...result,
      data: dataWithPending,
    });
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, `GET /api/${lexicalType}/paginated`);
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
 * Handles GET by ID requests
 */
export async function handleGetById(
  id: string,
  _lexicalType: LexicalType | 'lexical_units',
  routePath: string
): Promise<NextResponse> {
  try {
    const entry = await getEntryById(id);
    
    if (!entry) {
      return NextResponse.json(
        { error: `${getEntityName(_lexicalType)} not found` },
        { status: 404 }
      );
    }
    
    return NextResponse.json(entry);
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, routePath);
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
 * Get allowed fields for each entity type
 */
function getAllowedFieldsForType(lexicalType: LexicalType | 'lexical_units'): string[] {
  const commonFields = ['id', 'gloss', 'lemmas', 'src_lemmas', 'examples', 'lexfile', 'flagged', 'flaggedReason', 'frame_id'];
  
  return [...commonFields, 'vendler_class', 'countable', 'proper', 'collective', 'concrete', 'predicate', 'isMwe', 'gradable', 'predicative', 'attributive', 'subjective', 'relational', 'isSatellite'];
}

/**
 * Handles PATCH (update) requests
 */
export async function handleUpdateById(
  id: string,
  body: unknown,
  lexicalType: LexicalType | 'lexical_units',
  routePath: string
): Promise<NextResponse> {
  try {
    const entityType = lexicalTypeToEntityType(lexicalType);
    const userId = await getCurrentUserName();
    
    const updates = body as Record<string, unknown>;
    const allowedFields = getAllowedFieldsForType(lexicalType);
    const updateData: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    if ('flagged' in updateData || 'flaggedReason' in updateData) {
      const moderationUpdates: Record<string, any> = {};
      if ('flagged' in updateData) {
        moderationUpdates.flagged = updateData.flagged;
        delete updateData.flagged;
      }
      if ('flaggedReason' in updateData) {
        moderationUpdates.flaggedReason = updateData.flaggedReason;
        delete updateData.flaggedReason;
      }
      
      await updateModerationStatus([id], moderationUpdates);
      
      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ 
          success: true, 
          message: 'Flagging status updated successfully' 
        });
      }
    }

    // Stage all updates directly
    const response = await stageUpdate(entityType, id, updateData, userId);
    
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, routePath);
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
 * Handles DELETE requests
 */
export async function handleDeleteById(
  id: string,
  lexicalType: LexicalType | 'lexical_units',
  routePath: string
): Promise<NextResponse> {
  try {
    const entityType = lexicalTypeToEntityType(lexicalType);
    const userId = await getCurrentUserName();
    
    const response = await stageDelete(entityType, id, userId);
    
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, routePath);
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
 * Handles search requests
 */
export async function handleSearchRequest(
  request: NextRequest,
  lexicalType: LexicalType | 'lexical_units'
): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 20;

  if (!query) {
    return NextResponse.json({ error: 'Search query is required' }, { status: 400 });
  }

  try {
    // Determine POS if using legacy routes
    let pos: any = undefined;
    if (lexicalType !== 'lexical_units') {
      const posMap: Record<string, string> = {
        verbs: 'verb',
        nouns: 'noun',
        adjectives: 'adjective',
        adverbs: 'adverb'
      };
      pos = posMap[lexicalType];
    }

    const results = await searchEntries(query, limit, pos);
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
 * Handles GET relations requests
 */
export async function handleGetRelations(
  id: string,
  lexicalType: LexicalType | 'lexical_units',
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
    const { message, status, shouldRetry } = handleDatabaseError(error, routePath);
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
 * Handles GET graph requests
 */
export async function handleGetGraph(
  id: string,
  lexicalType: LexicalType | 'lexical_units',
  routePath: string,
  searchParams?: URLSearchParams
): Promise<NextResponse> {
  try {
    const shouldInvalidate = searchParams?.get('invalidate') === 'true';
    const node = shouldInvalidate 
      ? await getGraphNodeUncached(id)
      : await getGraphNode(id);
    
    if (!node) {
      return NextResponse.json(
        { error: `${getEntityName(lexicalType)} not found` },
        { status: 404 }
      );
    }
    
    const entityType = lexicalTypeToEntityType(lexicalType);
    const { entity: nodeWithPendingValues, pending: pendingInfo } = await applyPendingToEntity(
      node,
      entityType,
      BigInt(node.numericId)
    );
    
    const attachPendingToNodes = async (nodes: typeof node.parents) => {
      if (!nodes || nodes.length === 0) return nodes;
      
      const nodesWithPending = await Promise.all(
        nodes.map(async (n) => {
          const pending = await getPendingInfoForEntity(entityType, BigInt(n.numericId));
          return { ...n, pending };
        })
      );
      return nodesWithPending;
    };
    
    const [parentsWithPending, childrenWithPending] = await Promise.all([
      attachPendingToNodes(nodeWithPendingValues.parents),
      attachPendingToNodes(nodeWithPendingValues.children),
    ]);
    
    return NextResponse.json({
      ...nodeWithPendingValues,
      pending: pendingInfo,
      parents: parentsWithPending,
      children: childrenWithPending,
    });
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, routePath);
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
 * Valid moderation fields
 */
const VALID_MODERATION_FIELDS = ['flagged', 'flaggedReason', 'verifiable', 'unverifiableReason'];

/**
 * Handles PATCH moderation requests
 */
export async function handleModerationRequest(
  request: NextRequest,
  lexicalType: LexicalType | 'lexical_units'
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

    const hasValidUpdate = Object.keys(updates).some(key => VALID_MODERATION_FIELDS.includes(key));
    if (!hasValidUpdate) {
      return NextResponse.json(
        { error: 'At least one moderation field must be updated' },
        { status: 400 }
      );
    }

    const entityType = lexicalTypeToEntityType(lexicalType);
    const userId = await getCurrentUserName();
    
    const directUpdates: Record<string, any> = {};
    const stagedUpdates: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'flagged' || key === 'flaggedReason') {
        directUpdates[key] = value;
      } else if (VALID_MODERATION_FIELDS.includes(key)) {
        stagedUpdates[key] = value;
      }
    }

    let stagedCount = 0;
    let directCount = 0;
    let changesetIds: string[] = [];
    let message = '';

    if (Object.keys(directUpdates).length > 0) {
      const { updatedCount } = await updateModerationStatus(ids, directUpdates);
      directCount = updatedCount;
      message = `Updated flagging status for ${directCount} entries. `;
    }

    if (Object.keys(stagedUpdates).length > 0) {
      const result = await stageModerationUpdates(entityType, ids, stagedUpdates, userId);
      stagedCount = result.staged_count;
      changesetIds = result.changeset_ids;
      message += `Staged other moderation changes for ${result.staged_count} entries.`;
    }

    return NextResponse.json({ 
      staged: Object.keys(stagedUpdates).length > 0,
      staged_count: stagedCount,
      updated_count: directCount,
      count: directCount,
      changeset_ids: changesetIds,
      message: message.trim() || 'No changes applied'
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, `PATCH /api/${lexicalType}/moderation`);
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
