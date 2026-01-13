import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { JobScope, JobTargetType } from '@/lib/llm/types';
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
      // For frame IDs, count frames and/or associated lexical units depending on flagTarget
      const frames = await prisma.frames.findMany({
        where: {
          OR: scope.frameIds.map(id =>
            id.match(/^\d+$/)
              ? { id: BigInt(id) }
              : { label: { equals: id, mode: 'insensitive' as Prisma.QueryMode } }
          ),
        } as any,
        select: { id: true } as any,
      });

      const frameIds = frames.map(f => f.id);
      const flagTarget = scope.flagTarget ?? 'frame';

      if (flagTarget === 'frame' || flagTarget === 'both') {
        count += frameIds.length;
      }

      if (flagTarget === 'lexical_unit' || flagTarget === 'both') {
        const targetType = scope.targetType;
        const luWhere: any = {
          deleted: false,
          frame_id: { in: frameIds },
        };
        if (targetType && targetType !== 'frames') {
          luWhere.pos = targetType;
        }
        const luCount = await prisma.lexical_units.count({ where: luWhere });
        count += luCount;
      }
    } else if (scope.kind === 'filters') {
      // For filters, we need to run a count query
      const targetType = scope.targetType;
      const { where } = await translateFilterASTToPrisma(targetType, scope.filters.where);
      const limit = scope.filters.limit;

      if (targetType === 'frames') {
        count = await prisma.frames.count({ where: where as Prisma.framesWhereInput });
      } else {
        const luWhere: any = {
          ...(where as Record<string, unknown>),
          deleted: false,
          pos: targetType as any,
        };
        count = await prisma.lexical_units.count({ where: luWhere });
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

