import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { JobScope, PartOfSpeech } from '@/lib/llm/types';
import { translateFilterASTToPrisma } from '@/lib/filters/translate';
import type { Prisma } from '@prisma/client';

/**
 * Quickly counts entries in a scope without fetching them all
 * Used by frontend to determine if batching is needed
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as { scope: JobScope };
    
    if (!payload.scope || typeof payload.scope !== 'object') {
      return NextResponse.json({ error: 'scope is required.' }, { status: 400 });
    }

    const scope = payload.scope;
    let count = 0;

    if (scope.kind === 'ids') {
      // For IDs, just return the array length
      count = scope.ids.length;
    } else if (scope.kind === 'frame_ids') {
      // For frame IDs, we need to count verbs if includeVerbs is true
      if (scope.includeVerbs && scope.pos === 'verbs') {
        // Count verbs associated with these frames
        const frames = await prisma.frames.findMany({
          where: {
            OR: scope.frameIds.map(id =>
              id.match(/^\d+$/)
                ? { id: BigInt(id) }
                : { frame_name: { equals: id, mode: 'insensitive' as Prisma.QueryMode } }
            ),
          },
          select: {
            _count: {
              select: {
                verbs: {
                  where: { deleted: false },
                },
              },
            },
          },
        });
        count = frames.reduce((sum, frame) => sum + frame._count.verbs, 0);
      } else {
        // Just count frames
        count = scope.frameIds.length;
      }
    } else if (scope.kind === 'filters') {
      // For filters, we need to run a count query
      const pos = scope.pos;
      const { where } = await translateFilterASTToPrisma(pos, scope.filters.where);
      const limit = scope.filters.limit;

      if (pos === 'verbs') {
        const verbsWhere = where as Prisma.verbsWhereInput;
        const finalWhere: Prisma.verbsWhereInput = {
          ...verbsWhere,
          AND: [
            verbsWhere,
            { deleted: false },
          ],
        };
        count = await prisma.verbs.count({ where: finalWhere });
      } else if (pos === 'nouns') {
        count = await prisma.nouns.count({ where: where as Prisma.nounsWhereInput });
      } else if (pos === 'adjectives') {
        count = await prisma.adjectives.count({ where: where as Prisma.adjectivesWhereInput });
      } else if (pos === 'adverbs') {
        count = await prisma.adverbs.count({ where: where as Prisma.adverbsWhereInput });
      } else if (pos === 'frames') {
        count = await prisma.frames.count({ where: where as Prisma.framesWhereInput });
      }

      // Apply limit if specified and less than actual count
      if (limit && limit > 0 && limit < count) {
        count = limit;
      }
    }

    return NextResponse.json({ count });
  } catch (error) {
    console.error('[LLM] Failed to count scope:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to count scope' },
      { status: 500 }
    );
  }
}

