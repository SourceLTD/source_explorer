/**
 * Unified Entity Pagination System
 * 
 * Queries the unified lexical_units table with optional POS filtering.
 * All POS types (verb, noun, adjective, adverb) are in one table.
 */

import { prisma } from '../prisma';
import { withRetry } from '../db-utils';
import { Prisma, entity_type, change_operation, part_of_speech } from '@prisma/client';
import type { PartOfSpeech, PaginationParams, PaginatedResult, TableEntry, VendlerClass } from '../types';
import { getPOSConfig, parsePOSFilter, isValidPOS } from './config';

/**
 * Build WHERE clause conditions for lexical_units queries
 */
function buildWhereConditions(
  params: PaginationParams
): Prisma.lexical_unitsWhereInput[] {
  const {
    search,
    pos,
    lexfile,
    gloss,
    lemmas,
    examples,
    flaggedReason,
    unverifiableReason,
    flagged,
    verifiable,
    isMwe,
    excludeNullFrame,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore,
  } = params;

  const conditions: Prisma.lexical_unitsWhereInput[] = [];
  
  // Filter out deleted entries
  conditions.push({ deleted: false });
  
  // POS filter
  const posFilter = parsePOSFilter(pos as string | string[] | undefined);
  if (posFilter && posFilter.length > 0) {
    conditions.push({ pos: { in: posFilter as part_of_speech[] } });
  }
  
  // Global search
  if (search) {
    conditions.push({
      OR: [
        { gloss: { contains: search, mode: 'insensitive' } },
        { lemmas: { hasSome: [search] } },
        { src_lemmas: { hasSome: [search] } },
        { examples: { hasSome: search.split(' ') } },
      ],
    });
  }

  // Lexfile filter
  if (lexfile) {
    const lexfiles = lexfile.split(',').map(lf => lf.trim()).filter(Boolean);
    if (lexfiles.length > 0) {
      conditions.push({ lexfile: { in: lexfiles } });
    }
  }

  // Text filters
  if (gloss) {
    conditions.push({ gloss: { contains: gloss, mode: 'insensitive' } });
  }

  if (lemmas) {
    const lemmaTerms = lemmas.split(/[\s,]+/).filter(Boolean);
    conditions.push({
      OR: [
        { lemmas: { hasSome: lemmaTerms } },
        { src_lemmas: { hasSome: lemmaTerms } },
      ],
    });
  }

  if (examples) {
    conditions.push({
      examples: { hasSome: examples.split(/[\s,]+/).filter(Boolean) },
    });
  }

  if (flaggedReason) {
    conditions.push({
      flagged_reason: { contains: flaggedReason, mode: 'insensitive' },
    });
  }

  if (unverifiableReason) {
    conditions.push({
      unverifiable_reason: { contains: unverifiableReason, mode: 'insensitive' },
    });
  }

  // Boolean filters
  if (flagged !== undefined) {
    conditions.push({ flagged });
  }

  if (verifiable !== undefined) {
    conditions.push({ verifiable });
  }

  if (isMwe !== undefined) {
    conditions.push({ is_mwe: isMwe });
  }

  if (excludeNullFrame === true) {
    conditions.push({ frame_id: { not: null } });
  }

  // Date filters
  if (createdAfter) {
    conditions.push({ created_at: { gte: new Date(createdAfter) } });
  }

  if (createdBefore) {
    conditions.push({ created_at: { lte: new Date(createdBefore + 'T23:59:59.999Z') } });
  }

  if (updatedAfter) {
    conditions.push({ updated_at: { gte: new Date(updatedAfter) } });
  }

  if (updatedBefore) {
    conditions.push({ updated_at: { lte: new Date(updatedBefore + 'T23:59:59.999Z') } });
  }

  return conditions;
}

/**
 * Build advanced WHERE conditions (frames, jobs, pending state)
 */
async function buildAdvancedWhereConditions(
  params: PaginationParams
): Promise<Prisma.lexical_unitsWhereInput[]> {
  const { frame_id, flaggedByJobId, pendingCreate, pendingUpdate, pendingDelete } = params;
  const conditions: Prisma.lexical_unitsWhereInput[] = [];

  // Frame filter
  if (frame_id) {
    const rawValues = frame_id.split(',').map(id => id.trim()).filter(Boolean);

    if (rawValues.length > 0) {
      const numericIds = new Set<bigint>();
      const codesToLookup: string[] = [];

      rawValues.forEach(value => {
        if (/^\d+$/.test(value)) {
          numericIds.add(BigInt(value));
        } else {
          codesToLookup.push(value);
        }
      });

      if (codesToLookup.length > 0) {
        const frames = await prisma.frames.findMany({
          where: {
            OR: codesToLookup.map(code => ({
              label: { equals: code, mode: 'insensitive' as const },
            })),
          },
          select: { id: true },
        });

        frames.forEach(frame => {
          numericIds.add(frame.id);
        });
      }

      if (numericIds.size > 0) {
        conditions.push({ frame_id: { in: Array.from(numericIds) } });
      }
    }
  }

  // AI jobs: entries flagged by a specific job
  if (flaggedByJobId) {
    try {
      const jobIdBigInt = BigInt(flaggedByJobId);
      conditions.push({
        llm_job_items: {
          some: {
            job_id: jobIdBigInt,
            flagged: true,
          },
        },
      });
    } catch {
      // ignore invalid job id values
    }
  }

  // Pending state filters
  const hasPendingFilter = pendingCreate || pendingUpdate || pendingDelete;
  if (hasPendingFilter) {
    const pendingOps: change_operation[] = [];
    
    if (pendingUpdate) pendingOps.push('update');
    if (pendingDelete) pendingOps.push('delete');
    
    if (pendingOps.length > 0) {
      const changesets = await prisma.changesets.findMany({
        where: {
          entity_type: 'lexical_unit',
          operation: { in: pendingOps },
          status: 'pending',
          entity_id: { not: null },
        },
        select: { entity_id: true },
      });
      
      const pendingIds = changesets
        .filter(cs => cs.entity_id !== null)
        .map(cs => cs.entity_id!);
      
      if (pendingIds.length > 0) {
        conditions.push({ id: { in: pendingIds } });
      } else {
        conditions.push({ id: { equals: BigInt(-1) } });
      }
    } else if (pendingCreate) {
      conditions.push({ id: { equals: BigInt(-1) } });
    }
  }

  return conditions;
}

/**
 * Build order clause with field name mapping
 */
function buildOrderClause(
  sortBy: string,
  sortOrder: 'asc' | 'desc'
): { orderBy: Prisma.lexical_unitsOrderByWithRelationInput; actualSortBy: string } {
  let actualSortBy = sortBy;
  if (sortBy === 'src_id') {
    actualSortBy = 'legacy_id';
  }

  const orderBy: Prisma.lexical_unitsOrderByWithRelationInput = {};

  if (actualSortBy === 'parentsCount' || actualSortBy === 'childrenCount') {
    // Computed fields - use default sort, will re-sort after fetching
    orderBy.id = sortOrder;
  } else if (actualSortBy in orderBy || ['id', 'code', 'gloss', 'legacy_id', 'created_at', 'updated_at', 'pos', 'lexfile'].includes(actualSortBy)) {
    (orderBy as Record<string, 'asc' | 'desc'>)[actualSortBy] = sortOrder;
  } else {
    orderBy.id = sortOrder;
  }

  return { orderBy, actualSortBy };
}

/**
 * Fetch relation counts for lexical units
 */
async function fetchRelationCounts(
  entryIds: bigint[],
  posValues: PartOfSpeech[]
): Promise<Map<string, { parents: number; children: number }>> {
  if (entryIds.length === 0) {
    return new Map();
  }

  // Determine relation types based on POS
  // For mixed POS queries, we use hypernym as the default
  const parentType = posValues.length === 1 
    ? getPOSConfig(posValues[0]).parentRelationType 
    : 'hypernym';
  const childType = posValues.length === 1 
    ? getPOSConfig(posValues[0]).childRelationType 
    : 'hyponym';

  const countsData = await withRetry(
    () => prisma.$queryRaw<Array<{
      lu_id: bigint;
      parents_count: bigint;
      children_count: bigint;
    }>>`
      SELECT 
        lu.id as lu_id,
        (SELECT COUNT(*)::bigint FROM lexical_unit_relations WHERE source_id = lu.id AND type = ${parentType}::lexical_unit_relation_type) as parents_count,
        (SELECT COUNT(*)::bigint FROM lexical_unit_relations WHERE target_id = lu.id AND type = ${childType}::lexical_unit_relation_type) as children_count
      FROM (SELECT unnest(${entryIds}::bigint[]) as id) lu
    `,
    undefined,
    'getPaginatedEntities:relationCounts'
  );

  return new Map(countsData.map(c => [
    c.lu_id.toString(),
    { parents: Number(c.parents_count), children: Number(c.children_count) },
  ]));
}

/**
 * Apply post-fetch filters and sorting for computed fields
 */
function applyComputedFieldFilters(
  data: TableEntry[],
  params: PaginationParams,
  sortBy: string,
  sortOrder: 'asc' | 'desc'
): TableEntry[] {
  const { parentsCountMin, parentsCountMax, childrenCountMin, childrenCountMax } = params;

  let result = data;

  if (parentsCountMin !== undefined) {
    result = result.filter(entry => entry.parentsCount >= parentsCountMin);
  }
  if (parentsCountMax !== undefined) {
    result = result.filter(entry => entry.parentsCount <= parentsCountMax);
  }
  if (childrenCountMin !== undefined) {
    result = result.filter(entry => entry.childrenCount >= childrenCountMin);
  }
  if (childrenCountMax !== undefined) {
    result = result.filter(entry => entry.childrenCount <= childrenCountMax);
  }

  if (sortBy === 'parentsCount') {
    result.sort((a, b) =>
      sortOrder === 'asc'
        ? a.parentsCount - b.parentsCount
        : b.parentsCount - a.parentsCount
    );
  } else if (sortBy === 'childrenCount') {
    result.sort((a, b) =>
      sortOrder === 'asc'
        ? a.childrenCount - b.childrenCount
        : b.childrenCount - a.childrenCount
    );
  }

  return result;
}

/**
 * Transform database entry to TableEntry format
 */
function transformToTableEntry(
  entry: Prisma.lexical_unitsGetPayload<{ include: { frames: { select: { id: true; label: true; code: true } } } }>,
  counts: { parents: number; children: number }
): TableEntry {
  const entryCode = entry.code || entry.id.toString();
  const numericId = entry.id.toString();

  return {
    id: entryCode,
    numericId,
    legacy_id: entry.legacy_id,
    lemmas: entry.lemmas,
    src_lemmas: entry.src_lemmas,
    gloss: entry.gloss,
    pos: entry.pos,
    lexfile: entry.lexfile,
    examples: entry.examples,
    flagged: entry.flagged ?? undefined,
    flaggedReason: entry.flagged_reason ?? undefined,
    verifiable: entry.verifiable ?? undefined,
    unverifiableReason: entry.unverifiable_reason ?? undefined,
    frame_id: entry.frame_id ? entry.frame_id.toString() : null,
    frame: entry.frames?.code || null,
    
    // Verb-specific
    vendler_class: entry.vendler_class as VendlerClass | null,
    
    // Noun-specific
    isMwe: entry.is_mwe ?? undefined,
    countable: entry.countable ?? undefined,
    proper: entry.proper ?? undefined,
    collective: entry.collective ?? undefined,
    concrete: entry.concrete ?? undefined,
    predicate: entry.predicate ?? undefined,
    
    // Adjective-specific
    isSatellite: entry.is_satellite ?? undefined,
    gradable: entry.gradable ?? undefined,
    predicative: entry.predicative ?? undefined,
    attributive: entry.attributive ?? undefined,
    subjective: entry.subjective ?? undefined,
    relational: entry.relational ?? undefined,
    
    parentsCount: counts.parents,
    childrenCount: counts.children,
    createdAt: entry.created_at ?? new Date(),
    updatedAt: entry.updated_at ?? new Date(),
  };
}

/**
 * Unified paginated entities function
 * Queries the lexical_units table with optional POS filtering
 */
export async function getPaginatedEntities(
  params: PaginationParams = {}
): Promise<PaginatedResult<TableEntry>> {
  const {
    page = 1,
    limit: rawLimit = 10,
    sortBy = 'id',
    sortOrder = 'asc',
    pos,
  } = params;

  const limit = rawLimit;
  const skip = (page - 1) * limit;

  // Build where clause
  const baseConditions = buildWhereConditions(params);
  const advancedConditions = await buildAdvancedWhereConditions(params);
  const allConditions = [...baseConditions, ...advancedConditions];

  const whereClause: Prisma.lexical_unitsWhereInput = 
    allConditions.length > 0 ? { AND: allConditions } : {};

  // Build order clause
  const { orderBy, actualSortBy } = buildOrderClause(sortBy, sortOrder);

  // Get total count
  const total = await withRetry(
    () => prisma.lexical_units.count({ where: whereClause }),
    undefined,
    'getPaginatedEntities:count'
  );

  // Fetch entries with frames
  const entries = await withRetry(
    () => prisma.lexical_units.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy,
      include: {
        frames: {
          select: { id: true, label: true, code: true },
        },
      },
    }),
    undefined,
    'getPaginatedEntities:findMany'
  );

  // Get entry IDs and determine POS values for relation counting
  const entryIds = entries.map(e => e.id);
  const posFilter = parsePOSFilter(pos as string | string[] | undefined);
  const posValues: PartOfSpeech[] = posFilter || ['verb', 'noun', 'adjective', 'adverb'];

  // Fetch relation counts
  const countsByEntryId = await fetchRelationCounts(entryIds, posValues);

  // Transform to TableEntry format
  let data: TableEntry[] = entries.map(entry => 
    transformToTableEntry(
      entry,
      countsByEntryId.get(entry.id.toString()) || { parents: 0, children: 0 }
    )
  );

  // Apply computed field filters and sorting
  data = applyComputedFieldFilters(data, params, actualSortBy, sortOrder);

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Get a single lexical unit by ID or code
 */
export async function getLexicalUnitById(
  idOrCode: string
): Promise<TableEntry | null> {
  // Try to parse as BigInt first
  let entry;
  
  if (/^\d+$/.test(idOrCode)) {
    entry = await prisma.lexical_units.findUnique({
      where: { id: BigInt(idOrCode) },
      include: {
        frames: {
          select: { id: true, label: true, code: true },
        },
      },
    });
  }
  
  // If not found by ID, try by code
  if (!entry) {
    entry = await prisma.lexical_units.findUnique({
      where: { code: idOrCode },
      include: {
        frames: {
          select: { id: true, label: true, code: true },
        },
      },
    });
  }

  if (!entry) {
    return null;
  }

  // Fetch relation counts for this single entry
  const countsByEntryId = await fetchRelationCounts([entry.id], [entry.pos as PartOfSpeech]);

  return transformToTableEntry(
    entry,
    countsByEntryId.get(entry.id.toString()) || { parents: 0, children: 0 }
  );
}
