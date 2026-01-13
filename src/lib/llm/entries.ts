import { Prisma, part_of_speech } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { translateFilterASTToPrisma } from '@/lib/filters/translate';
import type { BooleanFilterGroup } from '@/lib/filters/types';
import { sortRolesByPrecedence } from '@/lib/types';
import type { PartOfSpeech as POSType } from '@/lib/types';
import type { 
  JobScope, 
  LexicalUnitSummary, 
  JobTargetType, 
  FrameRoleData, 
  FrameLexicalUnitData,
  FrameRelationData 
} from './types';

/**
 * Build structured frame data for template loops.
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
  lexical_units?: Array<{
    id: bigint;
    code: string;
    pos: part_of_speech;
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

  // Build structured lexical units array
  const lexical_units: FrameLexicalUnitData[] = (frameRecord.lexical_units ?? []).map(lu => ({
    code: lu.code,
    gloss: lu.gloss,
    pos: lu.pos as POSType,
    lemmas: lu.lemmas,
    examples: lu.examples,
    flagged: lu.flagged ?? false,
  }));

  // Build flat additional data for backward compatibility
  const additional: Record<string, unknown> = {
    'frame.id': frameRecord.id.toString(),
    'frame.label': frameRecord.label,
    'frame.definition': frameRecord.definition,
    'frame.short_definition': frameRecord.short_definition,
    'frame.prototypical_synset': frameRecord.prototypical_synset,
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
    lexical_units,
  };

  return { additional, frame };
}

/**
 * Fetch lexical units based on job scope configuration.
 */
export async function fetchEntriesForScope(scope: JobScope): Promise<LexicalUnitSummary[]> {
  switch (scope.kind) {
    case 'ids':
      return fetchEntriesByIds(scope.targetType, scope.ids);
    case 'frame_ids':
      return fetchEntriesByFrameIds(scope.frameIds, scope.targetType, scope.includeLexicalUnits, scope.offset, scope.limit);
    case 'filters':
      return fetchEntriesByFilters(scope.targetType, scope.filters);
    default:
      return [];
  }
}

/**
 * Fetch units by their lexical codes (e.g., say.v.01) or frame IDs.
 */
async function fetchEntriesByIds(targetType: JobTargetType, ids: string[]): Promise<LexicalUnitSummary[]> {
  if (ids.length === 0) return [];

  const uniqueIds = Array.from(new Set(ids));
  let entries: LexicalUnitSummary[] = [];

  if (targetType === 'frames') {
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
        lexical_units: {
          where: { deleted: false },
          select: {
            id: true,
            code: true,
            pos: true,
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
        const frameInfo = buildStructuredFrameData(record);
        
        return {
          dbId: record.id,
          code: record.id.toString(),
          pos: 'frames',
          gloss: record.definition ?? '',
          lemmas: [],
          examples: [],
          label: record.label,
          definition: record.definition,
          short_definition: record.short_definition,
          prototypical_synset: record.prototypical_synset,
          flagged: record.flagged,
          flagged_reason: record.flagged_reason,
          verifiable: record.verifiable,
          unverifiable_reason: record.unverifiable_reason,
          roles: frameInfo.frame.roles,
          lexical_units: frameInfo.frame.lexical_units,
        };
      });
  } else {
    // Lexical units (verb, noun, adjective, adverb)
    const posFilter = targetType as POSType;
    const records = await prisma.lexical_units.findMany({
      where: { 
        code: { in: uniqueIds },
        pos: posFilter as part_of_speech,
        deleted: false,
      },
      select: {
        id: true,
        code: true,
        pos: true,
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
            lexical_units: {
              where: { deleted: false },
              select: {
                id: true,
                code: true,
                pos: true,
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

    const byCode = new Map(records.map(record => [record.code, record]));
    entries = uniqueIds
      .map(code => byCode.get(code))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => {
        const frameInfo = record.frames 
          ? buildStructuredFrameData(record.frames)
          : { additional: {}, frame: null };

        return {
          dbId: record.id,
          code: record.code,
          pos: targetType,
          gloss: record.gloss,
          lemmas: record.lemmas,
          examples: record.examples,
          flagged: record.flagged,
          flagged_reason: record.flagged_reason,
          label: record.frames?.label ?? null,
          lexfile: record.lexfile,
          additional: frameInfo.additional,
          frame: frameInfo.frame,
        };
      });
  }

  return entries;
}

/**
 * Fetch entries by frame IDs, optionally including associated lexical units.
 */
async function fetchEntriesByFrameIds(
  frameIds: string[], 
  targetType?: JobTargetType, 
  includeLexicalUnits?: boolean,
  offset?: number,
  limit?: number
): Promise<LexicalUnitSummary[]> {
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
      lexical_units: {
        where: { deleted: false },
        select: {
          id: true,
          code: true,
          pos: true,
          gloss: true,
          lemmas: true,
          examples: true,
          flagged: true,
          flagged_reason: true,
          lexfile: true,
        },
        take: 100,
      },
    },
  });

  const entries: LexicalUnitSummary[] = [];
  
  // If targeting frames directly
  if (!includeLexicalUnits || targetType === 'frames') {
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
        roles: frameInfo.frame.roles,
        lexical_units: frameInfo.frame.lexical_units,
      });
    }
  }
  
  // If including lexical units
  if (includeLexicalUnits && frames.length > 0) {
    for (const frame of frames) {
      const frameInfo = buildStructuredFrameData(frame);
      
      for (const lu of frame.lexical_units) {
        // Apply targetType filter if specified (and not 'frames')
        if (targetType && targetType !== 'frames' && lu.pos !== targetType) {
          continue;
        }

        entries.push({
          dbId: lu.id,
          code: lu.code,
          pos: lu.pos as POSType,
          gloss: lu.gloss,
          lemmas: lu.lemmas,
          examples: lu.examples,
          flagged: lu.flagged,
          flagged_reason: lu.flagged_reason,
          label: frame.label,
          lexfile: lu.lexfile,
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
 * Fetch units using boolean filter AST.
 */
async function fetchEntriesByFilters(
  targetType: JobTargetType, 
  filters: { limit?: number; offset?: number; where?: BooleanFilterGroup | undefined } | Record<string, unknown>
): Promise<LexicalUnitSummary[]> {
  const limit = typeof (filters as { limit?: unknown }).limit === 'number' ? Number((filters as { limit?: number }).limit) : undefined;
  const offset = typeof (filters as { offset?: unknown }).offset === 'number' ? Number((filters as { offset?: number }).offset) : undefined;
  const ast = (filters as { where?: BooleanFilterGroup }).where as BooleanFilterGroup | undefined;
  
  // translateFilterASTToPrisma expects 'verbs' style POS, but for lexical_units it's 'verb'
  const legacyPos = targetType === 'frames' ? 'frames' : targetType + 's';
  const { where, computedFilters } = await translateFilterASTToPrisma(legacyPos as any, ast);

  if (targetType === 'frames') {
    const takeArg = limit === 0 ? undefined : (limit ?? 50);
    const skipArg = offset;
    const records = await prisma.frames.findMany({
      where: where as Prisma.framesWhereInput,
      take: takeArg,
      skip: skipArg,
      orderBy: { id: 'asc' },
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
        lexical_units: {
          where: { deleted: false },
          select: {
            id: true,
            code: true,
            pos: true,
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
          pos: 'frames',
          gloss: record.definition ?? '',
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
          roles: frameInfo.frame.roles,
          lexical_units: frameInfo.frame.lexical_units,
        };
      }) as LexicalUnitSummary[];
  }

  // Lexical units (verb, noun, adjective, adverb)
  const takeArg = limit === 0 ? undefined : (limit ?? 50);
  const skipArg = offset;
  
  // Add POS filter and deleted filter
  const luWhere = where as Prisma.lexical_unitsWhereInput;
  const finalWhere: Prisma.lexical_unitsWhereInput = {
    AND: [
      luWhere,
      { pos: targetType as part_of_speech },
      { deleted: false },
    ],
  };
  
  const records = await prisma.lexical_units.findMany({
    where: finalWhere,
    take: takeArg,
    skip: skipArg,
    orderBy: { id: 'asc' },
    include: {
      _count: {
        select: {
          lexical_unit_relations_lexical_unit_relations_source_idTolexical_units: { where: { type: 'hypernym' } },
          lexical_unit_relations_lexical_unit_relations_target_idTolexical_units: { where: { type: 'hypernym' } },
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
          lexical_units: {
            where: { deleted: false },
            select: {
              id: true,
              code: true,
              pos: true,
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
    const frameInfo = record.frames 
      ? buildStructuredFrameData(record.frames)
      : { additional: {}, frame: null };

    return {
      dbId: record.id,
      code: record.code,
      pos: targetType,
      gloss: record.gloss,
      lemmas: record.lemmas,
      examples: record.examples,
      flagged: record.flagged ?? undefined,
      flagged_reason: record.flagged_reason ?? null,
      label: record.frames?.label ?? null,
      lexfile: record.lexfile,
      additional: frameInfo.additional,
      frame: frameInfo.frame,
      _parentsCount: record._count?.lexical_unit_relations_lexical_unit_relations_source_idTolexical_units ?? 0,
      _childrenCount: record._count?.lexical_unit_relations_lexical_unit_relations_target_idTolexical_units ?? 0,
    };
  }) as Array<LexicalUnitSummary & { _parentsCount: number; _childrenCount: number }>;

  // Apply computed filters on counts
  for (const cf of computedFilters) {
    const field = cf.field === 'parentsCount' ? '_parentsCount' : '_childrenCount';
    entries = entries.filter(e => compareNumber((e as unknown as Record<string, unknown>)[field] as number, cf.operator, cf.value, cf.value2));
  }

  // Strip temporary fields
  return entries.map(entry => {
    const { _parentsCount, _childrenCount, ...rest } = entry;
    void _parentsCount;
    void _childrenCount;
    return rest;
  });
}

/**
 * Compare a number against an operator and value(s).
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
