import { unstable_cache, revalidateTag } from 'next/cache';
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
  legal_gloss: string | null;
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
  legal_gloss: string | null;
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

export async function updateEntry(id: string, updates: Partial<Pick<LexicalEntry, 'gloss' | 'lemmas' | 'examples' | 'flagged' | 'flaggedReason' | 'forbidden' | 'forbiddenReason'> & { main_roles?: unknown[]; alt_roles?: unknown[] }>): Promise<EntryWithRelations | null> {
  // Handle roles updates separately
  if (updates.main_roles || updates.alt_roles) {
    await updateEntryRoles(id, updates.main_roles, updates.alt_roles);
  }

  // Extract non-roles fields for the main update
  const { main_roles, alt_roles, ...otherUpdates } = updates;

  const updatedEntry = await withRetry(
    () => prisma.lexicalEntry.update({
    where: { id },
    data: otherUpdates,
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

  // Invalidate cache for graph nodes since moderation status affects display
  revalidateTag('graph-node');

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

async function updateEntryRoles(entryId: string, mainRoles?: unknown[], altRoles?: unknown[]) {
  // Handle main roles updates
  if (mainRoles) {
    // Delete existing main roles for this entry
    await prisma.main_roles.deleteMany({
      where: { lexical_entry_id: entryId }
    });

    // Insert new main roles
    for (const role of mainRoles) {
      const roleData = role as { id: string; description: string; roleType: string };
      if (roleData.description.trim()) {
        // Find existing role type
        const roleType = await prisma.role_types.findFirst({
          where: { label: roleData.roleType }
        });
        
        if (!roleType) {
          console.warn(`Role type "${roleData.roleType}" not found in database. Skipping role creation.`);
          continue;
        }

        // Find frame role
        const frameRole = await prisma.frame_roles.findFirst({
          where: {
            frame_id: (await prisma.lexicalEntry.findUnique({ where: { id: entryId } }))?.frame_id || '',
            role_type_id: roleType.id
          }
        });

        if (frameRole) {
          await prisma.main_roles.create({
            data: {
              id: `main_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              lexical_entry_id: entryId,
              frame_id: frameRole.frame_id,
              frame_role_id: frameRole.id,
              description: roleData.description,
              instantiation_type_ids: []
            }
          });
        }
      }
    }
  }

  // Handle alt roles updates
  if (altRoles) {
    // Delete existing alt roles for this entry
    await prisma.alt_roles.deleteMany({
      where: { lexical_entry_id: entryId }
    });

    // Insert new alt roles
    for (const role of altRoles) {
      const roleData = role as { id: number; description: string; roleType: string; exampleSentence: string };
      if (roleData.description.trim()) {
        // Find existing role type
        const roleType = await prisma.role_types.findFirst({
          where: { label: roleData.roleType }
        });
        
        if (!roleType) {
          console.warn(`Role type "${roleData.roleType}" not found in database. Skipping role creation.`);
          continue;
        }

        await prisma.alt_roles.create({
          data: {
            lexical_entry_id: entryId,
            role_type_id: roleType.id,
            description: roleData.description,
            example_sentence: roleData.exampleSentence || null,
            instantiation_type_ids: []
          }
        });
      }
    }
  }
}

// Internal implementation without caching
async function getGraphNodeInternal(entryId: string): Promise<GraphNode | null> {
  // Use a more efficient query that only fetches what we need
  const entry = await withRetry(
    () => prisma.lexicalEntry.findUnique({
      where: { id: entryId },
      include: {
        frame: {
          select: {
            id: true,
            framebank_id: true,
            frame_name: true,
            definition: true,
            short_definition: true,
            is_supporting_frame: true,
          }
        },
        main_roles_main_roles_lexical_entry_idTolexical_entries: {
          select: {
            id: true,
            description: true,
            instantiation_type_ids: true,
            frame_roles_main_roles_frame_role_idToframe_roles: {
              select: {
                role_types: {
                  select: {
                    id: true,
                    label: true,
                    generic_description: true,
                    explanation: true,
                  }
                }
              }
            }
          },
          take: 5, // Limit to first 5 to avoid overwhelming the display
        },
        alt_roles: {
          select: {
            id: true,
            description: true,
            example_sentence: true,
            instantiation_type_ids: true,
            role_types: {
              select: {
                id: true,
                label: true,
                generic_description: true,
                explanation: true,
              }
            }
          },
          take: 3, // Limit to first 3
        },
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
                lexfile: true,
                examples: true,
                frame_id: true,
                vendler_class: true,
                forbidden: true,
                forbiddenReason: true,
                flagged: true,
                flaggedReason: true,
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
                lexfile: true,
                examples: true,
                frame_id: true,
                vendler_class: true,
                forbidden: true,
                forbiddenReason: true,
                flagged: true,
                flaggedReason: true,
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
      lexfile: rel.target!.lexfile,
      examples: rel.target!.examples,
      flagged: (rel.target as { flagged?: boolean | null }).flagged ?? undefined,
      flaggedReason: (rel.target as { flaggedReason?: string | null }).flaggedReason || undefined,
      forbidden: (rel.target as { forbidden?: boolean | null }).forbidden ?? undefined,
      forbiddenReason: (rel.target as { forbiddenReason?: string | null }).forbiddenReason || undefined,
      frame_id: (rel.target as { frame_id?: string | null }).frame_id ?? null,
      vendler_class: (rel.target as { vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null }).vendler_class ?? null,
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
        lexfile: rel.source!.lexfile,
        examples: rel.source!.examples,
        flagged: (rel.source as { flagged?: boolean | null }).flagged ?? undefined,
        flaggedReason: (rel.source as { flaggedReason?: string | null }).flaggedReason || undefined,
        forbidden: (rel.source as { forbidden?: boolean | null }).forbidden ?? undefined,
        forbiddenReason: (rel.source as { forbiddenReason?: string | null }).forbiddenReason || undefined,
        frame_id: (rel.source as { frame_id?: string | null }).frame_id ?? null,
        vendler_class: (rel.source as { vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null }).vendler_class ?? null,
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
      lexfile: rel.target!.lexfile,
      examples: rel.target!.examples,
      flagged: (rel.target as { flagged?: boolean | null }).flagged ?? undefined,
      flaggedReason: (rel.target as { flaggedReason?: string | null }).flaggedReason || undefined,
      forbidden: (rel.target as { forbidden?: boolean | null }).forbidden ?? undefined,
      forbiddenReason: (rel.target as { forbiddenReason?: string | null }).forbiddenReason || undefined,
      frame_id: (rel.target as { frame_id?: string | null }).frame_id ?? null,
      vendler_class: (rel.target as { vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null }).vendler_class ?? null,
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
      lexfile: rel.target!.lexfile,
      examples: rel.target!.examples,
      flagged: (rel.target as { flagged?: boolean | null }).flagged ?? undefined,
      flaggedReason: (rel.target as { flaggedReason?: string | null }).flaggedReason || undefined,
      forbidden: (rel.target as { forbidden?: boolean | null }).forbidden ?? undefined,
      forbiddenReason: (rel.target as { forbiddenReason?: string | null }).forbiddenReason || undefined,
      frame_id: (rel.target as { frame_id?: string | null }).frame_id ?? null,
      vendler_class: (rel.target as { vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null }).vendler_class ?? null,
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
      lexfile: rel.target!.lexfile,
      examples: rel.target!.examples,
      flagged: (rel.target as { flagged?: boolean | null }).flagged ?? undefined,
      flaggedReason: (rel.target as { flaggedReason?: string | null }).flaggedReason || undefined,
      forbidden: (rel.target as { forbidden?: boolean | null }).forbidden ?? undefined,
      forbiddenReason: (rel.target as { forbiddenReason?: string | null }).forbiddenReason || undefined,
      frame_id: (rel.target as { frame_id?: string | null }).frame_id ?? null,
      vendler_class: (rel.target as { vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null }).vendler_class ?? null,
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
    legal_gloss: (entry as { legal_gloss?: string | null }).legal_gloss ?? null,
    pos: entry.pos,
    lexfile: entry.lexfile,
    examples: entry.examples,
    flagged: entry.flagged ?? undefined,
    flaggedReason: (entry as PrismaEntryWithOptionalFields).flaggedReason || undefined,
    forbidden: entry.forbidden ?? undefined,
    forbiddenReason: (entry as PrismaEntryWithOptionalFields).forbiddenReason || undefined,
    frame_id: (entry as { frame_id?: string | null }).frame_id ?? null,
    vendler_class: (entry as { vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null }).vendler_class ?? null,
    frame: (entry as { frame?: { id: string; framebank_id: string; frame_name: string; definition: string; short_definition: string; is_supporting_frame: boolean } | null }).frame ?? null,
    main_roles: (entry as { main_roles_main_roles_lexical_entry_idTolexical_entries?: unknown[] }).main_roles_main_roles_lexical_entry_idTolexical_entries?.map((role: unknown) => {
      const roleData = role as { id: string; description?: string; instantiation_type_ids: string[]; frame_roles_main_roles_frame_role_idToframe_roles?: { role_types?: { id: string; label: string; generic_description: string; explanation?: string } } };
      return {
        id: roleData.id,
        description: roleData.description,
        instantiation_type_ids: roleData.instantiation_type_ids,
        frame_role: {
          role_type: roleData.frame_roles_main_roles_frame_role_idToframe_roles?.role_types || { id: '', label: '', generic_description: '', explanation: '' }
        }
      };
    }),
    alt_roles: (entry as { alt_roles?: unknown[] }).alt_roles?.map((role: unknown) => {
      const roleData = role as { id: number; description?: string; example_sentence?: string; instantiation_type_ids: string[]; role_types?: { id: string; label: string; generic_description: string; explanation?: string } };
      return {
        id: roleData.id,
        description: roleData.description,
        example_sentence: roleData.example_sentence,
        instantiation_type_ids: roleData.instantiation_type_ids,
        role_type: roleData.role_types || { id: '', label: '', generic_description: '', explanation: '' }
      };
    }),
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
    revalidate: 60, // Cache for 1 minute instead of 1 hour
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
      lexfile: string;
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
          e.lexfile,
          e.lemmas,
          e.src_lemmas,
          e.examples,
          0 as depth
        FROM lexical_entries e
        WHERE e.id = ${entryId}
        
        UNION ALL
        
        -- Recursive case: find parent (hypernym)
        -- If there are multiple parents, pick the first one alphabetically
        SELECT 
          e.id,
          e.legacy_id,
          e.gloss,
          e.pos,
          e.lexfile,
          e.lemmas,
          e.src_lemmas,
          e.examples,
          ap.depth + 1 as depth
        FROM ancestor_path ap
        INNER JOIN LATERAL (
          SELECT e.*
          FROM entry_relations r
          INNER JOIN lexical_entries e ON r.target_id = e.id
          WHERE r.source_id = ap.id AND r.type = 'hypernym'
          ORDER BY e.id
          LIMIT 1
        ) e ON true
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
    lexfile: result.lexfile,
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

  // Invalidate cache for graph nodes since moderation status affects display
  revalidateTag('graph-node');

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