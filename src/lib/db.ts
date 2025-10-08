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

export async function getGraphNode(entryId: string): Promise<GraphNode | null> {
  const entry = await getEntryById(entryId);
  if (!entry) return null;

  // Get parents (hypernyms) - these are broader concepts
  // Since DB stores: child → parent, type = hypernym
  // When current entry is the SOURCE (child), the TARGET is the parent (hypernym)
  const parents: GraphNode[] = [];
  for (const relation of entry.sourceRelations) {
    if (relation.type === RelationType.HYPERNYM && relation.target) {
      parents.push({
        id: relation.target.id,
        legacy_id: relation.target.legacy_id,
        lemmas: relation.target.lemmas,
        src_lemmas: relation.target.src_lemmas,
        gloss: relation.target.gloss,
        pos: relation.target.pos,
        examples: relation.target.examples,
        parents: [],
        children: [],
        entails: [],
        causes: [],
        alsoSee: [],
      });
    }
  }

  // Get children (hyponyms) - these are more specific concepts  
  // When current entry is the TARGET (parent), the SOURCE is the child (hyponym)
  const children: GraphNode[] = [];
  for (const relation of entry.targetRelations) {
    if (relation.type === RelationType.HYPERNYM && relation.source) {
      children.push({
        id: relation.source.id,
        legacy_id: relation.source.legacy_id,
        lemmas: relation.source.lemmas,
        src_lemmas: relation.source.src_lemmas,
        gloss: relation.source.gloss,
        pos: relation.source.pos,
        examples: relation.source.examples,
        parents: [],
        children: [],
        entails: [],
        causes: [],
        alsoSee: [],
      });
    }
  }

  // Get entails relationships - when current entry is the SOURCE
  const entails: GraphNode[] = [];
  for (const relation of entry.sourceRelations) {
    if (relation.type === RelationType.ENTAILS && relation.target) {
      entails.push({
        id: relation.target.id,
        legacy_id: relation.target.legacy_id,
        lemmas: relation.target.lemmas,
        src_lemmas: relation.target.src_lemmas,
        gloss: relation.target.gloss,
        pos: relation.target.pos,
        examples: relation.target.examples,
        parents: [],
        children: [],
        entails: [],
        causes: [],
        alsoSee: [],
      });
    }
  }

  // Get causes relationships - when current entry is the SOURCE
  const causes: GraphNode[] = [];
  for (const relation of entry.sourceRelations) {
    if (relation.type === RelationType.CAUSES && relation.target) {
      causes.push({
        id: relation.target.id,
        legacy_id: relation.target.legacy_id,
        lemmas: relation.target.lemmas,
        src_lemmas: relation.target.src_lemmas,
        gloss: relation.target.gloss,
        pos: relation.target.pos,
        examples: relation.target.examples,
        parents: [],
        children: [],
        entails: [],
        causes: [],
        alsoSee: [],
      });
    }
  }

  // Get also_see relationships - when current entry is the SOURCE
  const alsoSee: GraphNode[] = [];
  for (const relation of entry.sourceRelations) {
    if (relation.type === RelationType.ALSO_SEE && relation.target) {
      alsoSee.push({
        id: relation.target.id,
        legacy_id: relation.target.legacy_id,
        lemmas: relation.target.lemmas,
        src_lemmas: relation.target.src_lemmas,
        gloss: relation.target.gloss,
        pos: relation.target.pos,
        examples: relation.target.examples,
        parents: [],
        children: [],
        entails: [],
        causes: [],
        alsoSee: [],
      });
    }
  }

  return {
    id: entry.id,
    legacy_id: entry.legacy_id,
    lemmas: entry.lemmas,
    src_lemmas: entry.src_lemmas,
    gloss: entry.gloss,
    pos: entry.pos,
    examples: entry.examples,
    flagged: entry.flagged ?? undefined,
    flaggedReason: entry.flaggedReason || undefined,
    forbidden: entry.forbidden ?? undefined,
    forbiddenReason: entry.forbiddenReason || undefined,
    parents,
    children,
    entails,
    causes,
    alsoSee,
  };
}

export async function getAncestorPath(entryId: string): Promise<GraphNode[]> {
  const path: GraphNode[] = [];
  let currentId = entryId;

  while (currentId) {
    const node = await getGraphNode(currentId);
    if (!node) break;

    path.unshift(node);

    // Find the first parent (hypernym) to continue the path
    const parent = node.parents[0];
    if (parent) {
      currentId = parent.id;
    } else {
      break;
    }
  }

  return path;
}

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