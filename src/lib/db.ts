import { prisma } from './prisma';
import { RelationType, type EntryWithRelations, type GraphNode, type SearchResult, type TableEntry, type PaginatedResult, type PaginationParams } from './types';

export async function getEntryById(id: string): Promise<EntryWithRelations | null> {
  return await prisma.lexicalEntry.findUnique({
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

  return updatedEntry;
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

export async function getPaginatedEntries(params: PaginationParams): Promise<PaginatedResult<TableEntry>> {
  const {
    page = 1,
    limit = 20,
    sortBy = 'id',
    sortOrder = 'asc',
    search,
    pos,
    lexfile,
    isMwe,
    transitive,
    hasParticles,
    hasFrames,
    hasExamples,
    lemmaContains,
    glossContains,
    minParents,
    maxParents,
    minChildren,
    maxChildren,
    createdAfter,
    createdBefore,
  } = params;

  const offset = (page - 1) * limit;
  
  // Build where clause
  const where: Record<string, unknown> = {};
  
  if (search) {
    where.OR = [
      { gloss: { contains: search, mode: 'insensitive' } },
      { lemmas: { hasSome: [search] } },
      { examples: { hasSome: [search] } }
    ];
  }
  
  if (pos) where.pos = pos;
  if (lexfile) where.lexfile = { contains: lexfile, mode: 'insensitive' };
  if (isMwe !== undefined) where.isMwe = isMwe;
  if (transitive !== undefined) where.transitive = transitive;
  if (lemmaContains) {
    where.lemmas = { hasSome: [lemmaContains] };
  }
  if (glossContains) {
    where.gloss = { contains: glossContains, mode: 'insensitive' };
  }
  if (hasParticles !== undefined) {
    where.particles = hasParticles ? { not: { equals: [] } } : { equals: [] };
  }
  if (hasFrames !== undefined) {
    where.frames = hasFrames ? { not: { equals: [] } } : { equals: [] };
  }
  if (hasExamples !== undefined) {
    where.examples = hasExamples ? { not: { equals: [] } } : { equals: [] };
  }
  if (createdAfter) {
    where.createdAt = { ...where.createdAt, gte: new Date(createdAfter) };
  }
  if (createdBefore) {
    where.createdAt = { ...where.createdAt, lte: new Date(createdBefore) };
  }

  // Build order by clause
  const orderBy: Record<string, string> = {};
  if (sortBy === 'parentsCount' || sortBy === 'childrenCount') {
    // These will be handled in the raw query since they require aggregation
  } else {
    orderBy[sortBy] = sortOrder;
  }

  // For parent/children counts, we need to use a more complex query
  if (sortBy === 'parentsCount' || sortBy === 'childrenCount' || minParents !== undefined || maxParents !== undefined || minChildren !== undefined || maxChildren !== undefined) {
    // Use raw SQL for complex queries with relation counts
    const whereConditions: string[] = [];
    const parameters: (string | number | boolean | Date)[] = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(
        le.gloss ILIKE $${paramIndex} OR 
        $${paramIndex + 1} = ANY(le.lemmas) OR
        le.examples && ARRAY[$${paramIndex + 2}]
      )`);
      parameters.push(`%${search}%`, search, search);
      paramIndex += 3;
    }
    
    if (pos) {
      whereConditions.push(`le.pos = $${paramIndex}`);
      parameters.push(pos);
      paramIndex++;
    }
    
    if (lexfile) {
      whereConditions.push(`le.lexfile ILIKE $${paramIndex}`);
      parameters.push(`%${lexfile}%`);
      paramIndex++;
    }
    
    if (isMwe !== undefined) {
      whereConditions.push(`le.is_mwe = $${paramIndex}`);
      parameters.push(isMwe);
      paramIndex++;
    }
    
    if (transitive !== undefined) {
      whereConditions.push(`le.transitive = $${paramIndex}`);
      parameters.push(transitive);
      paramIndex++;
    }
    
    if (lemmaContains) {
      whereConditions.push(`$${paramIndex} = ANY(le.lemmas)`);
      parameters.push(lemmaContains);
      paramIndex++;
    }
    
    if (glossContains) {
      whereConditions.push(`le.gloss ILIKE $${paramIndex}`);
      parameters.push(`%${glossContains}%`);
      paramIndex++;
    }
    
    if (hasParticles !== undefined) {
      whereConditions.push(hasParticles ? `array_length(le.particles, 1) > 0` : `array_length(le.particles, 1) IS NULL`);
    }
    
    if (hasFrames !== undefined) {
      whereConditions.push(hasFrames ? `array_length(le.frames, 1) > 0` : `array_length(le.frames, 1) IS NULL`);
    }
    
    if (hasExamples !== undefined) {
      whereConditions.push(hasExamples ? `array_length(le.examples, 1) > 0` : `array_length(le.examples, 1) IS NULL`);
    }
    
    if (createdAfter) {
      whereConditions.push(`le.created_at >= $${paramIndex}`);
      parameters.push(new Date(createdAfter));
      paramIndex++;
    }
    
    if (createdBefore) {
      whereConditions.push(`le.created_at <= $${paramIndex}`);
      parameters.push(new Date(createdBefore));
      paramIndex++;
    }
    
    if (minParents !== undefined) {
      whereConditions.push(`parents_count >= $${paramIndex}`);
      parameters.push(minParents);
      paramIndex++;
    }
    
    if (maxParents !== undefined) {
      whereConditions.push(`parents_count <= $${paramIndex}`);
      parameters.push(maxParents);
      paramIndex++;
    }
    
    if (minChildren !== undefined) {
      whereConditions.push(`children_count >= $${paramIndex}`);
      parameters.push(minChildren);
      paramIndex++;
    }
    
    if (maxChildren !== undefined) {
      whereConditions.push(`children_count <= $${paramIndex}`);
      parameters.push(maxChildren);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    const orderByClause = sortBy === 'parentsCount' ? `ORDER BY parents_count ${sortOrder}` :
                         sortBy === 'childrenCount' ? `ORDER BY children_count ${sortOrder}` :
                         `ORDER BY le.${sortBy} ${sortOrder}`;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM (
        SELECT le.id,
          COALESCE(parent_counts.count, 0) as parents_count,
          COALESCE(child_counts.count, 0) as children_count
        FROM lexical_entries le
        LEFT JOIN (
          SELECT target_id, COUNT(*) as count
          FROM entry_relations
          WHERE type = 'hypernym'
          GROUP BY target_id
        ) parent_counts ON le.id = parent_counts.target_id
        LEFT JOIN (
          SELECT source_id, COUNT(*) as count
          FROM entry_relations
          WHERE type = 'hypernym'
          GROUP BY source_id
        ) child_counts ON le.id = child_counts.source_id
        ${whereClause}
      ) counted
    `;

    const dataQuery = `
      SELECT le.id, le.lemmas, le.gloss, le.pos, le.lexfile, le.is_mwe as "isMwe", 
             le.transitive, le.particles, le.frames, le.examples, le.created_at as "createdAt", 
             le.updated_at as "updatedAt",
             COALESCE(parent_counts.count, 0) as "parentsCount",
             COALESCE(child_counts.count, 0) as "childrenCount"
      FROM lexical_entries le
      LEFT JOIN (
        SELECT target_id, COUNT(*) as count
        FROM entry_relations
        WHERE type = 'hypernym'
        GROUP BY target_id
      ) parent_counts ON le.id = parent_counts.target_id
      LEFT JOIN (
        SELECT source_id, COUNT(*) as count
        FROM entry_relations
        WHERE type = 'hypernym'
        GROUP BY source_id
      ) child_counts ON le.id = child_counts.source_id
      ${whereClause}
      ${orderByClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    parameters.push(limit, offset);

    const [totalResult, dataResult] = await Promise.all([
      prisma.$queryRawUnsafe(countQuery, ...parameters.slice(0, -2)) as Promise<[{ total: bigint }]>,
      prisma.$queryRawUnsafe(dataQuery, ...parameters) as Promise<TableEntry[]>
    ]);

    const total = Number(totalResult[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  // Simple query without relation counts
  const [total, data] = await Promise.all([
    prisma.lexicalEntry.count({ where }),
    prisma.lexicalEntry.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
      select: {
        id: true,
        lemmas: true,
        gloss: true,
        pos: true,
        lexfile: true,
        isMwe: true,
        transitive: true,
        particles: true,
        frames: true,
        examples: true,
        createdAt: true,
        updatedAt: true,
      }
    })
  ]);

  // Add relation counts for simple queries
  const enrichedData: TableEntry[] = await Promise.all(
    data.map(async (entry) => {
      const [parentsCount, childrenCount] = await Promise.all([
        prisma.entryRelation.count({
          where: {
            targetId: entry.id,
            type: RelationType.HYPERNYM
          }
        }),
        prisma.entryRelation.count({
          where: {
            sourceId: entry.id,
            type: RelationType.HYPERNYM
          }
        })
      ]);

      return {
        ...entry,
        parentsCount,
        childrenCount,
      };
    })
  );

  const totalPages = Math.ceil(total / limit);

  return {
    data: enrichedData,
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

// Database object with all the methods expected by API routes
export const db = {
  async getEntryRelations(entryId: string, type?: RelationType) {
    const where: Record<string, unknown> = {
      OR: [
        { sourceId: entryId },
        { targetId: entryId }
      ]
    };
    
    if (type) {
      where.type = type;
    }

    return await prisma.entryRelation.findMany({
      where,
      include: {
        source: true,
        target: true
      }
    });
  },

  async createEntryRelation(sourceId: string, targetId: string, type: RelationType) {
    return await prisma.entryRelation.create({
      data: {
        sourceId,
        targetId,
        type
      },
      include: {
        source: true,
        target: true
      }
    });
  },

  async deleteEntryRelation(sourceId: string, targetId: string, type: RelationType) {
    return await prisma.entryRelation.delete({
      where: {
        sourceId_type_targetId: {
          sourceId,
          targetId,
          type
        }
      }
    });
  },

  async getStatistics() {
    const [entriesCount, relationsCount, posStats] = await Promise.all([
      prisma.lexicalEntry.count(),
      prisma.entryRelation.count(),
      prisma.lexicalEntry.groupBy({
        by: ['pos'],
        _count: {
          pos: true
        }
      })
    ]);

    return {
      totalEntries: entriesCount,
      totalRelations: relationsCount,
      partOfSpeechBreakdown: posStats.map(stat => ({
        pos: stat.pos,
        count: stat._count.pos
      }))
    };
  }
};