import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { translateFilterASTToPrisma } from '@/lib/filters/translate';
import type { BooleanFilterGroup } from '@/lib/filters/types';
import { sortRolesByPrecedence } from '@/lib/types';
import type { 
  JobScope, 
  LexicalEntrySummary, 
  PartOfSpeech, 
  FrameRoleData, 
  FrameVerbData, 
  FrameNounData,
  FrameRelationData 
} from './types';

/**
 * Build structured frame data for template loops.
 * This provides both the flat 'frame.*' keys for simple interpolation
 * and the structured 'frame' object for loop iteration.
 */
function buildStructuredFrameData(frameRecord: {
  id: bigint;
  label: string;
  definition?: string | null;
  short_definition?: string | null;
  prototypical_synset: string;
  frame_roles?: Array<{
    id: bigint;
    description: string | null;
    notes: string | null;
    main: boolean | null;
    examples: string[] | null;
    label: string | null;
    role_types: { label: string; code: string } | null;
  }>;
  verbs?: Array<{
    id: bigint;
    code: string;
    gloss: string;
    lemmas: string[];
    examples: string[];
    flagged: boolean | null;
  }>;
  nouns?: Array<{
    id: bigint;
    code: string;
    gloss: string;
    lemmas: string[];
    examples: string[];
    flagged: boolean | null;
  }>;
}): { additional: Record<string, unknown>; frame: FrameRelationData } {
  // Build structured roles array
  const roles: FrameRoleData[] = sortRolesByPrecedence(
    (frameRecord.frame_roles ?? []).map(fr => ({
      role_type: fr.role_types ?? { label: '', code: '' },
      main: fr.main ?? false,
      description: fr.description ?? '',
      examples: fr.examples ?? [],
      label: fr.label ?? '',
    }))
  ).map(fr => ({
    type: fr.role_type.label,
    code: fr.role_type.code,
    description: fr.description,
    examples: fr.examples,
    label: fr.label,
    main: fr.main,
  }));

  // Build structured verbs array
  const verbs: FrameVerbData[] = (frameRecord.verbs ?? []).map(v => ({
    code: v.code,
    gloss: v.gloss,
    lemmas: v.lemmas,
    examples: v.examples,
    flagged: v.flagged ?? false,
  }));

  // Build structured nouns array
  const nouns: FrameNounData[] = (frameRecord.nouns ?? []).map(n => ({
    code: n.code,
    gloss: n.gloss,
    lemmas: n.lemmas,
    examples: n.examples,
    flagged: n.flagged ?? false,
  }));

  // Build flat additional data for backward compatibility with {{frame.roles}} etc.
  const additional: Record<string, unknown> = {
    'frame.id': frameRecord.id.toString(),
    'frame.label': frameRecord.label,
    'frame.definition': frameRecord.definition,
    'frame.short_definition': frameRecord.short_definition,
    'frame.prototypical_synset': frameRecord.prototypical_synset,
    // Legacy format for {{frame.roles}} - formatted string
    'frame.roles': roles.map(fr => {
      const examples = fr.examples.length > 0 ? fr.examples.join(', ') : '';
      return `**${fr.type}**: ${fr.description}${examples ? ` (e.g. ${examples})` : ''}${fr.label ? `; ${fr.label}` : ''}`;
    }).join('\n'),
  };

  // Build structured frame object for loop iteration
  const frame: FrameRelationData = {
    id: frameRecord.id.toString(),
    label: frameRecord.label,
    definition: frameRecord.definition,
    short_definition: frameRecord.short_definition,
    prototypical_synset: frameRecord.prototypical_synset,
    roles,
    verbs,
    nouns,
  };

  return { additional, frame };
}

/**
 * Fetch lexical entries based on job scope configuration.
 * Dispatches to the appropriate fetcher based on scope kind.
 */
export async function fetchEntriesForScope(scope: JobScope): Promise<LexicalEntrySummary[]> {
  switch (scope.kind) {
    case 'ids':
      return fetchEntriesByIds(scope.pos, scope.ids);
    case 'frame_ids':
      return fetchEntriesByFrameIds(scope.frameIds, scope.pos, scope.includeVerbs, scope.offset, scope.limit);
    case 'filters':
      return fetchEntriesByFilters(scope.pos, scope.filters);
    default:
      return [];
  }
}

/**
 * Fetch entries by their lexical codes (e.g., say.v.01).
 */
async function fetchEntriesByIds(pos: PartOfSpeech, ids: string[]): Promise<LexicalEntrySummary[]> {
  if (ids.length === 0) return [];

  const uniqueIds = Array.from(new Set(ids));
  let entries: LexicalEntrySummary[] = [];

  if (pos === 'verbs') {
    const records = await prisma.verbs.findMany({
      where: { code: { in: uniqueIds } },
      select: {
        id: true,
        code: true,
        gloss: true,
        lemmas: true,
        examples: true,
        flagged: true,
        flagged_reason: true,
        lexfile: true,
        frames: {
          select: {
            id: true,
            label: true,
            definition: true,
            short_definition: true,
            prototypical_synset: true,
            frame_roles: {
              select: {
                id: true,
                description: true,
                notes: true,
                main: true,
                examples: true,
                label: true,
                role_types: {
                  select: {
                    label: true,
                    code: true,
                  },
                },
              },
            },
            // Include other verbs in the same frame for loop iteration
            verbs: {
              where: { deleted: false },
              select: {
                id: true,
                code: true,
                gloss: true,
                lemmas: true,
                examples: true,
                flagged: true,
              },
              take: 100, // Limit to prevent huge payloads
            },
            // Include nouns in the same frame for loop iteration
            nouns: {
              where: { deleted: false },
              select: {
                id: true,
                code: true,
                gloss: true,
                lemmas: true,
                examples: true,
                flagged: true,
              },
              take: 100, // Limit to prevent huge payloads
            },
          },
        },
      },
    });

    const byCode = new Map(records.map(record => [record.code, record]));
    entries = uniqueIds
      .map(code => byCode.get(code))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => {
        const rec = record as typeof records[number];
        
        // Build structured frame data if frame exists
        const frameInfo = rec.frames 
          ? buildStructuredFrameData(rec.frames)
          : { additional: {}, frame: null };

        return {
          dbId: rec.id,
          code: rec.code,
          pos,
          gloss: rec.gloss,
          lemmas: rec.lemmas,
          examples: rec.examples,
          flagged: rec.flagged,
          flagged_reason: rec.flagged_reason,
          label: rec.frames?.label ?? null,
          lexfile: rec.lexfile,
          additional: frameInfo.additional,
          frame: frameInfo.frame,
        };
      });
  } else if (pos === 'nouns') {
    const records = await prisma.nouns.findMany({
      where: { code: { in: uniqueIds } },
      select: {
        id: true,
        code: true,
        gloss: true,
        lemmas: true,
        examples: true,
        flagged: true,
        flagged_reason: true,
        lexfile: true,
      },
    });
    const byCode = new Map(records.map(record => [record.code, record]));
    entries = uniqueIds
      .map(code => byCode.get(code))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => ({
        dbId: record.id,
        code: record.code,
        pos,
        gloss: record.gloss,
        lemmas: record.lemmas,
        examples: record.examples,
        flagged: record.flagged,
        flagged_reason: record.flagged_reason,
        lexfile: record.lexfile,
      }));
  } else if (pos === 'adjectives') {
    const records = await prisma.adjectives.findMany({
      where: { code: { in: uniqueIds } },
      select: {
        id: true,
        code: true,
        gloss: true,
        lemmas: true,
        examples: true,
        flagged: true,
        flagged_reason: true,
        lexfile: true,
      },
    });
    const byCode = new Map(records.map(record => [record.code, record]));
    entries = uniqueIds
      .map(code => byCode.get(code))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => ({
        dbId: record.id,
        code: record.code,
        pos,
        gloss: record.gloss,
        lemmas: record.lemmas,
        examples: record.examples,
        flagged: record.flagged,
        flagged_reason: record.flagged_reason,
        lexfile: record.lexfile,
      }));
  } else if (pos === 'adverbs') {
    const records = await prisma.adverbs.findMany({
      where: { code: { in: uniqueIds } },
      select: {
        id: true,
        code: true,
        gloss: true,
        lemmas: true,
        examples: true,
        flagged: true,
        flagged_reason: true,
        lexfile: true,
      },
    });
    const byCode = new Map(records.map(record => [record.code, record]));
    entries = uniqueIds
      .map(code => byCode.get(code))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => ({
        dbId: record.id,
        code: record.code,
        pos,
        gloss: record.gloss,
        lemmas: record.lemmas,
        examples: record.examples,
        flagged: record.flagged,
        flagged_reason: record.flagged_reason,
        lexfile: record.lexfile,
      }));
  } else if (pos === 'frames') {
    const records = await prisma.frames.findMany({
      where: { id: { in: uniqueIds.map(id => BigInt(id)) } },
      select: {
        id: true,
        label: true,
        definition: true,
        short_definition: true,
        prototypical_synset: true,
        flagged: true,
        flagged_reason: true,
        verifiable: true,
        unverifiable_reason: true,
        frame_roles: {
          select: {
            id: true,
            description: true,
            notes: true,
            main: true,
            examples: true,
            label: true,
            role_types: {
              select: {
                label: true,
                code: true,
              },
            },
          },
        },
        verbs: {
          where: { deleted: false },
          select: {
            id: true,
            code: true,
            gloss: true,
            lemmas: true,
            examples: true,
            flagged: true,
          },
          take: 100,
        },
        nouns: {
          where: { deleted: false },
          select: {
            id: true,
            code: true,
            gloss: true,
            lemmas: true,
            examples: true,
            flagged: true,
          },
          take: 100,
        },
      },
    });
    const byId = new Map(records.map(record => [record.id.toString(), record]));
    entries = uniqueIds
      .map(id => byId.get(id))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => {
        // Build structured data for the frame's relations
        const frameInfo = buildStructuredFrameData(record);
        
        return {
          dbId: record.id,
          code: record.id.toString(),
          pos,
          gloss: record.definition ?? '',
          lemmas: [], // Frames don't have lemmas
          examples: [], // Frames don't have examples
          label: record.label,
          definition: record.definition,
          short_definition: record.short_definition,
          prototypical_synset: record.prototypical_synset,
          flagged: record.flagged,
          flagged_reason: record.flagged_reason,
          verifiable: record.verifiable,
          unverifiable_reason: record.unverifiable_reason,
          // Include structured relations for loop iteration
          roles: frameInfo.frame.roles,
          verbs: frameInfo.frame.verbs,
          nouns: frameInfo.frame.nouns,
        };
      });
  }

  return entries;
}

/**
 * Fetch entries by frame IDs, optionally including associated verbs.
 */
async function fetchEntriesByFrameIds(
  frameIds: string[], 
  pos?: PartOfSpeech, 
  includeVerbs?: boolean,
  offset?: number,
  limit?: number
): Promise<LexicalEntrySummary[]> {
  if (frameIds.length === 0) return [];

  const frames = await prisma.frames.findMany({
    where: {
      id: { in: frameIds.filter(id => id.match(/^\d+$/)).map(id => BigInt(id)) }
    },
    select: {
      id: true,
      label: true,
      definition: true,
      short_definition: true,
      prototypical_synset: true,
      flagged: true,
      flagged_reason: true,
      verifiable: true,
      unverifiable_reason: true,
      frame_roles: {
        select: {
          id: true,
          description: true,
          notes: true,
          main: true,
          examples: true,
          label: true,
          role_types: {
            select: {
              label: true,
              code: true,
            },
          },
        },
      },
      verbs: {
        where: { deleted: false },
        select: {
          id: true,
          code: true,
          gloss: true,
          lemmas: true,
          examples: true,
          flagged: true,
          flagged_reason: true,
          lexfile: true,
        },
        take: 100,
      },
      nouns: {
        where: { deleted: false },
        select: {
          id: true,
          code: true,
          gloss: true,
          lemmas: true,
          examples: true,
          flagged: true,
        },
        take: 100,
      },
    },
  });

  const entries: LexicalEntrySummary[] = [];
  
  // If targeting frames directly
  if (!includeVerbs || pos === 'frames') {
    for (const frame of frames) {
      const frameInfo = buildStructuredFrameData(frame);
      entries.push({
        dbId: frame.id,
        code: frame.id.toString(),
        pos: 'frames',
        gloss: frame.definition ?? '',
        lemmas: [],
        examples: [],
        label: frame.label,
        definition: frame.definition,
        short_definition: frame.short_definition,
        prototypical_synset: frame.prototypical_synset,
        flagged: frame.flagged,
        flagged_reason: frame.flagged_reason,
        verifiable: frame.verifiable,
        unverifiable_reason: frame.unverifiable_reason,
        // Include structured relations for loop iteration
        roles: frameInfo.frame.roles,
        verbs: frameInfo.frame.verbs,
        nouns: frameInfo.frame.nouns,
      });
    }
  }
  
  // If including verbs
  if (includeVerbs && frames.length > 0) {
    for (const frame of frames) {
      const frameInfo = buildStructuredFrameData(frame);
      
      for (const verb of frame.verbs) {
        entries.push({
          dbId: verb.id,
          code: verb.code,
          pos: 'verbs',
          gloss: verb.gloss,
          lemmas: verb.lemmas,
          examples: verb.examples,
          flagged: verb.flagged,
          flagged_reason: verb.flagged_reason,
          label: frame.label,
          lexfile: verb.lexfile,
          additional: frameInfo.additional,
          frame: frameInfo.frame,
        });
      }
    }
  }

  // Apply offset and limit if provided
  if (offset !== undefined || limit !== undefined) {
    const start = offset ?? 0;
    const end = limit !== undefined ? start + limit : entries.length;
    return entries.slice(start, end);
  }

  return entries;
}

/**
 * Fetch entries using boolean filter AST.
 */
async function fetchEntriesByFilters(pos: PartOfSpeech, filters: { limit?: number; offset?: number; where?: BooleanFilterGroup | undefined } | Record<string, unknown>): Promise<LexicalEntrySummary[]> {
  // Backward compatibility: if filters is a plain object without 'where', try to use it as simple fields
  const limit = typeof (filters as { limit?: unknown }).limit === 'number' ? Number((filters as { limit?: number }).limit) : undefined;
  const offset = typeof (filters as { offset?: unknown }).offset === 'number' ? Number((filters as { offset?: number }).offset) : undefined;
  const ast = (filters as { where?: BooleanFilterGroup }).where as BooleanFilterGroup | undefined;
  const { where, computedFilters } = await translateFilterASTToPrisma(pos, ast);

  if (pos === 'verbs') {
    // limit=0 means fetch all, undefined means use default of 50
    const takeArg = limit === 0 ? undefined : (limit ?? 50);
    const skipArg = offset;
    
    // Ensure deleted filter is always applied
    const verbsWhere = where as Prisma.verbsWhereInput;
    const finalWhere: Prisma.verbsWhereInput = {
      ...verbsWhere,
      AND: [
        verbsWhere,
        {
          deleted: false
        }
      ]
    };
    
    const records = await prisma.verbs.findMany({
      where: finalWhere,
      take: takeArg,
      skip: skipArg,
      orderBy: { id: 'asc' }, // Ensure deterministic ordering for consistent previews
      include: {
        _count: {
          select: {
            verb_relations_verb_relations_source_idToverbs: { where: { type: 'hypernym' } },
            verb_relations_verb_relations_target_idToverbs: { where: { type: 'hypernym' } },
          },
        },
        frames: {
          select: {
            id: true,
            label: true,
            definition: true,
            short_definition: true,
            prototypical_synset: true,
            frame_roles: {
              select: {
                id: true,
                description: true,
                notes: true,
                main: true,
                examples: true,
                label: true,
                role_types: {
                  select: {
                    label: true,
                    code: true,
                  },
                },
              },
            },
            // Include other verbs in the same frame for loop iteration
            verbs: {
              where: { deleted: false },
              select: {
                id: true,
                code: true,
                gloss: true,
                lemmas: true,
                examples: true,
                flagged: true,
              },
              take: 100,
            },
            // Include nouns in the same frame for loop iteration
            nouns: {
              where: { deleted: false },
              select: {
                id: true,
                code: true,
                gloss: true,
                lemmas: true,
                examples: true,
                flagged: true,
              },
              take: 100,
            },
          },
        },
      },
    });

    let entries = records.map(record => {
      // Build structured frame data if frame exists
      const frameInfo = record.frames 
        ? buildStructuredFrameData(record.frames)
        : { additional: {}, frame: null };

      return {
        dbId: record.id,
        code: record.code,
        pos,
        gloss: record.gloss,
        lemmas: record.lemmas,
        examples: record.examples,
        flagged: record.flagged ?? undefined,
        flagged_reason: record.flagged_reason ?? null,
        label: record.frames?.label ?? null,
        lexfile: record.lexfile,
        additional: frameInfo.additional,
        frame: frameInfo.frame,
        // temporary attachment for filtering only
        _parentsCount: record._count?.verb_relations_verb_relations_source_idToverbs ?? 0,
        _childrenCount: record._count?.verb_relations_verb_relations_target_idToverbs ?? 0,
      };
    }) as Array<LexicalEntrySummary & { _parentsCount: number; _childrenCount: number }>;

    // Apply computed filters on counts
    for (const cf of computedFilters) {
      const field = cf.field === 'parentsCount' ? '_parentsCount' : '_childrenCount';
      entries = entries.filter(e => compareNumber((e as any)[field] as number, cf.operator, cf.value, cf.value2));
    }

    // Strip temporary fields
    return entries.map(entry => {
      const { _parentsCount, _childrenCount, ...rest } = entry;
      void _parentsCount;
      void _childrenCount;
      return rest;
    });
  }

  if (pos === 'nouns') {
    // limit=0 means fetch all, undefined means use default of 50
    const takeArg = limit === 0 ? undefined : (limit ?? 50);
    const skipArg = offset;
    const records = await prisma.nouns.findMany({
      where: where as Prisma.nounsWhereInput,
      take: takeArg,
      skip: skipArg,
      orderBy: { id: 'asc' }, // Ensure deterministic ordering for consistent previews
      select: {
        id: true,
        code: true,
        gloss: true,
        lemmas: true,
        examples: true,
        flagged: true,
        flagged_reason: true,
        lexfile: true,
      },
    });
    return records.map(record => ({
      dbId: record.id,
      code: record.code,
      pos,
      gloss: record.gloss,
      lemmas: record.lemmas,
      examples: record.examples,
      flagged: record.flagged,
      flagged_reason: record.flagged_reason,
      lexfile: record.lexfile,
    }));
  }

  if (pos === 'adjectives') {
    // limit=0 means fetch all, undefined means use default of 50
    const takeArg = limit === 0 ? undefined : (limit ?? 50);
    const skipArg = offset;
    const records = await prisma.adjectives.findMany({
      where: where as Prisma.adjectivesWhereInput,
      take: takeArg,
      skip: skipArg,
      orderBy: { id: 'asc' }, // Ensure deterministic ordering for consistent previews
      select: {
        id: true,
        code: true,
        gloss: true,
        lemmas: true,
        examples: true,
        flagged: true,
        flagged_reason: true,
        lexfile: true,
      },
    });
    return records.map(record => ({
      dbId: record.id,
      code: record.code,
      pos,
      gloss: record.gloss,
      lemmas: record.lemmas,
      examples: record.examples,
      flagged: record.flagged,
      flagged_reason: record.flagged_reason,
      lexfile: record.lexfile,
    }));
  }

  if (pos === 'adverbs') {
    // limit=0 means fetch all, undefined means use default of 50
    const takeArg = limit === 0 ? undefined : (limit ?? 50);
    const skipArg = offset;
    const records = await prisma.adverbs.findMany({
      where: where as Prisma.adverbsWhereInput,
      take: takeArg,
      skip: skipArg,
      orderBy: { id: 'asc' }, // Ensure deterministic ordering for consistent previews
      select: {
        id: true,
        code: true,
        gloss: true,
        lemmas: true,
        examples: true,
        flagged: true,
        flagged_reason: true,
        lexfile: true,
      },
    });
    return records.map(record => ({
      dbId: record.id,
      code: record.code,
      pos,
      gloss: record.gloss,
      lemmas: record.lemmas,
      examples: record.examples,
      flagged: record.flagged,
      flagged_reason: record.flagged_reason,
      lexfile: record.lexfile,
    }));
  }

  if (pos === 'frames') {
    // limit=0 means fetch all, undefined means use default of 50
    const takeArg = limit === 0 ? undefined : (limit ?? 50);
    const skipArg = offset;
    const records = await prisma.frames.findMany({
      where: where as Prisma.framesWhereInput,
      take: takeArg,
      skip: skipArg,
      orderBy: { id: 'asc' }, // Ensure deterministic ordering for consistent previews
      select: {
        id: true,
        label: true,
        definition: true,
        short_definition: true,
        prototypical_synset: true,
        flagged: true,
        flagged_reason: true,
        verifiable: true,
        unverifiable_reason: true,
        frame_roles: {
          select: {
            id: true,
            description: true,
            notes: true,
            main: true,
            examples: true,
            label: true,
            role_types: {
              select: {
                label: true,
                code: true,
              },
            },
          },
        },
        verbs: {
          where: { deleted: false },
          select: {
            id: true,
            code: true,
            gloss: true,
            lemmas: true,
            examples: true,
            flagged: true,
          },
          take: 100,
        },
        nouns: {
          where: { deleted: false },
          select: {
            id: true,
            code: true,
            gloss: true,
            lemmas: true,
            examples: true,
            flagged: true,
          },
          take: 100,
        },
      },
    });
    return records.map(record => {
      const frameInfo = buildStructuredFrameData(record);
      return {
        dbId: record.id,
        code: record.id.toString(),
        pos,
        gloss: record.definition,
        lemmas: [] as string[],
        examples: [] as string[],
        label: record.label,
        definition: record.definition,
        short_definition: record.short_definition,
        prototypical_synset: record.prototypical_synset,
        flagged: record.flagged,
        flagged_reason: record.flagged_reason,
        verifiable: record.verifiable,
        unverifiable_reason: record.unverifiable_reason,
        // Include structured relations for loop iteration
        roles: frameInfo.frame.roles,
        verbs: frameInfo.frame.verbs,
        nouns: frameInfo.frame.nouns,
      };
    }) as LexicalEntrySummary[];
  }

  return [];
}

/**
 * Compare a number against an operator and value(s).
 * Used for computed filter comparisons.
 */
function compareNumber(actual: number, op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between', v: number, v2?: number): boolean {
  switch (op) {
    case 'eq':
      return actual === v;
    case 'neq':
      return actual !== v;
    case 'gt':
      return actual > v;
    case 'gte':
      return actual >= v;
    case 'lt':
      return actual < v;
    case 'lte':
      return actual <= v;
    case 'between':
      if (v2 === undefined) return true;
      return actual >= v && actual <= v2;
    default:
      return true;
  }
}

