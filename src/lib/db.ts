import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from './prisma';
import { withRetry } from './db-utils'; 
import { RelationType, type LexicalType, type Verb, type VerbWithRelations, type VerbRelation, type GraphNode, type SearchResult, type PaginationParams, type PaginatedResult, type TableEntry, type EntryRecipes, type Recipe, type RecipePredicateNode, type RecipePredicateRoleMapping, type LogicNode, type LogicNodeKind, type Frame, type FramePaginationParams } from './types';
import type { verbs as PrismaVerb, verb_relations as PrismaVerbRelation } from '@prisma/client';
import { Prisma } from '@prisma/client';

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
  id: string | bigint;
  legacy_id: string;
  code: string;
  gloss: string;
  legal_gloss: string | null;
  pos: string;
  lexfile: string;
  lemmas: string[];
  src_lemmas: string[];
  examples: string[];
  created_at: Date;
  updated_at: Date;
  flagged: boolean | null;
  flagged_reason: string | null;
  forbidden: boolean | null;
  forbidden_reason: string | null;
  frame_id: bigint | null;
  vendler_class: 'state' | 'activity' | 'accomplishment' | 'achievement' | null;
  verb_relations_verb_relations_source_idToverbs: (PrismaVerbRelation & {
    verbs_verb_relations_target_idToverbs: PrismaVerb | null;
  })[];
  verb_relations_verb_relations_target_idToverbs: (PrismaVerbRelation & {
    verbs_verb_relations_source_idToverbs: PrismaVerb | null;
  })[];
};

// Type for Prisma entry with counts
type PrismaEntryWithCounts = {
  id: string | bigint;
  code: string;
  legacy_id: string;
  gloss: string;
  legal_gloss: string | null;
  pos: string;
  lexfile: string;
  isMwe: boolean;
  lemmas: string[];
  src_lemmas: string[];
  examples: string[];
  createdAt: Date;
  updatedAt: Date;
  flagged: boolean | null;
  flaggedReason: string | null;
  forbidden: boolean | null;
  forbiddenReason: string | null;
  frame_id: bigint | null;
  frames: { id: bigint; code: string; frame_name: string } | null;
  vendler_class: 'state' | 'activity' | 'accomplishment' | 'achievement' | null;
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
    () => prisma.verbs.findFirst({
      where: { 
        code: id,
        deleted: { not: true }
      } as Prisma.verbsWhereInput, // Query by code (human-readable ID)
      include: {
        verb_relations_verb_relations_source_idToverbs: {
          include: {
            verbs_verb_relations_target_idToverbs: true
          },
        },
        verb_relations_verb_relations_target_idToverbs: {
          include: {
            verbs_verb_relations_source_idToverbs: true
          },
        },
      },
    }),
    undefined,
    `getEntryById(${id})`
  ) as unknown as PrismaEntryWithRelations | null;

  if (!entry) return null;

  // Convert Prisma types to our types
  const { verb_relations_verb_relations_source_idToverbs, verb_relations_verb_relations_target_idToverbs, ...rest } = entry;
  
  return {
    ...rest,
    id: entry.code || entry.id.toString(), // Use code as id
    legacy_id: entry.legacy_id,
    gloss: entry.gloss,
    pos: 'v',
    lexfile: entry.lexfile,
    lemmas: entry.lemmas,
    src_lemmas: entry.src_lemmas,
    examples: entry.examples,
    frame_id: entry.frame_id?.toString() ?? null,
    flagged: entry.flagged ?? undefined,
    flaggedReason: (entry as any).flagged_reason || undefined,
    forbidden: entry.forbidden ?? undefined,
    forbiddenReason: (entry as any).forbidden_reason || undefined,
    vendler_class: entry.vendler_class || undefined,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
    sourceRelations: verb_relations_verb_relations_source_idToverbs
      .filter(rel => rel.verbs_verb_relations_target_idToverbs && !rel.verbs_verb_relations_target_idToverbs.deleted)
      .map(rel => ({
        sourceId: rel.source_id.toString(),
        targetId: rel.target_id.toString(),
        type: rel.type as RelationType,
        target: rel.verbs_verb_relations_target_idToverbs ? {
          ...rel.verbs_verb_relations_target_idToverbs,
          id: (rel.verbs_verb_relations_target_idToverbs as { code?: string }).code || rel.verbs_verb_relations_target_idToverbs.id.toString(),
          frame_id: (rel.verbs_verb_relations_target_idToverbs as { frame_id?: bigint | null }).frame_id?.toString() ?? null,
          flagged: rel.verbs_verb_relations_target_idToverbs.flagged ?? undefined,
          flaggedReason: (rel.verbs_verb_relations_target_idToverbs as any).flagged_reason || undefined,
          forbidden: rel.verbs_verb_relations_target_idToverbs.forbidden ?? undefined,
          forbiddenReason: (rel.verbs_verb_relations_target_idToverbs as any).forbidden_reason || undefined
        } as unknown as Verb : undefined,
      })),
    targetRelations: verb_relations_verb_relations_target_idToverbs
      .filter(rel => rel.verbs_verb_relations_source_idToverbs && !rel.verbs_verb_relations_source_idToverbs.deleted)
      .map(rel => ({
        sourceId: rel.source_id.toString(),
        targetId: rel.target_id.toString(),
        type: rel.type as RelationType,
        source: rel.verbs_verb_relations_source_idToverbs ? {
          ...rel.verbs_verb_relations_source_idToverbs,
          id: (rel.verbs_verb_relations_source_idToverbs as { code?: string }).code || rel.verbs_verb_relations_source_idToverbs.id.toString(),
          frame_id: (rel.verbs_verb_relations_source_idToverbs as { frame_id?: bigint | null }).frame_id?.toString() ?? null,
          flagged: rel.verbs_verb_relations_source_idToverbs.flagged ?? undefined,
          flaggedReason: (rel.verbs_verb_relations_source_idToverbs as any).flagged_reason || undefined,
          forbidden: rel.verbs_verb_relations_source_idToverbs.forbidden ?? undefined,
          forbiddenReason: (rel.verbs_verb_relations_source_idToverbs as any).forbidden_reason || undefined
        } as unknown as Verb : undefined,
      })),
  };
}

export async function searchEntries(query: string, limit = 20, table: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' = 'verbs'): Promise<SearchResult[]> {
  // Map table to POS character
  const posMap = { verbs: 'v', nouns: 'n', adjectives: 'a', adverbs: 'r' };
  const pos = posMap[table];
  
  // Only verbs table has deleted column
  const hasDeletedColumn = table === 'verbs';
  
  // If query contains a dot, only search IDs
  const containsDot = query.includes('.');
  
  if (containsDot) {
    // Only search ID fields when dot is present
    // Use Prisma.sql for safe table name injection
    const results = await withRetry(
      () => prisma.$queryRaw<SearchResult[]>`
      SELECT 
        code as id,
        legacy_id,
        lemmas,
        src_lemmas,
        gloss,
        ${Prisma.raw(`'${pos}'`)} as pos,
        CASE 
          WHEN code ILIKE ${query} THEN 1000
          WHEN code ILIKE ${query + '%'} THEN 500
          WHEN legacy_id ILIKE ${query + '%'} THEN 400
          ELSE 0
        END as rank
      FROM ${Prisma.raw(table)}
      WHERE 
        (code ILIKE ${query + '%'} OR
        legacy_id ILIKE ${query + '%'})
        ${hasDeletedColumn ? Prisma.sql`AND (deleted = false OR deleted IS NULL)` : Prisma.empty}
      ORDER BY rank DESC, code
      LIMIT ${limit}
    `,
      undefined,
      `searchEntries(${query}, ${table})`
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
      ${Prisma.raw(`'${pos}'`)} as pos,
      (
        ${table === 'verbs' ? Prisma.sql`0` : Prisma.sql`
          COALESCE(ts_rank(gloss_tsv, websearch_to_tsquery('english', ${query})), 0) +
          COALESCE(ts_rank(examples_tsv, websearch_to_tsquery('english', ${query})), 0)
        `} +
        CASE 
          WHEN ${query} = ANY(lemmas) OR ${query} = ANY(src_lemmas) THEN 2
          ELSE 0
        END +
        CASE 
          WHEN EXISTS (SELECT 1 FROM unnest(lemmas) AS l WHERE l ILIKE ${query + '%'}) 
            OR EXISTS (SELECT 1 FROM unnest(src_lemmas) AS l2 WHERE l2 ILIKE ${query + '%'}) 
          THEN 1
          ELSE 0
        END +
        CASE 
          WHEN gloss ILIKE ${'%' + query + '%'} THEN 0.5
          ELSE 0
        END
      ) as rank
    FROM ${Prisma.raw(table)}
    WHERE 
      (
      ${table === 'verbs' ? Prisma.empty : Prisma.sql`
        gloss_tsv @@ websearch_to_tsquery('english', ${query}) OR
        examples_tsv @@ websearch_to_tsquery('english', ${query}) OR
      `}
      -- Exact lemma matches
      ${query} = ANY(lemmas) OR
      ${query} = ANY(src_lemmas) OR
      -- Prefix lemma matches
      EXISTS (SELECT 1 FROM unnest(lemmas) AS l WHERE l ILIKE ${query + '%'}) OR
      EXISTS (SELECT 1 FROM unnest(src_lemmas) AS l2 WHERE l2 ILIKE ${query + '%'}) OR
      -- Fallback substring match on gloss for phrases that FTS might miss
      gloss ILIKE ${'%' + query + '%'}
      )
      ${hasDeletedColumn ? Prisma.sql`AND (deleted = false OR deleted IS NULL)` : Prisma.empty}
    ORDER BY rank DESC, code
    LIMIT ${limit}
  `,
    undefined,
    `searchEntries(${query}, ${table})`
  );

  return results;
}

// Recipes for an entry (predicates and their relations)
export async function getRecipesForEntryInternal(entryId: string): Promise<EntryRecipes> {
  // First get the numeric ID from the code
  const entry = await withRetry(
    () => prisma.verbs.findFirst({
      where: { 
        code: entryId,
        deleted: { not: true }
      } as Prisma.verbsWhereInput,
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
    () => prisma.$queryRaw<Array<{ id: bigint; label: string | null; description: string | null; is_default: boolean; example: string | null; logic_root_node_id: bigint | null }>>`
      SELECT id, label, description, is_default, example, logic_root_node_id
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
      lex_concrete: boolean | null;
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
        le."forbidden_reason" as lex_forbidden_reason,
        le.concrete as lex_concrete
      FROM recipe_predicates rp
      JOIN verbs le ON le.id = rp.predicate_verb_id
      WHERE rp.recipe_id = ANY(${recipeIds}::bigint[])
        AND (le.deleted = false OR le.deleted IS NULL)
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
      variable_key: string | null;
      constant: unknown;
      discovered: boolean | null;
      noun_code: string | null;
    }>>`
      SELECT
        rprb.recipe_predicate_id,
        rprb.bind_kind,
        prt.label as predicate_role_label,
        lrt.label as entry_role_label,
        pvt.label as variable_type_label,
        rv.key as variable_key,
        rprb.constant,
        rprb.discovered,
        n.code as noun_code
      FROM recipe_predicate_role_bindings rprb
      LEFT JOIN roles pr ON pr.id = rprb.predicate_role_id
      LEFT JOIN role_types prt ON prt.id = pr.role_type_id
      LEFT JOIN roles lr ON lr.id = rprb.verb_role_id
      LEFT JOIN role_types lrt ON lrt.id = lr.role_type_id
      LEFT JOIN predicate_variable_types pvt ON pvt.id = rprb.predicate_variable_type_id
      LEFT JOIN recipe_variables rv ON rv.id = rprb.variable_id
      LEFT JOIN nouns n ON n.id = rv.noun_id
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
      target_role_label: string | null;
      target_recipe_predicate_id: bigint | null;
      condition_params: unknown;
      description: string | null;
      error_message: string | null;
    }>>`
      SELECT 
        rp.id, 
        rp.recipe_id, 
        rp.condition_type, 
        rp.target_role_id, 
        rt.label as target_role_label,
        rp.target_recipe_predicate_id,
        rp.condition_params, 
        rp.description, 
        rp.error_message
      FROM recipe_preconditions rp
      LEFT JOIN roles r ON r.id = rp.target_role_id
      LEFT JOIN role_types rt ON rt.id = r.role_type_id
      WHERE rp.recipe_id = ANY(${recipeIds}::bigint[])
    `,
    undefined,
    `getRecipesForEntry:preconditions(${entryId})`
  );

  // Fetch recipe variables
  const recipeVariables = await withRetry(
    () => prisma.$queryRaw<Array<{
      id: bigint;
      recipe_id: bigint;
      key: string;
      predicate_variable_type_label: string | null;
      noun_id: bigint | null;
      noun_code: string | null;
      noun_gloss: string | null;
      default_value: unknown;
    }>>`
      SELECT
        rv.id,
        rv.recipe_id,
        rv.key,
        pvt.label as predicate_variable_type_label,
        rv.noun_id,
        n.code as noun_code,
        n.gloss as noun_gloss,
        rv.default_value
      FROM recipe_variables rv
      LEFT JOIN predicate_variable_types pvt ON pvt.id = rv.predicate_variable_type_id
      LEFT JOIN nouns n ON n.id = rv.noun_id
      WHERE rv.recipe_id = ANY(${recipeIds}::bigint[])
      ORDER BY rv.key ASC
    `,
    undefined,
    `getRecipesForEntry:variables(${entryId})`
  );

  // Group data into recipe structures
  const byRecipeId: Record<string, Recipe> = {};
  for (const r of recipes) {
    byRecipeId[r.id.toString()] = {
      id: r.id.toString(),
      label: r.label,
      description: r.description,
      example: r.example,
      is_default: r.is_default,
      predicates: [],
      predicate_groups: [], // Deprecated but kept for backwards compatibility
      relations: [],
      preconditions: [],
      variables: [],
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
      const mapping: RecipePredicateRoleMapping = {
        predicateRoleLabel: m.predicate_role_label,
        bindKind: 'role',
        entryRoleLabel: m.entry_role_label,
        discovered: m.discovered ?? false,
      };
      if (m.noun_code) {
        mapping.nounCode = m.noun_code;
      }
      if (m.variable_key) {
        mapping.variableKey = m.variable_key;
      }
      array.push(mapping);
    } else if (m.variable_type_label || m.variable_key) {
      // Role-to-variable binding
      const mapping: RecipePredicateRoleMapping = {
        predicateRoleLabel: m.predicate_role_label,
        bindKind: 'variable',
        variableTypeLabel: m.variable_type_label || undefined,
        variableKey: m.variable_key || undefined,
        discovered: m.discovered ?? false,
      };
      if (m.noun_code) {
        mapping.nounCode = m.noun_code;
      }
      array.push(mapping);
    } else if (m.bind_kind === 'constant') {
      // Role-to-constant binding (includes noun constants where constant field is NULL but noun_id is set)
      const mapping: RecipePredicateRoleMapping = {
        predicateRoleLabel: m.predicate_role_label,
        bindKind: 'constant',
        discovered: m.discovered ?? false,
      };
      // Add constant value if present
      if (m.constant !== null && m.constant !== undefined) {
        mapping.constant = m.constant;
      }
      // Add noun code if present (noun constants)
      if (m.noun_code) {
        mapping.nounCode = m.noun_code;
      }
      if (m.variable_key) {
        mapping.variableKey = m.variable_key;
      }
      array.push(mapping);
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
        concrete: p.lex_concrete ?? undefined,
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
      target_role_label: pc.target_role_label || null,
      target_recipe_predicate_id: pc.target_recipe_predicate_id?.toString() || null,
      condition_params: pc.condition_params,
      description: pc.description,
      error_message: pc.error_message,
    });
  }

  // Add variables to recipes
  for (const rv of recipeVariables) {
    const recipe = byRecipeId[rv.recipe_id.toString()];
    if (!recipe) continue;
    recipe.variables.push({
      id: rv.id.toString(),
      key: rv.key,
      predicate_variable_type_label: rv.predicate_variable_type_label,
      noun_id: rv.noun_id?.toString() || null,
      noun_code: rv.noun_code,
      noun_gloss: rv.noun_gloss,
      default_value: rv.default_value,
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

    // Find the root node for this recipe
    // First try using logic_root_node_id if available, otherwise fall back to natural_key pattern
    let rootNode: { id: bigint; recipe_id: bigint; kind: string; description: string | null; natural_key: string | null } | undefined;
    
    if (r.logic_root_node_id) {
      rootNode = logicNodes.find(ln => ln.id.toString() === r.logic_root_node_id?.toString());
    }
    
    // Fallback to natural_key pattern if logic_root_node_id not found or not set
    if (!rootNode) {
      rootNode = logicNodes.find(
        ln => ln.recipe_id.toString() === r.id.toString() 
          && ln.natural_key === `root:recipe:${r.id.toString()}`
      );
    }

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

export async function updateEntry(id: string, updates: Partial<Pick<Verb, 'gloss' | 'lemmas' | 'src_lemmas' | 'examples' | 'flagged' | 'flaggedReason' | 'forbidden' | 'forbiddenReason'> & { id?: string; roles?: unknown[]; role_groups?: unknown[]; vendler_class?: string | null; lexfile?: string; frame_id?: string | null }>): Promise<VerbWithRelations | null> {
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

  // Transform camelCase to snake_case for Prisma
  const prismaUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(otherUpdates)) {
    if (key === 'id') {
      prismaUpdates.code = value; // ID is stored as 'code' in database
    } else if (key === 'flaggedReason') {
      prismaUpdates.flagged_reason = value;
    } else if (key === 'forbiddenReason') {
      prismaUpdates.forbidden_reason = value;
    } else if (key === 'src_lemmas') {
      prismaUpdates.src_lemmas = value;
    } else if (key === 'vendler_class') {
      prismaUpdates.vendler_class = value;
    } else if (key === 'frame_id') {
      // Handle frame_id: can be numeric ID
      if (value === null || value === undefined || value === '') {
        prismaUpdates.frame_id = null;
      } else if (typeof value === 'number') {
        prismaUpdates.frame_id = BigInt(value);
      } else if (typeof value === 'string' && /^\d+$/.test(value)) {
        // Numeric string - use directly
        prismaUpdates.frame_id = BigInt(value);
      } else {
        console.warn(`Invalid frame_id: ${value}, setting to null`);
        prismaUpdates.frame_id = null;
      }
    } else {
      prismaUpdates[key] = value;
    }
  }

  const updatedEntry = await withRetry(
    () => prisma.verbs.update({
    where: { 
      code: id
    } as unknown as Prisma.verbsWhereUniqueInput, // Query by code (human-readable ID)
    data: prismaUpdates,
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

  // Invalidate all caches since the entry has been updated
  revalidateAllEntryCaches();

  // Convert Prisma types to our types
  const { verb_relations_verb_relations_source_idToverbs, verb_relations_verb_relations_target_idToverbs, ...rest } = updatedEntry;
  
  return {
    ...rest,
    id: updatedEntry.code || updatedEntry.id.toString(),
    legacy_id: updatedEntry.legacy_id,
    gloss: updatedEntry.gloss,
    pos: 'v',
    lexfile: updatedEntry.lexfile,
    lemmas: updatedEntry.lemmas,
    src_lemmas: updatedEntry.src_lemmas,
    examples: updatedEntry.examples,
    frame_id: updatedEntry.frame_id?.toString() ?? null,
    flagged: updatedEntry.flagged ?? undefined,
    flaggedReason: (updatedEntry as any).flagged_reason || undefined,
    forbidden: updatedEntry.forbidden ?? undefined,
    forbiddenReason: (updatedEntry as any).forbidden_reason || undefined,
    vendler_class: updatedEntry.vendler_class || undefined,
    createdAt: updatedEntry.created_at,
    updatedAt: updatedEntry.updated_at,
    sourceRelations: verb_relations_verb_relations_source_idToverbs
      .filter(rel => rel.verbs_verb_relations_target_idToverbs && !rel.verbs_verb_relations_target_idToverbs.deleted)
      .map(rel => ({
        sourceId: rel.source_id.toString(),
        targetId: rel.target_id.toString(),
        type: rel.type as RelationType,
        target: rel.verbs_verb_relations_target_idToverbs ? {
          ...rel.verbs_verb_relations_target_idToverbs,
          id: (rel.verbs_verb_relations_target_idToverbs as { code?: string }).code || rel.verbs_verb_relations_target_idToverbs.id.toString(),
          frame_id: (rel.verbs_verb_relations_target_idToverbs as { frame_id?: bigint | null }).frame_id?.toString() ?? null,
          flagged: rel.verbs_verb_relations_target_idToverbs.flagged ?? undefined,
          flaggedReason: (rel.verbs_verb_relations_target_idToverbs as any).flagged_reason || undefined,
          forbidden: rel.verbs_verb_relations_target_idToverbs.forbidden ?? undefined,
          forbiddenReason: (rel.verbs_verb_relations_target_idToverbs as any).forbidden_reason || undefined
        } as unknown as Verb : undefined,
      } as VerbRelation)),
    targetRelations: verb_relations_verb_relations_target_idToverbs
      .filter(rel => rel.verbs_verb_relations_source_idToverbs && !rel.verbs_verb_relations_source_idToverbs.deleted)
      .map(rel => ({
        sourceId: rel.source_id.toString(),
        targetId: rel.target_id.toString(),
        type: rel.type as RelationType,
        source: rel.verbs_verb_relations_source_idToverbs ? {
          ...rel.verbs_verb_relations_source_idToverbs,
          id: (rel.verbs_verb_relations_source_idToverbs as { code?: string }).code || rel.verbs_verb_relations_source_idToverbs.id.toString(),
          frame_id: (rel.verbs_verb_relations_source_idToverbs as { frame_id?: bigint | null }).frame_id?.toString() ?? null,
          flagged: rel.verbs_verb_relations_source_idToverbs.flagged ?? undefined,
          flaggedReason: (rel.verbs_verb_relations_source_idToverbs as any).flagged_reason || undefined,
          forbidden: rel.verbs_verb_relations_source_idToverbs.forbidden ?? undefined,
          forbiddenReason: (rel.verbs_verb_relations_source_idToverbs as any).forbidden_reason || undefined
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

    // First, delete recipe_predicate_role_bindings that reference roles for this entry
    // This must be done before deleting the roles themselves due to foreign key constraints
    await prisma.$executeRaw`
      DELETE FROM recipe_predicate_role_bindings 
      WHERE predicate_role_id IN (SELECT id FROM roles WHERE verb_id = ${entry.id})
         OR verb_role_id IN (SELECT id FROM roles WHERE verb_id = ${entry.id})
    `;

    // Now we can safely delete existing roles for this entry
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
async function getVerbGraphNode(entryId: string): Promise<GraphNode | null> {
  // Use a more efficient query that only fetches what we need
  const entry = await withRetry(
    () => prisma.verbs.findFirst({
      where: { 
        code: entryId,
        deleted: { not: true }
      } as Prisma.verbsWhereInput, // Query by code (human-readable ID)
      include: {
        frames: {
          select: {
            id: true,
            frame_name: true,
            definition: true,
            short_definition: true,
            prototypical_synset: true,
            created_at: true,
            updated_at: true,
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
                deleted: true,
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
                deleted: true,
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
    .filter(rel => {
      const target = rel.verbs_verb_relations_target_idToverbs;
      return rel.type === 'hypernym' && target && target.deleted !== true;
    })
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
    .filter(rel => {
      const source = rel.verbs_verb_relations_source_idToverbs;
      return rel.type === 'hypernym' && source && source.deleted !== true;
    })
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
    .filter(rel => {
      const target = rel.verbs_verb_relations_target_idToverbs;
      return rel.type === 'entails' && target && target.deleted !== true;
    })
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
    .filter(rel => {
      const target = rel.verbs_verb_relations_target_idToverbs;
      return rel.type === 'causes' && target && target.deleted !== true;
    })
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
    .filter(rel => {
      const target = rel.verbs_verb_relations_target_idToverbs;
      return rel.type === 'also_see' && target && target.deleted !== true;
    })
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
  const frameData = (entry as { frames?: { id: bigint; frame_name: string; definition: string; short_definition: string } | null }).frames;
  
  // Debug logging for frame mismatch
  if (entryCode === 'say.v.04') {
    console.log(`DEBUG getGraphNode say.v.04: frame_id=${entryTyped.frame_id?.toString()}, frame_name=${frameData?.frame_name}`);
  }
  
  return {
    id: entryCode,
    legacy_id: entry.legacy_id,
    lemmas: entry.lemmas,
    src_lemmas: entry.src_lemmas,
    gloss: entry.gloss,
    legal_gloss: (entry as { legal_gloss?: string | null }).legal_gloss ?? null,
    pos: 'v',
    lexfile: entry.lexfile,
    examples: entry.examples,
    flagged: entry.flagged ?? undefined,
    flaggedReason: (entry as any).flagged_reason || undefined,
    forbidden: entry.forbidden ?? undefined,
    forbiddenReason: (entry as any).forbidden_reason || undefined,
    frame_id: entryTyped.frame_id?.toString() ?? null,
    vendler_class: (entry as { vendler_class?: 'state' | 'activity' | 'accomplishment' | 'achievement' | null }).vendler_class ?? null,
    frame: frameData 
      ? {
          id: frameData.id.toString(),
          frame_name: frameData.frame_name,
          definition: frameData.definition,
          short_definition: frameData.short_definition,
          prototypical_synset: (frameData as any).prototypical_synset,
          createdAt: (frameData as any).created_at,
          updatedAt: (frameData as any).updated_at,
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

type PrismaNounWithRelations = Prisma.nounsGetPayload<{ 
  include: {
    noun_relations_noun_relations_source_idTonouns: {
      include: { nouns_noun_relations_target_idTonouns: true }
    };
    noun_relations_noun_relations_target_idTonouns: {
      include: { nouns_noun_relations_source_idTonouns: true }
    };
  };
}>;

type PrismaAdjectiveWithRelations = Prisma.adjectivesGetPayload<{ 
  include: {
    adjective_relations_adjective_relations_source_idToadjectives: {
      include: { adjectives_adjective_relations_target_idToadjectives: true }
    };
    adjective_relations_adjective_relations_target_idToadjectives: {
      include: { adjectives_adjective_relations_source_idToadjectives: true }
    };
  };
}>;

function detectPosFromEntryId(entryId: string): 'v' | 'n' | 'a' | 's' | null {
  const match = entryId.match(/\.([a-z])\./i);
  if (!match) return null;
  return match[1].toLowerCase() as 'v' | 'n' | 'a' | 's';
}

function dedupeNodes(nodes: GraphNode[]): GraphNode[] {
  const seen = new Map<string, GraphNode>();
  for (const node of nodes) {
    if (!seen.has(node.id)) {
      seen.set(node.id, node);
    }
  }
  return Array.from(seen.values());
}

function mapNounToGraphNode(noun: {
  id: bigint;
  code?: string | null;
  legacy_id: string;
  lemmas: string[];
  src_lemmas: string[];
  gloss: string;
  legal_gloss?: string | null;
  legal_constraints?: string[];
  lexfile: string;
  examples: string[];
  flagged?: boolean | null;
  flagged_reason?: string | null;
  forbidden?: boolean | null;
  forbidden_reason?: string | null;
  countable?: boolean | null;
  proper?: boolean | null;
  collective?: boolean | null;
  concrete?: boolean | null;
  predicate?: boolean | null;
}): GraphNode {
  const nounRecord = noun as {
    id: bigint;
    code?: string;
    legacy_id: string;
    lemmas: string[];
    src_lemmas: string[];
    gloss: string;
    legal_gloss?: string | null;
    legal_constraints?: string[];
    lexfile: string;
    examples: string[];
    flagged?: boolean | null;
    flagged_reason?: string | null;
    forbidden?: boolean | null;
    forbidden_reason?: string | null;
    countable?: boolean | null;
    proper?: boolean | null;
    collective?: boolean | null;
    concrete?: boolean | null;
    predicate?: boolean | null;
  };

  return {
    id: nounRecord.code || nounRecord.id.toString(),
    legacy_id: nounRecord.legacy_id,
    lemmas: nounRecord.lemmas,
    src_lemmas: nounRecord.src_lemmas,
    gloss: nounRecord.gloss,
    legal_gloss: nounRecord.legal_gloss ?? null,
    legal_constraints: nounRecord.legal_constraints ?? [],
    pos: 'n',
    lexfile: nounRecord.lexfile,
    examples: nounRecord.examples,
    flagged: nounRecord.flagged ?? undefined,
    flaggedReason: nounRecord.flagged_reason || undefined,
    forbidden: nounRecord.forbidden ?? undefined,
    forbiddenReason: nounRecord.forbidden_reason || undefined,
    countable: nounRecord.countable ?? null,
    proper: nounRecord.proper ?? undefined,
    collective: nounRecord.collective ?? undefined,
    concrete: nounRecord.concrete ?? undefined,
    predicate: nounRecord.predicate ?? undefined,
    parents: [],
    children: [],
    entails: [],
    causes: [],
    alsoSee: [],
  };
}

function mapAdjectiveToGraphNode(adjective: {
  id: bigint;
  code?: string | null;
  legacy_id: string;
  lemmas: string[];
  src_lemmas: string[];
  gloss: string;
  legal_gloss?: string | null;
  legal_constraints?: string[];
  lexfile: string;
  examples: string[];
  flagged?: boolean | null;
  flagged_reason?: string | null;
  forbidden?: boolean | null;
  forbidden_reason?: string | null;
  is_satellite?: boolean | null;
  gradable?: boolean | null;
  predicative?: boolean | null;
  attributive?: boolean | null;
  subjective?: boolean | null;
  relational?: boolean | null;
}): GraphNode {
  const adjRecord = adjective as {
    id: bigint;
    code?: string;
    legacy_id: string;
    lemmas: string[];
    src_lemmas: string[];
    gloss: string;
    legal_gloss?: string | null;
    legal_constraints?: string[];
    lexfile: string;
    examples: string[];
    flagged?: boolean | null;
    flagged_reason?: string | null;
    forbidden?: boolean | null;
    forbidden_reason?: string | null;
    is_satellite?: boolean | null;
    gradable?: boolean | null;
    predicative?: boolean | null;
    attributive?: boolean | null;
    subjective?: boolean | null;
    relational?: boolean | null;
  };

  return {
    id: adjRecord.code || adjRecord.id.toString(),
    legacy_id: adjRecord.legacy_id,
    lemmas: adjRecord.lemmas,
    src_lemmas: adjRecord.src_lemmas,
    gloss: adjRecord.gloss,
    legal_gloss: adjRecord.legal_gloss ?? null,
    legal_constraints: adjRecord.legal_constraints ?? [],
    pos: 'a',
    lexfile: adjRecord.lexfile,
    examples: adjRecord.examples,
    flagged: adjRecord.flagged ?? undefined,
    flaggedReason: adjRecord.flagged_reason || undefined,
    forbidden: adjRecord.forbidden ?? undefined,
    forbiddenReason: adjRecord.forbidden_reason || undefined,
    isSatellite: adjRecord.is_satellite ?? undefined,
    gradable: adjRecord.gradable ?? null,
    predicative: adjRecord.predicative ?? undefined,
    attributive: adjRecord.attributive ?? undefined,
    subjective: adjRecord.subjective ?? undefined,
    relational: adjRecord.relational ?? undefined,
    parents: [],
    children: [],
    entails: [],
    causes: [],
    alsoSee: [],
  };
}

async function getNounGraphNode(entryId: string): Promise<GraphNode | null> {
  const entry = await withRetry(
    () => prisma.nouns.findUnique({
      where: { code: entryId } as Prisma.nounsWhereUniqueInput,
      include: {
        noun_relations_noun_relations_source_idTonouns: {
          include: {
            nouns_noun_relations_target_idTonouns: true,
          },
        },
        noun_relations_noun_relations_target_idTonouns: {
          include: {
            nouns_noun_relations_source_idTonouns: true,
          },
        },
      },
    }),
    undefined,
    `getNounGraphNode(${entryId})`
  ) as PrismaNounWithRelations | null;

  if (!entry) return null;

  const parents: GraphNode[] = [];
  const children: GraphNode[] = [];
  const alsoSee: GraphNode[] = [];

  const relationTypesForParents = new Set(['hypernym', 'instance_hypernym']);
  const relationTypesForChildren = new Set(['hypernym', 'instance_hypernym']);
  const relationTypesForAlsoSee = new Set([
    'also_see',
    'similar_to',
    'attribute',
    'derivationally_related',
    'pertainym',
    'domain_topic',
    'domain_region',
    'domain_usage',
    'member_of_domain_topic',
    'member_of_domain_region',
    'member_of_domain_usage',
  ]);

  for (const rel of entry.noun_relations_noun_relations_source_idTonouns) {
    const target = rel.nouns_noun_relations_target_idTonouns;
    if (!target) continue;
    if (relationTypesForParents.has(rel.type)) {
      parents.push(mapNounToGraphNode(target));
    } else if (relationTypesForAlsoSee.has(rel.type)) {
      alsoSee.push(mapNounToGraphNode(target));
    }
  }

  for (const rel of entry.noun_relations_noun_relations_target_idTonouns) {
    const source = rel.nouns_noun_relations_source_idTonouns;
    if (!source) continue;
    if (relationTypesForChildren.has(rel.type)) {
      children.push(mapNounToGraphNode(source));
    } else if (relationTypesForAlsoSee.has(rel.type)) {
      alsoSee.push(mapNounToGraphNode(source));
    }
  }

  const baseNode = mapNounToGraphNode(entry);
  baseNode.parents = dedupeNodes(parents);
  baseNode.children = dedupeNodes(children);
  baseNode.alsoSee = dedupeNodes(alsoSee);

  return baseNode;
}

async function getAdjectiveGraphNode(entryId: string): Promise<GraphNode | null> {
  const entry = await withRetry(
    () => prisma.adjectives.findUnique({
      where: { code: entryId } as Prisma.adjectivesWhereUniqueInput,
      include: {
        adjective_relations_adjective_relations_source_idToadjectives: {
          include: {
            adjectives_adjective_relations_target_idToadjectives: true,
          },
        },
        adjective_relations_adjective_relations_target_idToadjectives: {
          include: {
            adjectives_adjective_relations_source_idToadjectives: true,
          },
        },
      },
    }),
    undefined,
    `getAdjectiveGraphNode(${entryId})`
  ) as PrismaAdjectiveWithRelations | null;

  if (!entry) return null;

  const alsoSee: GraphNode[] = [];
  const causes: GraphNode[] = [];

  const alsoSeeTypes = new Set([
    'similar',
    'also_see',
    'antonym',
    'attribute',
    'related_to',
    'pertainym',
    'derivationally_related',
    'exemplifies',
    'domain_topic',
    'domain_region',
    'domain_usage',
    'member_of_domain_topic',
    'member_of_domain_region',
    'member_of_domain_usage',
    'participle_of'
  ]);

  for (const rel of entry.adjective_relations_adjective_relations_source_idToadjectives) {
    const target = rel.adjectives_adjective_relations_target_idToadjectives;
    if (!target) continue;
    if (rel.type === 'causes') {
      causes.push(mapAdjectiveToGraphNode(target));
    } else if (alsoSeeTypes.has(rel.type)) {
      alsoSee.push(mapAdjectiveToGraphNode(target));
    }
  }

  for (const rel of entry.adjective_relations_adjective_relations_target_idToadjectives) {
    const source = rel.adjectives_adjective_relations_source_idToadjectives;
    if (!source) continue;
    if (rel.type === 'causes') {
      causes.push(mapAdjectiveToGraphNode(source));
    } else if (alsoSeeTypes.has(rel.type)) {
      alsoSee.push(mapAdjectiveToGraphNode(source));
    }
  }

  const baseNode = mapAdjectiveToGraphNode(entry);
  baseNode.alsoSee = dedupeNodes(alsoSee);
  baseNode.causes = dedupeNodes(causes);

  return baseNode;
}

async function getGraphNodeInternal(entryId: string): Promise<GraphNode | null> {
  const pos = detectPosFromEntryId(entryId);
  if (pos === 'n') {
    return getNounGraphNode(entryId);
  }
  if (pos === 'a' || pos === 's') {
    return getAdjectiveGraphNode(entryId);
  }
  return getVerbGraphNode(entryId);
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

// Helper function to revalidate all entry-related caches
export function revalidateAllEntryCaches() {
  revalidateTag('graph-node');
  revalidateTag('entry-recipes');
  revalidateTag('ancestor-path');
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
          AND (e.deleted = false OR e.deleted IS NULL)
        
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
            AND (e.deleted = false OR e.deleted IS NULL)
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

// Export uncached version for when we need fresh data
export const getAncestorPathUncached = getAncestorPathInternal;

export async function updateModerationStatus(
  ids: string[], 
  updates: { 
    flagged?: boolean; 
    flaggedReason?: string; 
    forbidden?: boolean; 
    forbiddenReason?: string; 
  },
  lexicalType: LexicalType = 'verbs'
): Promise<number> {
  // Transform camelCase to snake_case for Prisma
  const prismaUpdates: Record<string, unknown> = {};
  if (updates.flagged !== undefined) prismaUpdates.flagged = updates.flagged;
  if (updates.flaggedReason !== undefined) prismaUpdates.flagged_reason = updates.flaggedReason;
  if (updates.forbidden !== undefined) prismaUpdates.forbidden = updates.forbidden;
  if (updates.forbiddenReason !== undefined) prismaUpdates.forbidden_reason = updates.forbiddenReason;

  let result;
  
  // Update the correct table based on lexical type
  switch (lexicalType) {
    case 'verbs':
      result = await prisma.verbs.updateMany({
        where: {
          code: {
            in: ids
          },
          deleted: false // Only update non-deleted verbs
        } as Prisma.verbsWhereInput,
        data: prismaUpdates
      });
      break;
    
    case 'nouns':
      result = await prisma.nouns.updateMany({
        where: {
          code: {
            in: ids
          }
          // Note: Nouns table doesn't have a deleted field
        } as Prisma.nounsWhereInput,
        data: prismaUpdates
      });
      break;
    
    case 'adjectives':
      result = await prisma.adjectives.updateMany({
        where: {
          code: {
            in: ids
          }
          // Note: Adjectives table doesn't have a deleted field
        } as Prisma.adjectivesWhereInput,
        data: prismaUpdates
      });
      break;
    
    case 'adverbs':
      result = await prisma.adverbs.updateMany({
        where: {
          code: {
            in: ids
          }
          // Note: Adverbs table doesn't have a deleted field
        } as Prisma.adverbsWhereInput,
        data: prismaUpdates
      });
      break;
    
    default:
      throw new Error(`Unsupported lexical type: ${lexicalType}`);
  }

  // Invalidate all caches since moderation status affects display
  revalidateAllEntryCaches();

  return result.count;
}

export async function updateFramesForEntries(
  ids: string[],
  frameIdentifier: string | null
): Promise<number> {
  if (!ids || ids.length === 0) {
    return 0;
  }

  let resolvedFrameId: bigint | null = null;

  if (frameIdentifier && frameIdentifier.trim() !== '') {
    const trimmed = frameIdentifier.trim();

    if (/^\d+$/.test(trimmed)) {
      resolvedFrameId = BigInt(trimmed);
    } else {
      const frame = await prisma.frames.findFirst({
        where: {
          code: {
            equals: trimmed,
            mode: 'insensitive',
          },
        } as Prisma.framesWhereInput,
        select: { id: true } as Prisma.framesSelect,
      });

      if (!frame) {
        throw new Error(`Frame not found for identifier: ${frameIdentifier}`);
      }

      resolvedFrameId = frame.id;
    }
  }

  const result = await prisma.verbs.updateMany({
    where: {
      code: {
        in: ids,
      },
      deleted: false
    } as Prisma.verbsWhereInput,
    data: {
      frame_id: resolvedFrameId,
    },
  });

  revalidateAllEntryCaches();

  return result.count;
}

export async function getPaginatedEntries(params: PaginationParams = {}): Promise<PaginatedResult<TableEntry>> {
  const {
    page = 1,
    limit: rawLimit = 10,
    sortBy = 'id',
    sortOrder = 'asc',
    search,
    pos,
    lexfile,
    frame_id,
    gloss,
    lemmas,
    examples,
    flaggedReason,
    forbiddenReason,
    isMwe,
    flagged,
    forbidden,
    parentsCountMin,
    parentsCountMax,
    childrenCountMin,
    childrenCountMax,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore,
    flaggedByJobId
  } = params;

  // Use rawLimit directly, no special handling for -1
  const limit = rawLimit;
  const skip = (page - 1) * limit;

  // Build where clause
  const whereClause: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];
  
  // Always filter out deleted entries
  andConditions.push({ 
    deleted: false
  });
  
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
    const rawValues = frame_id
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);

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

        console.log(
          `Frame filter: input=${rawValues.join(',')}, resolved frames=`,
          frames.map(f => ({ id: f.id.toString(), code: (f as { code?: string | null }).code }))
        );

        frames.forEach(frame => {
          numericIds.add(frame.id);
        });
      }

      if (numericIds.size > 0) {
        andConditions.push({
          frame_id: {
            in: Array.from(numericIds)
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

  // Note: 'frames' filter removed - verbs table doesn't have a frames array field
  // It only has frame_id (BigInt)

  // Reason text filters
  if (flaggedReason) {
    andConditions.push({
      flagged_reason: {
        contains: flaggedReason,
        mode: 'insensitive'
      }
    } as Prisma.verbsWhereInput);
  }

  if (forbiddenReason) {
    andConditions.push({
      forbidden_reason: {
        contains: forbiddenReason,
        mode: 'insensitive'
      }
    } as Prisma.verbsWhereInput);
  }

  // Boolean filters
  if (flagged !== undefined) {
    andConditions.push({ flagged });
  }

  if (forbidden !== undefined) {
    andConditions.push({ forbidden });
  }

  // AI jobs: entries flagged by a specific job
  if (flaggedByJobId) {
    try {
      const jobIdBigInt = BigInt(flaggedByJobId);
      andConditions.push({
        llm_job_items: {
          some: {
            job_id: jobIdBigInt,
            flagged: true,
          },
        },
      } as Prisma.verbsWhereInput);
    } catch {
      // ignore invalid job id values
    }
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
    const entryCode = (entry as { code?: string }).code || (typeof entry.id === 'bigint' ? entry.id.toString() : entry.id);
    const frameData = (entry as { frames?: { frame_name: string; code: string } | null; frame_id?: bigint | null }).frames;
    const frameId = (entry as { frame_id?: bigint | null }).frame_id;
    
  // Debug logging for frame mismatch
  if (entryCode === 'say.v.04') {
    console.log(`DEBUG say.v.04: frame_id=${frameId?.toString()}, frame_name=${frameData?.frame_name}, frame_code=${frameData?.code}`);
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
      examples: entry.examples,
      flagged: (entry as any).flagged ?? undefined,
      flaggedReason: (entry as any).flagged_reason || undefined,
      forbidden: (entry as any).forbidden ?? undefined,
      forbiddenReason: (entry as any).forbidden_reason || undefined,
      frame_id: frameId ? frameId.toString() : null,
      frame: (entry as { frames?: { frame_name: string } } | undefined)?.frames?.frame_name || null,
      vendler_class: entry.vendler_class ?? null,
      roles: rolesByEntryId.get(numericId) || [],
      role_groups: roleGroupsByEntryId.get(numericId) || [],
      parentsCount: entry._count.verb_relations_verb_relations_source_idToverbs,
      childrenCount: entry._count.verb_relations_verb_relations_target_idToverbs,
      createdAt: (entry as any).createdAt ?? (entry as any).created_at,
      updatedAt: (entry as any).updatedAt ?? (entry as any).updated_at
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

export async function getPaginatedNouns(params: PaginationParams = {}): Promise<PaginatedResult<TableEntry>> {
  const {
    page = 1,
    limit: rawLimit = 10,
    sortBy = 'id',
    sortOrder = 'asc',
    search,
    lexfile,
    gloss,
    lemmas,
    examples,
    flaggedReason,
    forbiddenReason,
    isMwe,
    flagged,
    forbidden,
    parentsCountMin,
    parentsCountMax,
    childrenCountMin,
    childrenCountMax,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore,
  } = params;

  // Use rawLimit directly, no special handling for -1
  const limit = rawLimit;
  const skip = (page - 1) * limit;

  // Build where clause
  const whereClause: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];
  
  // Note: nouns don't have a 'deleted' field, so no filter needed
  
  // Global search
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

  // Reason text filters
  if (flaggedReason) {
    andConditions.push({
      flagged_reason: {
        contains: flaggedReason,
        mode: 'insensitive'
      }
    } as Prisma.nounsWhereInput);
  }

  if (forbiddenReason) {
    andConditions.push({
      forbidden_reason: {
        contains: forbiddenReason,
        mode: 'insensitive'
      }
    } as Prisma.nounsWhereInput);
  }

  // Boolean filters
  if (isMwe !== undefined) {
    andConditions.push({ is_mwe: isMwe });
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
      created_at: {
        gte: new Date(createdAfter)
      }
    });
  }

  if (createdBefore) {
    andConditions.push({
      created_at: {
        lte: new Date(createdBefore + 'T23:59:59.999Z')
      }
    });
  }

  if (updatedAfter) {
    andConditions.push({
      updated_at: {
        gte: new Date(updatedAfter)
      }
    });
  }

  if (updatedBefore) {
    andConditions.push({
      updated_at: {
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
    () => prisma.nouns.count({
      where: whereClause
    }),
    undefined,
    'getPaginatedNouns:count'
  );

  // Build order clause
  const orderBy: Record<string, unknown> = {};
  
  let actualSortBy = sortBy;
  if (sortBy === 'src_id') {
    actualSortBy = 'legacy_id';
  }
  
  if (actualSortBy === 'lemmas' || actualSortBy === 'src_lemmas') {
    orderBy[actualSortBy] = sortOrder;
  } else if (actualSortBy === 'parentsCount' || actualSortBy === 'childrenCount') {
    orderBy.id = sortOrder;
  } else {
    orderBy[actualSortBy] = sortOrder;
  }

  // Fetch nouns with relation counts
  const nouns = await withRetry(
    () => prisma.nouns.findMany({
    where: whereClause,
    skip,
    take: limit,
    orderBy,
    include: {
      _count: {
        select: {
          noun_relations_noun_relations_source_idTonouns: {
            where: { type: 'hypernym' }
          },
          noun_relations_noun_relations_target_idTonouns: {
            where: { type: 'hyponym' }
          }
        }
      }
    }
  }),
    undefined,
    'getPaginatedNouns:findMany'
  );

  // Transform to TableEntry format
  let data: TableEntry[] = nouns.map(noun => {
    const nounCode = noun.code || noun.id.toString();
    
    return {
      id: nounCode,
      legacy_id: noun.legacy_id,
      lemmas: noun.lemmas,
      src_lemmas: noun.src_lemmas,
      gloss: noun.gloss,
      pos: 'n',
      lexfile: noun.lexfile,
      isMwe: noun.is_mwe,
      transitive: undefined,
      particles: [],
      examples: noun.examples,
      flagged: noun.flagged ?? undefined,
      flaggedReason: noun.flagged_reason || undefined,
      forbidden: noun.forbidden ?? undefined,
      forbiddenReason: noun.forbidden_reason || undefined,
      frame_id: null,
      frame: null,
      vendler_class: null,
      legal_constraints: noun.legal_constraints || [],
      roles: [],
      role_groups: [],
      parentsCount: noun._count.noun_relations_noun_relations_source_idTonouns,
      childrenCount: noun._count.noun_relations_noun_relations_target_idTonouns,
      createdAt: noun.created_at,
      updatedAt: noun.updated_at
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

export async function getPaginatedAdjectives(params: PaginationParams = {}): Promise<PaginatedResult<TableEntry>> {
  const {
    page = 1,
    limit: rawLimit = 10,
    sortBy = 'id',
    sortOrder = 'asc',
    search,
    lexfile,
    gloss,
    lemmas,
    examples,
    flaggedReason,
    forbiddenReason,
    isMwe,
    flagged,
    forbidden,
    parentsCountMin,
    parentsCountMax,
    childrenCountMin,
    childrenCountMax,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore,
  } = params;

  // Use rawLimit directly, no special handling for -1
  const limit = rawLimit;
  const skip = (page - 1) * limit;

  // Build where clause
  const whereClause: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];
  
  // Note: adjectives don't have a 'deleted' field, so no filter needed
  
  // Global search
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

  // Reason text filters
  if (flaggedReason) {
    andConditions.push({
      flagged_reason: {
        contains: flaggedReason,
        mode: 'insensitive'
      }
    } as Prisma.adjectivesWhereInput);
  }

  if (forbiddenReason) {
    andConditions.push({
      forbidden_reason: {
        contains: forbiddenReason,
        mode: 'insensitive'
      }
    } as Prisma.adjectivesWhereInput);
  }

  // Boolean filters
  if (isMwe !== undefined) {
    andConditions.push({ is_mwe: isMwe });
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
      created_at: {
        gte: new Date(createdAfter)
      }
    });
  }

  if (createdBefore) {
    andConditions.push({
      created_at: {
        lte: new Date(createdBefore + 'T23:59:59.999Z')
      }
    });
  }

  if (updatedAfter) {
    andConditions.push({
      updated_at: {
        gte: new Date(updatedAfter)
      }
    });
  }

  if (updatedBefore) {
    andConditions.push({
      updated_at: {
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
    () => prisma.adjectives.count({
      where: whereClause
    }),
    undefined,
    'getPaginatedAdjectives:count'
  );

  // Build order clause
  const orderBy: Record<string, unknown> = {};
  
  let actualSortBy = sortBy;
  if (sortBy === 'src_id') {
    actualSortBy = 'legacy_id';
  }
  
  if (actualSortBy === 'lemmas' || actualSortBy === 'src_lemmas') {
    orderBy[actualSortBy] = sortOrder;
  } else if (actualSortBy === 'parentsCount' || actualSortBy === 'childrenCount') {
    orderBy.id = sortOrder;
  } else {
    orderBy[actualSortBy] = sortOrder;
  }

  // Fetch adjectives with relation counts
  const adjectives = await withRetry(
    () => prisma.adjectives.findMany({
    where: whereClause,
    skip,
    take: limit,
    orderBy,
    include: {
      _count: {
        select: {
          adjective_relations_adjective_relations_source_idToadjectives: {
            where: { type: 'similar' }
          },
          adjective_relations_adjective_relations_target_idToadjectives: {
            where: { type: 'similar' }
          }
        }
      }
    }
  }),
    undefined,
    'getPaginatedAdjectives:findMany'
  );

  // Transform to TableEntry format
  let data: TableEntry[] = adjectives.map(adjective => {
    const adjectiveCode = adjective.code || adjective.id.toString();
    
    return {
      id: adjectiveCode,
      legacy_id: adjective.legacy_id,
      lemmas: adjective.lemmas,
      src_lemmas: adjective.src_lemmas,
      gloss: adjective.gloss,
      pos: 'a',
      lexfile: adjective.lexfile,
      isMwe: adjective.is_mwe,
      transitive: undefined,
      particles: [],
      examples: adjective.examples,
      flagged: adjective.flagged ?? undefined,
      flaggedReason: adjective.flagged_reason || undefined,
      forbidden: adjective.forbidden ?? undefined,
      forbiddenReason: adjective.forbidden_reason || undefined,
      frame_id: null,
      frame: null,
      vendler_class: null,
      legal_constraints: adjective.legal_constraints || [],
      roles: [],
      role_groups: [],
      parentsCount: adjective._count.adjective_relations_adjective_relations_source_idToadjectives,
      childrenCount: adjective._count.adjective_relations_adjective_relations_target_idToadjectives,
      createdAt: adjective.created_at,
      updatedAt: adjective.updated_at
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

export async function getPaginatedAdverbs(params: PaginationParams = {}): Promise<PaginatedResult<TableEntry>> {
  const {
    page = 1,
    limit: rawLimit = 10,
    sortBy = 'id',
    sortOrder = 'asc',
    search,
    lexfile,
    gloss,
    lemmas,
    examples,
    flaggedReason,
    forbiddenReason,
    isMwe,
    flagged,
    forbidden,
    parentsCountMin,
    parentsCountMax,
    childrenCountMin,
    childrenCountMax,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore,
  } = params;

  // Use rawLimit directly, no special handling for -1
  const limit = rawLimit;
  const skip = (page - 1) * limit;

  // Build where clause
  const whereClause: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];
  
  // Note: adverbs don't have a 'deleted' field, so no filter needed
  
  // Global search
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

  // Reason text filters
  if (flaggedReason) {
    andConditions.push({
      flagged_reason: {
        contains: flaggedReason,
        mode: 'insensitive'
      }
    } as Prisma.adverbsWhereInput);
  }

  if (forbiddenReason) {
    andConditions.push({
      forbidden_reason: {
        contains: forbiddenReason,
        mode: 'insensitive'
      }
    } as Prisma.adverbsWhereInput);
  }

  // Boolean filters
  if (isMwe !== undefined) {
    andConditions.push({ is_mwe: isMwe });
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
      created_at: {
        gte: new Date(createdAfter)
      }
    });
  }

  if (createdBefore) {
    andConditions.push({
      created_at: {
        lte: new Date(createdBefore + 'T23:59:59.999Z')
      }
    });
  }

  if (updatedAfter) {
    andConditions.push({
      updated_at: {
        gte: new Date(updatedAfter)
      }
    });
  }

  if (updatedBefore) {
    andConditions.push({
      updated_at: {
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
    () => prisma.adverbs.count({
      where: whereClause
    }),
    undefined,
    'getPaginatedAdverbs:count'
  );

  // Build order clause
  const orderBy: Record<string, unknown> = {};
  
  let actualSortBy = sortBy;
  if (sortBy === 'src_id') {
    actualSortBy = 'legacy_id';
  }
  
  if (actualSortBy === 'lemmas' || actualSortBy === 'src_lemmas') {
    orderBy[actualSortBy] = sortOrder;
  } else if (actualSortBy === 'parentsCount' || actualSortBy === 'childrenCount') {
    orderBy.id = sortOrder;
  } else {
    orderBy[actualSortBy] = sortOrder;
  }

  // Fetch adverbs with relation counts
  const adverbs = await withRetry(
    () => prisma.adverbs.findMany({
    where: whereClause,
    skip,
    take: limit,
    orderBy,
    include: {
      _count: {
        select: {
          adverb_relations_adverb_relations_source_idToadverbs: {
            where: { type: 'similar' }
          },
          adverb_relations_adverb_relations_target_idToadverbs: {
            where: { type: 'similar' }
          }
        }
      }
    }
  }),
    undefined,
    'getPaginatedAdverbs:findMany'
  );

  // Transform to TableEntry format
  let data: TableEntry[] = adverbs.map(adverb => {
    const adverbCode = adverb.code || adverb.id.toString();
    
    return {
      id: adverbCode,
      legacy_id: adverb.legacy_id,
      lemmas: adverb.lemmas,
      src_lemmas: adverb.src_lemmas,
      gloss: adverb.gloss,
      pos: 'r',
      lexfile: adverb.lexfile,
      isMwe: adverb.is_mwe,
      transitive: undefined,
      particles: [],
      examples: adverb.examples,
      flagged: adverb.flagged ?? undefined,
      flaggedReason: adverb.flagged_reason || undefined,
      forbidden: adverb.forbidden ?? undefined,
      forbiddenReason: adverb.forbidden_reason || undefined,
      frame_id: null,
      frame: null,
      vendler_class: null,
      legal_constraints: adverb.legal_constraints || [],
      roles: [],
      role_groups: [],
      parentsCount: adverb._count.adverb_relations_adverb_relations_source_idToadverbs,
      childrenCount: adverb._count.adverb_relations_adverb_relations_target_idToadverbs,
      createdAt: adverb.created_at,
      updatedAt: adverb.updated_at
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

export async function getPaginatedFrames(params: FramePaginationParams = {}): Promise<PaginatedResult<Frame>> {
  const {
    page = 1,
    limit: rawLimit = 10,
    sortBy = 'frame_name',
    sortOrder = 'asc',
    search,
    frame_name,
    definition,
    short_definition,
    prototypical_synset,
    is_supporting_frame,
    communication,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore,
  } = params;

  // Use rawLimit directly, no special handling for -1
  const limit = rawLimit;
  const skip = (page - 1) * limit;

  // Build where clause
  const andConditions: Record<string, unknown>[] = [];

  // Global search across multiple text fields
  if (search) {
    andConditions.push({
      OR: [
        {
          frame_name: {
            contains: search,
            mode: 'insensitive'
          }
        },
        {
          definition: {
            contains: search,
            mode: 'insensitive'
          }
        },
        {
          short_definition: {
            contains: search,
            mode: 'insensitive'
          }
        },
        {
          prototypical_synset: {
            contains: search,
            mode: 'insensitive'
          }
        }
      ]
    });
  }

  // Text filters
  if (frame_name) {
    andConditions.push({
      frame_name: {
        contains: frame_name,
        mode: 'insensitive'
      }
    });
  }

  if (definition) {
    andConditions.push({
      definition: {
        contains: definition,
        mode: 'insensitive'
      }
    });
  }

  if (short_definition) {
    andConditions.push({
      short_definition: {
        contains: short_definition,
        mode: 'insensitive'
      }
    });
  }

  if (prototypical_synset) {
    andConditions.push({
      prototypical_synset: {
        contains: prototypical_synset,
        mode: 'insensitive'
      }
    });
  }

  // Boolean filters
  if (is_supporting_frame !== undefined) {
    andConditions.push({ is_supporting_frame });
  }

  if (communication !== undefined) {
    andConditions.push({ communication });
  }

  // Date filters
  if (createdAfter) {
    andConditions.push({
      created_at: {
        gte: new Date(createdAfter)
      }
    });
  }

  if (createdBefore) {
    andConditions.push({
      created_at: {
        lte: new Date(createdBefore + 'T23:59:59.999Z')
      }
    });
  }

  if (updatedAfter) {
    andConditions.push({
      updated_at: {
        gte: new Date(updatedAfter)
      }
    });
  }

  if (updatedBefore) {
    andConditions.push({
      updated_at: {
        lte: new Date(updatedBefore + 'T23:59:59.999Z')
      }
    });
  }

  const whereClause = andConditions.length > 0 ? { AND: andConditions } : {};

  // Get total count
  const total = await withRetry(
    () => prisma.frames.count({ where: whereClause as Prisma.framesWhereInput }),
    undefined,
    'getPaginatedFrames:count'
  );

  // Build orderBy
  const orderBy: Record<string, 'asc' | 'desc'> = {};
  
  // Map sortBy field names
  if (sortBy === 'createdAt') {
    orderBy.created_at = sortOrder;
  } else if (sortBy === 'updatedAt') {
    orderBy.updated_at = sortOrder;
  } else {
    orderBy[sortBy] = sortOrder;
  }

  // Fetch frames with roles
  const frames = await withRetry(
    () => prisma.frames.findMany({
      where: whereClause as Prisma.framesWhereInput,
      skip,
      take: limit,
      orderBy: orderBy as Prisma.framesOrderByWithRelationInput,
      include: {
        frame_roles: {
          include: {
            role_types: true
          }
        }
      }
    }),
    undefined,
    'getPaginatedFrames:findMany'
  );

  // Transform to Frame format
  const data: Frame[] = frames.map(frame => ({
    id: frame.id.toString(),
    frame_name: frame.frame_name,
    definition: frame.definition,
    short_definition: frame.short_definition,
    prototypical_synset: frame.prototypical_synset,
    createdAt: frame.created_at,
    updatedAt: frame.updated_at,
    frame_roles: frame.frame_roles.map(fr => ({
      id: fr.id.toString(),
      description: fr.description,
      notes: fr.notes,
      main: fr.main,
      role_type: {
        id: fr.role_types.id.toString(),
        code: fr.role_types.code,
        label: fr.role_types.label,
        generic_description: fr.role_types.generic_description,
        explanation: fr.role_types.explanation
      }
    }))
  }));

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

/**
 * Delete an entry and reassign its hyponyms to the deleted entry's hypernym
 * @param code - The code of the entry to delete
 * @returns The deleted entry or null if not found
 */
export async function deleteEntry(code: string): Promise<VerbWithRelations | null> {
  return await withRetry(async () => {
    // Get the entry to delete
    const entry = await prisma.verbs.findUnique({
      where: { code: code } as unknown as Prisma.verbsWhereUniqueInput,
      select: { id: true }
    });

    if (!entry) {
      return null;
    }

    // Find the entry's hypernym (parent)
    const hypernymRelation = await prisma.verb_relations.findFirst({
      where: {
        source_id: entry.id,
        type: 'hypernym'
      },
      select: {
        target_id: true
      }
    });

    // Find all hyponyms (children) of this entry
    const hyponymRelations = await prisma.verb_relations.findMany({
      where: {
        target_id: entry.id,
        type: 'hypernym'
      },
      select: {
        source_id: true
      }
    });

    // If the entry has a hypernym and hyponyms, reassign hyponyms to the hypernym
    if (hypernymRelation && hyponymRelations.length > 0) {
      const hypernymId = hypernymRelation.target_id;

      // For each hyponym, update its hypernym relation
      for (const hyponymRelation of hyponymRelations) {
        const hyponymId = hyponymRelation.source_id;

        // Delete old relation (hyponym -> deleted entry)
        await prisma.verb_relations.deleteMany({
          where: {
            source_id: hyponymId,
            target_id: entry.id,
            type: 'hypernym'
          }
        });

        // Create new relation (hyponym -> deleted entry's hypernym)
        await prisma.verb_relations.upsert({
          where: {
            source_id_type_target_id: {
              source_id: hyponymId,
              target_id: hypernymId,
              type: 'hypernym'
            }
          },
          create: {
            source_id: hyponymId,
            target_id: hypernymId,
            type: 'hypernym'
          },
          update: {}
        });
      }
    } else if (hyponymRelations.length > 0) {
      // If entry has no hypernym (it's a root), hyponyms become new roots
      // Just delete the relations pointing to this entry
      await prisma.verb_relations.deleteMany({
        where: {
          target_id: entry.id,
          type: 'hypernym'
        }
      });
    }

    // Get the full entry before deleting
    const entryToDelete = await getEntryById(code);

    // Delete all relations involving this entry
    await prisma.verb_relations.deleteMany({
      where: {
        OR: [
          { source_id: entry.id },
          { target_id: entry.id }
        ]
      }
    });

    // Delete any roles associated with this entry
    await prisma.roles.deleteMany({
      where: { verb_id: entry.id }
    });

    // Delete any role groups associated with this entry
    await prisma.role_groups.deleteMany({
      where: { verb_id: entry.id }
    });

    // Soft delete the entry itself (set deleted = true instead of actually deleting)
    await prisma.verbs.update({
      where: { code: code } as unknown as Prisma.verbsWhereUniqueInput,
      data: {
        deleted: true,
        deleted_at: new Date()
      }
    });

    // Invalidate all caches
    revalidateAllEntryCaches();

    return entryToDelete;
  });
}