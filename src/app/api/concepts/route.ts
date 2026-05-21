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
    const where: Prisma.conceptsWhereInput = { deleted: false };
    
    if (search) {
      where.OR = [
        { label: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { id: /^\d+$/.test(search) ? BigInt(search) : undefined }
      ].filter(condition => condition.id !== undefined || !('id' in condition)) as Prisma.conceptsWhereInput[];
    }

    if (ids && ids.length > 0) {
      const numericIds = ids.filter(id => /^\d+$/.test(id)).map(id => BigInt(id));
      const labels = ids.filter(id => !/^\d+$/.test(id));
      
      const idConditions: Prisma.conceptsWhereInput[] = [];
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

    // Get concepts with limit
    const concepts = await withRetry(
      () => prisma.concepts.findMany({
        where,
        select: {
          id: true,
          label: true,
          code: true,
        } as Prisma.conceptsSelect,
        orderBy: {
          label: 'asc'
        },
        take: limit
      }),
      undefined,
      'GET /api/concepts'
    );

    // Return concepts for display
    const formattedConcepts = concepts.map(f => ({
      id: f.id.toString(),
      label: f.label,
      code: f.code,
    }));

    return NextResponse.json(formattedConcepts);
  } catch (error) {
    console.error('Error fetching concepts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch concepts' },
      { status: 500 }
    );
  }
}

