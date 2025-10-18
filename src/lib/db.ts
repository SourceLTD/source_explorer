import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from './prisma';
import { withRetry } from './db-utils'; 
import { RelationType, type LexicalEntry, type EntryWithRelations, type GraphNode, type SearchResult, type PaginationParams, type PaginatedResult, type TableEntry, type EntryRecipes, type Recipe, type RecipePredicateNode, type RecipePredicateRoleMapping } from './types';
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
  frame_id: string | null;
  vendler_class: 'state' | 'activity' | 'accomplishment' | 'achievement' | null;
  legal_constraints: string[];
  roles?: Array<{
    id: string;
    description?: string | null;
    example_sentence?: string | null;
    instantiation_type_ids: string[];
    main: boolean;
    role_types?: {
      id: string;
      label: string;
      generic_description: string;
      explanation?: string | null;
    };
  }>;
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

// Recipes for an entry (predicates and their relations)
async function getRecipesForEntryInternal(entryId: string): Promise<EntryRecipes> {
  // Fetch recipes for the entry
  const recipes = await withRetry(
    () => prisma.$queryRaw<Array<{ id: string; label: string | null; description: string | null; is_default: boolean }>>`
      SELECT id, label, description, is_default
      FROM recipes
      WHERE lexical_entry_id = ${entryId}
      ORDER BY is_default DESC, created_at ASC
    `,
    undefined,
    `getRecipesForEntry:recipes(${entryId})`
  );

  if (recipes.length === 0) {
    return { entryId, recipes: [] };
  }

  const recipeIds = recipes.map(r => r.id);

  // Fetch predicates with their lexical entries
  const predicates = await withRetry(
    () => prisma.$queryRaw<Array<{
      id: string;
      recipe_id: string;
      alias: string | null;
      position: number | null;
      optional: boolean | null;
      negated: boolean | null;
      predicate_lexical_entry_id: string;
      lex_id: string;
      lex_legacy_id: string;
      lex_lemmas: string[];
      lex_src_lemmas: string[];
      lex_gloss: string;
      lex_pos: string;
      lex_lexfile: string;
      lex_examples: string[];
      lex_frame_id: string | null;
      lex_vendler_class: string | null;
      lex_flagged: boolean | null;
      lex_flagged_reason: string | null;
      lex_forbidden: boolean | null;
      lex_forbidden_reason: string | null;
    }>>`
      SELECT
        rp.id,
        rp.recipe_id,
        rp.alias,
        rp.position,
        rp.optional,
        rp.negated,
        rp.predicate_lexical_entry_id,
        le.id as lex_id,
        le.legacy_id as lex_legacy_id,
        le.lemmas as lex_lemmas,
        le.src_lemmas as lex_src_lemmas,
        le.gloss as lex_gloss,
        le.pos as lex_pos,
        le.lexfile as lex_lexfile,
        le.examples as lex_examples,
        le.frame_id as lex_frame_id,
        le.vendler_class as lex_vendler_class,
        le.flagged as lex_flagged,
        le."flagged_reason" as lex_flagged_reason,
        le.forbidden as lex_forbidden,
        le."forbidden_reason" as lex_forbidden_reason
      FROM recipe_predicates rp
      JOIN lexical_entries le ON le.id = rp.predicate_lexical_entry_id
      WHERE rp.recipe_id = ANY(${recipeIds}::text[])
      ORDER BY COALESCE(rp.position, 0) ASC
    `,
    undefined,
    `getRecipesForEntry:predicates(${entryId})`
  );

  // Fetch role mappings per predicate (all binding types)
  const roleMappings = await withRetry(
    () => prisma.$queryRaw<Array<{
      recipe_predicate_id: string;
      bind_kind: string;
      predicate_role_label: string | null;
      entry_role_label: string | null;
      variable_type_label: string | null;
      constant: unknown;
    }>>`
      SELECT
        rprb.recipe_predicate_id,
        rprb.bind_kind,
        prt.label as predicate_role_label,
        lrt.label as entry_role_label,
        pvt.label as variable_type_label,
        rprb.constant
      FROM recipe_predicate_role_bindings rprb
      LEFT JOIN roles pr ON pr.id = rprb.predicate_role_id
      LEFT JOIN role_types prt ON prt.id = pr.role_type_id
      LEFT JOIN roles lr ON lr.id = rprb.lexical_entry_role_id
      LEFT JOIN role_types lrt ON lrt.id = lr.role_type_id
      LEFT JOIN predicate_variable_types pvt ON pvt.id = rprb.predicate_variable_type_id
      WHERE rprb.recipe_predicate_id IN (
        SELECT id FROM recipe_predicates WHERE recipe_id = ANY(${recipeIds}::text[])
      )
      AND prt.label IS NOT NULL
    `,
    undefined,
    `getRecipesForEntry:roleMappings(${entryId})`
  );

  // Fetch predicate relations
  const edges = await withRetry(
    () => prisma.$queryRaw<Array<{ recipe_id: string; source_recipe_predicate_id: string; target_recipe_predicate_id: string; relation_type: string }>>`
      SELECT recipe_id, source_recipe_predicate_id, target_recipe_predicate_id, relation_type
      FROM recipe_predicate_relations
      WHERE recipe_id = ANY(${recipeIds}::text[])
    `,
    undefined,
    `getRecipesForEntry:edges(${entryId})`
  );

  // Group data into recipe structures
  const byRecipeId: Record<string, Recipe> = {};
  for (const r of recipes) {
    byRecipeId[r.id] = {
      id: r.id,
      label: r.label,
      description: r.description,
      is_default: r.is_default,
      predicates: [],
      relations: [],
    };
  }

  const mappingsByPredicate: Record<string, RecipePredicateRoleMapping[]> = {};
  for (const m of roleMappings) {
    // Skip mappings where predicate role label is missing
    if (!m.predicate_role_label) {
      continue;
    }
    
    const array = mappingsByPredicate[m.recipe_predicate_id] || (mappingsByPredicate[m.recipe_predicate_id] = []);
    
    // Determine binding type and create appropriate mapping
    // Priority: if entry_role_label exists, it's a role binding
    if (m.entry_role_label) {
      // Role-to-role binding
      array.push({
        predicateRoleLabel: m.predicate_role_label,
        bindKind: 'role',
        entryRoleLabel: m.entry_role_label,
      });
    } else if (m.variable_type_label) {
      // Role-to-variable binding
      array.push({
        predicateRoleLabel: m.predicate_role_label,
        bindKind: 'variable',
        variableTypeLabel: m.variable_type_label,
      });
    } else if (m.constant !== null && m.constant !== undefined) {
      // Role-to-constant binding
      array.push({
        predicateRoleLabel: m.predicate_role_label,
        bindKind: 'constant',
        constant: m.constant,
      });
    }
  }

  for (const p of predicates) {
    const recipe = byRecipeId[p.recipe_id];
    if (!recipe) continue;
    const node: RecipePredicateNode = {
      id: p.id,
      alias: p.alias,
      position: p.position ?? undefined,
      optional: Boolean(p.optional),
      negated: Boolean(p.negated),
      lexical: {
        id: p.lex_id,
        legacy_id: p.lex_legacy_id,
        lemmas: p.lex_lemmas,
        src_lemmas: p.lex_src_lemmas,
        gloss: p.lex_gloss,
        legal_constraints: [],
        pos: p.lex_pos,
        lexfile: p.lex_lexfile,
        examples: p.lex_examples,
        flagged: p.lex_flagged ?? undefined,
        flaggedReason: p.lex_flagged_reason ?? undefined,
        forbidden: p.lex_forbidden ?? undefined,
        forbiddenReason: p.lex_forbidden_reason ?? undefined,
        frame_id: p.lex_frame_id ?? null,
        vendler_class: (p.lex_vendler_class as 'state' | 'activity' | 'accomplishment' | 'achievement' | null) ?? null,
        parents: [],
        children: [],
        entails: [],
        causes: [],
        alsoSee: [],
      },
      roleMappings: mappingsByPredicate[p.id] || [],
    };
    recipe.predicates.push(node);
  }

  for (const e of edges) {
    const recipe = byRecipeId[e.recipe_id];
    if (!recipe) continue;
    recipe.relations.push({
      sourcePredicateId: e.source_recipe_predicate_id,
      targetPredicateId: e.target_recipe_predicate_id,
      relation_type: e.relation_type as 'also_see' | 'causes' | 'entails',
    });
  }

  return { entryId, recipes: Object.values(byRecipeId) };
}

export const getRecipesForEntry = unstable_cache(
  async (entryId: string) => getRecipesForEntryInternal(entryId),
  ['entry-recipes'],
  { revalidate: 60, tags: ['entry-recipes'] }
);

export async function updateEntry(id: string, updates: Partial<Pick<LexicalEntry, 'gloss' | 'lemmas' | 'examples' | 'flagged' | 'flaggedReason' | 'forbidden' | 'forbiddenReason'> & { roles?: unknown[] }>): Promise<EntryWithRelations | null> {
  // Handle roles updates separately
  if (updates.roles) {
    await updateEntryRoles(id, updates.roles);
  }

  // Extract non-roles fields for the main update
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { roles: _roles, ...otherUpdates } = updates;

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

async function updateEntryRoles(entryId: string, roles?: unknown[]) {
  if (roles) {
    // Delete existing roles for this entry
    await prisma.$executeRaw`
      DELETE FROM roles WHERE lexical_entry_id = ${entryId}
    `;

    // Insert new roles
    for (const role of roles) {
      const roleData = role as { id: string; description: string; roleType: string; exampleSentence?: string; main: boolean };
      if (roleData.description.trim()) {
        // Find existing role type
        const roleType = await prisma.role_types.findFirst({
          where: { label: roleData.roleType }
        });
        
        if (!roleType) {
          console.warn(`Role type "${roleData.roleType}" not found in database. Skipping role creation.`);
          continue;
        }

        const newId = `${roleData.main ? 'main' : 'alt'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await prisma.$executeRaw`
          INSERT INTO roles (
            id, lexical_entry_id, role_type_id, main, description, example_sentence, instantiation_type_ids, created_at, updated_at
          ) VALUES (
            ${newId}, ${entryId}, ${roleType.id}, ${roleData.main}, ${roleData.description}, ${roleData.exampleSentence || null}, ARRAY[]::varchar[], now(), now()
          )
        `;
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

  // Fetch roles separately to avoid type issues
  const rolesData = await withRetry(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (prisma as any).roles.findMany({
      where: { lexical_entry_id: entryId },
      include: {
        role_types: {
          select: {
            id: true,
            label: true,
            generic_description: true,
            explanation: true,
          }
        }
      }
    }),
    undefined,
    `getRoles(${entryId})`
  ) as Array<{
    id: string;
    description: string | null;
    example_sentence: string | null;
    instantiation_type_ids: string[];
    main: boolean;
    role_types: {
      id: string;
      label: string;
      generic_description: string;
      explanation: string | null;
    };
  }>;

  // Get parents (hypernyms) - these are broader concepts
  const parents: GraphNode[] = entry.sourceRelations
    .filter(rel => rel.type === 'hypernym' && rel.target)
    .map(rel => ({
      id: rel.target!.id,
      legacy_id: rel.target!.legacy_id,
      lemmas: rel.target!.lemmas,
      src_lemmas: rel.target!.src_lemmas,
      gloss: rel.target!.gloss,
      legal_constraints: [],
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
        legal_constraints: [],
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
      legal_constraints: [],
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
      legal_constraints: [],
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
      legal_constraints: [],
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

  // Map roles data to the expected format
  const roles = rolesData.map(role => ({
    id: role.id,
    description: role.description ?? undefined,
    example_sentence: role.example_sentence ?? undefined,
    instantiation_type_ids: role.instantiation_type_ids,
    main: role.main,
    role_type: {
      id: role.role_types.id,
      label: role.role_types.label,
      generic_description: role.role_types.generic_description,
      explanation: role.role_types.explanation ?? undefined,
    },
  }));

  return {
    id: entry.id,
    legacy_id: entry.legacy_id,
    lemmas: entry.lemmas,
    src_lemmas: entry.src_lemmas,
    gloss: entry.gloss,
    legal_gloss: (entry as { legal_gloss?: string | null }).legal_gloss ?? null,
    legal_constraints: (entry as { legal_constraints?: string[] }).legal_constraints ?? [],
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
    roles,
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

// Helper function to revalidate graph node cache
export function revalidateGraphNodeCache() {
  revalidateTag('graph-node');
}

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
    legal_constraints: [],
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
    frame_id,
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
    const posValues = pos.split(',').map(p => p.trim()).filter(Boolean);
    if (posValues.length > 0) {
      andConditions.push({
        pos: {
          in: posValues
        }
      });
    }
  }

  if (lexfile) {
    const lexfiles = lexfile.split(',').map(lf => lf.trim()).filter(Boolean);
    if (lexfiles.length > 0) {
      andConditions.push({
        lexfile: {
          in: lexfiles
        }
      });
    }
  }

  if (frame_id) {
    const frameIds = frame_id.split(',').map(id => id.trim()).filter(Boolean);
    if (frameIds.length > 0) {
      andConditions.push({
        frame_id: {
          in: frameIds
        }
      });
    }
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
      },
      // roles omitted for performance and Prisma include typing stability
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
    frame_id: entry.frame_id ?? null,
    vendler_class: entry.vendler_class ?? null,
    legal_constraints: entry.legal_constraints || [],
    roles: [],
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