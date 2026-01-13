import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRetry } from '@/lib/db-utils';
import type { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const ids = searchParams.get('ids')?.split(',').filter(Boolean);

    // Build where clause
    const where: Prisma.framesWhereInput = {};
    
    if (search) {
      where.OR = [
        { label: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { id: /^\d+$/.test(search) ? BigInt(search) : undefined }
      ].filter(condition => condition.id !== undefined || !('id' in condition)) as Prisma.framesWhereInput[];
    }

    if (ids && ids.length > 0) {
      const numericIds = ids.filter(id => /^\d+$/.test(id)).map(id => BigInt(id));
      const labels = ids.filter(id => !/^\d+$/.test(id));
      
      const idConditions: Prisma.framesWhereInput[] = [];
      if (numericIds.length > 0) {
        idConditions.push({ id: { in: numericIds } });
      }
      if (labels.length > 0) {
        idConditions.push({ label: { in: labels, mode: 'insensitive' } });
      }

      if (idConditions.length > 0) {
        if (where.OR) {
          // If we already have OR from search, we need to intersect
          const searchOr = where.OR;
          delete where.OR;
          where.AND = [
            { OR: searchOr },
            { OR: idConditions }
          ];
        } else {
          where.OR = idConditions;
        }
      }
    }

    // Get frames with limit
    const frames = await withRetry(
      () => prisma.frames.findMany({
        where,
        select: {
          id: true,
          label: true,
          code: true,
        } as Prisma.framesSelect,
        orderBy: {
          label: 'asc'
        },
        take: limit
      }),
      undefined,
      'GET /api/frames'
    );

    // Return frames for display
    const formattedFrames = frames.map(f => ({
      id: f.id.toString(),
      label: f.label,
      code: f.code,
    }));

    return NextResponse.json(formattedFrames);
  } catch (error) {
    console.error('Error fetching frames:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frames' },
      { status: 500 }
    );
  }
}

