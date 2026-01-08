/**
 * Unified Entity Pagination System
 * 
 * Replaces the duplicated getPaginatedEntries, getPaginatedNouns,
 * getPaginatedAdjectives, and getPaginatedAdverbs functions with
 * a single config-driven implementation.
 */

import { prisma } from '../prisma';
import { withRetry } from '../db-utils';
import { Prisma } from '@prisma/client';
import type { LexicalType, PaginationParams, PaginatedResult, TableEntry, Role, RoleGroup } from '../types';
import { getEntityConfig, type EntityConfig } from './config';

/**
 * Build the WHERE clause conditions that are common to all entity types
 */
function buildCommonWhereConditions(
  params: PaginationParams,
  config: EntityConfig
): Record<string, unknown>[] {
  const {
    search,
    lexfile,
    gloss,
    lemmas,
    examples,
    flaggedReason,
    forbiddenReason,
    flagged,
    forbidden,
    isMwe,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore,
  } = params;

  const conditions: Record<string, unknown>[] = [];
  
  // Add deleted filter for tables that have it (only verbs)
  if (config.hasDeleted) {
    conditions.push({ deleted: false });
  }
  
  // Global search (legacy)
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

  // Advanced text filters
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

  // Reason text filters
  if (flaggedReason) {
    conditions.push({
      flagged_reason: { contains: flaggedReason, mode: 'insensitive' },
    });
  }

  if (forbiddenReason) {
    conditions.push({
      forbidden_reason: { contains: forbiddenReason, mode: 'insensitive' },
    });
  }

  // Boolean filters
  if (flagged !== undefined) {
    conditions.push({ flagged });
  }

  if (forbidden !== undefined) {
    conditions.push({ forbidden });
  }

  // isMwe filter (for non-verb entities)
  if (isMwe !== undefined && config.hasIsMwe) {
    conditions.push({ is_mwe: isMwe });
  }

  // Date filters - handle different column naming conventions
  const createdAtCol = config.dateColumnStyle === 'camelCase' ? 'createdAt' : 'created_at';
  const updatedAtCol = config.dateColumnStyle === 'camelCase' ? 'updatedAt' : 'updated_at';

  if (createdAfter) {
    conditions.push({ [createdAtCol]: { gte: new Date(createdAfter) } });
  }

  if (createdBefore) {
    conditions.push({ [createdAtCol]: { lte: new Date(createdBefore + 'T23:59:59.999Z') } });
  }

  if (updatedAfter) {
    conditions.push({ [updatedAtCol]: { gte: new Date(updatedAfter) } });
  }

  if (updatedBefore) {
    conditions.push({ [updatedAtCol]: { lte: new Date(updatedBefore + 'T23:59:59.999Z') } });
  }

  return conditions;
}

/**
 * Build verb-specific WHERE conditions
 */
async function buildVerbWhereConditions(
  params: PaginationParams
): Promise<Record<string, unknown>[]> {
  const { pos, frame_id, flaggedByJobId } = params;
  const conditions: Record<string, unknown>[] = [];

  // POS filter
  if (pos) {
    const posValues = pos.split(',').map(p => p.trim()).filter(Boolean);
    if (posValues.length > 0) {
      conditions.push({ pos: { in: posValues } });
    }
  }

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
              frame_name: { equals: code, mode: 'insensitive' },
            })) as Prisma.framesWhereInput[],
          },
          select: { id: true } as Prisma.framesSelect,
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

  return conditions;
}

/**
 * Build order clause with field name mapping
 */
function buildOrderClause(
  sortBy: string,
  sortOrder: 'asc' | 'desc'
): { orderBy: Record<string, unknown>; actualSortBy: string } {
  // Map old field names to new ones for backward compatibility
  let actualSortBy = sortBy;
  if (sortBy === 'src_id') {
    actualSortBy = 'legacy_id';
  }

  const orderBy: Record<string, unknown> = {};

  if (actualSortBy === 'lemmas' || actualSortBy === 'src_lemmas') {
    orderBy[actualSortBy] = sortOrder;
  } else if (actualSortBy === 'parentsCount' || actualSortBy === 'childrenCount') {
    // These are computed fields - use default sort, will re-sort after fetching
    orderBy.id = sortOrder;
  } else {
    orderBy[actualSortBy] = sortOrder;
  }

  return { orderBy, actualSortBy };
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

  // Apply numeric filters on computed fields
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

  // Sort by computed fields if needed
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
 * Fetch verb-specific data (roles and role_groups) in bulk
 */
async function fetchVerbRolesAndGroups(entryIds: bigint[]): Promise<{
  rolesByEntryId: Map<string, Role[]>;
  roleGroupsByEntryId: Map<string, RoleGroup[]>;
}> {
  if (entryIds.length === 0) {
    return { rolesByEntryId: new Map(), roleGroupsByEntryId: new Map() };
  }

  // Fetch all roles for these entries in bulk
  const rolesData = await withRetry(
    () => prisma.$queryRaw<Array<{
      verb_id: bigint;
      id: bigint;
      description: string | null;
      example_sentence: string | null;
      instantiation_type_ids: bigint[];
      main: boolean;
      role_type_id: bigint;
      role_type_label: string;
      role_type_generic_description: string;
      role_type_explanation: string | null;
    }>>`
      SELECT 
        r.verb_id,
        r.id,
        r.description,
        r.example_sentence,
        r.instantiation_type_ids,
        r.main,
        rt.id as role_type_id,
        rt.label as role_type_label,
        rt.generic_description as role_type_generic_description,
        rt.explanation as role_type_explanation
      FROM roles r
      JOIN role_types rt ON r.role_type_id = rt.id
      WHERE r.verb_id = ANY(${entryIds}::bigint[])
      ORDER BY r.verb_id, r.main DESC, r.id
    `,
    undefined,
    'getPaginatedEntities:roles'
  );

  // Fetch all role_groups for these entries in bulk
  const roleGroupsData = await withRetry(
    () => prisma.$queryRaw<Array<{
      verb_id: bigint;
      id: bigint;
      description: string | null;
      require_at_least_one: boolean;
      role_id: bigint | null;
    }>>`
      SELECT 
        rg.verb_id,
        rg.id,
        rg.description,
        rg.require_at_least_one,
        rgm.role_id
      FROM role_groups rg
      LEFT JOIN role_group_members rgm ON rg.id = rgm.role_group_id
      WHERE rg.verb_id = ANY(${entryIds}::bigint[])
      ORDER BY rg.verb_id, rg.id, rgm.role_id
    `,
    undefined,
    'getPaginatedEntities:roleGroups'
  );

  // Group roles by entry ID
  const rolesByEntryId = new Map<string, Role[]>();
  for (const role of rolesData) {
    const entryId = role.verb_id.toString();
    if (!rolesByEntryId.has(entryId)) {
      rolesByEntryId.set(entryId, []);
    }
    rolesByEntryId.get(entryId)!.push({
      id: role.id.toString(),
      description: role.description ?? undefined,
      example_sentence: role.example_sentence ?? undefined,
      instantiation_type_ids: role.instantiation_type_ids.map(id => Number(id)),
      main: role.main,
      role_type: {
        id: role.role_type_id.toString(),
        label: role.role_type_label,
        generic_description: role.role_type_generic_description,
        explanation: role.role_type_explanation ?? undefined,
      },
    });
  }

  // Group role_groups by entry ID
  const roleGroupsByEntryId = new Map<string, RoleGroup[]>();
  for (const row of roleGroupsData) {
    const entryId = row.verb_id.toString();
    const groupId = row.id.toString();

    if (!roleGroupsByEntryId.has(entryId)) {
      roleGroupsByEntryId.set(entryId, []);
    }

    const groups = roleGroupsByEntryId.get(entryId)!;
    let group = groups.find(g => g.id === groupId);

    if (!group) {
      group = {
        id: groupId,
        description: row.description,
        require_at_least_one: row.require_at_least_one,
        role_ids: [],
      };
      groups.push(group);
    }

    if (row.role_id) {
      group.role_ids.push(row.role_id.toString());
    }
  }

  return { rolesByEntryId, roleGroupsByEntryId };
}

/**
 * Fetch verb relation counts using bulk query
 */
async function fetchVerbRelationCounts(entryIds: bigint[]): Promise<Map<string, { parents: number; children: number }>> {
  if (entryIds.length === 0) {
    return new Map();
  }

  const countsData = await withRetry(
    () => prisma.$queryRaw<Array<{
      verb_id: bigint;
      parents_count: bigint;
      children_count: bigint;
    }>>`
      SELECT 
        v.id as verb_id,
        (SELECT COUNT(*)::bigint FROM verb_relations WHERE source_id = v.id AND type = 'hypernym') as parents_count,
        (SELECT COUNT(*)::bigint FROM verb_relations WHERE target_id = v.id AND type = 'hypernym') as children_count
      FROM (SELECT unnest(${entryIds}::bigint[]) as id) v
    `,
    undefined,
    'getPaginatedEntities:verbCounts'
  );

  return new Map(countsData.map(c => [
    c.verb_id.toString(),
    { parents: Number(c.parents_count), children: Number(c.children_count) },
  ]));
}

/**
 * Unified paginated entities function - replaces all 4 duplicated functions
 */
export async function getPaginatedEntities(
  lexicalType: LexicalType,
  params: PaginationParams = {}
): Promise<PaginatedResult<TableEntry>> {
  const config = getEntityConfig(lexicalType);
  const {
    page = 1,
    limit: rawLimit = 10,
    sortBy = 'id',
    sortOrder = 'asc',
  } = params;

  const limit = rawLimit;
  const skip = (page - 1) * limit;

  // Build where clause
  const andConditions = buildCommonWhereConditions(params, config);

  // Add verb-specific conditions
  if (lexicalType === 'verbs') {
    const verbConditions = await buildVerbWhereConditions(params);
    andConditions.push(...verbConditions);
  }

  const whereClause: Record<string, unknown> =
    andConditions.length > 0 ? { AND: andConditions } : {};

  // Build order clause
  const { orderBy, actualSortBy } = buildOrderClause(sortBy, sortOrder);

  // Execute queries based on entity type
  if (lexicalType === 'verbs') {
    return await executeVerbQuery(whereClause, skip, limit, orderBy, actualSortBy, sortOrder, page, params, config);
  } else {
    return await executeNonVerbQuery(lexicalType, whereClause, skip, limit, orderBy, actualSortBy, sortOrder, page, params, config);
  }
}

/**
 * Execute verb-specific query with roles, frames, etc.
 */
async function executeVerbQuery(
  whereClause: Record<string, unknown>,
  skip: number,
  limit: number,
  orderBy: Record<string, unknown>,
  actualSortBy: string,
  sortOrder: 'asc' | 'desc',
  page: number,
  params: PaginationParams,
  config: EntityConfig
): Promise<PaginatedResult<TableEntry>> {
  // Get total count
  const total = await withRetry(
    () => prisma.verbs.count({ where: whereClause }),
    undefined,
    'getPaginatedEntities:verbCount'
  );

  // Fetch entries with frames
  const entries = await withRetry(
    () => prisma.verbs.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy,
      include: {
        frames: {
          select: { id: true, frame_name: true } as Prisma.framesSelect,
        },
      },
    }),
    undefined,
    'getPaginatedEntities:verbFindMany'
  );

  // Get all entry IDs for bulk fetching
  const entryIds = entries.map(e => e.id).filter(Boolean) as bigint[];

  // Fetch roles, role_groups, and relation counts in parallel
  const [{ rolesByEntryId, roleGroupsByEntryId }, countsByEntryId] = await Promise.all([
    fetchVerbRolesAndGroups(entryIds),
    fetchVerbRelationCounts(entryIds),
  ]);

  // Transform to TableEntry format
  let data: TableEntry[] = entries.map(entry => {
    const entryCode = entry.code || entry.id.toString();
    const numericId = entry.id.toString();
    const frameData = entry.frames as { frame_name: string } | null;
    const frameId = entry.frame_id;

    return {
      id: entryCode,
      numericId,
      legacy_id: entry.legacy_id,
      lemmas: entry.lemmas,
      src_lemmas: entry.src_lemmas,
      gloss: entry.gloss,
      pos: config.posCode,
      lexfile: entry.lexfile,
      examples: entry.examples,
      flagged: entry.flagged ?? undefined,
      flaggedReason: entry.flagged_reason ?? undefined,
      forbidden: entry.forbidden ?? undefined,
      forbiddenReason: entry.forbidden_reason ?? undefined,
      frame_id: frameId ? frameId.toString() : null,
      frame: frameData?.frame_name || null,
      vendler_class: entry.vendler_class ?? null,
      roles: rolesByEntryId.get(numericId) || [],
      role_groups: roleGroupsByEntryId.get(numericId) || [],
      parentsCount: countsByEntryId.get(numericId)?.parents || 0,
      childrenCount: countsByEntryId.get(numericId)?.children || 0,
      createdAt: (entry as Record<string, unknown>).createdAt as Date ?? (entry as Record<string, unknown>).created_at as Date,
      updatedAt: (entry as Record<string, unknown>).updatedAt as Date ?? (entry as Record<string, unknown>).updated_at as Date,
    };
  });

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
 * Execute query for non-verb entities (nouns, adjectives, adverbs)
 */
async function executeNonVerbQuery(
  lexicalType: LexicalType,
  whereClause: Record<string, unknown>,
  skip: number,
  limit: number,
  orderBy: Record<string, unknown>,
  actualSortBy: string,
  sortOrder: 'asc' | 'desc',
  page: number,
  params: PaginationParams,
  config: EntityConfig
): Promise<PaginatedResult<TableEntry>> {
  // Build include clause for relation counts
  const countInclude = {
    _count: {
      select: {
        [config.relationConfig.sourceRelation]: {
          where: { type: config.relationConfig.sourceCountType },
        },
        [config.relationConfig.targetRelation]: {
          where: { type: config.relationConfig.targetCountType },
        },
      },
    },
  };

  // Execute type-specific query
  let total: number;
  let entries: unknown[];

  switch (lexicalType) {
    case 'nouns':
      total = await withRetry(
        () => prisma.nouns.count({ where: whereClause }),
        undefined,
        'getPaginatedEntities:nounCount'
      );
      entries = await withRetry(
        () => prisma.nouns.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy,
          include: countInclude,
        }),
        undefined,
        'getPaginatedEntities:nounFindMany'
      );
      break;

    case 'adjectives':
      total = await withRetry(
        () => prisma.adjectives.count({ where: whereClause }),
        undefined,
        'getPaginatedEntities:adjectiveCount'
      );
      entries = await withRetry(
        () => prisma.adjectives.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy,
          include: countInclude,
        }),
        undefined,
        'getPaginatedEntities:adjectiveFindMany'
      );
      break;

    case 'adverbs':
      total = await withRetry(
        () => prisma.adverbs.count({ where: whereClause }),
        undefined,
        'getPaginatedEntities:adverbCount'
      );
      entries = await withRetry(
        () => prisma.adverbs.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy,
          include: countInclude,
        }),
        undefined,
        'getPaginatedEntities:adverbFindMany'
      );
      break;

    default:
      throw new Error(`Unsupported lexical type: ${lexicalType}`);
  }

  // Transform to TableEntry format
  let data: TableEntry[] = (entries as Record<string, unknown>[]).map(entry => {
    const entryCode = (entry.code as string) || (entry.id as bigint).toString();
    const numericId = (entry.id as bigint).toString();
    const countData = entry._count as Record<string, number>;

    // Build base entry
    const tableEntry: TableEntry = {
      id: entryCode,
      numericId,
      legacy_id: entry.legacy_id as string,
      lemmas: entry.lemmas as string[],
      src_lemmas: entry.src_lemmas as string[],
      gloss: entry.gloss as string,
      pos: config.posCode,
      lexfile: entry.lexfile as string,
      examples: entry.examples as string[],
      flagged: (entry.flagged as boolean) ?? undefined,
      flaggedReason: (entry.flagged_reason as string) || undefined,
      forbidden: (entry.forbidden as boolean) ?? undefined,
      forbiddenReason: (entry.forbidden_reason as string) || undefined,
      frame_id: null,
      frame: null,
      vendler_class: null,
      roles: [],
      role_groups: [],
      parentsCount: countData[config.relationConfig.sourceRelation] || 0,
      childrenCount: countData[config.relationConfig.targetRelation] || 0,
      createdAt: entry.created_at as Date,
      updatedAt: entry.updated_at as Date,
    };

    // Add type-specific fields
    for (const field of config.typeSpecificFields) {
      const value = entry[field.dbColumn];
      if (value !== undefined) {
        (tableEntry as unknown as Record<string, unknown>)[field.outputField] = value ?? field.defaultValue;
      }
    }

    return tableEntry;
  });

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

