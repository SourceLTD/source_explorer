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
  FrameRelationData,
  ChildFrameData
} from './types';

function mergeLemmas(lemmas?: string[] | null, srcLemmas?: string[] | null): string[] {
  return Array.from(new Set([...(srcLemmas ?? []), ...(lemmas ?? [])].filter(Boolean)));
}

/**
 * Build structured frame data for template loops.
 */
function buildStructuredFrameData(frameRecord: {
  id: bigint;
  code?: string | null;
  label: string;
  definition?: string | null;
  short_definition?: string | null;
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
    src_lemmas?: string[] | null;
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
    id: lu.id.toString(),
    code: lu.code,
    gloss: lu.gloss,
    pos: lu.pos as POSType,
    // Abstract away src_lemmas vs lemmas: combine both into one list
    lemmas: mergeLemmas(lu.lemmas, lu.src_lemmas),
    examples: lu.examples,
    flagged: lu.flagged ?? false,
  }));

  // Build flat additional data for backward compatibility
  const additional: Record<string, unknown> = {
    'frame.id': frameRecord.id.toString(),
    'frame.code': frameRecord.code ?? frameRecord.label ?? frameRecord.id.toString(),
    'frame.label': frameRecord.label,
    'frame.definition': frameRecord.definition,
    'frame.short_definition': frameRecord.short_definition,
    'frame.roles': roles.map(fr => {
      const examples = fr.examples.length > 0 ? fr.examples.join(', ') : '';
      return `**${fr.type}**: ${fr.description}${examples ? ` (e.g. ${examples})` : ''}${fr.label ? `; ${fr.label}` : ''}`;
    }).join('\n'),
  };

  // Build structured frame object for loop iteration
  const frame: FrameRelationData = {
    id: frameRecord.id.toString(),
    code: frameRecord.code ?? frameRecord.label ?? frameRecord.id.toString(),
    label: frameRecord.label,
    definition: frameRecord.definition,
    short_definition: frameRecord.short_definition,
    roles,
    lexical_units,
  };

  return { additional, frame };
}

/**
 * Build child frames data for superframes.
 */
function buildChildFramesData(childFrames: Array<{
  id: bigint;
  code: string | null;
  label: string;
  definition: string | null;
  short_definition: string | null;
  _count?: {
    frame_roles: number;
    lexical_units: number;
  };
}>): ChildFrameData[] {
  return childFrames.map(frame => ({
    id: frame.id.toString(),
    code: frame.code ?? frame.label ?? frame.id.toString(),
    label: frame.label,
    definition: frame.definition,
    short_definition: frame.short_definition,
    roles_count: frame._count?.frame_roles ?? 0,
    lexical_units_count: frame._count?.lexical_units ?? 0,
  }));
}

/**
 * Fetch lexical units based on job scope configuration.
 */
export async function fetchUnitsForScope(scope: JobScope): Promise<LexicalUnitSummary[]> {
  switch (scope.kind) {
    case 'ids':
      return fetchEntriesByIds(scope.targetType, scope.ids, scope.isSuperFrame);
    case 'frame_ids':
      return fetchEntriesByFrameIds(scope.frameIds, scope.targetType, scope.includeLexicalUnits, scope.offset, scope.limit, scope.isSuperFrame);
    case 'filters':
      return fetchEntriesByFilters(scope.targetType, scope.filters, scope.isSuperFrame);
    default:
      return [];
  }
}

/**
 * Quickly counts entries in a scope without fetching them all
 */
export async function countEntriesForScope(scope: JobScope): Promise<number> {
  let count = 0;

  if (scope.kind === 'ids') {
    // For IDs, just return the array length
    count = scope.ids.length;
  } else if (scope.kind === 'frame_ids') {
    // For frame IDs, count frames and/or associated lexical units depending on flagTarget
    const MAX_BIND_VARS = 15000;
    const frameIds: bigint[] = [];
    
    // Process frameIds in chunks to avoid bind variable limits
    for (let i = 0; i < scope.frameIds.length; i += MAX_BIND_VARS) {
      const chunk = scope.frameIds.slice(i, i + MAX_BIND_VARS);
      const frames = await prisma.frames.findMany({
        where: {
          deleted: false,
          OR: chunk.map(id =>
            id.match(/^\d+$/)
              ? { id: BigInt(id) }
              : { label: { equals: id, mode: 'insensitive' as Prisma.QueryMode } }
          ),
          ...(scope.isSuperFrame === true
            ? { super_frame_id: null }
            : scope.isSuperFrame === false
              ? { super_frame_id: { not: null } }
              : {}),
        },
        select: { id: true },
      });
      frameIds.push(...frames.map(f => f.id));
    }

    const flagTarget = scope.flagTarget ?? 'lexical_unit';

    if (flagTarget === 'frame' || flagTarget === 'both') {
      count += frameIds.length;
    }

    if (flagTarget === 'lexical_unit' || flagTarget === 'both') {
      const targetType = scope.targetType;
      // Process in chunks if we have many frameIds to avoid "in" clause limits
      for (let i = 0; i < frameIds.length; i += MAX_BIND_VARS) {
        const chunk = frameIds.slice(i, i + MAX_BIND_VARS);
        const luWhere: any = {
          deleted: false,
          frame_id: { in: chunk },
        };
        if (targetType && targetType !== 'frames' && targetType !== 'lexical_units') {
          luWhere.pos = targetType;
        }
        const luCount = await prisma.lexical_units.count({ where: luWhere });
        count += luCount;
      }
    }
  } else if (scope.kind === 'filters') {
    // For filters, we need to run a count query
    const targetType = scope.targetType;
    const legacyPos = targetType === 'frames' ? 'frames' : 
                     targetType === 'lexical_units' ? 'lexical_units' : 
                     targetType + 's';
    const { where } = await translateFilterASTToPrisma(legacyPos as any, scope.filters.where);
    const limit = scope.filters.limit;

    if (targetType === 'frames') {
      const framesWhere: Prisma.framesWhereInput = {
        AND: [
          where as Prisma.framesWhereInput,
          { deleted: false },
          ...(scope.isSuperFrame === true
            ? [{ super_frame_id: null }]
            : scope.isSuperFrame === false
              ? [{ super_frame_id: { not: null } }]
              : []),
        ],
      };
      count = await prisma.frames.count({ where: framesWhere });
    } else {
      const luWhere: any = {
        AND: [
          where as Record<string, unknown>,
          { deleted: false },
          ...(targetType !== 'lexical_units' ? [{ pos: targetType as part_of_speech }] : []),
        ],
      };
      count = await prisma.lexical_units.count({ where: luWhere });
    }

    // Apply limit if specified and less than actual count
    if (limit && limit > 0 && limit < count) {
      count = limit;
    }
  }

  return count;
}

/**
 * Fetch units by their lexical codes (e.g., say.v.01) or frame IDs.
 */
async function fetchEntriesByIds(targetType: JobTargetType, ids: string[], isSuperFrame?: boolean): Promise<LexicalUnitSummary[]> {
  if (ids.length === 0) return [];

  const uniqueIds = Array.from(new Set(ids));
  let entries: LexicalUnitSummary[] = [];

  if (targetType === 'frames') {
    const numericIds = uniqueIds.filter(id => /^\d+$/.test(id)).map(id => BigInt(id));
    const labels = uniqueIds.filter(id => !/^\d+$/.test(id));

    const MAX_BIND_VARS = 15000;
    const records: any[] = [];

    // Process numeric IDs in chunks
    for (let i = 0; i < numericIds.length; i += MAX_BIND_VARS) {
      const chunk = numericIds.slice(i, i + MAX_BIND_VARS);
      const chunkRecords = await prisma.frames.findMany({
        where: {
          id: { in: chunk },
          deleted: false,
          ...(isSuperFrame === true
            ? { super_frame_id: null }
            : isSuperFrame === false
              ? { super_frame_id: { not: null } }
              : {}),
        },
        select: {
          id: true,
          code: true,
          label: true,
          definition: true,
          short_definition: true,
          super_frame_id: true,
          // Parent superframe (null for top-level superframes)
          frames: {
            select: {
              id: true,
              code: true,
              label: true,
              definition: true,
              short_definition: true,
            },
          },
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
              src_lemmas: true,
              examples: true,
              flagged: true,
            },
            take: 100,
          },
          // Include child frames for superframes
          other_frames: {
            where: { deleted: false },
            select: {
              id: true,
              code: true,
              label: true,
              definition: true,
              short_definition: true,
              _count: {
                select: {
                  frame_roles: true,
                  lexical_units: { where: { deleted: false } },
                },
              },
            },
            take: 100,
          },
        },
      });
      records.push(...chunkRecords);
    }

    // Process labels in chunks
    for (let i = 0; i < labels.length; i += MAX_BIND_VARS) {
      const chunk = labels.slice(i, i + MAX_BIND_VARS);
      const chunkRecords = await prisma.frames.findMany({
        where: {
          label: { in: chunk },
          deleted: false,
          ...(isSuperFrame === true
            ? { super_frame_id: null }
            : isSuperFrame === false
              ? { super_frame_id: { not: null } }
              : {}),
        },
        select: {
          id: true,
          code: true,
          label: true,
          definition: true,
          short_definition: true,
          super_frame_id: true,
          // Parent superframe (null for top-level superframes)
          frames: {
            select: {
              id: true,
              code: true,
              label: true,
              definition: true,
              short_definition: true,
            },
          },
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
              src_lemmas: true,
              examples: true,
              flagged: true,
            },
            take: 100,
          },
          // Include child frames for superframes
          other_frames: {
            where: { deleted: false },
            select: {
              id: true,
              code: true,
              label: true,
              definition: true,
              short_definition: true,
              _count: {
                select: {
                  frame_roles: true,
                  lexical_units: { where: { deleted: false } },
                },
              },
            },
            take: 100,
          },
        },
      });
      records.push(...chunkRecords);
    }
    
    const byIdOrLabel = new Map<string, typeof records[number]>();
    for (const record of records) {
      byIdOrLabel.set(record.id.toString(), record);
      byIdOrLabel.set(record.label, record);
    }

    entries = uniqueIds
      .map(id => byIdOrLabel.get(id))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => {
        const frameInfo = buildStructuredFrameData(record);
        // A frame is a superframe if it has child frames (other_frames)
        const isSuperFrame = record.other_frames.length > 0;
        
        return {
          dbId: record.id,
          code: record.code ?? record.label ?? record.id.toString(),
          pos: 'frames',
          gloss: record.definition ?? '',
          lemmas: [],
          examples: [],
          label: record.label,
          definition: record.definition,
          short_definition: record.short_definition,
          super_frame_id: record.super_frame_id ? record.super_frame_id.toString() : null,
          super_frame: record.frames
            ? {
                id: record.frames.id.toString(),
                code: record.frames.code ?? record.frames.label ?? record.frames.id.toString(),
                label: record.frames.label,
                definition: record.frames.definition,
                short_definition: record.frames.short_definition,
              }
            : null,
          flagged: record.flagged,
          flagged_reason: record.flagged_reason,
          verifiable: record.verifiable,
          unverifiable_reason: record.unverifiable_reason,
          roles: frameInfo.frame.roles,
          lexical_units: frameInfo.frame.lexical_units,
          // Superframe-specific fields
          isSuperFrame,
          child_frames: isSuperFrame ? buildChildFramesData(record.other_frames) : undefined,
        };
      });
  } else {
    // Lexical units (verb, noun, adjective, adverb, or generic lexical_units)
    const MAX_BIND_VARS = 15000;
    const records: any[] = [];
    
    for (let i = 0; i < uniqueIds.length; i += MAX_BIND_VARS) {
      const chunk = uniqueIds.slice(i, i + MAX_BIND_VARS);
      const chunkRecords = await prisma.lexical_units.findMany({
        where: { 
          code: { in: chunk },
          ...(targetType !== 'lexical_units' ? { pos: targetType as part_of_speech } : {}),
          deleted: false,
        },
        select: {
          id: true,
          code: true,
          pos: true,
          gloss: true,
          lemmas: true,
          src_lemmas: true,
          examples: true,
          flagged: true,
          flagged_reason: true,
          lexfile: true,
          frames: {
            select: {
              id: true,
              code: true,
              label: true,
              definition: true,
              short_definition: true,
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
            src_lemmas: true,
                  examples: true,
                  flagged: true,
                },
                take: 100,
              },
            },
          },
        },
      });
      records.push(...chunkRecords);
    }

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
          lemmas: mergeLemmas(record.lemmas, record.src_lemmas),
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
  limit?: number,
  isSuperFrame?: boolean
): Promise<LexicalUnitSummary[]> {
  if (frameIds.length === 0) return [];

  const numericIds = frameIds.filter(id => id.match(/^\d+$/)).map(id => BigInt(id));
  const labels = frameIds.filter(id => !id.match(/^\d+$/));

  // Chunking to avoid "too many bind variables" error (max 32767)
  const MAX_BIND_VARS = 15000;
  const frameRecords: any[] = [];
  
  // Process numeric IDs in chunks
  for (let i = 0; i < numericIds.length; i += MAX_BIND_VARS) {
    const chunk = numericIds.slice(i, i + MAX_BIND_VARS);
    const records = await prisma.frames.findMany({
      where: {
        id: { in: chunk },
        deleted: false,
        ...(isSuperFrame === true
          ? { super_frame_id: null }
          : isSuperFrame === false
            ? { super_frame_id: { not: null } }
            : {}),
      },
      select: {
        id: true,
        code: true,
        label: true,
        definition: true,
        short_definition: true,
        super_frame_id: true,
        // Parent superframe (null for top-level superframes)
        frames: {
          select: {
            id: true,
            code: true,
            label: true,
            definition: true,
            short_definition: true,
          },
        },
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
            src_lemmas: true,
            examples: true,
            flagged: true,
            flagged_reason: true,
            lexfile: true,
          },
          take: 100,
        },
        // Include child frames for superframes
        other_frames: {
          where: { deleted: false },
          select: {
            id: true,
            code: true,
            label: true,
            definition: true,
            short_definition: true,
            _count: {
              select: {
                frame_roles: true,
                lexical_units: { where: { deleted: false } },
              },
            },
          },
          take: 100,
        },
      },
    });
    frameRecords.push(...records);
  }

  // Process labels in chunks
  for (let i = 0; i < labels.length; i += MAX_BIND_VARS) {
    const chunk = labels.slice(i, i + MAX_BIND_VARS);
    const records = await prisma.frames.findMany({
      where: {
        label: { in: chunk },
        deleted: false,
        ...(isSuperFrame === true
          ? { super_frame_id: null }
          : isSuperFrame === false
            ? { super_frame_id: { not: null } }
            : {}),
      },
      select: {
        id: true,
        code: true,
        label: true,
        definition: true,
        short_definition: true,
        super_frame_id: true,
        // Parent superframe (null for top-level superframes)
        frames: {
          select: {
            id: true,
            code: true,
            label: true,
            definition: true,
            short_definition: true,
          },
        },
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
            src_lemmas: true,
            examples: true,
            flagged: true,
            flagged_reason: true,
            lexfile: true,
          },
          take: 100,
        },
        // Include child frames for superframes
        other_frames: {
          where: { deleted: false },
          select: {
            id: true,
            code: true,
            label: true,
            definition: true,
            short_definition: true,
            _count: {
              select: {
                frame_roles: true,
                lexical_units: { where: { deleted: false } },
              },
            },
          },
          take: 100,
        },
      },
    });
    frameRecords.push(...records);
  }

  const frames = frameRecords;

  const entries: LexicalUnitSummary[] = [];
  
  // If targeting frames directly
  if (!includeLexicalUnits || targetType === 'frames') {
    for (const frame of frames) {
      const frameInfo = buildStructuredFrameData(frame);
      // A frame is a superframe if it has child frames (other_frames)
      const isSuperFrame = frame.other_frames.length > 0;
      entries.push({
        dbId: frame.id,
        code: frame.code ?? frame.label ?? frame.id.toString(),
        pos: 'frames',
        gloss: frame.definition ?? '',
        lemmas: [],
        examples: [],
        label: frame.label,
        definition: frame.definition,
        short_definition: frame.short_definition,
        super_frame_id: frame.super_frame_id ? frame.super_frame_id.toString() : null,
        super_frame: frame.frames
          ? {
              id: frame.frames.id.toString(),
              code: frame.frames.code ?? frame.frames.label ?? frame.frames.id.toString(),
              label: frame.frames.label,
              definition: frame.frames.definition,
              short_definition: frame.frames.short_definition,
            }
          : null,
        flagged: frame.flagged,
        flagged_reason: frame.flagged_reason,
        verifiable: frame.verifiable,
        unverifiable_reason: frame.unverifiable_reason,
        roles: frameInfo.frame.roles,
        lexical_units: frameInfo.frame.lexical_units,
        // Superframe-specific fields
        isSuperFrame,
        child_frames: isSuperFrame ? buildChildFramesData(frame.other_frames) : undefined,
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
          lemmas: mergeLemmas(lu.lemmas, lu.src_lemmas),
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
  filters: { limit?: number; offset?: number; where?: BooleanFilterGroup | undefined } | Record<string, unknown>,
  isSuperFrame?: boolean
): Promise<LexicalUnitSummary[]> {
  const limit = typeof (filters as { limit?: unknown }).limit === 'number' ? Number((filters as { limit?: number }).limit) : undefined;
  const offset = typeof (filters as { offset?: unknown }).offset === 'number' ? Number((filters as { offset?: number }).offset) : undefined;
  const ast = (filters as { where?: BooleanFilterGroup }).where as BooleanFilterGroup | undefined;
  
  // translateFilterASTToPrisma expects 'verbs' style POS, but for lexical_units it's 'verb'
  const legacyPos = targetType === 'frames' ? 'frames' : 
                   targetType === 'lexical_units' ? 'lexical_units' : 
                   targetType + 's';
  const { where, computedFilters } = await translateFilterASTToPrisma(legacyPos as any, ast);

  if (targetType === 'frames') {
    const takeArg = limit === 0 ? undefined : (limit ?? 50);
    const skipArg = offset;
    const records = await prisma.frames.findMany({
      where: {
        AND: [
          where as Prisma.framesWhereInput,
          { deleted: false },
          ...(isSuperFrame === true
            ? [{ super_frame_id: null }]
            : isSuperFrame === false
              ? [{ super_frame_id: { not: null } }]
              : []),
        ],
      },
      take: takeArg,
      skip: skipArg,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        code: true,
        label: true,
        definition: true,
        short_definition: true,
        super_frame_id: true,
        // Parent superframe (null for top-level superframes)
        frames: {
          select: {
            id: true,
            code: true,
            label: true,
            definition: true,
            short_definition: true,
          },
        },
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
                src_lemmas: true,
            examples: true,
            flagged: true,
          },
          take: 100,
        },
        // Include child frames for superframes
        other_frames: {
          where: { deleted: false },
          select: {
            id: true,
            code: true,
            label: true,
            definition: true,
            short_definition: true,
            _count: {
              select: {
                frame_roles: true,
                lexical_units: { where: { deleted: false } },
              },
            },
          },
          take: 100,
        },
      },
    });
    return records.map(record => {
      const frameInfo = buildStructuredFrameData(record);
      // A frame is a superframe if it has child frames (other_frames)
      const isSuperFrame = record.other_frames.length > 0;
      return {
        dbId: record.id,
        code: record.code ?? record.label ?? record.id.toString(),
        pos: 'frames',
        gloss: record.definition ?? '',
        lemmas: [] as string[],
        examples: [] as string[],
        label: record.label,
        definition: record.definition,
        short_definition: record.short_definition,
        super_frame_id: record.super_frame_id ? record.super_frame_id.toString() : null,
        super_frame: record.frames
          ? {
              id: record.frames.id.toString(),
              code: record.frames.code ?? record.frames.label ?? record.frames.id.toString(),
              label: record.frames.label,
              definition: record.frames.definition,
              short_definition: record.frames.short_definition,
            }
          : null,
        flagged: record.flagged,
        flagged_reason: record.flagged_reason,
        verifiable: record.verifiable,
        unverifiable_reason: record.unverifiable_reason,
        roles: frameInfo.frame.roles,
        lexical_units: frameInfo.frame.lexical_units,
        // Superframe-specific fields
        isSuperFrame,
        child_frames: isSuperFrame ? buildChildFramesData(record.other_frames) : undefined,
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
      ...(targetType !== 'lexical_units' ? [{ pos: targetType as part_of_speech }] : []),
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
          code: true,
          label: true,
          definition: true,
          short_definition: true,
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
              src_lemmas: true,
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
      lemmas: mergeLemmas(record.lemmas, record.src_lemmas),
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
