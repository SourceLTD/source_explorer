/**
 * Database Layer
 * 
 * Unified database operations for lexical_units and frames.
 * All POS types (verb, noun, adjective, adverb) are in the lexical_units table.
 */

import { unstable_cache, revalidateTag } from 'next/cache';
import { prisma } from './prisma';
import { withRetry } from './db-utils';
import { Prisma, part_of_speech, lexical_unit_relation_type } from '@prisma/client';
import type {
  PartOfSpeech,
  LexicalUnit,
  LexicalUnitWithRelations,
  LexicalUnitRelation,
  LexicalUnitRelationType,
  GraphNode,
  SearchResult,
  PaginationParams,
  PaginatedResult,
  TableEntry,
  EntryRecipes,
  Recipe,
  RecipePredicateNode,
  RecipePredicateRoleMapping,
  LogicNode,
  LogicNodeKind,
  Frame,
  FramePaginationParams,
  VendlerClass,
} from './types';

// Re-export the unified pagination function
export { getPaginatedLexicalUnits, getLexicalUnitById } from '@/lib/db/entities';

// Back-compat: some routes import prisma from '@/lib/db'
export { prisma };

// ============================================
// Helper Functions
// ============================================

/**
 * Check if an entryId is a numeric ID (as opposed to a code like "say.v.04")
 */
function parseNumericEntryId(entryId: string): bigint | null {
  if (/^\d+$/.test(entryId)) {
    try {
      return BigInt(entryId);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Detect POS from entry code (e.g., "say.v.04" -> "verb")
 */
function detectPosFromEntryId(entryId: string): PartOfSpeech | null {
  const match = entryId.match(/\.([vnars])\.?\d*$/);
  if (!match) return null;
  
  const posChar = match[1];
  switch (posChar) {
    case 'v': return 'verb';
    case 'n': return 'noun';
    case 'a':
    case 's': return 'adjective';
    case 'r': return 'adverb';
    default: return null;
  }
}

// ============================================
// Lexical Unit Operations
// ============================================

/**
 * Get a lexical unit by ID or code with relations
 */
export async function getEntryById(id: string): Promise<LexicalUnitWithRelations | null> {
  const numericId = parseNumericEntryId(id);
  
  const whereClause: Prisma.lexical_unitsWhereInput = numericId
    ? { id: numericId, deleted: false }
    : { code: id, deleted: false };

  const entry = await withRetry(
    () => prisma.lexical_units.findFirst({
      where: whereClause,
      include: {
        frames: {
          select: { id: true, label: true, code: true, definition: true, short_definition: true }
        },
        lexical_unit_relations_lexical_unit_relations_source_idTolexical_units: {
          include: {
            lexical_units_lexical_unit_relations_target_idTolexical_units: true
          },
        },
        lexical_unit_relations_lexical_unit_relations_target_idTolexical_units: {
          include: {
            lexical_units_lexical_unit_relations_source_idTolexical_units: true
          },
        },
      },
    }),
    undefined,
    `getEntryById(${id})`
  );

  if (!entry) return null;

  return transformToLexicalUnitWithRelations(entry);
}

/**
 * Transform Prisma entry to LexicalUnitWithRelations
 */
function transformToLexicalUnitWithRelations(entry: any): LexicalUnitWithRelations {
  const sourceRelations = (entry.lexical_unit_relations_lexical_unit_relations_source_idTolexical_units || [])
    .filter((rel: any) => rel.lexical_units_lexical_unit_relations_target_idTolexical_units?.deleted !== true)
    .map((rel: any) => ({
      sourceId: rel.source_id.toString(),
      targetId: rel.target_id.toString(),
      type: rel.type as LexicalUnitRelationType,
      target: rel.lexical_units_lexical_unit_relations_target_idTolexical_units 
        ? transformToLexicalUnit(rel.lexical_units_lexical_unit_relations_target_idTolexical_units)
        : undefined,
    }));

  const targetRelations = (entry.lexical_unit_relations_lexical_unit_relations_target_idTolexical_units || [])
    .filter((rel: any) => rel.lexical_units_lexical_unit_relations_source_idTolexical_units?.deleted !== true)
    .map((rel: any) => ({
      sourceId: rel.source_id.toString(),
      targetId: rel.target_id.toString(),
      type: rel.type as LexicalUnitRelationType,
      source: rel.lexical_units_lexical_unit_relations_source_idTolexical_units
        ? transformToLexicalUnit(rel.lexical_units_lexical_unit_relations_source_idTolexical_units)
        : undefined,
    }));

  return {
    ...transformToLexicalUnit(entry),
    sourceRelations,
    targetRelations,
  };
}

/**
 * Transform Prisma entry to LexicalUnit
 */
function transformToLexicalUnit(entry: any): LexicalUnit {
  return {
    id: entry.code || entry.id.toString(),
    code: entry.code,
    legacy_id: entry.legacy_id,
    pos: entry.pos as PartOfSpeech,
    lemmas: entry.lemmas || [],
    src_lemmas: entry.src_lemmas || [],
    gloss: entry.gloss,
    lexfile: entry.lexfile,
    examples: entry.examples || [],
    isMwe: entry.is_mwe ?? undefined,
    flagged: entry.flagged ?? undefined,
    flaggedReason: entry.flagged_reason ?? undefined,
    verifiable: entry.verifiable ?? undefined,
    unverifiableReason: entry.unverifiable_reason ?? undefined,
    legal_gloss: entry.legal_gloss ?? undefined,
    deleted: entry.deleted ?? undefined,
    frame_id: entry.frame_id?.toString() ?? null,
    frame: entry.frames ? {
      id: entry.frames.id.toString(),
      label: entry.frames.label,
      code: entry.frames.code,
      definition: entry.frames.definition,
      short_definition: entry.frames.short_definition,
      createdAt: new Date(),
      updatedAt: new Date(),
    } : null,
    createdAt: entry.created_at ?? new Date(),
    updatedAt: entry.updated_at ?? new Date(),
    version: entry.version ?? 1,
    
    // Verb-specific
    vendler_class: entry.vendler_class as VendlerClass | null,
    created_from: entry.created_from || [],
    
    // Noun-specific
    countable: entry.countable ?? undefined,
    proper: entry.proper ?? undefined,
    collective: entry.collective ?? undefined,
    concrete: entry.concrete ?? undefined,
    predicate: entry.predicate ?? undefined,
    
    // Adjective-specific
    isSatellite: entry.is_satellite ?? undefined,
    predicative: entry.predicative ?? undefined,
    attributive: entry.attributive ?? undefined,
    subjective: entry.subjective ?? undefined,
    relational: entry.relational ?? undefined,
    
    // Adjective/Adverb
    gradable: entry.gradable ?? undefined,
  };
}

// ============================================
// Search Operations
// ============================================

/**
 * Search lexical units by query
 */
export async function searchLexicalUnits(
  query: string,
  limit = 20,
  pos?: PartOfSpeech | PartOfSpeech[]
): Promise<SearchResult[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const searchTerm = query.trim().toLowerCase();
  
  const whereClause: Prisma.lexical_unitsWhereInput = {
    deleted: false,
    OR: [
      { gloss: { contains: searchTerm, mode: 'insensitive' } },
      { lemmas: { hasSome: [searchTerm] } },
      { src_lemmas: { hasSome: [searchTerm] } },
      { code: { contains: searchTerm, mode: 'insensitive' } },
    ],
  };

  // Add POS filter if provided
  if (pos) {
    const posArray = Array.isArray(pos) ? pos : [pos];
    whereClause.pos = { in: posArray as part_of_speech[] };
  }

  const entries = await withRetry(
    () => prisma.lexical_units.findMany({
      where: whereClause,
      take: limit,
      orderBy: [
        { lemmas: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        code: true,
        legacy_id: true,
        lemmas: true,
        src_lemmas: true,
        gloss: true,
        pos: true,
      },
    }),
    undefined,
    `searchLexicalUnits(${query})`
  );

  return entries.map((entry, index) => ({
    id: entry.code || entry.id.toString(),
    numericId: entry.id.toString(),
    legacy_id: entry.legacy_id,
    lemmas: entry.lemmas,
    src_lemmas: entry.src_lemmas,
    gloss: entry.gloss,
    pos: entry.pos,
    rank: index + 1,
  }));
}

/**
 * @deprecated Use searchLexicalUnits
 */
export const searchEntries = searchLexicalUnits;

// ============================================
// Graph Operations
// ============================================

/**
 * Fetch a single lexical unit by ID or code, including its full graph context
 * (parents, children, entails, causes, also_see, etc.) and frame roles.
 */
export async function getGraphNodeUncached(idOrCode: string): Promise<GraphNode | null> {
  const numericId = parseNumericEntryId(idOrCode);
  
  const whereClause: Prisma.lexical_unitsWhereInput = numericId
    ? { id: numericId, deleted: false }
    : { code: idOrCode, deleted: false };

  const entry = await withRetry(
    () => prisma.lexical_units.findFirst({
      where: whereClause,
      include: {
        frames: {
          include: {
            frame_roles: {
              include: {
                role_types: true,
              },
            },
            role_groups: {
              include: {
                role_group_members: true,
              },
            },
          },
        },
        lexical_unit_relations_lexical_unit_relations_source_idTolexical_units: {
          include: {
            lexical_units_lexical_unit_relations_target_idTolexical_units: true,
          },
        },
        lexical_unit_relations_lexical_unit_relations_target_idTolexical_units: {
          include: {
            lexical_units_lexical_unit_relations_source_idTolexical_units: true,
          },
        },
      },
    }),
    undefined,
    `getGraphNodeUncached(${idOrCode})`
  );

  if (!entry) return null;

  return transformToGraphNodeWithContext(entry);
}

/**
 * Cached wrapper for getGraphNode.
 */
export const getGraphNode = unstable_cache(
  async (id: string) => getGraphNodeUncached(id),
  ['graph-node'],
  { revalidate: 3600, tags: ['graph-node'] }
);

/**
 * Transform database entry to GraphNode with full context.
 */
function transformToGraphNodeWithContext(entry: any): GraphNode {
  const node = transformToGraphNode(entry);
  
  // Frame context
  if (entry.frames) {
    node.frame = {
      id: entry.frames.id.toString(),
      label: entry.frames.label,
      code: entry.frames.code,
      definition: entry.frames.definition,
      short_definition: entry.frames.short_definition,
      createdAt: entry.frames.created_at,
      updatedAt: entry.frames.updated_at,
      frame_roles: entry.frames.frame_roles.map((role: any) => ({
        id: role.id.toString(),
        description: role.description,
        notes: role.notes,
        main: role.main,
        examples: role.examples,
        example_sentence: role.examples?.[0] || '',
        label: role.label,
        role_type: {
          id: role.role_types.id.toString(),
          code: role.role_types.code,
          label: role.role_types.label,
          generic_description: role.role_types.generic_description,
          explanation: role.role_types.explanation,
        },
      })),
    };
    
    node.roles = node.frame.frame_roles;
    node.role_groups = entry.frames.role_groups.map((group: any) => ({
      id: group.id.toString(),
      description: group.description,
      role_ids: group.role_group_members.map((m: any) => m.role_id.toString()),
    }));
  }

  // Relations
  const sourceRelations = entry.lexical_unit_relations_lexical_unit_relations_source_idTolexical_units || [];
  const targetRelations = entry.lexical_unit_relations_lexical_unit_relations_target_idTolexical_units || [];

  // Parents are targets of 'hypernym' relations where we are the source
  node.parents = sourceRelations
    .filter((rel: any) => rel.type === 'hypernym')
    .map((rel: any) => transformToGraphNode(rel.lexical_units_lexical_unit_relations_target_idTolexical_units));

  // Children are sources of 'hypernym' relations where we are the target
  node.children = targetRelations
    .filter((rel: any) => rel.type === 'hypernym')
    .map((rel: any) => transformToGraphNode(rel.lexical_units_lexical_unit_relations_source_idTolexical_units));

  // Entails
  node.entails = sourceRelations
    .filter((rel: any) => rel.type === 'entails')
    .map((rel: any) => transformToGraphNode(rel.lexical_units_lexical_unit_relations_target_idTolexical_units));

  // Causes
  node.causes = sourceRelations
    .filter((rel: any) => rel.type === 'causes')
    .map((rel: any) => transformToGraphNode(rel.lexical_units_lexical_unit_relations_target_idTolexical_units));

  // Also See
  node.alsoSee = sourceRelations
    .filter((rel: any) => rel.type === 'also_see')
    .map((rel: any) => transformToGraphNode(rel.lexical_units_lexical_unit_relations_target_idTolexical_units));

  return node;
}

// ============================================
// Breadcrumb / Ancestor Path Operations
// ============================================

/**
 * Fetch ancestor path (hypernym chain) for a lexical unit, ending at the root.
 * This is used for UI breadcrumbs.
 */
export async function getAncestorPathUncached(idOrCode: string): Promise<Array<{
  id: string; // code
  legacy_id: string;
  lemmas: string[];
  src_lemmas: string[];
  gloss: string;
}>> {
  const numericId = parseNumericEntryId(idOrCode);

  const start = await prisma.lexical_units.findFirst({
    where: numericId ? { id: numericId, deleted: false } : { code: idOrCode, deleted: false },
    select: { id: true, code: true, legacy_id: true, lemmas: true, src_lemmas: true, gloss: true },
  });

  if (!start) return [];

  const path: Array<{
    id: string;
    legacy_id: string;
    lemmas: string[];
    src_lemmas: string[];
    gloss: string;
  }> = [];

  let currentId: bigint | null = start.id;
  const seen = new Set<string>();

  while (currentId) {
    if (seen.has(currentId.toString())) break;
    seen.add(currentId.toString());

    const node = await prisma.lexical_units.findUnique({
      where: { id: currentId },
      select: { id: true, code: true, legacy_id: true, lemmas: true, src_lemmas: true, gloss: true, deleted: true },
    });

    if (!node || node.deleted) break;

    path.push({
      id: node.code || node.id.toString(),
      legacy_id: node.legacy_id,
      lemmas: node.lemmas ?? [],
      src_lemmas: node.src_lemmas ?? [],
      gloss: node.gloss,
    });

    // Find parent via hypernym relation: source_id -> target_id
    const relation: { target_id: bigint } | null = await prisma.lexical_unit_relations.findFirst({
      where: { source_id: currentId, type: 'hypernym' },
      select: { target_id: true },
    });

    currentId = relation?.target_id ?? null;
  }

  // Breadcrumbs typically go from root -> leaf
  return path.reverse();
}

/**
 * Cached wrapper for ancestor path.
 */
export const getAncestorPath = unstable_cache(
  async (idOrCode: string) => getAncestorPathUncached(idOrCode),
  ['ancestor-path'],
  { revalidate: 3600, tags: ['breadcrumbs'] }
);

// ============================================
// Update Operations
// ============================================

/**
 * Update a lexical unit
 */
export async function updateEntry(
  id: string,
  updates: Partial<{
    gloss: string;
    lemmas: string[];
    src_lemmas: string[];
    examples: string[];
    flagged: boolean;
    flaggedReason: string;
    verifiable: boolean;
    unverifiableReason: string;
    vendler_class: VendlerClass | null;
    lexfile: string;
    frame_id: string | null;
    countable: boolean | null;
    proper: boolean;
    collective: boolean;
    concrete: boolean;
    predicate: boolean;
    is_mwe: boolean;
    is_satellite: boolean;
    gradable: boolean | null;
    predicative: boolean;
    attributive: boolean;
    subjective: boolean;
    relational: boolean;
  }>
): Promise<LexicalUnitWithRelations | null> {
  const numericId = parseNumericEntryId(id);
  
  const whereClause: Prisma.lexical_unitsWhereUniqueInput = numericId
    ? { id: numericId }
    : { code: id };

  // Map updates to database column names
  const dbUpdates: Prisma.lexical_unitsUpdateInput = {};
  
  if (updates.gloss !== undefined) dbUpdates.gloss = updates.gloss;
  if (updates.lemmas !== undefined) dbUpdates.lemmas = updates.lemmas;
  if (updates.src_lemmas !== undefined) dbUpdates.src_lemmas = updates.src_lemmas;
  if (updates.examples !== undefined) dbUpdates.examples = updates.examples;
  if (updates.flagged !== undefined) dbUpdates.flagged = updates.flagged;
  if (updates.flaggedReason !== undefined) dbUpdates.flagged_reason = updates.flaggedReason;
  if (updates.verifiable !== undefined) dbUpdates.verifiable = updates.verifiable;
  if (updates.unverifiableReason !== undefined) dbUpdates.unverifiable_reason = updates.unverifiableReason;
  if (updates.vendler_class !== undefined) dbUpdates.vendler_class = updates.vendler_class;
  if (updates.lexfile !== undefined) dbUpdates.lexfile = updates.lexfile;
  if (updates.countable !== undefined) dbUpdates.countable = updates.countable;
  if (updates.proper !== undefined) dbUpdates.proper = updates.proper;
  if (updates.collective !== undefined) dbUpdates.collective = updates.collective;
  if (updates.concrete !== undefined) dbUpdates.concrete = updates.concrete;
  if (updates.predicate !== undefined) dbUpdates.predicate = updates.predicate;
  if (updates.is_mwe !== undefined) dbUpdates.is_mwe = updates.is_mwe;
  if (updates.is_satellite !== undefined) dbUpdates.is_satellite = updates.is_satellite;
  if (updates.gradable !== undefined) dbUpdates.gradable = updates.gradable;
  if (updates.predicative !== undefined) dbUpdates.predicative = updates.predicative;
  if (updates.attributive !== undefined) dbUpdates.attributive = updates.attributive;
  if (updates.subjective !== undefined) dbUpdates.subjective = updates.subjective;
  if (updates.relational !== undefined) dbUpdates.relational = updates.relational;
  
  // Handle frame_id
  if (updates.frame_id !== undefined) {
    if (updates.frame_id === null) {
      dbUpdates.frames = { disconnect: true };
    } else {
      dbUpdates.frames = { connect: { id: BigInt(updates.frame_id) } };
    }
  }

  dbUpdates.updated_at = new Date();

  try {
    await prisma.lexical_units.update({
      where: whereClause,
      data: dbUpdates,
    });

    return getEntryById(id);
  } catch (error) {
    console.error('Error updating entry:', error);
    return null;
  }
}

/**
 * Delete a lexical unit (soft delete)
 */
export async function deleteEntry(code: string): Promise<LexicalUnitWithRelations | null> {
  const entry = await getEntryById(code);
  if (!entry) return null;

  const numericId = parseNumericEntryId(code);
  const whereClause: Prisma.lexical_unitsWhereUniqueInput = numericId
    ? { id: numericId }
    : { code };

  await prisma.lexical_units.update({
    where: whereClause,
    data: {
      deleted: true,
      deleted_at: new Date(),
    },
  });

  return entry;
}

// ============================================
// Flag Operations
// ============================================

/**
 * Update flag status for multiple entries
 */
export async function updateFlagStatus(
  ids: string[],
  updates: {
    flagged?: boolean;
    flaggedReason?: string;
    verifiable?: boolean;
    unverifiableReason?: string;
  }
): Promise<{ success: boolean; updatedCount: number }> {
  const dbUpdates: Prisma.lexical_unitsUpdateInput = {};
  
  if (updates.flagged !== undefined) dbUpdates.flagged = updates.flagged;
  if (updates.flaggedReason !== undefined) dbUpdates.flagged_reason = updates.flaggedReason;
  if (updates.verifiable !== undefined) dbUpdates.verifiable = updates.verifiable;
  if (updates.unverifiableReason !== undefined) dbUpdates.unverifiable_reason = updates.unverifiableReason;
  dbUpdates.updated_at = new Date();

  // Convert codes to IDs
  const entries = await prisma.lexical_units.findMany({
    where: {
      OR: ids.map(id => {
        const numericId = parseNumericEntryId(id);
        return numericId ? { id: numericId } : { code: id };
      }),
    },
    select: { id: true },
  });

  const numericIds = entries.map(e => e.id);

  const result = await prisma.lexical_units.updateMany({
    where: { id: { in: numericIds } },
    data: dbUpdates,
  });

  return {
    success: true,
    updatedCount: result.count,
  };
}

/**
 * Update frame for multiple entries
 */
export async function updateFramesForEntries(
  ids: string[],
  frameId: string | null
): Promise<{ success: boolean; updatedCount: number }> {
  // Convert codes to IDs
  const entries = await prisma.lexical_units.findMany({
    where: {
      OR: ids.map(id => {
        const numericId = parseNumericEntryId(id);
        return numericId ? { id: numericId } : { code: id };
      }),
    },
    select: { id: true },
  });

  const numericIds = entries.map(e => e.id);

  const result = await prisma.lexical_units.updateMany({
    where: { id: { in: numericIds } },
    data: {
      frame_id: frameId ? BigInt(frameId) : null,
      updated_at: new Date(),
    },
  });

  return {
    success: true,
    updatedCount: result.count,
  };
}

/**
 * @deprecated Use `updateFramesForEntries` (same behavior).
 */
export async function updateFramesForLexicalUnits(
  ids: string[],
  frameId: string | null
): Promise<{ success: boolean; updatedCount: number }> {
  return updateFramesForEntries(ids, frameId);
}

// ============================================
// Recipe Operations
// ============================================

/**
 * Get recipes for a lexical unit (via frame)
 */
export async function getRecipesForEntryInternal(entryId: string): Promise<EntryRecipes> {
  // Get the entry to find its frame
  const entry = await getEntryById(entryId);
  
  if (!entry || !entry.frame_id) {
    return { entryId, recipes: [] };
  }

  // Get recipes for the frame
  const recipes = await prisma.recipes.findMany({
    where: { frame_id: BigInt(entry.frame_id) },
    include: {
      recipe_predicates: {
        include: {
          frames: true,
          recipe_predicate_role_bindings: {
            include: {
              predicate_variable_types: true,
              recipe_variables: {
                include: {
                  lexical_units: true,
                },
              },
            },
          },
        },
        orderBy: { position: 'asc' },
      },
      recipe_predicate_relations: true,
      recipe_preconditions: true,
      recipe_variables: {
        include: {
          predicate_variable_types: true,
          lexical_units: true,
        },
      },
      logic_nodes_recipes_logic_root_node_idTologic_nodes: {
        include: {
          logic_targets: {
            include: {
              recipe_predicates: true,
            },
          },
          logic_edges_logic_edges_parent_node_idTologic_nodes: {
            include: {
              logic_nodes_logic_edges_child_node_idTologic_nodes: true,
            },
            orderBy: { position: 'asc' },
          },
        },
      },
    },
  });

  const transformedRecipes: Recipe[] = await Promise.all(
    recipes.map(async (recipe) => {
      // Transform predicates
      const predicates: RecipePredicateNode[] = await Promise.all(
        recipe.recipe_predicates.map(async (pred) => {
          // Get the lexical unit for this predicate's frame
          let lexicalEntry: GraphNode | null = null;
          if (pred.predicate_frame_id) {
            const lu = await prisma.lexical_units.findFirst({
              where: { frame_id: pred.predicate_frame_id },
              include: { frames: true },
            });
            if (lu) {
              lexicalEntry = transformToGraphNode(lu);
            }
          }

          const roleMappings: RecipePredicateRoleMapping[] = pred.recipe_predicate_role_bindings.map(binding => ({
            predicateRoleLabel: binding.predicate_role_id.toString(),
            bindKind: binding.bind_kind as 'variable' | 'constant',
            variableTypeLabel: binding.predicate_variable_types?.label,
            variableKey: binding.recipe_variables?.key,
            constant: binding.constant,
            discovered: binding.discovered ?? undefined,
            lexicalUnitCode: binding.recipe_variables?.lexical_units?.code ?? undefined,
          }));

          return {
            id: pred.id.toString(),
            alias: pred.alias,
            position: pred.position,
            example: pred.example,
            lexical: lexicalEntry || createEmptyGraphNode(),
            roleMappings,
          };
        })
      );

      // Transform relations
      const relations = recipe.recipe_predicate_relations.map(rel => ({
        sourcePredicateId: rel.source_recipe_predicate_id.toString(),
        targetPredicateId: rel.target_recipe_predicate_id.toString(),
        relation_type: 'causes' as const, // Default, could be enhanced
      }));

      // Transform preconditions
      const preconditions = recipe.recipe_preconditions.map(pre => ({
        id: pre.id.toString(),
        condition_type: pre.condition_type,
        target_recipe_predicate_id: pre.target_recipe_predicate_id?.toString() ?? null,
        condition_params: pre.condition_params,
        description: pre.description,
        error_message: pre.error_message,
      }));

      // Transform variables
      const variables = recipe.recipe_variables.map(v => ({
        id: v.id.toString(),
        key: v.key,
        predicate_variable_type_label: v.predicate_variable_types?.label ?? null,
        lexical_unit_id: v.lexical_unit_id?.toString() ?? null,
        lexical_unit_code: v.lexical_units?.code ?? null,
        lexical_unit_gloss: v.lexical_units?.gloss ?? null,
        default_value: v.default_value,
      }));

      // Transform logic tree
      let logicRoot: LogicNode | null = null;
      if (recipe.logic_nodes_recipes_logic_root_node_idTologic_nodes) {
        logicRoot = transformLogicNode(recipe.logic_nodes_recipes_logic_root_node_idTologic_nodes, predicates);
      }

      return {
        id: recipe.id.toString(),
        label: recipe.label,
        description: recipe.description,
        example: recipe.example,
        is_default: recipe.is_default,
        predicates,
        predicate_groups: [],
        relations,
        preconditions,
        variables,
        logic_root: logicRoot,
      };
    })
  );

  return {
    entryId,
    recipes: transformedRecipes,
  };
}

function transformLogicNode(node: any, predicates: RecipePredicateNode[]): LogicNode {
  const children: LogicNode[] = (node.logic_edges_logic_edges_parent_node_idTologic_nodes || [])
    .map((edge: any) => transformLogicNode(edge.logic_nodes_logic_edges_child_node_idTologic_nodes, predicates));

  const targetPredicate = node.logic_targets?.recipe_predicate_id
    ? predicates.find(p => p.id === node.logic_targets.recipe_predicate_id.toString())
    : null;

  return {
    id: node.id.toString(),
    recipe_id: node.recipe_id.toString(),
    kind: node.kind as LogicNodeKind,
    description: node.description,
    target_predicate_id: node.logic_targets?.recipe_predicate_id?.toString() ?? null,
    target_predicate: targetPredicate ?? null,
    children,
  };
}

function transformToGraphNode(entry: any): GraphNode {
  return {
    id: entry.code || entry.id.toString(),
    numericId: entry.id.toString(),
    legacy_id: entry.legacy_id,
    lemmas: entry.lemmas || [],
    src_lemmas: entry.src_lemmas || [],
    gloss: entry.gloss,
    legal_gloss: entry.legal_gloss,
    pos: entry.pos,
    lexfile: entry.lexfile,
    examples: entry.examples || [],
    flagged: entry.flagged ?? undefined,
    flaggedReason: entry.flagged_reason ?? undefined,
    verifiable: entry.verifiable ?? undefined,
    unverifiableReason: entry.unverifiable_reason ?? undefined,
    vendler_class: entry.vendler_class,
    frame_id: entry.frame_id?.toString() ?? null,
    frame: entry.frames ? {
      id: entry.frames.id.toString(),
      label: entry.frames.label,
      code: entry.frames.code,
      definition: entry.frames.definition,
      short_definition: entry.frames.short_definition,
      createdAt: new Date(),
      updatedAt: new Date(),
    } : null,
    countable: entry.countable ?? undefined,
    proper: entry.proper ?? undefined,
    collective: entry.collective ?? undefined,
    concrete: entry.concrete ?? undefined,
    predicate: entry.predicate ?? undefined,
    isSatellite: entry.is_satellite ?? undefined,
    gradable: entry.gradable ?? undefined,
    predicative: entry.predicative ?? undefined,
    attributive: entry.attributive ?? undefined,
    subjective: entry.subjective ?? undefined,
    relational: entry.relational ?? undefined,
    isMwe: entry.is_mwe ?? undefined,
    parents: [],
    children: [],
    entails: [],
    causes: [],
    alsoSee: [],
  };
}

function createEmptyGraphNode(): GraphNode {
  return {
    id: '',
    numericId: '',
    legacy_id: '',
    lemmas: [],
    src_lemmas: [],
    gloss: '',
    pos: '',
    lexfile: '',
    examples: [],
    parents: [],
    children: [],
    entails: [],
    causes: [],
    alsoSee: [],
  };
}

// ============================================
// Frame Operations
// ============================================

/**
 * Get paginated frames
 */
export async function getPaginatedFrames(
  params: FramePaginationParams = {}
): Promise<PaginatedResult<Frame>> {
  const {
    page = 1,
    limit = 10,
    sortBy = 'label',
    sortOrder = 'asc',
    search,
    label,
    code,
    definition,
    short_definition,
    createdAfter,
    createdBefore,
    updatedAfter,
    updatedBefore,
    isSuperFrame,
    super_frame_id,
  } = params;

  const skip = (page - 1) * limit;
  const conditions: Prisma.framesWhereInput[] = [];

  // Filter out deleted frames
  conditions.push({ deleted: false });

  // Search
  if (search) {
    conditions.push({
      OR: [
        { label: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { definition: { contains: search, mode: 'insensitive' } },
        { short_definition: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  // Text filters
  if (label) conditions.push({ label: { contains: label, mode: 'insensitive' } });
  if (code) conditions.push({ code: { contains: code, mode: 'insensitive' } });
  if (definition) conditions.push({ definition: { contains: definition, mode: 'insensitive' } });
  if (short_definition) conditions.push({ short_definition: { contains: short_definition, mode: 'insensitive' } });

  // Date filters
  if (createdAfter) conditions.push({ created_at: { gte: new Date(createdAfter) } });
  if (createdBefore) conditions.push({ created_at: { lte: new Date(createdBefore + 'T23:59:59.999Z') } });
  if (updatedAfter) conditions.push({ updated_at: { gte: new Date(updatedAfter) } });
  if (updatedBefore) conditions.push({ updated_at: { lte: new Date(updatedBefore + 'T23:59:59.999Z') } });

  if (isSuperFrame === 'true') {
    conditions.push({ super_frame_id: null });
  } else if (isSuperFrame === 'false') {
    conditions.push({ super_frame_id: { not: null } });
  }

  if (super_frame_id) {
    conditions.push({ super_frame_id: BigInt(super_frame_id) });
  }

  const whereClause: Prisma.framesWhereInput = conditions.length > 0 ? { AND: conditions } : {};

  // Build order clause
  const orderBy: Prisma.framesOrderByWithRelationInput = {};
  (orderBy as Record<string, 'asc' | 'desc'>)[sortBy] = sortOrder;

  // Get total count
  const total = await prisma.frames.count({ where: whereClause });

  // Get frames with counts
  const frames = await prisma.frames.findMany({
    where: whereClause,
    skip,
    take: limit,
    orderBy,
    include: {
      frame_roles: {
        include: {
          role_types: true,
        },
      },
      _count: {
        select: {
          frame_roles: true,
          lexical_units: true,
          other_frames: true,
        },
      },
    },
  });

  // Transform to Frame type
  const data: Frame[] = frames.map(frame => ({
    id: frame.id.toString(),
    label: frame.label,
    definition: frame.definition,
    short_definition: frame.short_definition,
    code: frame.code,
    flagged: frame.flagged ?? undefined,
    flaggedReason: frame.flagged_reason ?? undefined,
    verifiable: frame.verifiable ?? undefined,
    unverifiableReason: frame.unverifiable_reason ?? undefined,
    createdAt: frame.created_at,
    updatedAt: frame.updated_at,
    roles_count: frame._count.frame_roles,
    lexical_units_count: frame._count.lexical_units,
    subframes_count: frame._count.other_frames,
    frame_roles: frame.frame_roles.map(role => ({
      id: role.id.toString(),
      description: role.description,
      notes: role.notes,
      main: role.main,
      examples: role.examples,
      label: role.label,
      role_type: {
        id: role.role_types.id.toString(),
        code: role.role_types.code,
        label: role.role_types.label,
        generic_description: role.role_types.generic_description,
        explanation: role.role_types.explanation,
      },
    })),
  }));

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

// ============================================
// Cache Invalidation
// ============================================

export function revalidateGraphNodeCache() {
  revalidateTag('graph-node');
}

export function revalidateAllEntryCaches() {
  revalidateTag('graph-node');
  revalidateTag('entries');
  revalidateTag('frames');
}

/**
 * @deprecated Use `revalidateAllEntryCaches` (same behavior).
 */
export function revalidateAllUnitCaches() {
  return revalidateAllEntryCaches();
}

// ============================================
// Legacy Exports (for backward compatibility)
// ============================================

// These functions now delegate to the unified implementation
export async function getPaginatedEntries(params: PaginationParams = {}): Promise<PaginatedResult<TableEntry>> {
  const { getPaginatedLexicalUnits } = await import('@/lib/db/entities');
  return getPaginatedLexicalUnits({ ...params, pos: 'verb' }) as any;
}

export async function getPaginatedNouns(params: PaginationParams = {}): Promise<PaginatedResult<TableEntry>> {
  const { getPaginatedLexicalUnits } = await import('@/lib/db/entities');
  return getPaginatedLexicalUnits({ ...params, pos: 'noun' }) as any;
}

export async function getPaginatedAdjectives(params: PaginationParams = {}): Promise<PaginatedResult<TableEntry>> {
  const { getPaginatedLexicalUnits } = await import('@/lib/db/entities');
  return getPaginatedLexicalUnits({ ...params, pos: 'adjective' }) as any;
}

export async function getPaginatedAdverbs(params: PaginationParams = {}): Promise<PaginatedResult<TableEntry>> {
  const { getPaginatedLexicalUnits } = await import('@/lib/db/entities');
  return getPaginatedLexicalUnits({ ...params, pos: 'adverb' }) as any;
}
