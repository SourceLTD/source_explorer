import { NextRequest, NextResponse } from 'next/server';
import { 
  getEntryById, 
  searchEntries,
  getGraphNode,
  updateModerationStatus,
} from './db';
import { getPaginatedEntities } from './db/entities';
import { handleDatabaseError } from './db-utils';
import { stageUpdate, stageDelete, stageModerationUpdates, stageRolesUpdate, EntityType, attachPendingInfoToEntities, getPendingInfoForEntity, applyPendingToEntity } from './version-control';
import type { LexicalType, PaginationParams, TableEntry } from './types';
import { getCurrentUserName } from '@/utils/supabase/server';

/**
 * Helper to convert LexicalType to EntityType
 */
function lexicalTypeToEntityType(lexicalType: LexicalType): EntityType {
  const mapping: Record<LexicalType, EntityType> = {
    verbs: 'verb',
    nouns: 'noun',
    adjectives: 'adjective',
    adverbs: 'adverb',
  };
  return mapping[lexicalType];
}

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
 * Helper to get search table name from lexical type
 */
function getSearchTable(lexicalType: LexicalType): 'verbs' | 'nouns' | 'adjectives' | 'adverbs' {
  return lexicalType;
}

/**
 * Valid sortBy fields for pagination
 */
const VALID_SORT_FIELDS = [
  'id', 'legacy_id', 'gloss', 'pos', 'lexfile', 'lemmas', 'src_lemmas', 
  'frame_id', 'vendler_class', 'parentsCount', 'childrenCount', 
  'createdAt', 'updatedAt', 'created_at', 'updated_at'
];

/**
 * Parse pagination parameters from URL search params
 * Returns the params and any validation error
 */
function parsePaginationParams(searchParams: URLSearchParams): { 
  params: PaginationParams; 
  validationError: string | null;
} {
  // Debug logging to catch src_id usage
  const sortByParam = searchParams.get('sortBy');
  if (sortByParam === 'src_id') {
    console.warn('⚠️  WARNING: Request received with sortBy=src_id, converting to legacy_id');
  }
  
  // Convert old field names to new ones for backward compatibility
  let sortBy = searchParams.get('sortBy') || 'id';
  if (sortBy === 'src_id') {
    sortBy = 'legacy_id';
  }
  if (sortBy === 'frame') {
    sortBy = 'frame_id';
  }

  // Parse page and limit
  const pageParam = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;
  const limitParam = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 10;
  
  // Validate page
  if (isNaN(pageParam) || pageParam < 1) {
    return { 
      params: {} as PaginationParams, 
      validationError: 'Page must be a valid number >= 1' 
    };
  }
  
  // Validate limit (1-2000 range)
  if (isNaN(limitParam) || limitParam < 1 || limitParam > 2000) {
    return { 
      params: {} as PaginationParams, 
      validationError: 'Limit must be a valid number between 1 and 2000' 
    };
  }

  // Validate sortBy field
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
      forbiddenReason: searchParams.get('forbiddenReason') || undefined,
      
      // AI jobs filters
      flaggedByJobId: searchParams.get('flaggedByJobId') || undefined,
      
      // Boolean filters
      isMwe: searchParams.get('isMwe') === 'true' ? true : searchParams.get('isMwe') === 'false' ? false : undefined,
      flagged: searchParams.get('flagged') === 'true' ? true : searchParams.get('flagged') === 'false' ? false : undefined,
      forbidden: searchParams.get('forbidden') === 'true' ? true : searchParams.get('forbidden') === 'false' ? false : undefined,
      
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
 * Uses the unified getPaginatedEntities function
 */
export async function handlePaginatedRequest(
  request: NextRequest,
  lexicalType: LexicalType
): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const { params, validationError } = parsePaginationParams(searchParams);
    
    // Return validation error if any
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Use the unified paginated entities function
    const result = await getPaginatedEntities(lexicalType, params);
    
    // Attach pending change info to each entry
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
function getAllowedFieldsForType(lexicalType: LexicalType): string[] {
  const commonFields = ['id', 'gloss', 'lemmas', 'src_lemmas', 'examples', 'lexfile', 'flagged', 'flaggedReason'];
  
  switch (lexicalType) {
    case 'verbs':
      return [...commonFields, 'roles', 'role_groups', 'vendler_class', 'frame_id'];
    case 'nouns':
      return [...commonFields, 'countable', 'proper', 'collective', 'concrete', 'predicate', 'frame_id'];
    case 'adjectives':
      return [...commonFields, 'gradable', 'predicative', 'attributive', 'subjective', 'relational', 'frame_id'];
    case 'adverbs':
      return [...commonFields, 'gradable', 'frame_id'];
    default:
      return commonFields;
  }
}

/**
 * Handles PATCH (update) requests for any lexical type
 * Now stages changes for version control instead of direct updates
 * Supports verb-specific roles handling
 */
export async function handleUpdateById(
  id: string,
  body: unknown,
  lexicalType: LexicalType,
  routePath: string
): Promise<NextResponse> {
  try {
    const entityType = lexicalTypeToEntityType(lexicalType);
    const userId = await getCurrentUserName();
    
    const updates = body as Record<string, unknown>;
    
    // Validate that only allowed fields are being updated
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

    // Handle direct updates (flagged status) immediately
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
      
      await updateModerationStatus([id], moderationUpdates, lexicalType as any);
      
      // If only flagged fields were updated, return early
      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ 
          success: true, 
          message: 'Flagging status updated successfully' 
        });
      }
    }

    // Handle verb-specific roles update
    if (lexicalType === 'verbs') {
      const hasRoles = 'roles' in updateData;
      const hasRoleGroups = 'role_groups' in updateData;
      
      // Separate roles from other fields
      const { roles, role_groups, ...otherFields } = updateData;

      // Stage roles update if present
      if (hasRoles || hasRoleGroups) {
        const rolesResponse = await stageRolesUpdate(
          id,
          roles as unknown[] ?? [],
          hasRoleGroups ? role_groups as unknown[] : undefined,
          userId
        );

        // If only roles are being updated, return the roles response
        if (Object.keys(otherFields).length === 0) {
          return NextResponse.json(rolesResponse, {
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate',
              'Pragma': 'no-cache',
            },
          });
        }
      }

      // Stage other field updates for verbs
      if (Object.keys(otherFields).length > 0) {
        const response = await stageUpdate(entityType, id, otherFields, userId);
        
        return NextResponse.json(response, {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
          },
        });
      }

      // If we got here with roles, return a combined response
      return NextResponse.json({
        staged: true,
        message: 'Changes staged for review',
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
    }
    
    // For non-verb entities, stage all updates directly
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
 * Handles DELETE requests for any lexical type
 * Now stages deletion for version control instead of direct delete
 */
export async function handleDeleteById(
  id: string,
  lexicalType: LexicalType,
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
    
    // Apply pending changes to the main node (merges pending values for preview)
    const entityType = lexicalTypeToEntityType(lexicalType);
    const { entity: nodeWithPendingValues, pending: pendingInfo } = await applyPendingToEntity(
      node,
      entityType,
      BigInt(node.numericId)
    );
    
    // Also check for pending info on parent/child nodes
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
const VALID_MODERATION_FIELDS = ['flagged', 'flaggedReason', 'forbidden', 'forbiddenReason'];

/**
 * Handles PATCH moderation requests for any lexical type
 * Now stages moderation changes for version control
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

    // Validate that at least one moderation field is being updated
    const hasValidUpdate = Object.keys(updates).some(key => VALID_MODERATION_FIELDS.includes(key));
    if (!hasValidUpdate) {
      return NextResponse.json(
        { error: 'At least one moderation field must be updated' },
        { status: 400 }
      );
    }

    const entityType = lexicalTypeToEntityType(lexicalType);
    const userId = await getCurrentUserName();
    
    // Split updates into direct (flagged) and staged (others)
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

    // Apply direct updates (flagged status) immediately
    if (Object.keys(directUpdates).length > 0) {
      directCount = await updateModerationStatus(ids, directUpdates, lexicalType as any);
      message = `Updated flagging status for ${directCount} ${lexicalType}. `;
    }

    // Stage other moderation updates (e.g., forbidden)
    if (Object.keys(stagedUpdates).length > 0) {
      const result = await stageModerationUpdates(entityType, ids, stagedUpdates, userId);
      stagedCount = result.staged_count;
      changesetIds = result.changeset_ids;
      message += `Staged other moderation changes for ${result.staged_count} ${lexicalType}.`;
    }

    return NextResponse.json({ 
      staged: Object.keys(stagedUpdates).length > 0,
      staged_count: stagedCount,
      updated_count: directCount,
      count: directCount, // Compatibility with some frontend parts
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

