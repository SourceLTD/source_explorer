import { unstable_cache } from 'next/cache';
import { prisma } from './prisma';
import { withRetry } from './db-utils';
import { RelationType, type LexicalEntry, type EntryWithRelations, type GraphNode, type SearchResult, type PaginationParams, type PaginatedResult, type TableEntry } from './types';
import type { LexicalEntry as PrismaLexicalEntry, EntryRelation as PrismaEntryRelation } from '@prisma/client';

// Type for Prisma entry that might have optional fields
type PrismaEntryWithOptionalFields = {
  flagged?: boolean;
  flaggedReason?: string;
  forbidden?: boolean;
  forbiddenReason?: string;
  [key: string]: unknown;
};

// Type for Prisma entry with relations
type PrismaEntryWithRelations = {
  id: string;
  legacy_id: string;
  gloss: string;
  pos: string;
  lexfile: string;
  isMwe: boolean;
  transitive: boolean | null;
  lemmas: string[];
  src_lemmas: string[];
  particles: string[];
  frames: string[];
  examples: string[];
  createdAt: Date;
  updatedAt: Date;
  flagged: boolean | null;
  flaggedReason: string | null;
  forbidden: boolean | null;
  forbiddenReason: string | null;
  sourceRelations: (PrismaEntryRelation & {
    target: PrismaLexicalEntry | null;
  })[];
  targetRelations: (PrismaEntryRelation & {
    source: PrismaLexicalEntry | null;
  })[];
};

// Type for Prisma entry with counts
type PrismaEntryWithCounts = {
  id: string;
  legacy_id: string;
  gloss: string;
  pos: string;
  lexfile: string;
  isMwe: boolean;
  transitive: boolean | null;
  lemmas: string[];
  src_lemmas: string[];
  particles: string[];
  frames: string[];
  examples: string[];
  createdAt: Date;
  updatedAt: Date;
  flagged: boolean | null;
  flaggedReason: string | null;
  forbidden: boolean | null;
  forbiddenReason: string | null;
  _count: {
    sourceRelations: number;
    targetRelations: number;
  };
};

export async function getEntryById(id: string): Promise<EntryWithRelations | null> {
  const entry = await withRetry(
    () => prisma.lexicalEntry.findUnique({
      where: { id },
      include: {
        sourceRelations: {
          include: {
            target: true,
          },
        },
        targetRelations: {
          include: {
            source: true,
          },
        },
      },
    }),
    undefined,
    `getEntryById(${id})`
  ) as unknown as PrismaEntryWithRelations | null;

  if (!entry) return null;

  // Convert Prisma types to our types
  return {
    ...entry,
    transitive: entry.transitive || undefined,
    flagged: entry.flagged ?? undefined,
    flaggedReason: (entry as PrismaEntryWithOptionalFields).flaggedReason || undefined,
    forbidden: entry.forbidden ?? undefined,
    forbiddenReason: (entry as PrismaEntryWithOptionalFields).forbiddenReason || undefined,
    sourceRelations: entry.sourceRelations.map(rel => ({
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type as RelationType,
      target: rel.target ? {
        ...rel.target,
        transitive: rel.target.transitive || undefined,
        flagged: rel.target.flagged ?? undefined,
        flaggedReason: (rel.target as PrismaEntryWithOptionalFields).flaggedReason || undefined,
        forbidden: rel.target.forbidden ?? undefined,
        forbiddenReason: (rel.target as PrismaEntryWithOptionalFields).forbiddenReason || undefined
      } as unknown as LexicalEntry : undefined,
    })),
    targetRelations: entry.targetRelations.map(rel => ({
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type as RelationType,
      source: rel.source ? {
        ...rel.source,
        transitive: rel.source.transitive || undefined,
        flagged: rel.source.flagged ?? undefined,
        flaggedReason: (rel.source as PrismaEntryWithOptionalFields).flaggedReason || undefined,
        forbidden: rel.source.forbidden ?? undefined,
        forbiddenReason: (rel.source as PrismaEntryWithOptionalFields).forbiddenReason || undefined
      } as unknown as LexicalEntry : undefined,
    })),
  };
}

export async function searchEntries(query: string, limit = 20): Promise<SearchResult[]> {
  // If query contains a dot, only search IDs
  const containsDot = query.includes('.');
  
  if (containsDot) {
    // Only search ID fields when dot is present
    const results = await withRetry(
      () => prisma.$queryRaw<SearchResult[]>`
      SELECT 
        id,
        legacy_id,
        lemmas,
        src_lemmas,
        gloss,
        pos,
        CASE 
          WHEN id ILIKE ${query} THEN 1000
          WHEN id ILIKE ${query + '%'} THEN 500
          WHEN legacy_id ILIKE ${query + '%'} THEN 400
          ELSE 0
        END as rank
      FROM lexical_entries
      WHERE 
        id ILIKE ${query + '%'} OR
        legacy_id ILIKE ${query + '%'}
      ORDER BY rank DESC, id
      LIMIT ${limit}
    `,
      undefined,
      `searchEntries(${query})`
    );
    return results;
  }
  
  // Use PostgreSQL full-text search for regular queries
  const results = await withRetry(
    () => prisma.$queryRaw<SearchResult[]>`
    SELECT 
      id,
      legacy_id,
      lemmas,
      src_lemmas,
      gloss,
      pos,
      ts_rank(gloss_tsv, plainto_tsquery('english', ${query})) +
      ts_rank(examples_tsv, plainto_tsquery('english', ${query})) as rank
    FROM lexical_entries
    WHERE 
      gloss_tsv @@ plainto_tsquery('english', ${query}) OR
      examples_tsv @@ plainto_tsquery('english', ${query}) OR
      ${query} = ANY(lemmas) OR
      ${query} = ANY(src_lemmas)
    ORDER BY rank DESC, id
    LIMIT ${limit}
  `,
    undefined,
    `searchEntries(${query})`
  );

  return results;
}

export async function updateEntry(id: string, updates: Partial<Pick<LexicalEntry, 'gloss' | 'lemmas' | 'examples' | 'flagged' | 'flaggedReason' | 'forbidden' | 'forbiddenReason'>>): Promise<EntryWithRelations | null> {
  const updatedEntry = await withRetry(
    () => prisma.lexicalEntry.update({
    where: { id },
    data: updates,
    include: {
      sourceRelations: {
        include: {
          target: true
        }
      },
      targetRelations: {
        include: {
          source: true
        }
      }
    }
  }),
    undefined,
    `updateEntry(${id})`
  ) as unknown as PrismaEntryWithRelations | null;

  if (!updatedEntry) return null;

  // Convert Prisma types to our types
  return {
    ...updatedEntry,
    transitive: updatedEntry.transitive || undefined,
    flagged: updatedEntry.flagged ?? undefined,
    flaggedReason: (updatedEntry as PrismaEntryWithOptionalFields).flaggedReason || undefined,
    forbidden: updatedEntry.forbidden ?? undefined,
    forbiddenReason: (updatedEntry as PrismaEntryWithOptionalFields).forbiddenReason || undefined,
    sourceRelations: updatedEntry.sourceRelations.map(rel => ({
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type as RelationType,
      target: rel.target ? {
        ...rel.target,
        transitive: rel.target.transitive || undefined,
        flagged: rel.target.flagged ?? undefined,
        flaggedReason: (rel.target as PrismaEntryWithOptionalFields).flaggedReason || undefined,
        forbidden: rel.target.forbidden ?? undefined,
        forbiddenReason: (rel.target as PrismaEntryWithOptionalFields).forbiddenReason || undefined
      } as unknown as LexicalEntry : undefined,
    })),
    targetRelations: updatedEntry.targetRelations.map(rel => ({
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type as RelationType,
      source: rel.source ? {
        ...rel.source,
        transitive: rel.source.transitive || undefined,
        flagged: rel.source.flagged ?? undefined,
        flaggedReason: (rel.source as PrismaEntryWithOptionalFields).flaggedReason || undefined,
        forbidden: rel.source.forbidden ?? undefined,
        forbiddenReason: (rel.source as PrismaEntryWithOptionalFields).forbiddenReason || undefined
      } as unknown as LexicalEntry : undefined,
    })),
  };
}

// Internal implementation without caching
async function getGraphNodeInternal(entryId: string): Promise<GraphNode | null> {
  // Use a more efficient query that only fetches what we need
  const entry = await withRetry(
    () => prisma.lexicalEntry.findUnique({
      where: { id: entryId },
      include: {
        sourceRelations: {
          where: {
            type: {
              in: ['hypernym', 'entails', 'causes', 'also_see']
            }
          },
          include: {
            target: {
              select: {
                id: true,
                legacy_id: true,
                lemmas: true,
                src_lemmas: true,
                gloss: true,
                pos: true,
                examples: true,
              }
            }
          }
        },
        targetRelations: {
          where: {
            type: 'hypernym' // Only need hypernyms for children
          },
          include: {
            source: {
              select: {
                id: true,
                legacy_id: true,
                lemmas: true,
                src_lemmas: true,
                gloss: true,
                pos: true,
                examples: true,
              }
            }
          }
        }
      }
    }),
    undefined,
    `getGraphNodeInternal(${entryId})`
  ) as unknown as PrismaEntryWithRelations | null;

  if (!entry) return null;

  // Get parents (hypernyms) - these are broader concepts
  const parents: GraphNode[] = entry.sourceRelations
    .filter(rel => rel.type === 'hypernym' && rel.target)
    .map(rel => ({
      id: rel.target!.id,
      legacy_id: rel.target!.legacy_id,
      lemmas: rel.target!.lemmas,
      src_lemmas: rel.target!.src_lemmas,
      gloss: rel.target!.gloss,
      pos: rel.target!.pos,
      examples: rel.target!.examples,
      parents: [],
      children: [],
      entails: [],
      causes: [],
      alsoSee: [],
    }));

  // Get children (hyponyms) - these are more specific concepts
  const children: GraphNode[] = entry.targetRelations
    .filter(rel => rel.type === 'hypernym' && rel.source)
    .map(rel => ({
      id: rel.source!.id,
      legacy_id: rel.source!.legacy_id,
      lemmas: rel.source!.lemmas,
      src_lemmas: rel.source!.src_lemmas,
      gloss: rel.source!.gloss,
      pos: rel.source!.pos,
      examples: rel.source!.examples,
      parents: [],
      children: [],
      entails: [],
      causes: [],
      alsoSee: [],
    }));

  // Get entails relationships
  const entails: GraphNode[] = entry.sourceRelations
    .filter(rel => rel.type === 'entails' && rel.target)
    .map(rel => ({
      id: rel.target!.id,
      legacy_id: rel.target!.legacy_id,
      lemmas: rel.target!.lemmas,
      src_lemmas: rel.target!.src_lemmas,
      gloss: rel.target!.gloss,
      pos: rel.target!.pos,
      examples: rel.target!.examples,
      parents: [],
      children: [],
      entails: [],
      causes: [],
      alsoSee: [],
    }));

  // Get causes relationships
  const causes: GraphNode[] = entry.sourceRelations
    .filter(rel => rel.type === 'causes' && rel.target)
    .map(rel => ({
      id: rel.target!.id,
      legacy_id: rel.target!.legacy_id,
      lemmas: rel.target!.lemmas,
      src_lemmas: rel.target!.src_lemmas,
      gloss: rel.target!.gloss,
      pos: rel.target!.pos,
      examples: rel.target!.examples,
      parents: [],
      children: [],
      entails: [],
      causes: [],
      alsoSee: [],
    }));

  // Get also_see relationships
  const alsoSee: GraphNode[] = entry.sourceRelations
    .filter(rel => rel.type === 'also_see' && rel.target)
    .map(rel => ({
      id: rel.target!.id,
      legacy_id: rel.target!.legacy_id,
      lemmas: rel.target!.lemmas,
      src_lemmas: rel.target!.src_lemmas,
      gloss: rel.target!.gloss,
      pos: rel.target!.pos,
      examples: rel.target!.examples,
      parents: [],
      children: [],
      entails: [],
      causes: [],
      alsoSee: [],
    }));

  return {
    id: entry.id,
    legacy_id: entry.legacy_id,
    lemmas: entry.lemmas,
    src_lemmas: entry.src_lemmas,
    gloss: entry.gloss,
    pos: entry.pos,
    examples: entry.examples,
    flagged: entry.flagged ?? undefined,
    flaggedReason: (entry as PrismaEntryWithOptionalFields).flaggedReason || undefined,
    forbidden: entry.forbidden ?? undefined,
    forbiddenReason: (entry as PrismaEntryWithOptionalFields).forbiddenReason || undefined,
    parents,
    children,
    entails,
    causes,
    alsoSee,
  };
}

// Cached wrapper for getGraphNode
export const getGraphNode = unstable_cache(
  async (entryId: string) => getGraphNodeInternal(entryId),
  ['graph-node'],
  {
    revalidate: 3600, // Cache for 1 hour
    tags: ['graph-node'],
  }
);

// Internal implementation without caching
async function getAncestorPathInternal(entryId: string): Promise<GraphNode[]> {
  // Use recursive CTE to get entire ancestor path in a single query
  const results = await withRetry(
    () => prisma.$queryRaw<Array<{
      id: string;
      legacy_id: string;
      gloss: string;
      pos: string;
      lemmas: string[];
      src_lemmas: string[];
      examples: string[];
      depth: number;
    }>>`
      WITH RECURSIVE ancestor_path AS (
        -- Base case: start with the given entry
        SELECT 
          e.id,
          e.legacy_id,
          e.gloss,
          e.pos,
          e.lemmas,
          e.src_lemmas,
          e.examples,
          0 as depth
        FROM lexical_entries e
        WHERE e.id = ${entryId}
        
        UNION ALL
        
        -- Recursive case: find parent (hypernym)
        SELECT 
          e.id,
          e.legacy_id,
          e.gloss,
          e.pos,
          e.lemmas,
          e.src_lemmas,
          e.examples,
          ap.depth + 1 as depth
        FROM lexical_entries e
        INNER JOIN entry_relations r ON r.target_id = e.id
        INNER JOIN ancestor_path ap ON r.source_id = ap.id
        WHERE r.type = 'hypernym'
        LIMIT 1
      )
      SELECT * FROM ancestor_path
      ORDER BY depth DESC
    `,
    undefined,
    `getAncestorPath(${entryId})`
  );

  // Convert to GraphNode format (without nested relations for efficiency)
  return results.map(result => ({
    id: result.id,
    legacy_id: result.legacy_id,
    lemmas: result.lemmas,
    src_lemmas: result.src_lemmas,
    gloss: result.gloss,
    pos: result.pos,
    examples: result.examples,
    parents: [],
    children: [],
    entails: [],
    causes: [],
    alsoSee: [],
  }));
}

// Cached wrapper for getAncestorPath
export const getAncestorPath = unstable_cache(
  async (entryId: string) => getAncestorPathInternal(entryId),
  ['ancestor-path'],
  {
    revalidate: 3600, // Cache for 1 hour
    tags: ['ancestor-path'],
  }
);

export async function updateModerationStatus(
  ids: string[], 
  updates: { 
    flagged?: boolean; 
    flaggedReason?: string; 
    forbidden?: boolean; 
    forbiddenReason?: string; 
  }
): Promise<number> {
  const result = await prisma.lexicalEntry.updateMany({
    where: {
      id: {
        in: ids
      }
    },
    data: updates
  });

  return result.count;
}

export async function getPaginatedEntries(params: PaginationParams = {}): Promise<PaginatedResult<TableEntry>> {
  const {
    page = 1,
    limit = 20,
    sortBy = 'id',
    sortOrder = 'asc',
    search,
    pos,
    lexfile,
    gloss,
    lemmas,
    examples,
    particles,
    frames,
    isMwe,
    transitive,
    flagged,
    forbidden,
    parentsCountMin,
    parentsCountMax,
    childrenCountMin,
    childrenCountMax,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore
  } = params;

  const skip = (page - 1) * limit;

  // Build where clause
  const whereClause: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];
  
  // Global search (legacy)
  if (search) {
    andConditions.push({
      OR: [
        {
          gloss: {
            contains: search,
            mode: 'insensitive'
          }
        },
        {
          lemmas: {
            hasSome: [search]
          }
        },
        {
          src_lemmas: {
            hasSome: [search]
          }
        },
        {
          examples: {
            hasSome: search.split(' ')
          }
        }
      ]
    });
  }

  // Basic filters
  if (pos) {
    andConditions.push({ pos });
  }

  if (lexfile) {
    andConditions.push({ lexfile });
  }

  // Advanced text filters
  if (gloss) {
    andConditions.push({
      gloss: {
        contains: gloss,
        mode: 'insensitive'
      }
    });
  }

  if (lemmas) {
    const lemmaTerms = lemmas.split(/[\s,]+/).filter(Boolean);
    andConditions.push({
      OR: [
        {
          lemmas: {
            hasSome: lemmaTerms
          }
        },
        {
          src_lemmas: {
            hasSome: lemmaTerms
          }
        }
      ]
    });
  }

  if (examples) {
    andConditions.push({
      examples: {
        hasSome: examples.split(/[\s,]+/).filter(Boolean)
      }
    });
  }

  if (particles) {
    andConditions.push({
      particles: {
        hasSome: particles.split(/[\s,]+/).filter(Boolean)
      }
    });
  }

  if (frames) {
    andConditions.push({
      frames: {
        hasSome: frames.split(/[\s,]+/).filter(Boolean)
      }
    });
  }

  // Boolean filters
  if (isMwe !== undefined) {
    andConditions.push({ isMwe });
  }

  if (transitive !== undefined) {
    andConditions.push({ transitive });
  }

  if (flagged !== undefined) {
    andConditions.push({ flagged });
  }

  if (forbidden !== undefined) {
    andConditions.push({ forbidden });
  }

  // Date filters
  if (createdAfter) {
    andConditions.push({
      createdAt: {
        gte: new Date(createdAfter)
      }
    });
  }

  if (createdBefore) {
    andConditions.push({
      createdAt: {
        lte: new Date(createdBefore + 'T23:59:59.999Z')
      }
    });
  }

  if (updatedAfter) {
    andConditions.push({
      updatedAt: {
        gte: new Date(updatedAfter)
      }
    });
  }

  if (updatedBefore) {
    andConditions.push({
      updatedAt: {
        lte: new Date(updatedBefore + 'T23:59:59.999Z')
      }
    });
  }

  // Combine all conditions
  if (andConditions.length > 0) {
    whereClause.AND = andConditions;
  }

  // Get total count
  const total = await withRetry(
    () => prisma.lexicalEntry.count({
      where: whereClause
    }),
    undefined,
    'getPaginatedEntries:count'
  );

  // Build order clause
  const orderBy: Record<string, unknown> = {};
  
  // Map old field names to new ones for backward compatibility
  let actualSortBy = sortBy;
  if (sortBy === 'src_id') {
    actualSortBy = 'legacy_id';
  }
  
  if (actualSortBy === 'lemmas' || actualSortBy === 'src_lemmas') {
    // For array fields, we need to use raw SQL for proper sorting
    orderBy[actualSortBy] = sortOrder;
  } else if (actualSortBy === 'parentsCount' || actualSortBy === 'childrenCount') {
    // These will be computed after fetching
    orderBy.id = sortOrder; // Default fallback
  } else {
    orderBy[actualSortBy] = sortOrder;
  }

  // Fetch entries with relation counts
  const entries = await withRetry(
    () => prisma.lexicalEntry.findMany({
    where: whereClause,
    skip,
    take: limit,
    orderBy,
    include: {
      _count: {
        select: {
          sourceRelations: {
            where: { type: 'hypernym' }
          },
          targetRelations: {
            where: { type: 'hypernym' }
          }
        }
      }
    }
  }),
    undefined,
    'getPaginatedEntries:findMany'
  ) as unknown as PrismaEntryWithCounts[];

  // Transform to TableEntry format
  let data: TableEntry[] = entries.map(entry => ({
    id: entry.id,
    legacy_id: entry.legacy_id,
    lemmas: entry.lemmas,
    src_lemmas: entry.src_lemmas,
    gloss: entry.gloss,
    pos: entry.pos,
    lexfile: entry.lexfile,
    isMwe: entry.isMwe,
    transitive: entry.transitive || undefined,
    particles: entry.particles,
    frames: entry.frames,
    examples: entry.examples,
    flagged: (entry as PrismaEntryWithOptionalFields).flagged ?? undefined,
    flaggedReason: (entry as PrismaEntryWithOptionalFields).flaggedReason || undefined,
    forbidden: (entry as PrismaEntryWithOptionalFields).forbidden ?? undefined,
    forbiddenReason: (entry as PrismaEntryWithOptionalFields).forbiddenReason || undefined,
    parentsCount: entry._count.sourceRelations,
    childrenCount: entry._count.targetRelations,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }));

  // Apply numeric filters on computed fields
  if (parentsCountMin !== undefined) {
    data = data.filter(entry => entry.parentsCount >= parentsCountMin);
  }
  if (parentsCountMax !== undefined) {
    data = data.filter(entry => entry.parentsCount <= parentsCountMax);
  }
  if (childrenCountMin !== undefined) {
    data = data.filter(entry => entry.childrenCount >= childrenCountMin);
  }
  if (childrenCountMax !== undefined) {
    data = data.filter(entry => entry.childrenCount <= childrenCountMax);
  }

  // Sort by computed fields if needed
  if (sortBy === 'parentsCount') {
    data.sort((a, b) => sortOrder === 'asc' 
      ? a.parentsCount - b.parentsCount 
      : b.parentsCount - a.parentsCount
    );
  } else if (sortBy === 'childrenCount') {
    data.sort((a, b) => sortOrder === 'asc' 
      ? a.childrenCount - b.childrenCount 
      : b.childrenCount - a.childrenCount
    );
  }

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}