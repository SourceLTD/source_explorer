import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from './prisma';
import { withRetry } from './db-utils'; 
import { RelationType, type Verb, type VerbWithRelations, type VerbRelation, type GraphNode, type SearchResult, type PaginationParams, type PaginatedResult, type TableEntry, type EntryRecipes, type Recipe, type RecipePredicateNode, type RecipePredicateRoleMapping, type LogicNode, type LogicNodeKind } from './types';
import type { verbs as PrismaVerb, verb_relations as PrismaVerbRelation, Prisma } from '@prisma/client';

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
  verb_relations_verb_relations_source_idToverbs: (PrismaVerbRelation & {
    verbs_verb_relations_target_idToverbs: PrismaVerb | null;
  })[];
  verb_relations_verb_relations_target_idToverbs: (PrismaVerbRelation & {
    verbs_verb_relations_source_idToverbs: PrismaVerb | null;
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
    verb_relations_verb_relations_source_idToverbs: number;
    verb_relations_verb_relations_target_idToverbs: number;
  };
};

export async function getEntryById(id: string): Promise<VerbWithRelations | null> {
  const entry = await withRetry(
    () => prisma.verbs.findUnique({
      where: { code: id } as unknown as Prisma.verbsWhereUniqueInput, // Query by code (human-readable ID)
      include: {
        verb_relations_verb_relations_source_idToverbs: {
          include: {
            verbs_verb_relations_target_idToverbs: true,
          },
        },
        verb_relations_verb_relations_target_idToverbs: {
          include: {
            verbs_verb_relations_source_idToverbs: true,
          },
        },
      },
    }),
    undefined,
    `getEntryById(${id})`
  ) as unknown as PrismaEntryWithRelations | null;

  if (!entry) return null;

  // Convert Prisma types to our types
  const entryWithRelations = entry as unknown as {
    id: bigint;
    frame_id: bigint | null;
    verb_relations_verb_relations_source_idToverbs: Array<{
      source_id: bigint;
      target_id: bigint;
      type: string;
      verbs_verb_relations_target_idToverbs: PrismaVerb;
    }>;
    verb_relations_verb_relations_target_idToverbs: Array<{
      source_id: bigint;
      target_id: bigint;
      type: string;
      verbs_verb_relations_source_idToverbs: PrismaVerb;
    }>;
  };
  
  // Destructure to exclude BigInt and relation fields from spread
  const { id: _id, frame_id: _frame_id, verb_relations_verb_relations_source_idToverbs: _sourceRels, verb_relations_verb_relations_target_idToverbs: _targetRels, ...rest } = entryWithRelations;
  
  return {
    ...rest,
    id: (entry as { code?: string }).code || entryWithRelations.id.toString(), // Use code as id
    frame_id: entryWithRelations.frame_id?.toString() ?? null,
    transitive: entry.transitive || undefined,
    flagged: entry.flagged ?? undefined,
    flaggedReason: (entry as PrismaEntryWithOptionalFields).flaggedReason || undefined,
    forbidden: entry.forbidden ?? undefined,
    forbiddenReason: (entry as PrismaEntryWithOptionalFields).forbiddenReason || undefined,
    sourceRelations: entryWithRelations.verb_relations_verb_relations_source_idToverbs.map(rel => ({
      sourceId: rel.source_id.toString(),
      targetId: rel.target_id.toString(),
      type: rel.type as RelationType,
      target: rel.verbs_verb_relations_target_idToverbs ? {
        ...rel.verbs_verb_relations_target_idToverbs,
        id: (rel.verbs_verb_relations_target_idToverbs as { code?: string }).code || rel.verbs_verb_relations_target_idToverbs.id.toString(),
        frame_id: (rel.verbs_verb_relations_target_idToverbs as { frame_id?: bigint | null }).frame_id?.toString() ?? null,
        transitive: rel.verbs_verb_relations_target_idToverbs.transitive || undefined,
        flagged: rel.verbs_verb_relations_target_idToverbs.flagged ?? undefined,
        flaggedReason: (rel.verbs_verb_relations_target_idToverbs as PrismaEntryWithOptionalFields).flaggedReason || undefined,
        forbidden: rel.verbs_verb_relations_target_idToverbs.forbidden ?? undefined,
        forbiddenReason: (rel.verbs_verb_relations_target_idToverbs as PrismaEntryWithOptionalFields).forbiddenReason || undefined
      } as unknown as Verb : undefined,
    })),
    targetRelations: entryWithRelations.verb_relations_verb_relations_target_idToverbs.map(rel => ({
      sourceId: rel.source_id.toString(),
      targetId: rel.target_id.toString(),
      type: rel.type as RelationType,
      source: rel.verbs_verb_relations_source_idToverbs ? {
        ...rel.verbs_verb_relations_source_idToverbs,
        id: (rel.verbs_verb_relations_source_idToverbs as { code?: string }).code || rel.verbs_verb_relations_source_idToverbs.id.toString(),
        frame_id: (rel.verbs_verb_relations_source_idToverbs as { frame_id?: bigint | null }).frame_id?.toString() ?? null,
        transitive: rel.verbs_verb_relations_source_idToverbs.transitive || undefined,
        flagged: rel.verbs_verb_relations_source_idToverbs.flagged ?? undefined,
        flaggedReason: (rel.verbs_verb_relations_source_idToverbs as PrismaEntryWithOptionalFields).flaggedReason || undefined,
        forbidden: rel.verbs_verb_relations_source_idToverbs.forbidden ?? undefined,
        forbiddenReason: (rel.verbs_verb_relations_source_idToverbs as PrismaEntryWithOptionalFields).forbiddenReason || undefined
      } as unknown as Verb : undefined,
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
        code as id,
        legacy_id,
        lemmas,
        src_lemmas,
        gloss,
        'v' as pos,
        CASE 
          WHEN code ILIKE ${query} THEN 1000
          WHEN code ILIKE ${query + '%'} THEN 500
          WHEN legacy_id ILIKE ${query + '%'} THEN 400
          ELSE 0
        END as rank
      FROM verbs
      WHERE 
        code ILIKE ${query + '%'} OR
        legacy_id ILIKE ${query + '%'}
      ORDER BY rank DESC, code
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
      code as id,
      legacy_id,
      lemmas,
      src_lemmas,
      gloss,
      'v' as pos,
      ts_rank(gloss_tsv, plainto_tsquery('english', ${query})) +
      ts_rank(examples_tsv, plainto_tsquery('english', ${query})) as rank
    FROM verbs
    WHERE 
      gloss_tsv @@ plainto_tsquery('english', ${query}) OR
      examples_tsv @@ plainto_tsquery('english', ${query}) OR
      ${query} = ANY(lemmas) OR
      ${query} = ANY(src_lemmas)
    ORDER BY rank DESC, code
    LIMIT ${limit}
  `,
    undefined,
    `searchEntries(${query})`
  );

  return results;
}

// Recipes for an entry (predicates and their relations)
export async function getRecipesForEntryInternal(entryId: string): Promise<EntryRecipes> {
  // First get the numeric ID from the code
  const entry = await withRetry(
    () => prisma.verbs.findUnique({
      where: { code: entryId } as unknown as Prisma.verbsWhereUniqueInput,
      select: { id: true }
    }),
    undefined,
    `getRecipesForEntry:getEntry(${entryId})`
  );

  if (!entry) {
    return { entryId, recipes: [] };
  }

  // Fetch recipes for the entry
  const recipes = await withRetry(
    () => prisma.$queryRaw<Array<{ id: bigint; label: string | null; description: string | null; is_default: boolean }>>`
      SELECT id, label, description, is_default
      FROM recipes
      WHERE verb_id = ${entry.id}
      ORDER BY is_default DESC, created_at ASC
    `,
    undefined,
    `getRecipesForEntry:recipes(${entryId})`
  );

  if (recipes.length === 0) {
    return { entryId, recipes: [] };
  }

  const recipeIds = recipes.map(r => r.id.toString());

  // Fetch predicates with their lexical entries
  // Note: optional, negated, min_count, max_count columns removed by migration
  const predicates = await withRetry(
    () => prisma.$queryRaw<Array<{
      id: bigint;
      recipe_id: bigint;
      alias: string | null;
      position: number | null;
      example: string | null;
      predicate_verb_id: bigint;
      lex_id: bigint;
      lex_code: string;
      lex_legacy_id: string;
      lex_lemmas: string[];
      lex_src_lemmas: string[];
      lex_gloss: string;
      lex_pos: string;
      lex_lexfile: string;
      lex_examples: string[];
      lex_frame_id: bigint | null;
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
        rp.example,
        rp.predicate_verb_id,
        le.id as lex_id,
        le.code as lex_code,
        le.legacy_id as lex_legacy_id,
        le.lemmas as lex_lemmas,
        le.src_lemmas as lex_src_lemmas,
        le.gloss as lex_gloss,
        'v' as lex_pos,
        le.lexfile as lex_lexfile,
        le.examples as lex_examples,
        le.frame_id as lex_frame_id,
        le.vendler_class as lex_vendler_class,
        le.flagged as lex_flagged,
        le."flagged_reason" as lex_flagged_reason,
        le.forbidden as lex_forbidden,
        le."forbidden_reason" as lex_forbidden_reason
      FROM recipe_predicates rp
      JOIN verbs le ON le.id = rp.predicate_verb_id
      WHERE rp.recipe_id = ANY(${recipeIds}::bigint[])
      ORDER BY COALESCE(rp.position, 0) ASC
    `,
    undefined,
    `getRecipesForEntry:predicates(${entryId})`
  );

  // Fetch role mappings per predicate (all binding types)
  const roleMappings = await withRetry(
    () => prisma.$queryRaw<Array<{
      recipe_predicate_id: bigint;
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
        LEFT JOIN roles lr ON lr.id = rprb.verb_role_id
      LEFT JOIN role_types lrt ON lrt.id = lr.role_type_id
      LEFT JOIN predicate_variable_types pvt ON pvt.id = rprb.predicate_variable_type_id
      WHERE rprb.recipe_predicate_id IN (
        SELECT id FROM recipe_predicates WHERE recipe_id = ANY(${recipeIds}::bigint[])
      )
      AND prt.label IS NOT NULL
    `,
    undefined,
    `getRecipesForEntry:roleMappings(${entryId})`
  );

  // Fetch predicate relations
  const edges = await withRetry(
    () => prisma.$queryRaw<Array<{ recipe_id: bigint; source_recipe_predicate_id: bigint; target_recipe_predicate_id: bigint; relation_type: string }>>`
      SELECT recipe_id, source_recipe_predicate_id, target_recipe_predicate_id, relation_type
      FROM recipe_predicate_relations
      WHERE recipe_id = ANY(${recipeIds}::bigint[])
    `,
    undefined,
    `getRecipesForEntry:edges(${entryId})`
  );

  // Fetch logic AST nodes for all recipes
  const logicNodes = await withRetry(
    () => prisma.$queryRaw<Array<{ 
      id: bigint; 
      recipe_id: bigint; 
      kind: string; 
      description: string | null;
      natural_key: string | null;
    }>>`
      SELECT id, recipe_id, kind::text, description, natural_key
      FROM logic_nodes
      WHERE recipe_id = ANY(${recipeIds}::bigint[])
      ORDER BY id
    `,
    undefined,
    `getRecipesForEntry:logicNodes(${entryId})`
  );
  
  // Fetch logic edges
  const logicEdges = await withRetry(
    () => prisma.$queryRaw<Array<{ 
      parent_node_id: bigint; 
      child_node_id: bigint; 
      position: number | null;
    }>>`
      SELECT parent_node_id, child_node_id, position
      FROM logic_edges
      WHERE parent_node_id IN (
        SELECT id FROM logic_nodes WHERE recipe_id = ANY(${recipeIds}::bigint[])
      )
      ORDER BY parent_node_id, position NULLS LAST, child_node_id
    `,
    undefined,
    `getRecipesForEntry:logicEdges(${entryId})`
  );

  // Fetch logic targets (what leaf nodes point to)
  const logicTargets = await withRetry(
    () => prisma.$queryRaw<Array<{ 
      node_id: bigint; 
      recipe_predicate_id: bigint | null;
    }>>`
      SELECT node_id, recipe_predicate_id
      FROM logic_targets
      WHERE node_id IN (
        SELECT id FROM logic_nodes WHERE recipe_id = ANY(${recipeIds}::bigint[])
      )
    `,
    undefined,
    `getRecipesForEntry:logicTargets(${entryId})`
  );

  // Fetch recipe preconditions
  const preconditions = await withRetry(
    () => prisma.$queryRaw<Array<{
      id: bigint;
      recipe_id: bigint;
      condition_type: string;
      target_role_id: bigint | null;
      target_recipe_predicate_id: bigint | null;
      condition_params: unknown;
      description: string | null;
      error_message: string | null;
    }>>`
      SELECT id, recipe_id, condition_type, target_role_id, target_recipe_predicate_id,
             condition_params, description, error_message
      FROM recipe_preconditions
      WHERE recipe_id = ANY(${recipeIds}::bigint[])
    `,
    undefined,
    `getRecipesForEntry:preconditions(${entryId})`
  );

  // Group data into recipe structures
  const byRecipeId: Record<string, Recipe> = {};
  for (const r of recipes) {
    byRecipeId[r.id.toString()] = {
      id: r.id.toString(),
      label: r.label,
      description: r.description,
      is_default: r.is_default,
      predicates: [],
      predicate_groups: [], // Deprecated but kept for backwards compatibility
      relations: [],
      preconditions: [],
      logic_root: null,
    };
  }

  const mappingsByPredicate: Record<string, RecipePredicateRoleMapping[]> = {};
  for (const m of roleMappings) {
    // Skip mappings where predicate role label is missing
    if (!m.predicate_role_label) {
      continue;
    }
    
    const predicateIdStr = m.recipe_predicate_id.toString();
    const array = mappingsByPredicate[predicateIdStr] || (mappingsByPredicate[predicateIdStr] = []);
    
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
    const recipe = byRecipeId[p.recipe_id.toString()];
    if (!recipe) continue;
    const node: RecipePredicateNode = {
      id: p.id.toString(),
      alias: p.alias,
      position: p.position ?? undefined,
      optional: false, // Removed from schema - now encoded in logic tree
      negated: false, // Removed from schema - now encoded as NOT nodes in tree
      example: p.example,
      lexical: {
        id: p.lex_code, // Use code as the id
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
        frame_id: p.lex_frame_id ? p.lex_frame_id.toString() : null,
        vendler_class: (p.lex_vendler_class as 'state' | 'activity' | 'accomplishment' | 'achievement' | null) ?? null,
        parents: [],
        children: [],
        entails: [],
        causes: [],
        alsoSee: [],
      },
      roleMappings: mappingsByPredicate[p.id.toString()] || [],
    };
    recipe.predicates.push(node);
  }

  for (const e of edges) {
    const recipe = byRecipeId[e.recipe_id.toString()];
    if (!recipe) continue;
    recipe.relations.push({
      sourcePredicateId: e.source_recipe_predicate_id.toString(),
      targetPredicateId: e.target_recipe_predicate_id.toString(),
      relation_type: e.relation_type as 'also_see' | 'causes' | 'entails',
    });
  }

  // Add preconditions to recipes
  for (const pc of preconditions) {
    const recipe = byRecipeId[pc.recipe_id.toString()];
    if (!recipe) continue;
    recipe.preconditions.push({
      id: pc.id.toString(),
      condition_type: pc.condition_type,
      target_role_id: pc.target_role_id?.toString() || null,
      target_recipe_predicate_id: pc.target_recipe_predicate_id?.toString() || null,
      condition_params: pc.condition_params,
      description: pc.description,
      error_message: pc.error_message,
    });
  }

  // Build logic tree for each recipe
  // 1. Create a map of node_id -> LogicNode
  const nodeMap: Record<string, LogicNode> = {};
  for (const ln of logicNodes) {
    nodeMap[ln.id.toString()] = {
      id: ln.id.toString(),
      recipe_id: ln.recipe_id.toString(),
      kind: ln.kind as LogicNodeKind,
      description: ln.description,
      target_predicate_id: null,
      target_predicate: null,
      children: [],
    };
  }

  // 2. Map targets to leaf nodes
  const targetsByNodeId: Record<string, string> = {};
  for (const lt of logicTargets) {
    if (lt.recipe_predicate_id) {
      targetsByNodeId[lt.node_id.toString()] = lt.recipe_predicate_id.toString();
    }
  }

  // 3. Build parent-child relationships via edges
  const childrenByParentId: Record<string, string[]> = {};
  for (const e of logicEdges) {
    const parentId = e.parent_node_id.toString();
    if (!childrenByParentId[parentId]) {
      childrenByParentId[parentId] = [];
    }
    childrenByParentId[parentId].push(e.child_node_id.toString());
  }

  // 4. Recursively populate children and attach target predicates to leaf nodes
  function populateNode(nodeId: string, predicateMap: Record<string, RecipePredicateNode>): LogicNode {
    const node = nodeMap[nodeId];
    if (!node) {
      throw new Error(`Logic node ${nodeId} not found`);
    }

    // If this is a leaf, attach the target predicate
    if (node.kind === 'leaf') {
      const predicateId = targetsByNodeId[nodeId];
      if (predicateId) {
        node.target_predicate_id = predicateId;
        node.target_predicate = predicateMap[predicateId] || null;
      }
    }

    // Populate children recursively
    const childIds = childrenByParentId[nodeId] || [];
    node.children = childIds.map(childId => populateNode(childId, predicateMap));

    return node;
  }

  // 5. Attach logic tree to each recipe
  for (const r of recipes) {
    const recipe = byRecipeId[r.id.toString()];
    if (!recipe) continue;

    // Create a map of predicate_id -> RecipePredicateNode for this recipe
    const predicateMap: Record<string, RecipePredicateNode> = {};
    for (const pred of recipe.predicates) {
      predicateMap[pred.id] = pred;
    }

    // Find the root node for this recipe (standard pattern: 'root:recipe:{id}')
    const rootNode = logicNodes.find(
      ln => ln.recipe_id.toString() === r.id.toString() 
        && ln.natural_key === `root:recipe:${r.id.toString()}`
    );

    if (rootNode) {
      recipe.logic_root = populateNode(rootNode.id.toString(), predicateMap);
    }
  }

  return { entryId, recipes: Object.values(byRecipeId) };
}

export const getRecipesForEntry = process.env.DISABLE_CACHE === 'true'
  ? getRecipesForEntryInternal
  : unstable_cache(
      async (entryId: string) => getRecipesForEntryInternal(entryId),
      ['entry-recipes'],
      { revalidate: 60, tags: ['entry-recipes'] }
    );

export async function updateEntry(id: string, updates: Partial<Pick<Verb, 'gloss' | 'lemmas' | 'examples' | 'flagged' | 'flaggedReason' | 'forbidden' | 'forbiddenReason'> & { roles?: unknown[]; role_groups?: unknown[] }>): Promise<VerbWithRelations | null> {
  // Handle roles and role_groups updates separately
  if (updates.roles) {
    await updateEntryRoles(id, updates.roles);
  }
  
  if (updates.role_groups !== undefined) {
    await updateEntryRoleGroups(id, updates.role_groups);
  }

  // Extract non-roles/role_groups fields for the main update
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { roles: _roles, role_groups: _role_groups, ...otherUpdates } = updates;

  const updatedEntry = await withRetry(
    () => prisma.verbs.update({
    where: { code: id } as unknown as Prisma.verbsWhereUniqueInput, // Query by code (human-readable ID)
    data: otherUpdates,
    include: {
      verb_relations_verb_relations_source_idToverbs: {
        include: {
          verbs_verb_relations_target_idToverbs: true
        }
      },
      verb_relations_verb_relations_target_idToverbs: {
        include: {
          verbs_verb_relations_source_idToverbs: true
        }
      }
    }
  }),
    undefined,
    `updateEntry(${id})`
  ) as unknown as PrismaEntryWithRelations | null;

  if (!updatedEntry) return null;

  // Invalidate cache for graph nodes since the entry has been updated
  revalidateTag('graph-node');
  // Also revalidate the specific entry's cache
  revalidateGraphNodeCache();

  // Convert Prisma types to our types
  const entryWithRelations = updatedEntry as unknown as {
    id: bigint;
    frame_id: bigint | null;
    verb_relations_verb_relations_source_idToverbs: Array<{
      source_id: bigint;
      target_id: bigint;
      type: string;
      verbs_verb_relations_target_idToverbs: PrismaVerb;
    }>;
    verb_relations_verb_relations_target_idToverbs: Array<{
      source_id: bigint;
      target_id: bigint;
      type: string;
      verbs_verb_relations_source_idToverbs: PrismaVerb;
    }>;
  };
  
  // Destructure to exclude BigInt and relation fields from spread
  const { id: _id, frame_id: _frame_id, verb_relations_verb_relations_source_idToverbs: _sourceRels, verb_relations_verb_relations_target_idToverbs: _targetRels, ...rest } = entryWithRelations;
  
  return {
    ...rest,
    id: (updatedEntry as { code?: string }).code || entryWithRelations.id.toString(),
    frame_id: entryWithRelations.frame_id?.toString() ?? null,
    transitive: updatedEntry.transitive || undefined,
    flagged: updatedEntry.flagged ?? undefined,
    flaggedReason: (updatedEntry as PrismaEntryWithOptionalFields).flaggedReason || undefined,
    forbidden: updatedEntry.forbidden ?? undefined,
    forbiddenReason: (updatedEntry as PrismaEntryWithOptionalFields).forbiddenReason || undefined,
    sourceRelations: entryWithRelations.verb_relations_verb_relations_source_idToverbs.map(rel => ({
      sourceId: rel.source_id.toString(),
      targetId: rel.target_id.toString(),
      type: rel.type as RelationType,
      target: rel.verbs_verb_relations_target_idToverbs ? {
        ...rel.verbs_verb_relations_target_idToverbs,
        id: (rel.verbs_verb_relations_target_idToverbs as { code?: string }).code || rel.verbs_verb_relations_target_idToverbs.id.toString(),
        frame_id: (rel.verbs_verb_relations_target_idToverbs as { frame_id?: bigint | null }).frame_id?.toString() ?? null,
        transitive: rel.verbs_verb_relations_target_idToverbs.transitive || undefined,
        flagged: rel.verbs_verb_relations_target_idToverbs.flagged ?? undefined,
        flaggedReason: (rel.verbs_verb_relations_target_idToverbs as PrismaEntryWithOptionalFields).flaggedReason || undefined,
        forbidden: rel.verbs_verb_relations_target_idToverbs.forbidden ?? undefined,
        forbiddenReason: (rel.verbs_verb_relations_target_idToverbs as PrismaEntryWithOptionalFields).forbiddenReason || undefined
      } as unknown as Verb : undefined,
      } as VerbRelation)),
    targetRelations: entryWithRelations.verb_relations_verb_relations_target_idToverbs.map(rel => ({
      sourceId: rel.source_id.toString(),
      targetId: rel.target_id.toString(),
      type: rel.type as RelationType,
      source: rel.verbs_verb_relations_source_idToverbs ? {
        ...rel.verbs_verb_relations_source_idToverbs,
        id: (rel.verbs_verb_relations_source_idToverbs as { code?: string }).code || rel.verbs_verb_relations_source_idToverbs.id.toString(),
        frame_id: (rel.verbs_verb_relations_source_idToverbs as { frame_id?: bigint | null }).frame_id?.toString() ?? null,
        transitive: rel.verbs_verb_relations_source_idToverbs.transitive || undefined,
        flagged: rel.verbs_verb_relations_source_idToverbs.flagged ?? undefined,
        flaggedReason: (rel.verbs_verb_relations_source_idToverbs as PrismaEntryWithOptionalFields).flaggedReason || undefined,
        forbidden: rel.verbs_verb_relations_source_idToverbs.forbidden ?? undefined,
        forbiddenReason: (rel.verbs_verb_relations_source_idToverbs as PrismaEntryWithOptionalFields).forbiddenReason || undefined
      } as unknown as Verb : undefined,
      } as VerbRelation)),
  };
}

async function updateEntryRoles(entryId: string, roles?: unknown[]) {
  if (roles) {
    // First get the numeric ID from the code
    const entry = await prisma.verbs.findUnique({
      where: { code: entryId } as unknown as Prisma.verbsWhereUniqueInput,
      select: { id: true }
    });
    
    if (!entry) {
      console.warn(`Entry with code "${entryId}" not found. Skipping role update.`);
      return;
    }

    // Delete existing roles for this entry
    await prisma.$executeRaw`
      DELETE FROM roles WHERE verb_id = ${entry.id}
    `;

    // Insert new roles and store mapping from temp IDs to real IDs
    const roleIdMapping = new Map<string, bigint>();
    for (let i = 0; i < roles.length; i++) {
      const role = roles[i];
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

        const result = await prisma.$queryRaw<Array<{ id: bigint }>>`
          INSERT INTO roles (
            verb_id, role_type_id, main, description, example_sentence, instantiation_type_ids, created_at, updated_at
          ) VALUES (
            ${entry.id}, ${roleType.id}, ${roleData.main}, ${roleData.description}, ${roleData.exampleSentence || null}, ARRAY[]::bigint[], now(), now()
          )
          RETURNING id
        `;
        
        if (result.length > 0) {
          // Map temp ID (or old ID) to new real ID
          const tempId = roleData.id || `temp-${i}`;
          roleIdMapping.set(tempId, result[0].id);
        }
      }
    }
    
    // Store the mapping for role groups to use
    (updateEntryRoles as { lastRoleIdMapping?: Map<string, bigint> }).lastRoleIdMapping = roleIdMapping;
  }
}

async function updateEntryRoleGroups(entryId: string, roleGroups?: unknown[]) {
  // First get the numeric ID from the code
  const entry = await prisma.verbs.findUnique({
    where: { code: entryId } as unknown as Prisma.verbsWhereUniqueInput,
    select: { id: true }
  });
  
  if (!entry) {
    console.warn(`Entry with code "${entryId}" not found. Skipping role group update.`);
    return;
  }

  // Delete existing role groups for this entry
  await prisma.$executeRaw`
    DELETE FROM role_groups WHERE verb_id = ${entry.id}
  `;

  if (!roleGroups || roleGroups.length === 0) {
    return;
  }

  // Get the role ID mapping from updateEntryRoles
  const roleIdMapping = (updateEntryRoles as { lastRoleIdMapping?: Map<string, bigint> }).lastRoleIdMapping || new Map();

  // Insert new role groups
  for (const group of roleGroups) {
    const groupData = group as { id: string; description: string; role_ids: string[] };
    
    // Skip groups with less than 2 roles
    if (groupData.role_ids.length < 2) {
      continue;
    }

    // Create the role group
    const result = await prisma.$queryRaw<Array<{ id: bigint }>>`
      INSERT INTO role_groups (
        verb_id, description, require_at_least_one, created_at, updated_at
      ) VALUES (
        ${entry.id}, ${groupData.description || null}, true, now(), now()
      )
      RETURNING id
    `;

    if (result.length > 0) {
      const roleGroupId = result[0].id;

      // Get the real role IDs for this entry
      const existingRoles = await prisma.$queryRaw<Array<{ id: bigint }>>`
        SELECT id FROM roles WHERE verb_id = ${entry.id}
      `;
      const existingRoleIds = existingRoles.map(r => r.id);

      // Insert role group members, mapping temp IDs to real IDs
      for (const tempRoleId of groupData.role_ids) {
        // Try to find the real role ID from the mapping
        let realRoleId = roleIdMapping.get(tempRoleId);
        
        // If not found in mapping and it's already a bigint-like string, use it directly
        if (!realRoleId && tempRoleId.match(/^\d+$/)) {
          realRoleId = BigInt(tempRoleId);
        }
        
        // Only add if the role exists
        if (realRoleId && existingRoleIds.some(id => id === realRoleId)) {
          await prisma.$executeRaw`
            INSERT INTO role_group_members (
              role_group_id, role_id, created_at
            ) VALUES (
              ${roleGroupId}, ${realRoleId}, now()
            )
          `;
        }
      }
    }
  }
  
  // Clear the mapping after use
  delete (updateEntryRoles as { lastRoleIdMapping?: Map<string, bigint> }).lastRoleIdMapping;
}

// Internal implementation without caching
async function getGraphNodeInternal(entryId: string): Promise<GraphNode | null> {
  // Use a more efficient query that only fetches what we need
  const entry = await withRetry(
    () => prisma.verbs.findUnique({
      where: { code: entryId } as unknown as Prisma.verbsWhereUniqueInput, // Query by code (human-readable ID)
      include: {
        frames: {
          select: {
            id: true,
            code: true, // Add code field for human-readable IDs
            framebank_id: true,
            frame_name: true,
            definition: true,
            short_definition: true,
            is_supporting_frame: true,
          } as Prisma.framesSelect
        },
        verb_relations_verb_relations_source_idToverbs: {
          where: {
            type: {
              in: ['hypernym', 'entails', 'causes', 'also_see']
            }
          },
          include: {
            verbs_verb_relations_target_idToverbs: {
              select: {
                id: true,
                code: true, // Add code field for human-readable IDs
                legacy_id: true,
                lemmas: true,
                src_lemmas: true,
                gloss: true,
                lexfile: true,
                examples: true,
                frame_id: true,
                vendler_class: true,
                forbidden: true,
                forbidden_reason: true,
                flagged: true,
                flagged_reason: true,
              } as Prisma.verbsSelect
            }
          }
        },
        verb_relations_verb_relations_target_idToverbs: {
          where: {
            type: 'hypernym' // Only need hypernyms for children
          },
          include: {
            verbs_verb_relations_source_idToverbs: {
              select: {
                id: true,
                code: true, // Add code field for human-readable IDs
                legacy_id: true,
                lemmas: true,
                src_lemmas: true,
                gloss: true,
                lexfile: true,
                examples: true,
                frame_id: true,
                vendler_class: true,
                forbidden: true,
                forbidden_reason: true,
                flagged: true,
                flagged_reason: true,
              } as Prisma.verbsSelect
            }
          }
        }
      }
    }),
    undefined,
    `getGraphNodeInternal(${entryId})`
  ) as unknown as PrismaEntryWithRelations | null;

  if (!entry) return null;

  // First get the numeric ID from the entry
  const numericId = entry ? (entry as unknown as { id?: bigint }).id : null;
  if (!numericId) return null;

  // Fetch roles separately to avoid type issues
  const rolesData = await withRetry(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (prisma as any).roles.findMany({
      where: { verb_id: numericId },
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
    id: bigint;
    description: string | null;
    example_sentence: string | null;
    instantiation_type_ids: bigint[]; // Changed to bigint[]
    main: boolean;
    role_types: {
      id: bigint;
      label: string;
      generic_description: string;
      explanation: string | null;
    };
  }>;

  // Fetch role_groups with their members
  const roleGroupsData = await withRetry(
    () => prisma.$queryRaw<Array<{
      id: bigint;
      description: string | null;
      require_at_least_one: boolean;
      role_id: bigint;
    }>>`
      SELECT 
        rg.id,
        rg.description,
        rg.require_at_least_one,
        rgm.role_id
      FROM role_groups rg
      LEFT JOIN role_group_members rgm ON rg.id = rgm.role_group_id
      WHERE rg.verb_id = ${numericId}
      ORDER BY rg.id, rgm.role_id
    `,
    undefined,
    `getRoleGroups(${entryId})`
  );

  // Get parents (hypernyms) - these are broader concepts
  const parents: GraphNode[] = entry.verb_relations_verb_relations_source_idToverbs
    .filter(rel => rel.type === 'hypernym' && rel.verbs_verb_relations_target_idToverbs)
    .map(rel => {
      const target = rel.verbs_verb_relations_target_idToverbs as { id: bigint | string; code?: string };
      return {
      id: target.code || (typeof target.id === 'bigint' ? target.id.toString() : target.id), // Use code or convert BigInt
      legacy_id: rel.verbs_verb_relations_target_idToverbs!.legacy_id,
      lemmas: rel.verbs_verb_relations_target_idToverbs!.lemmas,
      src_lemmas: rel.verbs_verb_relations_target_idToverbs!.src_lemmas,
      gloss: rel.verbs_verb_relations_target_idToverbs!.gloss,
      legal_constraints: [],
      pos: 'v',
      lexfile: rel.verbs_verb_relations_target_idToverbs!.lexfile,
      examples: rel.verbs_verb_relations_target_idToverbs!.examples,
      flagged: (rel.verbs_verb_relations_target_idToverbs as { flagged?: boolean | null }).flagged ?? undefined,
      flaggedReason: (rel.verbs_verb_relations_target_idToverbs as { flagged_reason?: string | null }).flagged_reason || undefined,
      forbidden: (rel.verbs_verb_relations_target_idToverbs as { forbidden?: boolean | null }).forbidden ?? undefined,
      forbiddenReason: (rel.verbs_verb_relations_target_idToverbs as { forbidden_reason?: string | null }).forbidden_reason || undefined,
      frame_id: (rel.verbs_verb_relations_target_idToverbs as { frame_id?: bigint | null }).frame_id?.toString() ?? null,
      vendler_class: (rel.verbs_verb_relations_target_idToverbs as { vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null }).vendler_class ?? null,
      parents: [],
      children: [],
      entails: [],
      causes: [],
      alsoSee: [],
    }});

  // Get children (hyponyms) - these are more specific concepts
  const children: GraphNode[] = entry.verb_relations_verb_relations_target_idToverbs
    .filter(rel => rel.type === 'hypernym' && rel.verbs_verb_relations_source_idToverbs)
    .map(rel => {
      const source = rel.verbs_verb_relations_source_idToverbs as { id: bigint | string; code?: string };
      return {
        id: source.code || (typeof source.id === 'bigint' ? source.id.toString() : source.id), // Use code or convert BigInt
        legacy_id: rel.verbs_verb_relations_source_idToverbs!.legacy_id,
        lemmas: rel.verbs_verb_relations_source_idToverbs!.lemmas,
        src_lemmas: rel.verbs_verb_relations_source_idToverbs!.src_lemmas,
        gloss: rel.verbs_verb_relations_source_idToverbs!.gloss,
        legal_constraints: [],
        pos: 'v',
        lexfile: rel.verbs_verb_relations_source_idToverbs!.lexfile,
        examples: rel.verbs_verb_relations_source_idToverbs!.examples,
        flagged: (rel.verbs_verb_relations_source_idToverbs as { flagged?: boolean | null }).flagged ?? undefined,
        flaggedReason: (rel.verbs_verb_relations_source_idToverbs as { flagged_reason?: string | null }).flagged_reason || undefined,
        forbidden: (rel.verbs_verb_relations_source_idToverbs as { forbidden?: boolean | null }).forbidden ?? undefined,
        forbiddenReason: (rel.verbs_verb_relations_source_idToverbs as { forbidden_reason?: string | null }).forbidden_reason || undefined,
        frame_id: (rel.verbs_verb_relations_source_idToverbs as { frame_id?: bigint | null }).frame_id?.toString() ?? null,
        vendler_class: (rel.verbs_verb_relations_source_idToverbs as { vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null }).vendler_class ?? null,
        parents: [],
        children: [],
        entails: [],
        causes: [],
        alsoSee: [],
    }});

  // Get entails relationships
  const entails: GraphNode[] = entry.verb_relations_verb_relations_source_idToverbs
    .filter(rel => rel.type === 'entails' && rel.verbs_verb_relations_target_idToverbs)
    .map(rel => {
      const target = rel.verbs_verb_relations_target_idToverbs as { id: bigint | string; code?: string };
      return {
      id: target.code || (typeof target.id === 'bigint' ? target.id.toString() : target.id), // Use code or convert BigInt
      legacy_id: rel.verbs_verb_relations_target_idToverbs!.legacy_id,
      lemmas: rel.verbs_verb_relations_target_idToverbs!.lemmas,
      src_lemmas: rel.verbs_verb_relations_target_idToverbs!.src_lemmas,
      gloss: rel.verbs_verb_relations_target_idToverbs!.gloss,
      legal_constraints: [],
      pos: 'v',
      lexfile: rel.verbs_verb_relations_target_idToverbs!.lexfile,
      examples: rel.verbs_verb_relations_target_idToverbs!.examples,
      flagged: (rel.verbs_verb_relations_target_idToverbs as { flagged?: boolean | null }).flagged ?? undefined,
      flaggedReason: (rel.verbs_verb_relations_target_idToverbs as { flagged_reason?: string | null }).flagged_reason || undefined,
      forbidden: (rel.verbs_verb_relations_target_idToverbs as { forbidden?: boolean | null }).forbidden ?? undefined,
      forbiddenReason: (rel.verbs_verb_relations_target_idToverbs as { forbidden_reason?: string | null }).forbidden_reason || undefined,
      frame_id: (rel.verbs_verb_relations_target_idToverbs as { frame_id?: bigint | null }).frame_id?.toString() ?? null,
      vendler_class: (rel.verbs_verb_relations_target_idToverbs as { vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null }).vendler_class ?? null,
      parents: [],
      children: [],
      entails: [],
      causes: [],
      alsoSee: [],
    }});

  // Get causes relationships
  const causes: GraphNode[] = entry.verb_relations_verb_relations_source_idToverbs
    .filter(rel => rel.type === 'causes' && rel.verbs_verb_relations_target_idToverbs)
    .map(rel => {
      const target = rel.verbs_verb_relations_target_idToverbs as { id: bigint | string; code?: string };
      return {
      id: target.code || (typeof target.id === 'bigint' ? target.id.toString() : target.id), // Use code or convert BigInt
      legacy_id: rel.verbs_verb_relations_target_idToverbs!.legacy_id,
      lemmas: rel.verbs_verb_relations_target_idToverbs!.lemmas,
      src_lemmas: rel.verbs_verb_relations_target_idToverbs!.src_lemmas,
      gloss: rel.verbs_verb_relations_target_idToverbs!.gloss,
      legal_constraints: [],
      pos: 'v',
      lexfile: rel.verbs_verb_relations_target_idToverbs!.lexfile,
      examples: rel.verbs_verb_relations_target_idToverbs!.examples,
      flagged: (rel.verbs_verb_relations_target_idToverbs as { flagged?: boolean | null }).flagged ?? undefined,
      flaggedReason: (rel.verbs_verb_relations_target_idToverbs as { flagged_reason?: string | null }).flagged_reason || undefined,
      forbidden: (rel.verbs_verb_relations_target_idToverbs as { forbidden?: boolean | null }).forbidden ?? undefined,
      forbiddenReason: (rel.verbs_verb_relations_target_idToverbs as { forbidden_reason?: string | null }).forbidden_reason || undefined,
      frame_id: (rel.verbs_verb_relations_target_idToverbs as { frame_id?: bigint | null }).frame_id?.toString() ?? null,
      vendler_class: (rel.verbs_verb_relations_target_idToverbs as { vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null }).vendler_class ?? null,
      parents: [],
      children: [],
      entails: [],
      causes: [],
      alsoSee: [],
    }});

  // Get also_see relationships
  const alsoSee: GraphNode[] = entry.verb_relations_verb_relations_source_idToverbs
    .filter(rel => rel.type === 'also_see' && rel.verbs_verb_relations_target_idToverbs)
    .map(rel => {
      const target = rel.verbs_verb_relations_target_idToverbs as { id: bigint | string; code?: string };
      return {
      id: target.code || (typeof target.id === 'bigint' ? target.id.toString() : target.id), // Use code or convert BigInt
      legacy_id: rel.verbs_verb_relations_target_idToverbs!.legacy_id,
      lemmas: rel.verbs_verb_relations_target_idToverbs!.lemmas,
      src_lemmas: rel.verbs_verb_relations_target_idToverbs!.src_lemmas,
      gloss: rel.verbs_verb_relations_target_idToverbs!.gloss,
      legal_constraints: [],
      pos: 'v',
      lexfile: rel.verbs_verb_relations_target_idToverbs!.lexfile,
      examples: rel.verbs_verb_relations_target_idToverbs!.examples,
      flagged: (rel.verbs_verb_relations_target_idToverbs as { flagged?: boolean | null }).flagged ?? undefined,
      flaggedReason: (rel.verbs_verb_relations_target_idToverbs as { flagged_reason?: string | null }).flagged_reason || undefined,
      forbidden: (rel.verbs_verb_relations_target_idToverbs as { forbidden?: boolean | null }).forbidden ?? undefined,
      forbiddenReason: (rel.verbs_verb_relations_target_idToverbs as { forbidden_reason?: string | null }).forbidden_reason || undefined,
      frame_id: (rel.verbs_verb_relations_target_idToverbs as { frame_id?: bigint | null }).frame_id?.toString() ?? null,
      vendler_class: (rel.verbs_verb_relations_target_idToverbs as { vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null }).vendler_class ?? null,
      parents: [],
      children: [],
      entails: [],
      causes: [],
      alsoSee: [],
    }});

  // Map roles data to the expected format
  const roles = rolesData.map(role => ({
    id: role.id.toString(),
    description: role.description ?? undefined,
    example_sentence: role.example_sentence ?? undefined,
    instantiation_type_ids: role.instantiation_type_ids.map(id => Number(id)), // Convert BigInt[] to number[]
    main: role.main,
    role_type: {
      id: role.role_types.id.toString(),
      label: role.role_types.label,
      generic_description: role.role_types.generic_description,
      explanation: role.role_types.explanation ?? undefined,
    },
  }));

  // Process role_groups data into the expected format
  const roleGroupsMap = new Map<string, { description: string | null; require_at_least_one: boolean; role_ids: string[] }>();
  for (const row of roleGroupsData) {
    const groupId = row.id.toString();
    if (!roleGroupsMap.has(groupId)) {
      roleGroupsMap.set(groupId, {
        description: row.description,
        require_at_least_one: row.require_at_least_one,
        role_ids: [],
      });
    }
    if (row.role_id) {
      roleGroupsMap.get(groupId)!.role_ids.push(row.role_id.toString());
    }
  }
  const role_groups = Array.from(roleGroupsMap.entries()).map(([id, data]) => ({
    id,
    description: data.description,
    require_at_least_one: data.require_at_least_one,
    role_ids: data.role_ids,
  }));

  const entryTyped = entry as { id: bigint | string; code?: string; frame_id?: bigint | null };
  const entryCode = entryTyped.code || (typeof entryTyped.id === 'bigint' ? entryTyped.id.toString() : entryTyped.id);
  
  // Debug logging for say.v.04
  if (entryCode === 'say.v.04') {
    console.log(`DEBUG say.v.04 role_groups:`, JSON.stringify(role_groups, null, 2));
    console.log(`DEBUG say.v.04 roles:`, roles.map(r => ({ id: r.id, label: r.role_type.label })));
  }
  const frameData = (entry as { frames?: { id: bigint; code?: string; framebank_id: string; frame_name: string; definition: string; short_definition: string; is_supporting_frame: boolean } | null }).frames;
  
  // Debug logging for frame mismatch
  if (entryCode === 'say.v.04') {
    console.log(`DEBUG getGraphNode say.v.04: frame_id=${entryTyped.frame_id?.toString()}, frame_name=${frameData?.frame_name}, frame_code=${frameData?.code}`);
  }
  
  return {
    id: entryCode,
    legacy_id: entry.legacy_id,
    lemmas: entry.lemmas,
    src_lemmas: entry.src_lemmas,
    gloss: entry.gloss,
    legal_gloss: (entry as { legal_gloss?: string | null }).legal_gloss ?? null,
    legal_constraints: (entry as { legal_constraints?: string[] }).legal_constraints ?? [],
    pos: 'v',
    lexfile: entry.lexfile,
    examples: entry.examples,
    flagged: entry.flagged ?? undefined,
    flaggedReason: (entry as PrismaEntryWithOptionalFields).flaggedReason || undefined,
    forbidden: entry.forbidden ?? undefined,
    forbiddenReason: (entry as PrismaEntryWithOptionalFields).forbiddenReason || undefined,
    frame_id: entryTyped.frame_id?.toString() ?? null,
    vendler_class: (entry as { vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null }).vendler_class ?? null,
    frame: frameData 
      ? {
          id: (frameData.code || frameData.id.toString()),
          framebank_id: frameData.framebank_id,
          frame_name: frameData.frame_name,
          definition: frameData.definition,
          short_definition: frameData.short_definition,
          is_supporting_frame: frameData.is_supporting_frame,
        }
      : null,
    roles,
    role_groups,
    parents,
    children,
    entails,
    causes,
    alsoSee,
  };
}

// Cached wrapper for getGraphNode
export const getGraphNode = process.env.DISABLE_CACHE === 'true'
  ? getGraphNodeInternal
  : unstable_cache(
      async (entryId: string) => getGraphNodeInternal(entryId),
      ['graph-node'],
      {
        revalidate: 60, // Cache for 1 minute instead of 1 hour
        tags: ['graph-node'],
      }
    );

// Export uncached version for when we need fresh data
export const getGraphNodeUncached = getGraphNodeInternal;

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
      code: string;
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
          e.code,
          e.legacy_id,
          e.gloss,
          'v' as pos,
          e.lexfile,
          e.lemmas,
          e.src_lemmas,
          e.examples,
          0 as depth
        FROM verbs e
        WHERE e.code = ${entryId}
        
        UNION ALL
        
        -- Recursive case: find parent (hypernym)
        -- If there are multiple parents, pick the first one alphabetically
        SELECT 
          e.id,
          e.code,
          e.legacy_id,
          e.gloss,
          'v' as pos,
          e.lexfile,
          e.lemmas,
          e.src_lemmas,
          e.examples,
          ap.depth + 1 as depth
        FROM ancestor_path ap
        INNER JOIN LATERAL (
          SELECT e.*
          FROM verb_relations r
          INNER JOIN verbs e ON r.target_id = e.id
          WHERE r.source_id = ap.id AND r.type = 'hypernym'
          ORDER BY e.code
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
    id: result.code, // Use code as the id for display
    legacy_id: result.legacy_id,
    lemmas: result.lemmas,
    src_lemmas: result.src_lemmas,
    gloss: result.gloss,
    legal_constraints: [],
    pos: 'v',
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
export const getAncestorPath = process.env.DISABLE_CACHE === 'true'
  ? getAncestorPathInternal
  : unstable_cache(
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
  const result = await prisma.verbs.updateMany({
    where: {
      code: {
        in: ids // ids are now codes (human-readable IDs)
      }
    } as Prisma.verbsWhereInput,
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
    const frameCodes = frame_id.split(',').map(id => id.trim()).filter(Boolean);
    if (frameCodes.length > 0) {
      // Convert frame codes to frame IDs
      // Use OR conditions to match by code case-insensitively or by frame_name
      const frames = await prisma.frames.findMany({
        where: {
          OR: frameCodes.map(code => ({
            code: {
              equals: code,
              mode: 'insensitive'
            }
          })) as Prisma.framesWhereInput[]
        },
        select: {
          id: true,
          code: true
        } as Prisma.framesSelect
      });
      
      console.log(`Frame filter: input codes=${frameCodes.join(',')}, found frames:`, frames.map(f => ({ id: f.id.toString(), code: (f as { code?: string }).code })));
      
      const frameIdBigInts = frames.map(f => f.id);
      
      if (frameIdBigInts.length > 0) {
        andConditions.push({
          frame_id: {
            in: frameIdBigInts
          }
        });
      }
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
    () => prisma.verbs.count({
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
    () => prisma.verbs.findMany({
    where: whereClause,
    skip,
    take: limit,
    orderBy,
    include: {
      _count: {
        select: {
          verb_relations_verb_relations_source_idToverbs: {
            where: { type: 'hypernym' }
          },
          verb_relations_verb_relations_target_idToverbs: {
            where: { type: 'hypernym' }
          }
        }
      },
      frames: {
        select: {
          id: true,
          code: true,
          frame_name: true,
        } as Prisma.framesSelect
      },
      // roles omitted for performance and Prisma include typing stability
    }
  }),
    undefined,
    'getPaginatedEntries:findMany'
  ) as unknown as PrismaEntryWithCounts[];

  // Get all entry IDs for bulk fetching roles and role_groups
  const entryIds = entries.map(e => {
    const entry = e as unknown as { id?: bigint };
    return entry.id;
  }).filter(Boolean) as bigint[];

  // Fetch all roles for these entries in bulk
  const rolesData = entryIds.length > 0 ? await withRetry(
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
    'getPaginatedEntries:roles'
  ) : [];

  // Fetch all role_groups for these entries in bulk
  const roleGroupsData = entryIds.length > 0 ? await withRetry(
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
    'getPaginatedEntries:roleGroups'
  ) : [];

  // Group roles by entry ID
  const rolesByEntryId = new Map<string, Array<{
    id: string;
    description?: string;
    example_sentence?: string;
    instantiation_type_ids: number[];
    main: boolean;
    role_type: {
      id: string;
      label: string;
      generic_description: string;
      explanation?: string;
    };
  }>>();
  
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
  const roleGroupsByEntryId = new Map<string, Array<{
    id: string;
    description: string | null;
    require_at_least_one: boolean;
    role_ids: string[];
  }>>();
  
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

  // Transform to TableEntry format
  let data: TableEntry[] = entries.map(entry => {
    const entryCode = (entry as { code?: string }).code || entry.id;
    const frameData = (entry as { frames?: { frame_name: string; code: string } | null; frame_id?: bigint | null }).frames;
    const frameId = (entry as { frame_id?: bigint | null }).frame_id;
    
  // Debug logging for frame mismatch
  if (entryCode === 'say.v.04') {
    const framesArray = (entry as { frames?: string[] }).frames;
    console.log(`DEBUG say.v.04: frame_id=${frameId?.toString()}, frame_name=${frameData?.frame_name}, frame_code=${frameData?.code}, frames_array=${JSON.stringify(framesArray)}`);
  }
    
    const numericId = (entry as unknown as { id?: bigint }).id?.toString() || '';
    
    return {
      id: entryCode,
      legacy_id: entry.legacy_id,
      lemmas: entry.lemmas,
      src_lemmas: entry.src_lemmas,
      gloss: entry.gloss,
      pos: 'v',
      lexfile: entry.lexfile,
      isMwe: entry.isMwe,
      transitive: entry.transitive || undefined,
      particles: entry.particles,
      examples: entry.examples,
      flagged: (entry as PrismaEntryWithOptionalFields).flagged ?? undefined,
      flaggedReason: (entry as PrismaEntryWithOptionalFields).flaggedReason || undefined,
      forbidden: (entry as PrismaEntryWithOptionalFields).forbidden ?? undefined,
      forbiddenReason: (entry as PrismaEntryWithOptionalFields).forbiddenReason || undefined,
      frame_id: frameId ? frameId.toString() : null,
      frame: (entry as { frames?: { frame_name: string } } | undefined)?.frames?.frame_name || null,
      vendler_class: entry.vendler_class ?? null,
      legal_constraints: entry.legal_constraints || [],
      roles: rolesByEntryId.get(numericId) || [],
      role_groups: roleGroupsByEntryId.get(numericId) || [],
      parentsCount: entry._count.verb_relations_verb_relations_source_idToverbs,
      childrenCount: entry._count.verb_relations_verb_relations_target_idToverbs,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    };
  });

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