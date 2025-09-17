import { prisma } from './prisma';
import { RelationType, type LexicalEntry, type EntryWithRelations, type GraphNode, type SearchResult, type PaginationParams, type PaginatedResult, type TableEntry } from './types';

export async function getEntryById(id: string): Promise<EntryWithRelations | null> {
  const entry = await prisma.lexicalEntry.findUnique({
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
  });

  if (!entry) return null;

  // Convert Prisma types to our types
  return {
    ...entry,
    transitive: entry.transitive || undefined,
    sourceRelations: entry.sourceRelations.map(rel => ({
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type as RelationType,
      target: rel.target ? {
        ...rel.target,
        transitive: rel.target.transitive || undefined
      } : undefined,
    })),
    targetRelations: entry.targetRelations.map(rel => ({
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type as RelationType,
      source: rel.source ? {
        ...rel.source,
        transitive: rel.source.transitive || undefined
      } : undefined,
    })),
  };
}

export async function searchEntries(query: string, limit = 20): Promise<SearchResult[]> {
  // Use PostgreSQL full-text search
  const results = await prisma.$queryRaw<SearchResult[]>`
    SELECT 
      id,
      lemmas,
      gloss,
      pos,
      ts_rank(gloss_tsv, plainto_tsquery('english', ${query})) +
      ts_rank(examples_tsv, plainto_tsquery('english', ${query})) as rank
    FROM lexical_entries
    WHERE 
      gloss_tsv @@ plainto_tsquery('english', ${query}) OR
      examples_tsv @@ plainto_tsquery('english', ${query}) OR
      ${query} = ANY(lemmas)
    ORDER BY rank DESC, id
    LIMIT ${limit}
  `;

  return results;
}

export async function updateEntry(id: string, updates: Partial<Pick<LexicalEntry, 'gloss' | 'lemmas' | 'examples'>>): Promise<EntryWithRelations | null> {
  const updatedEntry = await prisma.lexicalEntry.update({
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
  });

  if (!updatedEntry) return null;

  // Convert Prisma types to our types
  return {
    ...updatedEntry,
    transitive: updatedEntry.transitive || undefined,
    sourceRelations: updatedEntry.sourceRelations.map(rel => ({
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type as RelationType,
      target: rel.target ? {
        ...rel.target,
        transitive: rel.target.transitive || undefined
      } : undefined,
    })),
    targetRelations: updatedEntry.targetRelations.map(rel => ({
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type as RelationType,
      source: rel.source ? {
        ...rel.source,
        transitive: rel.source.transitive || undefined
      } : undefined,
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
        lemmas: relation.target.lemmas,
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
        lemmas: relation.source.lemmas,
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
        lemmas: relation.target.lemmas,
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
        lemmas: relation.target.lemmas,
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
        lemmas: relation.target.lemmas,
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
    lemmas: entry.lemmas,
    gloss: entry.gloss,
    pos: entry.pos,
    examples: entry.examples,
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

export async function getPaginatedEntries(params: PaginationParams = {}): Promise<PaginatedResult<TableEntry>> {
  const {
    page = 1,
    limit = 20,
    sortBy = 'id',
    sortOrder = 'asc',
    search,
    pos,
    lexfile
  } = params;

  const skip = (page - 1) * limit;

  // Build where clause
  const whereClause: Record<string, unknown> = {};
  
  if (search) {
    whereClause.OR = [
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
        examples: {
          hasSome: search.split(' ')
        }
      }
    ];
  }

  if (pos) {
    whereClause.pos = pos;
  }

  if (lexfile) {
    whereClause.lexfile = lexfile;
  }

  // Get total count
  const total = await prisma.lexicalEntry.count({
    where: whereClause
  });

  // Build order clause
  const orderBy: Record<string, unknown> = {};
  if (sortBy === 'lemmas') {
    // For array fields, we need to use raw SQL for proper sorting
    orderBy.lemmas = sortOrder;
  } else if (sortBy === 'parentsCount' || sortBy === 'childrenCount') {
    // These will be computed after fetching
    orderBy.id = sortOrder; // Default fallback
  } else {
    orderBy[sortBy] = sortOrder;
  }

  // Fetch entries with relation counts
  const entries = await prisma.lexicalEntry.findMany({
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
  });

  // Transform to TableEntry format
  const data: TableEntry[] = entries.map(entry => ({
    id: entry.id,
    lemmas: entry.lemmas,
    gloss: entry.gloss,
    pos: entry.pos,
    lexfile: entry.lexfile,
    isMwe: entry.isMwe,
    transitive: entry.transitive || undefined,
    examples: entry.examples,
    parentsCount: entry._count.sourceRelations,
    childrenCount: entry._count.targetRelations,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  }));

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