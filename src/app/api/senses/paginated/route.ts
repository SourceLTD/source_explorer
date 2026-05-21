import { NextRequest, NextResponse } from 'next/server';
import { Prisma, part_of_speech } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { attachPendingInfoToEntities } from '@/lib/version-control';
import { computeFrameWarning } from '@/lib/db/senses';
import type { FrameSenseFrameRef } from '@/lib/types';

/**
 * GET /api/frame-senses/paginated
 *
 * Paginated listing of frame_senses for tabular exploration. Each row returns
 * the sense's scalar fields, its linked frame(s), and a display-only snippet
 * of lexical units reached via lexical_unit_senses.
 *
 * Query params:
 *   - page (default 1)
 *   - limit (default 10, max 2000)
 *   - search: matched against sense id, definition, lemmas, pos, frame_type,
 *     linked frame label/code, and linked lexical unit code/lemmas
 *   - sortBy: one of id | pos | definition | frame_type | created_at | updated_at
 *   - sortOrder: asc | desc
 */

const VALID_SORT_FIELDS: Record<string, string> = {
  id: 'id',
  pos: 'pos',
  definition: 'definition',
  frame_type: 'frame_type',
  confidence: 'confidence',
  causative: 'causative',
  inchoative: 'inchoative',
  perspectival: 'perspectival',
  createdAt: 'created_at',
  created_at: 'created_at',
  updatedAt: 'updated_at',
  updated_at: 'updated_at',
};

const LU_SNIPPET_LIMIT = 10;

const PART_OF_SPEECH_VALUES = Object.values(part_of_speech);

/** Legacy short tokens still passed from older URLs / bookmarks. */
const LEGACY_POS_FILTER: Record<string, part_of_speech> = {
  n: part_of_speech.noun,
  v: part_of_speech.verb,
  adj: part_of_speech.adjective,
  adv: part_of_speech.adverb,
};

function normalizePosFilterTokens(tokens: string[]): part_of_speech[] {
  const out = new Set<part_of_speech>();
  for (const raw of tokens) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    const fromLegacy = LEGACY_POS_FILTER[t];
    if (fromLegacy !== undefined) {
      out.add(fromLegacy);
      continue;
    }
    if (PART_OF_SPEECH_VALUES.includes(t as part_of_speech)) {
      out.add(t as part_of_speech);
    }
  }
  return [...out];
}

/** Substring matches on enum labels (`verb`, `nou`, adj→adjective aliases). */
function partOfSpeechValuesMatchingFreeText(search: string): part_of_speech[] {
  const q = search.trim().toLowerCase();
  if (!q) return [];
  const matched = new Set<part_of_speech>();
  if (LEGACY_POS_FILTER[q] !== undefined) matched.add(LEGACY_POS_FILTER[q]);
  for (const v of PART_OF_SPEECH_VALUES) {
    if (v.includes(q)) matched.add(v);
  }
  return [...matched];
}

function toEndOfDay(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const limitParam = parseInt(searchParams.get('limit') || '10', 10);
    const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1;
    const limit =
      Number.isFinite(limitParam) && limitParam >= 1 && limitParam <= 2000
        ? limitParam
        : 10;
    const skip = (page - 1) * limit;

    const rawSortBy = searchParams.get('sortBy') || 'id';
    const sortBy = VALID_SORT_FIELDS[rawSortBy];
    if (!sortBy) {
      return NextResponse.json(
        { error: `Invalid sortBy column: ${rawSortBy}` },
        { status: 400 }
      );
    }
    const sortOrder = searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc';

    const search = searchParams.get('search')?.trim() || '';
    const definition = searchParams.get('definition')?.trim() || '';
    const lemmas = searchParams.get('lemmas')?.trim() || '';
    const frameType = searchParams.get('frame_type')?.trim() || '';
    const frameId = searchParams.get('frame_id')?.trim() || '';
    const pos = searchParams.get('pos')?.trim() || '';
    const frameWarning = searchParams.get('frameWarning');
    const createdAfter = searchParams.get('createdAfter')?.trim() || '';
    const createdBefore = searchParams.get('createdBefore')?.trim() || '';
    const updatedAfter = searchParams.get('updatedAfter')?.trim() || '';
    const updatedBefore = searchParams.get('updatedBefore')?.trim() || '';

    const where: Prisma.frame_sensesWhereInput = {};
    const and: Prisma.frame_sensesWhereInput[] = [];

    if (search) {
      const matchingPosEnums = partOfSpeechValuesMatchingFreeText(search);
      const or: Prisma.frame_sensesWhereInput[] = [
        { definition: { contains: search, mode: 'insensitive' } },
        ...(matchingPosEnums.length > 0 ? [{ pos: { in: matchingPosEnums } }] : []),
        { frame_type: { contains: search, mode: 'insensitive' } },
        { lemmas: { has: search } },
        {
          frame_sense_frames: {
            some: {
              frames: {
                OR: [
                  { label: { contains: search, mode: 'insensitive' } },
                  { code: { contains: search, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
        {
          lexical_unit_senses: {
            some: {
              lexical_units: {
                OR: [
                  { code: { contains: search, mode: 'insensitive' } },
                  { lemmas: { has: search } },
                  { src_lemmas: { has: search } },
                ],
              },
            },
          },
        },
      ];

      if (/^\d+$/.test(search)) {
        or.push({ id: Number(search) });
      }

      and.push({ OR: or });
    }

    if (definition) {
      and.push({ definition: { contains: definition, mode: 'insensitive' } });
    }

    if (lemmas) {
      and.push({ lemmas: { has: lemmas } });
    }

    if (frameType) {
      and.push({ frame_type: { contains: frameType, mode: 'insensitive' } });
    }

    if (pos && pos !== 'none') {
      const selectedPos = normalizePosFilterTokens(pos.split(','));
      if (selectedPos.length > 0) {
        and.push({ pos: { in: selectedPos } });
      }
    } else if (pos === 'none') {
      and.push({ id: { equals: -1 } });
    }

    if (frameId) {
      const frameIds = frameId
        .split(',')
        .map(value => value.trim())
        .filter(value => /^\d+$/.test(value))
        .map(value => BigInt(value));
      if (frameIds.length > 0) {
        and.push({
          frame_sense_frames: {
            some: {
              frame_id: { in: frameIds },
            },
          },
        });
      }
    }

    if (frameWarning === 'none') {
      and.push({ frame_sense_frames: { none: {} } });
    } else if (frameWarning === 'multiple') {
      const multiFrameRows = await prisma.frame_sense_frames.groupBy({
        by: ['frame_sense_id'],
        having: {
          frame_id: { _count: { gt: 1 } },
        },
      });
      and.push({ id: { in: multiFrameRows.map(row => row.frame_sense_id) } });
    }

    if (createdAfter) {
      and.push({ created_at: { gte: new Date(createdAfter) } });
    }
    if (createdBefore) {
      and.push({ created_at: { lte: toEndOfDay(createdBefore) } });
    }
    if (updatedAfter) {
      and.push({ updated_at: { gte: new Date(updatedAfter) } });
    }
    if (updatedBefore) {
      and.push({ updated_at: { lte: toEndOfDay(updatedBefore) } });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    const [totalCount, senses] = await Promise.all([
      prisma.frame_senses.count({ where }),
      prisma.frame_senses.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder } as Prisma.frame_sensesOrderByWithRelationInput,
        include: {
          frame_sense_frames: {
            include: {
              frames: {
                select: { id: true, label: true, code: true },
              },
            },
          },
          lexical_unit_senses: {
            where: { lexical_units: { deleted: false } },
            include: {
              lexical_units: {
                select: {
                  id: true,
                  code: true,
                  lemmas: true,
                  src_lemmas: true,
                  pos: true,
                  gloss: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const serialized = senses.map(sense => {
      const frames: FrameSenseFrameRef[] = sense.frame_sense_frames.map(link => ({
        id: link.frames.id.toString(),
        label: link.frames.label,
        code: link.frames.code,
      }));

      const luEntries = sense.lexical_unit_senses.map(link => ({
        id: link.lexical_units.id.toString(),
        code: link.lexical_units.code,
        lemmas: link.lexical_units.lemmas,
        src_lemmas: link.lexical_units.src_lemmas,
        pos: link.lexical_units.pos,
        gloss: link.lexical_units.gloss,
      }));

      const lexicalUnitsCount = luEntries.length;
      const lexicalUnitSnippets = luEntries.slice(0, LU_SNIPPET_LIMIT);

      return {
        id: sense.id.toString(),
        pos: sense.pos,
        definition: sense.definition,
        frame_type: sense.frame_type,
        confidence: sense.confidence,
        type_dispute: sense.type_dispute,
        causative: sense.causative,
        inchoative: sense.inchoative,
        perspectival: sense.perspectival,
        lemmas: sense.lemmas ?? [],
        createdAt: sense.created_at?.toISOString() ?? null,
        updatedAt: sense.updated_at?.toISOString() ?? null,
        frame: frames[0] ?? null,
        frames,
        frameWarning: computeFrameWarning(frames),
        lexical_units: {
          entries: lexicalUnitSnippets,
          totalCount: lexicalUnitsCount,
          hasMore: lexicalUnitsCount > LU_SNIPPET_LIMIT,
        },
        lexical_units_count: lexicalUnitsCount,
      };
    });

    const dataWithPending = await attachPendingInfoToEntities(
      serialized,
      'frame_sense',
      row => BigInt(row.id)
    );

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      data: dataWithPending,
      total: totalCount,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    });
  } catch (error) {
    console.error('[API] GET /api/frame-senses/paginated failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frame senses' },
      { status: 500 }
    );
  }
}
